/**
 * Saga v1.0.0 Database Migration Utilities
 *
 * Provides utilities for migrating from the old schema to the new v1.0.0 schema.
 * The new schema uses flattened metadata, normalized tables, and LanceDB as the
 * single source of truth.
 */

import * as crypto from 'crypto';
import * as lancedb from '@lancedb/lancedb';
import { Index } from '@lancedb/lancedb';
import { getLogger } from '../utils.js';
import type {
    DocumentV1,
    DocumentTagV1,
    DocumentLanguageV1,
    ChunkV1,
    CodeBlockV1,
    KeywordV1,
    SchemaVersionV1,
    VectorIndexConfig,
    MigrationOptions,
    MigrationResultV1,
    LanceDB,
    LanceTable
} from '../types/database-v1.js';

export type { MigrationOptions } from '../types/database-v1.js';

const logger = getLogger('MigrationV1');

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
    return crypto.randomUUID();
}

/**
 * Get current ISO 8601 timestamp
 */
function getCurrentTimestamp(): string {
    return new Date().toISOString();
}

/**
 * Generate a sample embedding vector for schema inference
 * Creates a 1536-dimensional vector with float32 values (all zeros)
 * This allows LanceDB to properly infer the embedding field type
 */
function generateSampleEmbedding(dim: number = 1536): number[] {
    return new Array(dim).fill(0);
}

/**
 * Calculate SHA-256 hash of content (truncated to 16 chars)
 */
function calculateContentHash(content: string): string {
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    return hash.substring(0, 16);
}

/**
 * Calculate dynamic IVF_PQ parameters based on vector count and dimension
 * Based on LanceDB documentation recommendations
 */
function calculateIVF_PQ_Params(vectorCount: number, embeddingDim: number): VectorIndexConfig {
    // num_partitions: sqrt(n) for optimal balance
    const numPartitions = Math.max(16, Math.floor(Math.sqrt(vectorCount)));
    
    // num_sub_vectors: dimension / 16 for good compression
    const numSubVectors = Math.max(4, Math.floor(embeddingDim / 16));
    
    return {
        type: 'ivf_pq',
        metricType: 'cosine',
        num_partitions: Math.min(numPartitions, 2048), // Cap at 2048
        num_sub_vectors: Math.min(numSubVectors, 256)   // Cap at 256
    };
}

/**
 * Extract keywords from text using simple tokenization
 */
function extractKeywords(text: string, maxKeywords: number = 50): string[] {
    const words = text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3);
    
    // Count word frequencies
    const frequency = new Map<string, number>();
    for (const word of words) {
        frequency.set(word, (frequency.get(word) || 0) + 1);
    }
    
    // Sort by frequency and return top keywords
    return Array.from(frequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxKeywords)
        .map(([word]) => word);
}

/**
 * Retry logic with exponential backoff
 */
async function withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 5,
    baseDelayMs: number = 100
): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            const isCommitConflict = error instanceof Error &&
                (error.message.includes('commit conflict') ||
                 error.message.includes('Transaction'));
            
            if (!isCommitConflict || attempt === maxRetries) {
                throw error;
            }
            
            const delay = Math.min(5000, baseDelayMs * Math.pow(2, attempt));
            logger.warn(`${operationName} conflict on attempt ${attempt + 1}, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw new Error(`${operationName} failed after ${maxRetries} retries`);
}

// ============================================================================
// Schema Creation
// ============================================================================

/**
 * Drop all v1 tables if they exist
 */
export async function dropV1Tables(db: LanceDB): Promise<void> {
    const tableNames = ['documents', 'document_tags', 'document_languages', 'chunks', 'code_blocks', 'keywords', 'schema_version'];
    let droppedCount = 0;

    for (const tableName of tableNames) {
        try {
            const table = await db.openTable(tableName);
            const count = await table.countRows();
            await db.dropTable(tableName);
            logger.info(`Dropped table '${tableName}' (${count} rows)`);
            droppedCount++;
        } catch (error) {
            // Table doesn't exist, which is expected
            logger.debug(`Table '${tableName}' does not exist, skipping`);
        }
    }

    if (droppedCount > 0) {
        logger.info(`Cleared ${droppedCount} existing v1 tables before migration`);
    }
}

/**
 * Create all v1 tables with proper schema
 */
export async function createV1Schema(db: LanceDB): Promise<void> {
    logger.info('Creating v1.0.0 schema...');

    // Create documents table with sample record
    try {
        await db.createTable('documents', [{
            id: generateUUID(),
            title: '',
            content_hash: '',
            content_length: 0,
            source: 'upload',
            original_filename: '',
            file_extension: '',
            crawl_id: '',
            crawl_url: '',
            author: '',
            description: '',
            content_type: '',
            created_at: getCurrentTimestamp(),
            updated_at: getCurrentTimestamp(),
            processed_at: getCurrentTimestamp(),
            chunks_count: 0,
            code_blocks_count: 0,
            status: 'active'
        }]);
        logger.info('Created documents table');
    } catch (error) {
        if ((error as Error).message.includes('already exists')) {
            logger.info('Documents table already exists');
        } else {
            throw error;
        }
    }
    
    // Create document_tags table with sample record
    try {
        await db.createTable('document_tags', [{
            id: generateUUID(),
            document_id: '',
            tag: '',
            is_generated: false,
            created_at: getCurrentTimestamp()
        }]);
        logger.info('Created document_tags table');
    } catch (error) {
        if ((error as Error).message.includes('already exists')) {
            logger.info('Document_tags table already exists');
        } else {
            throw error;
        }
    }
    
    // Create document_languages table with sample record
    try {
        await db.createTable('document_languages', [{
            id: generateUUID(),
            document_id: '',
            language_code: '',
            created_at: getCurrentTimestamp()
        }]);
        logger.info('Created document_languages table');
    } catch (error) {
        if ((error as Error).message.includes('already exists')) {
            logger.info('Document_languages table already exists');
        } else {
            throw error;
        }
    }
    
    // Create chunks table with sample record
    try {
        await db.createTable('chunks', [{
            id: generateUUID(),
            document_id: '',
            chunk_index: 0,
            start_position: 0,
            end_position: 0,
            content: '',
            content_length: 0,
            embedding: generateSampleEmbedding(),
            surrounding_context: '',
            semantic_topic: '',
            created_at: getCurrentTimestamp()
        }]);
        logger.info('Created chunks table');
    } catch (error) {
        if ((error as Error).message.includes('already exists')) {
            logger.info('Chunks table already exists');
        } else {
            throw error;
        }
    }
    
    // Create code_blocks table with sample record
    try {
        await db.createTable('code_blocks', [{
            id: generateUUID(),
            document_id: '',
            block_id: '',
            block_index: 0,
            language: '',
            content: '',
            content_length: 0,
            embedding: generateSampleEmbedding(),
            source_url: '',
            created_at: getCurrentTimestamp()
        }]);
        logger.info('Created code_blocks table');
    } catch (error) {
        if ((error as Error).message.includes('already exists')) {
            logger.info('Code_blocks table already exists');
        } else {
            throw error;
        }
    }
    
    // Create keywords table with sample record
    try {
        await db.createTable('keywords', [{
            id: generateUUID(),
            keyword: '',
            document_id: '',
            source: 'title',
            frequency: 0,
            created_at: getCurrentTimestamp()
        }]);
        logger.info('Created keywords table');
    } catch (error) {
        if ((error as Error).message.includes('already exists')) {
            logger.info('Keywords table already exists');
        } else {
            throw error;
        }
    }
    
    // Create schema_version table with sample record
    try {
        await db.createTable('schema_version', [{
            id: 0,
            version: '',
            applied_at: getCurrentTimestamp(),
            description: ''
        }]);
        logger.info('Created schema_version table');
    } catch (error) {
        if ((error as Error).message.includes('already exists')) {
            logger.info('Schema_version table already exists');
        } else {
            throw error;
        }
    }
    
    logger.info('v1.0.0 schema created successfully');
}

// ============================================================================
// Schema Cleanup
// ============================================================================

/**
 * Remove sample records from all v1 tables after schema creation
 * These sample records are used for schema inference but should be removed
 * before migration to avoid data count mismatches
 */
export async function cleanupSampleRecords(db: LanceDB): Promise<void> {
    logger.info('Cleaning up sample records from v1 tables...');
    
    const tableNames = ['documents', 'document_tags', 'document_languages', 'chunks', 'code_blocks', 'keywords'];
    let totalRemoved = 0;
    
    for (const tableName of tableNames) {
        try {
            const table = await db.openTable(tableName);
            
            // Remove records with empty document_id (sample records)
            const sampleRecords = await table
                .query()
                .where(`document_id = ''`)
                .toArray();
            
            if (sampleRecords.length > 0) {
                // Delete sample records
                for (const record of sampleRecords) {
                    await table.delete(`id = '${record.id}'`);
                }
                totalRemoved += sampleRecords.length;
                logger.info(`Removed ${sampleRecords.length} sample record(s) from '${tableName}' table`);
            }
        } catch (error) {
            logger.warn(`Could not clean up '${tableName}' table:`, error);
        }
    }
    
    // Also clean up schema_version table if it has a sample record (id = 0)
    try {
        const schemaVersionTable = await db.openTable('schema_version');
        const sampleVersions = await schemaVersionTable
            .query()
            .where(`id = 0`)
            .toArray();
        
        if (sampleVersions.length > 0) {
            for (const record of sampleVersions) {
                await schemaVersionTable.delete(`id = ${record.id}`);
            }
            totalRemoved += sampleVersions.length;
            logger.info(`Removed ${sampleVersions.length} sample record(s) from 'schema_version' table`);
        }
    } catch (error) {
        logger.warn('Could not clean up schema_version table:', error);
    }
    
    if (totalRemoved > 0) {
        logger.info(`Sample record cleanup complete: ${totalRemoved} record(s) removed`);
    } else {
        logger.info('No sample records found to clean up');
    }
}

// ============================================================================
// Migration Functions
// ============================================================================

/**
 * Migrate documents from old schema to new schema
 */
export async function migrateDocuments(
    oldDb: LanceDB,
    newDb: LanceDB,
    batchSize: number = 1000
): Promise<number> {
    logger.info('Migrating documents table...');
    
    let migratedCount = 0;
    
    try {
        const oldChunksTable = await oldDb.openTable('chunks');
        const newDocumentsTable = await newDb.openTable('documents');
        const newDocumentTagsTable = await newDb.openTable('document_tags');
        const newDocumentLanguagesTable = await newDb.openTable('document_languages');
        
        // Get all unique document IDs from old chunks table
        const allChunks = await oldChunksTable.query().toArray();
        const documentMap = new Map<string, any[]>();
        
        for (const chunk of allChunks) {
            const docId = chunk.document_id;
            if (!documentMap.has(docId)) {
                documentMap.set(docId, []);
            }
            documentMap.get(docId)!.push(chunk);
        }
        
        logger.info(`Found ${documentMap.size} unique documents to migrate`);
        
        // Process documents in batches
        const documentIds = Array.from(documentMap.keys());
        const batches: string[][] = [];
        
        for (let i = 0; i < documentIds.length; i += batchSize) {
            batches.push(documentIds.slice(i, i + batchSize));
        }
        
        for (const batch of batches) {
            const documents: DocumentV1[] = [];
            const tags: DocumentTagV1[] = [];
            const languages: DocumentLanguageV1[] = [];
            
            for (const documentId of batch) {
                const chunks = documentMap.get(documentId)!;
                const firstChunk = chunks[0];
                const metadata = firstChunk.metadata || {};
                
                // Extract document metadata from first chunk
                const title = metadata.title || `Document ${documentId}`;
                const content = chunks.map(c => c.content).join('\n');
                const contentHash = calculateContentHash(content);
                
                // Extract tags from metadata
                const tagsArray = metadata.tags || [];
                const languagesArray = metadata.languages || [];
                
                // Create document row
                const document: DocumentV1 = {
                    id: documentId,
                    title,
                    content_hash: contentHash,
                    content_length: content.length,
                    source: metadata.source || 'upload',
                    original_filename: metadata.original_filename || null,
                    file_extension: metadata.file_extension || null,
                    crawl_id: metadata.crawl_id || null,
                    crawl_url: metadata.crawl_url || null,
                    author: metadata.author || null,
                    description: metadata.description || null,
                    content_type: metadata.content_type || null,
                    created_at: metadata.created_at || getCurrentTimestamp(),
                    updated_at: metadata.updated_at || getCurrentTimestamp(),
                    processed_at: getCurrentTimestamp(),
                    chunks_count: chunks.length,
                    code_blocks_count: 0, // Will be updated later
                    status: 'active'
                };
                
                documents.push(document);
                
                // Create tag relationships
                for (const tag of tagsArray) {
                    tags.push({
                        id: generateUUID(),
                        document_id: documentId,
                        tag: tag.toLowerCase(),
                        is_generated: metadata.is_generated_tags || false,
                        created_at: getCurrentTimestamp()
                    });
                }
                
                // Create language relationships
                for (const language of languagesArray) {
                    languages.push({
                        id: generateUUID(),
                        document_id: documentId,
                        language_code: language.toLowerCase(),
                        created_at: getCurrentTimestamp()
                    });
                }
            }
            
            // Add documents to new table
            if (documents.length > 0) {
                await newDocumentsTable.add(documents);
            }
            
            // Add tags to new table
            if (tags.length > 0) {
                await newDocumentTagsTable.add(tags);
            }
            
            // Add languages to new table
            if (languages.length > 0) {
                await newDocumentLanguagesTable.add(languages);
            }
            
            migratedCount += batch.length;
            logger.info(`Migrated ${migratedCount}/${documentIds.length} documents`);
        }
        
        logger.info(`Documents migration complete: ${migratedCount} documents`);
    } catch (error) {
        logger.error('Error migrating documents:', error);
        throw error;
    }
    
    return migratedCount;
}

/**
 * Migrate chunks from old schema to new schema with flattened metadata
 */
export async function migrateChunks(
    oldDb: LanceDB,
    newDb: LanceDB,
    batchSize: number = 1000
): Promise<number> {
    logger.info('Migrating chunks table...');
    
    let migratedCount = 0;
    
    try {
        const oldChunksTable = await oldDb.openTable('chunks');
        const newChunksTable = await newDb.openTable('chunks');
        
        // Get all chunks from old table
        const allChunks = await oldChunksTable.query().toArray();
        logger.info(`Found ${allChunks.length} chunks to migrate`);
        
        // Process chunks in batches
        for (let i = 0; i < allChunks.length; i += batchSize) {
            const batch = allChunks.slice(i, i + batchSize);
            const chunks: ChunkV1[] = [];
            
            for (const oldChunk of batch) {
                const metadata = oldChunk.metadata || {};
                
                // Extract embedding vector from old schema
                // The old schema may have embedding as a LanceDB internal object
                let embeddingVector: number[] = [];
                if (oldChunk.embedding) {
                    if (Array.isArray(oldChunk.embedding)) {
                        // Already an array, use as-is
                        embeddingVector = oldChunk.embedding;
                    } else if (typeof oldChunk.embedding === 'object' && 'length' in oldChunk.embedding) {
                        // LanceDB internal object - convert to array
                        try {
                            embeddingVector = Array.from(oldChunk.embedding as any);
                        } catch (error) {
                            logger.warn(`Failed to convert embedding object to array for chunk ${oldChunk.id}:`, error);
                            embeddingVector = [];
                        }
                    }
                }
                
                // Create chunk with flattened metadata
                const chunk: ChunkV1 = {
                    id: oldChunk.id,
                    document_id: oldChunk.document_id,
                    chunk_index: oldChunk.chunk_index,
                    start_position: oldChunk.start_position || 0,
                    end_position: oldChunk.end_position || 0,
                    content: oldChunk.content,
                    content_length: oldChunk.content.length,
                    embedding: embeddingVector,
                    surrounding_context: metadata.surrounding_context || null,
                    semantic_topic: metadata.semantic_topic || null,
                    created_at: getCurrentTimestamp()
                };
                
                chunks.push(chunk);
            }
            
            // Add chunks to new table
            if (chunks.length > 0) {
                await newChunksTable.add(chunks);
            }
            
            migratedCount += batch.length;
            logger.info(`Migrated ${migratedCount}/${allChunks.length} chunks`);
        }
        
        logger.info(`Chunks migration complete: ${migratedCount} chunks`);
    } catch (error) {
        logger.error('Error migrating chunks:', error);
        throw error;
    }
    
    return migratedCount;
}

/**
 * Migrate code blocks from old schema to new schema
 */
export async function migrateCodeBlocks(
    oldDb: LanceDB,
    newDb: LanceDB,
    batchSize: number = 1000
): Promise<number> {
    logger.info('Migrating code_blocks table...');
    
    let migratedCount = 0;
    
    try {
        const oldCodeBlocksTable = await oldDb.openTable('code_blocks');
        const newCodeBlocksTable = await newDb.openTable('code_blocks');
        const newDocumentsTable = await newDb.openTable('documents');
        
        // Get all code blocks from old table
        const allCodeBlocks = await oldCodeBlocksTable.query().toArray();
        logger.info(`Found ${allCodeBlocks.length} code blocks to migrate`);
        
        // Process code blocks in batches
        for (let i = 0; i < allCodeBlocks.length; i += batchSize) {
            const batch = allCodeBlocks.slice(i, i + batchSize);
            const codeBlocks: CodeBlockV1[] = [];
            const documentUpdateMap = new Map<string, number>();
            
            for (const oldBlock of batch) {
                const metadata = oldBlock.metadata || {};
                
                // Extract embedding vector from old schema
                // The old schema may have embedding as a LanceDB internal object
                let embeddingVector: number[] = [];
                if (oldBlock.embedding) {
                    if (Array.isArray(oldBlock.embedding)) {
                        // Already an array, use as-is
                        embeddingVector = oldBlock.embedding;
                    } else if (typeof oldBlock.embedding === 'object' && 'length' in oldBlock.embedding) {
                        // LanceDB internal object - convert to array
                        try {
                            embeddingVector = Array.from(oldBlock.embedding as any);
                        } catch (error) {
                            logger.warn(`Failed to convert embedding object to array for code block ${oldBlock.id}:`, error);
                            embeddingVector = [];
                        }
                    }
                }
                
                // Create code block
                const codeBlock: CodeBlockV1 = {
                    id: oldBlock.id,
                    document_id: oldBlock.document_id,
                    block_id: oldBlock.block_id,
                    block_index: oldBlock.block_index,
                    language: oldBlock.language || 'unknown',
                    content: oldBlock.content,
                    content_length: oldBlock.content.length,
                    embedding: embeddingVector,
                    source_url: oldBlock.source_url || metadata.source_url || null,
                    created_at: getCurrentTimestamp()
                };
                
                codeBlocks.push(codeBlock);
                
                // Track code blocks per document
                documentUpdateMap.set(
                    oldBlock.document_id,
                    (documentUpdateMap.get(oldBlock.document_id) || 0) + 1
                );
            }
            
            // Add code blocks to new table
            if (codeBlocks.length > 0) {
                await newCodeBlocksTable.add(codeBlocks);
            }
            
            // Update documents with code block counts
            for (const [documentId, count] of Array.from(documentUpdateMap.entries())) {
                // Get current document
                const docs = await newDocumentsTable
                    .query()
                    .where(`id = '${documentId}'`)
                    .toArray();
                
                if (docs.length > 0) {
                    const doc = docs[0];
                    await newDocumentsTable.update({
                        where: `id = '${documentId}'`,
                        values: {
                            code_blocks_count: (doc.code_blocks_count || 0) + count
                        }
                    });
                }
            }
            
            migratedCount += batch.length;
            logger.info(`Migrated ${migratedCount}/${allCodeBlocks.length} code blocks`);
        }
        
        logger.info(`Code blocks migration complete: ${migratedCount} code blocks`);
    } catch (error) {
        logger.error('Error migrating code blocks:', error);
        throw error;
    }
    
    return migratedCount;
}

/**
 * Build keyword inverted index from documents
 */
export async function buildKeywordIndex(
    newDb: LanceDB,
    batchSize: number = 1000
): Promise<number> {
    logger.info('Building keyword index...');
    
    let keywordCount = 0;
    
    try {
        const newDocumentsTable = await newDb.openTable('documents');
        const newKeywordsTable = await newDb.openTable('keywords');
        
        // Get all documents
        const documents = await newDocumentsTable.query().toArray();
        logger.info(`Processing ${documents.length} documents for keywords`);
        
        const keywords: KeywordV1[] = [];
        
        for (const document of documents) {
            // Extract keywords from title
            const titleKeywords = extractKeywords(document.title, 10);
            for (const keyword of titleKeywords) {
                keywords.push({
                    id: generateUUID(),
                    keyword,
                    document_id: document.id,
                    source: 'title',
                    frequency: 1,
                    created_at: getCurrentTimestamp()
                });
            }
            
            // Get chunks for this document to extract content keywords
            const newChunksTable = await newDb.openTable('chunks');
            const chunks = await newChunksTable
                .query()
                .where(`document_id = '${document.id}'`)
                .toArray();
            
            const content = chunks.map((c: any) => c.content).join(' ');
            const contentKeywords = extractKeywords(content, 40);
            
            // Count keyword frequency in content
            const keywordFrequency = new Map<string, number>();
            for (const keyword of contentKeywords) {
                keywordFrequency.set(keyword, (keywordFrequency.get(keyword) || 0) + 1);
            }
            
            for (const [keyword, frequency] of Array.from(keywordFrequency.entries())) {
                keywords.push({
                    id: generateUUID(),
                    keyword,
                    document_id: document.id,
                    source: 'content',
                    frequency,
                    created_at: getCurrentTimestamp()
                });
            }
            
            // Add keywords in batches
            if (keywords.length >= batchSize) {
                await newKeywordsTable.add(keywords);
                keywordCount += keywords.length;
                keywords.length = 0;
                logger.info(`Added ${keywordCount} keywords to index`);
            }
        }
        
        // Add remaining keywords
        if (keywords.length > 0) {
            await newKeywordsTable.add(keywords);
            keywordCount += keywords.length;
        }
        
        logger.info(`Keyword index build complete: ${keywordCount} keywords`);
    } catch (error) {
        logger.error('Error building keyword index:', error);
        throw error;
    }
    
    return keywordCount;
}

/**
 * Create scalar indexes for all tables
 */
export async function createScalarIndexes(newDb: LanceDB): Promise<void> {
    logger.info('Creating scalar indexes...');
    
    try {
        // Documents table indexes
        const documentsTable = await newDb.openTable('documents');
        await documentsTable.createIndex('id', { config: Index.btree() });
        await documentsTable.createIndex('content_hash', { config: Index.btree() });
        await documentsTable.createIndex('source', { config: Index.btree() });
        await documentsTable.createIndex('crawl_id', { config: Index.btree() });
        await documentsTable.createIndex('status', { config: Index.btree() });
        await documentsTable.createIndex('created_at', { config: Index.btree() });
        logger.info('Created scalar indexes on documents table');
        
        // Chunks table indexes
        const chunksTable = await newDb.openTable('chunks');
        await chunksTable.createIndex('document_id', { config: Index.btree() });
        await chunksTable.createIndex('chunk_index', { config: Index.btree() });
        await chunksTable.createIndex('created_at', { config: Index.btree() });
        logger.info('Created scalar indexes on chunks table');
        
        // Code blocks table indexes
        const codeBlocksTable = await newDb.openTable('code_blocks');
        await codeBlocksTable.createIndex('document_id', { config: Index.btree() });
        await codeBlocksTable.createIndex('block_index', { config: Index.btree() });
        await codeBlocksTable.createIndex('language', { config: Index.btree() });
        await codeBlocksTable.createIndex('created_at', { config: Index.btree() });
        logger.info('Created scalar indexes on code_blocks table');
        
        // Document tags table indexes
        const documentTagsTable = await newDb.openTable('document_tags');
        await documentTagsTable.createIndex('document_id', { config: Index.btree() });
        await documentTagsTable.createIndex('tag', { config: Index.btree() });
        logger.info('Created scalar indexes on document_tags table');
        
        // Document languages table indexes
        const documentLanguagesTable = await newDb.openTable('document_languages');
        await documentLanguagesTable.createIndex('document_id', { config: Index.btree() });
        await documentLanguagesTable.createIndex('language_code', { config: Index.btree() });
        logger.info('Created scalar indexes on document_languages table');
        
        // Keywords table indexes
        const keywordsTable = await newDb.openTable('keywords');
        await keywordsTable.createIndex('keyword', { config: Index.btree() });
        await keywordsTable.createIndex('document_id', { config: Index.btree() });
        logger.info('Created scalar indexes on keywords table');
        
        logger.info('Scalar indexes created successfully');
    } catch (error) {
        logger.error('Error creating scalar indexes:', error);
        throw error;
    }
}

/**
 * Create vector indexes with dynamic IVF_PQ parameters
 */
export async function createVectorIndexes(
    newDb: LanceDB,
    vectorCount: number,
    embeddingDim: number = 1536,
    timeoutMs: number = 300000
): Promise<void> {
    logger.info(`Creating vector indexes for ${vectorCount} vectors...`);
    
    // IVF_PQ requires minimum 256 vectors for PQ training
    const MIN_VECTORS_FOR_IVF_PQ = 256;
    
    if (vectorCount < MIN_VECTORS_FOR_IVF_PQ) {
        logger.warn(
            `Skipping vector index creation: only ${vectorCount} vectors available, ` +
            `but IVF_PQ requires at least ${MIN_VECTORS_FOR_IVF_PQ} vectors for training. ` +
            `Brute force search will be used instead, which is efficient for small datasets.`
        );
        return;
    }
    
    try {
        const config = calculateIVF_PQ_Params(vectorCount, embeddingDim);
        logger.info(`IVF_PQ config: partitions=${config.num_partitions}, sub_vectors=${config.num_sub_vectors}`);
        
        // Create chunks vector index
        const chunksTable = await newDb.openTable('chunks');
        const chunksIndexPromise = chunksTable.createIndex('embedding', {
            type: config.type,
            metricType: config.metricType,
            num_partitions: config.num_partitions,
            num_sub_vectors: config.num_sub_vectors
        });
        
        const chunksTimeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                reject(new Error('Chunks vector index creation timed out'));
            }, timeoutMs);
        });
        
        await Promise.race([chunksIndexPromise, chunksTimeoutPromise]);
        logger.info('Created vector index on chunks table');
        
        // Create code_blocks vector index
        const codeBlocksTable = await newDb.openTable('code_blocks');
        const codeBlocksIndexPromise = codeBlocksTable.createIndex('embedding', {
            type: config.type,
            metricType: config.metricType,
            num_partitions: config.num_partitions,
            num_sub_vectors: config.num_sub_vectors
        });
        
        const codeBlocksTimeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                reject(new Error('Code blocks vector index creation timed out'));
            }, timeoutMs);
        });
        
        await Promise.race([codeBlocksIndexPromise, codeBlocksTimeoutPromise]);
        logger.info('Created vector index on code_blocks table');
        
        logger.info('Vector indexes created successfully');
    } catch (error) {
        if ((error as Error).message.includes('timed out')) {
            logger.warn('Vector index creation timed out, continuing without index');
        } else {
            logger.error('Error creating vector indexes:', error);
            throw error;
        }
    }
}

/**
 * Validate migration by comparing old and new data
 */
export async function validateMigration(
    oldDb: LanceDB,
    newDb: LanceDB
): Promise<boolean> {
    logger.info('Validating migration...');

    try {
        // Compare chunk counts
        const oldChunksTable = await oldDb.openTable('chunks');
        const newChunksTable = await newDb.openTable('chunks');

        const oldChunkCount = await oldChunksTable.countRows();
        const newChunkCount = await newChunksTable.countRows();

        if (oldChunkCount !== newChunkCount) {
            logger.error(`Chunk count mismatch: old=${oldChunkCount}, new=${newChunkCount}`);
            return false;
        }
        
        // Compare code block counts
        try {
            const oldCodeBlocksTable = await oldDb.openTable('code_blocks');
            const newCodeBlocksTable = await newDb.openTable('code_blocks');
            
            const oldCodeBlockCount = await oldCodeBlocksTable.countRows();
            const newCodeBlockCount = await newCodeBlocksTable.countRows();
            
            if (oldCodeBlockCount !== newCodeBlockCount) {
                logger.error(`Code block count mismatch: old=${oldCodeBlockCount}, new=${newCodeBlockCount}`);
                return false;
            }
        } catch (error) {
            // Code blocks table might not exist in old schema
            logger.info('Code blocks table validation skipped (not present in old schema)');
        }
        
        // Verify document count
        const newDocumentsTable = await newDb.openTable('documents');
        const documentCount = await newDocumentsTable.countRows();
        
        if (documentCount === 0) {
            logger.error('No documents found in new schema');
            return false;
        }
        
        // Verify schema version
        const schemaVersionTable = await newDb.openTable('schema_version');
        const schemaVersions = await schemaVersionTable.query().toArray();
        
        if (schemaVersions.length === 0) {
            logger.warn('No schema version record found');
        }
        
        logger.info('Migration validation passed');
        return true;
    } catch (error) {
        logger.error('Error validating migration:', error);
        return false;
    }
}

/**
 * Record schema version in schema_version table
 */
export async function recordSchemaVersion(
    newDb: LanceDB,
    version: string,
    description: string
): Promise<void> {
    logger.info(`Recording schema version: ${version}`);
    
    try {
        const schemaVersionTable = await newDb.openTable('schema_version');
        
        const schemaVersion: SchemaVersionV1 = {
            id: Date.now(),
            version,
            applied_at: getCurrentTimestamp(),
            description
        };
        
        await schemaVersionTable.add([schemaVersion]);
        logger.info(`Schema version ${version} recorded successfully`);
    } catch (error) {
        logger.error('Error recording schema version:', error);
        throw error;
    }
}

// ============================================================================
// Main Migration Function
// ============================================================================

/**
 * Main migration function to migrate from old schema to v1.0.0
 */
export async function migrateToV1(
    dbPath: string,
    options: MigrationOptions = {}
): Promise<MigrationResultV1> {
    const startTime = Date.now();
    const result: MigrationResultV1 = {
        success: false,
        documentsMigrated: 0,
        chunksMigrated: 0,
        codeBlocksMigrated: 0,
        tagsMigrated: 0,
        languagesMigrated: 0,
        keywordsCreated: 0,
        errors: [],
        duration: 0
    };
    
    const batchSize = options.batchSize || 1000;
    const progressTracking = options.progressTracking ?? true;
    const dryRun = options.dryRun ?? false;
    const createIndexes = options.createIndexes ?? true;
    const validateAfterMigration = options.validateAfterMigration ?? true;
    
    logger.info(`Starting migration to v1.0.0${dryRun ? ' (dry run)' : ''}...`);
    
    try {
        // Connect to old database (backup should be used as source)
        // Find the most recent backup directory
        const fs = await import('fs');
        const path = await import('path');
        
        let oldDbPath = dbPath;
        const parentDir = path.dirname(dbPath);
        const dbBaseName = path.basename(dbPath);
        
        try {
            const files = fs.readdirSync(parentDir);
            const backups = files
                .filter(f => f.startsWith(`${dbBaseName}.backup.`))
                .sort((a, b) => {
                    // Extract timestamp and sort by most recent
                    const aMatch = a.match(/\.backup\.(\d+)$/);
                    const bMatch = b.match(/\.backup\.(\d+)$/);
                    if (!aMatch || !bMatch) return 0;
                    return parseInt(bMatch[1]) - parseInt(aMatch[1]);
                });
            
            if (backups.length > 0) {
                oldDbPath = path.join(parentDir, backups[0]);
                logger.info(`Using backup as source: ${oldDbPath}`);
            }
        } catch (error) {
            // If we can't find backups, just use the original db
            logger.debug(`Could not find backup directory, using original db: ${dbPath}`);
        }
        
        const oldDb = await lancedb.connect(oldDbPath);
        logger.info(`Connected to old database at: ${oldDbPath}`);
        
        // Connect to new database (original db path)
        const newDb = await lancedb.connect(dbPath);
        logger.info(`Connected to new database at: ${dbPath}`);
        
        if (dryRun) {
            logger.info('Dry run mode - no changes will be made');
            result.success = true;
            result.duration = Date.now() - startTime;
            return result;
        }

        // Phase 1: Clear existing v1 tables and create new schema
        await dropV1Tables(newDb);
        await createV1Schema(newDb);
        await cleanupSampleRecords(newDb);
        
        // Phase 2: Migrate data
        result.documentsMigrated = await migrateDocuments(oldDb, newDb, batchSize);
        result.chunksMigrated = await migrateChunks(oldDb, newDb, batchSize);
        result.codeBlocksMigrated = await migrateCodeBlocks(oldDb, newDb, batchSize);
        result.keywordsCreated = await buildKeywordIndex(newDb, batchSize);
        
        // Count tags and languages
        const newDocumentTagsTable = await newDb.openTable('document_tags');
        const newDocumentLanguagesTable = await newDb.openTable('document_languages');
        result.tagsMigrated = await newDocumentTagsTable.countRows();
        result.languagesMigrated = await newDocumentLanguagesTable.countRows();
        
        // Phase 3: Create indexes
        if (createIndexes) {
            await createScalarIndexes(newDb);
            
            // Get vector count for dynamic index configuration
            const newChunksTable = await newDb.openTable('chunks');
            const vectorCount = await newChunksTable.countRows();
            
            if (vectorCount > 0) {
                await createVectorIndexes(newDb, vectorCount);
            }
        }
        
        // Phase 4: Record schema version
        await recordSchemaVersion(newDb, '1.0.0', 'Migrated to v1.0.0 schema with flattened metadata and normalized tables');
        
        // Phase 5: Validate migration
        if (validateAfterMigration) {
            const isValid = await validateMigration(oldDb, newDb);
            if (!isValid) {
                result.errors.push('Migration validation failed');
                result.success = false;
            } else {
                result.success = true;
            }
        } else {
            result.success = true;
        }
        
        // Close connections
        await oldDb.close();
        await newDb.close();
        
        result.duration = Date.now() - startTime;
        
        if (result.success) {
            logger.info(`Migration completed successfully in ${result.duration}ms`);
            logger.info(`Documents: ${result.documentsMigrated}, Chunks: ${result.chunksMigrated}, Code Blocks: ${result.codeBlocksMigrated}`);
            logger.info(`Tags: ${result.tagsMigrated}, Languages: ${result.languagesMigrated}, Keywords: ${result.keywordsCreated}`);
        } else {
            logger.error(`Migration failed with ${result.errors.length} errors`);
        }
        
        return result;
    } catch (error) {
        result.errors.push(error instanceof Error ? error.message : String(error));
        result.duration = Date.now() - startTime;
        logger.error('Migration failed:', error);
        return result;
    }
}
