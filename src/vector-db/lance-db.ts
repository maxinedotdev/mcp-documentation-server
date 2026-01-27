/**
 * Vector Database Implementation
 * 
 * Provides an abstraction layer for vector storage and retrieval with
 * support for both LanceDB and in-memory storage as fallback.
 */

import * as path from "path";
import * as os from "os";
import { DocumentChunk, SearchResult, CodeBlock, CodeBlockSearchResult } from "../types.js";
import { getLogger } from "../utils.js";
import * as lancedb from "@lancedb/lancedb";
import { Index } from "@lancedb/lancedb";

const logger = getLogger("VectorDB");

/**
 * Vector database interface for storing and searching document chunks
 */
export interface VectorDatabase {
    /**
     * Initialize the vector database connection
     */
    initialize(): Promise<void>;

    /**
     * Add document chunks to the vector database
     * @param chunks - Array of document chunks with embeddings
     */
    addChunks(chunks: DocumentChunk[]): Promise<void>;

    /**
     * Remove all chunks for a specific document
     * @param documentId - Document ID to remove chunks for
     */
    removeChunks(documentId: string): Promise<void>;

    /**
     * Search for similar chunks using vector similarity
     * @param queryEmbedding - Query vector embedding
     * @param limit - Maximum number of results to return
     * @param filter - Optional SQL filter expression
     */
    search(queryEmbedding: number[], limit: number, filter?: string): Promise<SearchResult[]>;

    /**
     * Get a specific chunk by ID
     * @param chunkId - Chunk identifier
     */
    getChunk(chunkId: string): Promise<DocumentChunk | null>;

    /**
     * Close the database connection
     */
    close(): Promise<void>;
}

/**
 * LanceDB adapter implementation
 * Uses LanceDB for scalable, disk-based vector storage with HNSW indexing
 */
export class LanceDBAdapter implements VectorDatabase {
    private db: any = null;
    private table: any = null;
    private codeBlocksTable: any = null;
    private dbPath: string;
    private tableName: string;
    private codeBlocksTableName: string = "code_blocks";
    private initialized: boolean = false;

    constructor(dbPath: string, tableName: string = "chunks") {
        this.dbPath = dbPath;
        this.tableName = tableName;
    }

    async initialize(): Promise<void> {
        console.error('[LanceDBAdapter] initialize START');
        const startTime = Date.now();

        if (this.initialized) {
            console.error('[LanceDBAdapter] Already initialized, returning');
            return;
        }

        try {
            console.error(`[LanceDBAdapter] Connecting to LanceDB at: ${this.dbPath}`);
            this.db = await lancedb.connect(this.dbPath);
            console.error('[LanceDBAdapter] LanceDB connected');

            // Try to open existing table - will be created on first addChunks if it doesn't exist
            try {
                console.error(`[LanceDBAdapter] Opening table: ${this.tableName}`);
                this.table = await this.db.openTable(this.tableName);
                logger.info(`Opened existing table: ${this.tableName}`);

                // Check if table has data and create vector index if needed
                console.error('[LanceDBAdapter] Counting rows...');
                const count = await this.table.countRows();
                console.error(`[LanceDBAdapter] Table has ${count} rows`);
                if (count > 0) {
                    console.error('[LanceDBAdapter] Creating vector index (ivf_pq) with 30 second timeout...');
                    try {
                        // Add timeout to prevent hanging on index creation
                        const indexCreationPromise = this.table.createIndex("embedding", {
                            type: "ivf_pq",
                            metricType: "cosine",
                            num_partitions: 256,
                            num_sub_vectors: 16
                        });

                        const timeoutPromise = new Promise<never>((_, reject) => {
                            setTimeout(() => {
                                reject(new Error('Index creation timed out after 30 seconds'));
                            }, 30000); // 30 second timeout
                        });

                        await Promise.race([indexCreationPromise, timeoutPromise]);
                        logger.info("Created vector index on 'embedding' column");
                        console.error('[LanceDBAdapter] Vector index created successfully');
                    } catch (error) {
                        // Index might already exist or timed out, which is fine
                        const isTimeout = error instanceof Error && error.message.includes('timed out');
                        if (isTimeout) {
                            console.warn('[LanceDBAdapter] Index creation timed out, continuing without index (search will still work but may be slower)');
                        } else {
                            logger.debug("Vector index already exists or creation failed:", error);
                            console.error('[LanceDBAdapter] Vector index already exists or creation failed (continuing)');
                        }
                    }
                } else {
                    console.error('[LanceDBAdapter] Table is empty, skipping index creation');
                }
            } catch (tableError) {
                // Table doesn't exist yet - will be created when first data is added
                console.error(`[LanceDBAdapter] Table '${this.tableName}' does not exist yet, will be created on first data insertion`);
                this.table = null;
            }

            // Try to open code_blocks table - will be created on first addCodeBlocks if it doesn't exist
            try {
                console.error(`[LanceDBAdapter] Opening code_blocks table: ${this.codeBlocksTableName}`);
                this.codeBlocksTable = await this.db.openTable(this.codeBlocksTableName);
                logger.info(`Opened existing code_blocks table: ${this.codeBlocksTableName}`);

                // Check if code_blocks table has data and create indexes if needed
                console.error('[LanceDBAdapter] Counting code_blocks rows...');
                const codeBlocksCount = await this.codeBlocksTable.countRows();
                console.error(`[LanceDBAdapter] Code_blocks table has ${codeBlocksCount} rows`);

                if (codeBlocksCount > 0) {
                    // Create scalar indexes on document_id and language
                    console.error('[LanceDBAdapter] Creating scalar indexes on code_blocks table...');
                    try {
                        await this.codeBlocksTable.createIndex("document_id", { config: Index.btree() });
                        logger.info("Created scalar index on 'document_id' column");
                        console.error('[LanceDBAdapter] Scalar index on document_id created');
                    } catch (error) {
                        logger.debug("Scalar index on document_id already exists or creation failed:", error);
                    }

                    try {
                        await this.codeBlocksTable.createIndex("language", { config: Index.btree() });
                        logger.info("Created scalar index on 'language' column");
                        console.error('[LanceDBAdapter] Scalar index on language created');
                    } catch (error) {
                        logger.debug("Scalar index on language already exists or creation failed:", error);
                    }

                    // Create vector index on embedding
                    try {
                        console.error('[LanceDBAdapter] Creating vector index on code_blocks...');
                        const indexCreationPromise = this.codeBlocksTable.createIndex("embedding", {
                            type: "ivf_pq",
                            metricType: "cosine",
                            num_partitions: 256,
                            num_sub_vectors: 16
                        });

                        const timeoutPromise = new Promise<never>((_, reject) => {
                            setTimeout(() => {
                                reject(new Error('Code blocks index creation timed out after 30 seconds'));
                            }, 30000);
                        });

                        await Promise.race([indexCreationPromise, timeoutPromise]);
                        logger.info("Created vector index on code_blocks 'embedding' column");
                        console.error('[LanceDBAdapter] Code_blocks vector index created successfully');
                    } catch (error) {
                        const isTimeout = error instanceof Error && error.message.includes('timed out');
                        if (isTimeout) {
                            console.warn('[LanceDBAdapter] Code blocks index creation timed out, continuing without index');
                        } else {
                            logger.debug("Code blocks vector index already exists or creation failed:", error);
                        }
                    }
                }
            } catch (codeBlocksTableError) {
                // Table doesn't exist yet - will be created when first code blocks are added
                console.error(`[LanceDBAdapter] Code_blocks table '${this.codeBlocksTableName}' does not exist yet, will be created on first code block insertion`);
                this.codeBlocksTable = null;
            }

            this.initialized = true;
            const endTime = Date.now();
            console.error(`[LanceDBAdapter] initialize END - took ${endTime - startTime}ms`);
            logger.info("LanceDB initialized successfully");
        } catch (error) {
            const endTime = Date.now();
            console.error(`[LanceDBAdapter] initialize FAILED after ${endTime - startTime}ms:`, error);
            logger.error("Failed to initialize LanceDB:", error);
            throw new Error(`LanceDB initialization failed: ${error}`);
        }
    }

    async addChunks(chunks: DocumentChunk[]): Promise<void> {
        if (!this.initialized) {
            throw new Error("LanceDB not initialized");
        }

        try {
            // Create table on first data insertion if it doesn't exist
            if (!this.table) {
                logger.info(`Creating table '${this.tableName}' with ${chunks.length} initial chunks`);
                this.table = await this.db.createTable(this.tableName, chunks.map(chunk => ({
                    id: chunk.id,
                    document_id: chunk.document_id,
                    chunk_index: chunk.chunk_index,
                    content: chunk.content,
                    embedding: chunk.embeddings || [],
                    metadata: chunk.metadata || {},
                    start_position: chunk.start_position,
                    end_position: chunk.end_position
                })));
                
                // Create vector index after initial data is added
                try {
                    console.error('[LanceDBAdapter] Creating vector index on initial data with 30 second timeout...');
                    const indexCreationPromise = this.table.createIndex("embedding", {
                        type: "ivf_pq",
                        metricType: "cosine",
                        num_partitions: 256,
                        num_sub_vectors: 16
                    });

                    const timeoutPromise = new Promise<never>((_, reject) => {
                        setTimeout(() => {
                            reject(new Error('Index creation timed out after 30 seconds'));
                        }, 30000); // 30 second timeout
                    });

                    await Promise.race([indexCreationPromise, timeoutPromise]);
                    logger.info("Created vector index on 'embedding' column");
                    console.error('[LanceDBAdapter] Vector index created successfully');
                } catch (error) {
                    const isTimeout = error instanceof Error && error.message.includes('timed out');
                    if (isTimeout) {
                        console.warn('[LanceDBAdapter] Index creation timed out, continuing without index (search will still work but may be slower)');
                    } else {
                        logger.debug("Vector index creation failed (may already exist):", error);
                    }
                }
            } else {
                // Table already exists, just add data
                const data = chunks.map(chunk => ({
                    id: chunk.id,
                    document_id: chunk.document_id,
                    chunk_index: chunk.chunk_index,
                    content: chunk.content,
                    embedding: chunk.embeddings || [],
                    metadata: chunk.metadata || {},
                    start_position: chunk.start_position,
                    end_position: chunk.end_position
                }));

                await this.table.add(data);
            }
            
            logger.debug(`Added ${chunks.length} chunks to LanceDB`);
        } catch (error) {
            logger.error("Failed to add chunks to LanceDB:", error);
            throw new Error(`Failed to add chunks: ${error}`);
        }
    }

    async removeChunks(documentId: string): Promise<void> {
        if (!this.initialized) {
            throw new Error("LanceDB not initialized");
        }
        
        if (!this.table) {
            // Table doesn't exist yet, nothing to remove
            logger.debug(`No table exists, skipping removal for document: ${documentId}`);
            return;
        }

        try {
            await this.table.delete(`document_id = '${documentId}'`);
            logger.debug(`Removed chunks for document: ${documentId}`);
        } catch (error) {
            logger.error(`Failed to remove chunks for document ${documentId}:`, error);
            throw new Error(`Failed to remove chunks: ${error}`);
        }
    }

    async search(queryEmbedding: number[], limit: number, filter?: string): Promise<SearchResult[]> {
        if (!this.initialized) {
            throw new Error("LanceDB not initialized");
        }
        
        if (!this.table) {
            // Table doesn't exist yet, return empty results
            logger.debug("No table exists, returning empty search results");
            return [];
        }

        try {
            const query = this.table.search(queryEmbedding).limit(limit);
            
            if (filter) {
                query.where(filter);
            }

            const results = await query.toArray();
            
            return results.map((row: any) => ({
                chunk: {
                    id: row.id,
                    document_id: row.document_id,
                    chunk_index: row.chunk_index,
                    content: row.content,
                    embeddings: row.embedding,
                    start_position: row.start_position,
                    end_position: row.end_position,
                    metadata: row.metadata
                },
                // Normalize cosine similarity from [-1, 1] to [0, 1] for better UX
                score: row._distance ? (2 - row._distance) / 2 : 1
            })).sort((a: SearchResult, b: SearchResult) => b.score - a.score);
        } catch (error) {
            logger.error("Failed to search LanceDB:", error);
            throw new Error(`Failed to search: ${error}`);
        }
    }

    async getChunk(chunkId: string): Promise<DocumentChunk | null> {
        if (!this.initialized) {
            throw new Error("LanceDB not initialized");
        }
        
        if (!this.table) {
            // Table doesn't exist yet
            return null;
        }

        try {
            const results = await this.table.query()
                .where(`id = '${chunkId}'`)
                .limit(1)
                .toArray();

            if (results.length === 0) {
                return null;
            }

            const row = results[0];
            return {
                id: row.id,
                document_id: row.document_id,
                chunk_index: row.chunk_index,
                content: row.content,
                embeddings: row.embedding,
                start_position: row.start_position,
                end_position: row.end_position,
                metadata: row.metadata
            };
        } catch (error) {
            logger.error(`Failed to get chunk ${chunkId}:`, error);
            return null;
        }
    }

    async close(): Promise<void> {
        if (this.db) {
            try {
                await this.db.close();
                logger.info("LanceDB connection closed");
            } catch (error) {
                logger.error("Error closing LanceDB:", error);
            }
        }
        this.initialized = false;
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Add code blocks to the code_blocks table
     * @param codeBlocks - Array of code blocks with embeddings to add
     */
    async addCodeBlocks(codeBlocks: CodeBlock[]): Promise<void> {
        if (!this.initialized) {
            throw new Error("LanceDB not initialized");
        }

        try {
            // Create code_blocks table on first data insertion if it doesn't exist
            if (!this.codeBlocksTable) {
                logger.info(`Creating code_blocks table with ${codeBlocks.length} initial code blocks`);
                this.codeBlocksTable = await this.db.createTable(this.codeBlocksTableName, codeBlocks.map(block => ({
                    id: block.id,
                    document_id: block.document_id,
                    block_id: block.block_id,
                    block_index: block.block_index,
                    language: block.language,
                    content: block.content,
                    embedding: block.embedding || [],
                    metadata: block.metadata || {},
                    source_url: block.source_url || '',
                })));

                // Create indexes after initial data is added
                try {
                    console.error('[LanceDBAdapter] Creating scalar indexes on initial code_blocks data...');
                    await this.codeBlocksTable.createIndex("document_id", { config: Index.btree() });
                    logger.info("Created scalar index on 'document_id' column");
                } catch (error) {
                    logger.debug("Scalar index creation failed (may already exist):", error);
                }

                try {
                    await this.codeBlocksTable.createIndex("language", { config: Index.btree() });
                    logger.info("Created scalar index on 'language' column");
                } catch (error) {
                    logger.debug("Scalar index on language creation failed (may already exist):", error);
                }

                // Create vector index with timeout
                try {
                    console.error('[LanceDBAdapter] Creating vector index on initial code_blocks data with 30 second timeout...');
                    const indexCreationPromise = this.codeBlocksTable.createIndex("embedding", {
                        type: "ivf_pq",
                        metricType: "cosine",
                        num_partitions: 256,
                        num_sub_vectors: 16
                    });

                    const timeoutPromise = new Promise<never>((_, reject) => {
                        setTimeout(() => {
                            reject(new Error('Code blocks index creation timed out after 30 seconds'));
                        }, 30000);
                    });

                    await Promise.race([indexCreationPromise, timeoutPromise]);
                    logger.info("Created vector index on code_blocks 'embedding' column");
                    console.error('[LanceDBAdapter] Code_blocks vector index created successfully');
                } catch (error) {
                    const isTimeout = error instanceof Error && error.message.includes('timed out');
                    if (isTimeout) {
                        console.warn('[LanceDBAdapter] Code blocks index creation timed out, continuing without index');
                    } else {
                        logger.debug("Code blocks vector index creation failed (may already exist):", error);
                    }
                }
            } else {
                // Table already exists, just add data
                const data = codeBlocks.map(block => ({
                    id: block.id,
                    document_id: block.document_id,
                    block_id: block.block_id,
                    block_index: block.block_index,
                    language: block.language,
                    content: block.content,
                    embedding: block.embedding || [],
                    metadata: block.metadata || {},
                    source_url: block.source_url || '',
                }));

                await this.codeBlocksTable.add(data);
            }

            logger.debug(`Added ${codeBlocks.length} code blocks to LanceDB`);
        } catch (error) {
            logger.error("Failed to add code blocks to LanceDB:", error);
            throw new Error(`Failed to add code blocks: ${error}`);
        }
    }

    /**
     * Search code blocks using vector similarity
     * @param queryEmbedding - Query vector embedding
     * @param limit - Maximum number of results to return
     * @param language - Optional language filter (e.g., 'javascript', 'python')
     */
    async searchCodeBlocks(
        queryEmbedding: number[],
        limit: number,
        language?: string
    ): Promise<CodeBlockSearchResult[]> {
        if (!this.initialized) {
            throw new Error("LanceDB not initialized");
        }

        if (!this.codeBlocksTable) {
            // Table doesn't exist yet, return empty results
            logger.debug("No code_blocks table exists, returning empty search results");
            return [];
        }

        try {
            const query = this.codeBlocksTable.search(queryEmbedding).limit(limit);

            // Apply language filter if provided
            if (language) {
                const normalizedLanguage = language.toLowerCase().trim();
                query.where(`language = '${normalizedLanguage}'`);
            }

            const results = await query.toArray();

            return results.map((row: any) => ({
                code_block: {
                    id: row.id,
                    document_id: row.document_id,
                    block_id: row.block_id,
                    block_index: row.block_index,
                    language: row.language,
                    content: row.content,
                    embedding: row.embedding,
                    metadata: row.metadata,
                    source_url: row.source_url,
                },
                // Normalize cosine similarity from [-1, 1] to [0, 1] for better UX
                score: row._distance ? (2 - row._distance) / 2 : 1,
            })).sort((a: CodeBlockSearchResult, b: CodeBlockSearchResult) => b.score - a.score);
        } catch (error) {
            logger.error("Failed to search code blocks:", error);
            throw new Error(`Failed to search code blocks: ${error}`);
        }
    }

    /**
     * Get all code blocks for a specific document
     * @param documentId - Document ID to get code blocks for
     */
    async getCodeBlocksByDocument(documentId: string): Promise<CodeBlock[]> {
        if (!this.initialized) {
            throw new Error("LanceDB not initialized");
        }

        if (!this.codeBlocksTable) {
            return [];
        }

        try {
            const results = await this.codeBlocksTable.query()
                .where(`document_id = '${documentId}'`)
                .toArray();

            return results.map((row: any) => ({
                id: row.id,
                document_id: row.document_id,
                block_id: row.block_id,
                block_index: row.block_index,
                language: row.language,
                content: row.content,
                embedding: row.embedding,
                metadata: row.metadata,
                source_url: row.source_url,
            })).sort((a: CodeBlock, b: CodeBlock) => a.block_index - b.block_index);
        } catch (error) {
            logger.error(`Failed to get code blocks for document ${documentId}:`, error);
            return [];
        }
    }
}

/**
 * Factory function to create LanceDB vector database instance
 */
export function createVectorDatabase(dbPath?: string): VectorDatabase {
    const dbPathValue = dbPath || path.join(os.homedir(), ".data", "lancedb");
    return new LanceDBAdapter(dbPathValue);
}
