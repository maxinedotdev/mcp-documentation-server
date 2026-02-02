/**
 * Migration tests for Lance DB integration
 * Tests for migrating JSON documents to LanceDB
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createVectorDatabase } from '../vector-db/index.js';
import { createTempDir } from './test-utils.js';

describe.sequential('Migration Tests', () => {
    it('should migrate documents and verify data', { timeout: 60000 }, async () => {
        // Set MCP_BASE_DIR to tempDir to ensure DocumentManager uses the test directory
        // This prevents automatic migration from the system's default data directory
        const tempDir = createTempDir('mig-real-');
        const dataDir = path.join(tempDir, 'data');
        const lanceDir = path.join(tempDir, 'lancedb');

        // Set MCP_BASE_DIR environment variable before creating any DocumentManager instances
        process.env.MCP_BASE_DIR = tempDir;

        try {
            fs.mkdirSync(dataDir, { recursive: true });

            const createRealDocument = (id: string, title: string, content: string, metadata: Record<string, any> = {}) => {
                const doc = {
                    id,
                    title,
                    content,
                    metadata: { ...metadata, createdAt: new Date().toISOString() },
                    chunks: [
                        {
                            id: `${id}-chunk-0`,
                            document_id: id,
                            chunk_index: 0,
                            content,
                            embeddings: Array(384).fill(0).map((_, i) => Math.sin(id.charCodeAt(0) * i * 0.1)),
                            start_position: 0,
                            end_position: content.length,
                            metadata: {}
                        }
                    ],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                fs.writeFileSync(path.join(dataDir, `${id}.json`), JSON.stringify(doc, null, 2));
            };

            createRealDocument(
                'api-doc-1',
                'REST API Documentation',
                'The REST API provides endpoints for managing documents, users, and permissions.',
                { version: '2.0', category: 'api' }
            );

            createRealDocument(
                'guide-1',
                'Getting Started Guide',
                'Welcome to the documentation server. This guide will help you get started.',
                { category: 'guide', language: 'en' }
            );

            createRealDocument(
                'config-1',
                'Configuration Reference',
                'The server can be configured using environment variables like MCP_VECTOR_DB.',
                { category: 'reference' }
            );

            createRealDocument(
                'troubleshoot-1',
                'Troubleshooting Guide',
                'Common issues and their solutions. Check MCP_LANCE_DB_PATH for database issues.',
                { category: 'troubleshooting' }
            );

            createRealDocument(
                'api-doc-2',
                'WebSocket API Documentation',
                'The WebSocket API enables real-time communication for search results.',
                { version: '1.0', category: 'api', protocol: 'websocket' }
            );

            const { migrateFromJson } = await import('../vector-db/index.js');
            const vectorDB = createVectorDatabase(lanceDir);

            try {
                await vectorDB.initialize();

                const migrationResult = await migrateFromJson(vectorDB, tempDir);
                expect(migrationResult.documentsMigrated).toBeGreaterThan(0);
                expect(migrationResult.chunksMigrated).toBeGreaterThan(0);

                const chunk = await vectorDB.getChunk('api-doc-1-chunk-0');
                expect(chunk).not.toBeNull();
                expect(chunk?.id).toBe('api-doc-1-chunk-0');
                expect(chunk?.document_id).toBe('api-doc-1');

                const results = await vectorDB.search(
                    chunk?.embeddings || [],
                    5
                );
                expect(results.length).toBeGreaterThan(0);

                await vectorDB.close();
            } catch (error) {
                if (error instanceof Error && error.message.includes('LanceDB is not available')) {
                    // LanceDB not available, skip test
                    return;
                }
                throw error;
            }
        } finally {
            // Clean up temp directory
            fs.rmSync(tempDir, { recursive: true, force: true });
            // Restore MCP_BASE_DIR to prevent affecting other tests
            delete process.env.MCP_BASE_DIR;
        }
    });
});
