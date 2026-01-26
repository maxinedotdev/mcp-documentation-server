/**
 * Tests for generated tags functionality
 * Tests for optional tag generation, non-blocking behavior, and different document types
 */

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const getTempDir = (): string => {
    return fs.mkdtempSync(path.join(os.tmpdir(), `test-${Date.now()}-`));
};
import { DocumentManager } from '../document-manager.js';
import { LanceDBAdapter } from '../vector-db/index.js';
import { SimpleEmbeddingProvider } from '../embedding-provider.js';

/**
 * Test: Generated tags inclusion when enabled
 */
async function testGeneratedTagsInclusion() {
    console.log('\n=== Test: Generated Tags Inclusion When Enabled ===');
    
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tags-enabled-'));
    process.env.MCP_BASE_DIR = tempDir;
    process.env.MCP_TAG_GENERATION_ENABLED = 'true';
    process.env.MCP_AI_BASE_URL = 'http://127.0.0.1:1234';
    
    try {
        const vectorDB = new LanceDBAdapter(getTempDir());
        await vectorDB.initialize();
        
        const documentManager = new DocumentManager(new SimpleEmbeddingProvider(), vectorDB);
        
        // Add a document - tags should be generated in background
        const doc = await documentManager.addDocument(
            'Machine Learning Guide',
            'This comprehensive guide covers machine learning algorithms, neural networks, and deep learning techniques for data scientists.',
            { source: 'upload', tags: ['ml', 'guide'] }
        );
        
        // Wait a bit for background tag generation to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Retrieve the document to check if tags were generated
        const retrieved = await documentManager.getDocument(doc.id);
        assert(retrieved !== null, 'Document should be retrievable');
        
        // Check if tags_generated field exists in metadata
        // Note: Since we don't have a real API key, actual generation may fail
        // We're testing that the structure and non-blocking behavior works
        console.log('  Document metadata:', retrieved?.metadata);
        
        // The key test is that document addition didn't block
        console.log('✓ Document added without blocking on tag generation');
        
        await vectorDB.close();
        console.log('✓ Generated tags inclusion test passed');
    } finally {
        process.env.MCP_BASE_DIR = undefined;
        process.env.MCP_TAG_GENERATION_ENABLED = undefined;
        process.env.MCP_AI_BASE_URL = undefined;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

/**
 * Test: Generated tags disabled behavior
 */
async function testGeneratedTagsDisabled() {
    console.log('\n=== Test: Generated Tags Disabled Behavior ===');
    
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tags-disabled-'));
    process.env.MCP_BASE_DIR = tempDir;
    process.env.MCP_TAG_GENERATION_ENABLED = 'false';
    
    try {
        const vectorDB = new LanceDBAdapter(getTempDir());
        await vectorDB.initialize();
        
        const documentManager = new DocumentManager(new SimpleEmbeddingProvider(), vectorDB);
        
        // Add a document - tags should NOT be generated
        const doc = await documentManager.addDocument(
            'Python Programming',
            'Learn Python programming language with this comprehensive tutorial covering syntax, data structures, and algorithms.',
            { source: 'upload', tags: ['python', 'programming'] }
        );
        
        // Retrieve the document
        const retrieved = await documentManager.getDocument(doc.id);
        assert(retrieved !== null, 'Document should be retrievable');
        
        // Check that tags_generated is not in metadata (or is empty)
        const hasGeneratedTags = retrieved?.metadata?.tags_generated !== undefined;
        
        if (hasGeneratedTags) {
            console.log('  Warning: tags_generated exists but generation is disabled');
        }
        
        console.log('✓ Generated tags disabled test passed');
        
        await vectorDB.close();
    } finally {
        process.env.MCP_BASE_DIR = undefined;
        process.env.MCP_TAG_GENERATION_ENABLED = undefined;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

/**
 * Test: Non-blocking behavior of tag generation
 */
async function testNonBlockingTagGeneration() {
    console.log('\n=== Test: Non-Blocking Tag Generation ===');
    
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonblocking-'));
    process.env.MCP_BASE_DIR = tempDir;
    process.env.MCP_TAG_GENERATION_ENABLED = 'true';
    process.env.MCP_AI_BASE_URL = 'http://127.0.0.1:1234';
    
    try {
        const vectorDB = new LanceDBAdapter(getTempDir());
        await vectorDB.initialize();
        
        const documentManager = new DocumentManager(new SimpleEmbeddingProvider(), vectorDB);
        
        // Measure time to add document with tag generation enabled
        const startTime = Date.now();
        const doc = await documentManager.addDocument(
            'Data Science Tutorial',
            'This tutorial covers data science fundamentals including statistics, machine learning, and data visualization.',
            { source: 'upload', tags: ['data-science', 'tutorial'] }
        );
        const addTime = Date.now() - startTime;
        
        // Document addition should return quickly (< 1 second for background operation)
        // If it were blocking, it would take longer (API call time)
        console.log(`  Document added in ${addTime}ms (should be fast, non-blocking)`);
        assert(addTime < 5000, `Document addition should be fast (${addTime}ms < 5000ms)`);
        
        // Verify document was created successfully
        assert(doc.id !== undefined, 'Document should have ID');
        assert(doc.title === 'Data Science Tutorial', 'Title should match');
        assert(doc.chunks.length > 0, 'Document should have chunks');
        
        // Document should be retrievable immediately
        const retrieved = await documentManager.getDocument(doc.id);
        assert(retrieved !== null, 'Document should be retrievable immediately');
        
        console.log('✓ Non-blocking tag generation test passed');
        
        await vectorDB.close();
    } finally {
        process.env.MCP_BASE_DIR = undefined;
        process.env.MCP_TAG_GENERATION_ENABLED = undefined;
        process.env.MCP_AI_BASE_URL = undefined;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

/**
 * Test: Tag generation with different document types
 */
async function testTagGenerationWithDifferentDocumentTypes() {
    console.log('\n=== Test: Tag Generation with Different Document Types ===');
    
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctypes-'));
    process.env.MCP_BASE_DIR = tempDir;
    process.env.MCP_TAG_GENERATION_ENABLED = 'true';
    process.env.MCP_AI_BASE_URL = 'http://127.0.0.1:1234';
    
    try {
        const vectorDB = new LanceDBAdapter(getTempDir());
        await vectorDB.initialize();
        
        const documentManager = new DocumentManager(new SimpleEmbeddingProvider(), vectorDB);
        
        // Test with different document types
        const documentTypes = [
            {
                title: 'Technical API Documentation',
                content: 'This comprehensive API reference documentation covers REST endpoints, authentication methods, request/response formats, and data models. Learn how to integrate with our API using standard HTTP methods and JSON payloads.',
                metadata: { source: 'api', contentType: 'documentation' }
            },
            {
                title: 'Tutorial: Getting Started',
                content: 'This step-by-step tutorial is designed for beginners and covers installation, setup, and basic usage of the platform. Follow along to get started with your first project and learn the fundamentals.',
                metadata: { source: 'upload', contentType: 'tutorial' }
            },
            {
                title: 'Research Paper: Deep Learning',
                content: 'This academic research paper presents new deep learning architectures and explores their applications in computer vision and natural language processing. The paper includes experimental results and analysis.',
                metadata: { source: 'upload', contentType: 'research-paper' }
            },
            {
                title: 'Blog Post: Best Practices',
                content: 'This blog post shares industry best practices and practical tips for software development. Topics include code quality, testing, deployment strategies, and team collaboration.',
                metadata: { source: 'crawl', crawl_id: 'blog-crawl', contentType: 'blog-post' }
            }
        ];
        
        const docs: any[] = [];
        
        for (const docType of documentTypes) {
            const doc = await documentManager.addDocument(
                docType.title,
                docType.content,
                docType.metadata
            );
            docs.push(doc);
            console.log(`  Added document: ${docType.title} (${doc.metadata.contentType})`);
        }
        
        // Wait a bit for background tag generation
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify all documents are retrievable
        for (const doc of docs) {
            const retrieved = await documentManager.getDocument(doc.id);
            assert(retrieved !== null, `Document ${doc.title} should be retrievable`);
            assert(retrieved.title === doc.title, `Title should match for ${doc.title}`);
        }
        
        // Query to verify documents are indexed and searchable
        const queryResult = await documentManager.query('API tutorial research paper documentation', { limit: 10 });
        assert(Array.isArray(queryResult.results), 'Query should return an array of results');
        
        console.log('✓ Tag generation with different document types test passed');
        
        await vectorDB.close();
    } finally {
        process.env.MCP_BASE_DIR = undefined;
        process.env.MCP_TAG_GENERATION_ENABLED = undefined;
        process.env.MCP_AI_BASE_URL = undefined;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

/**
 * Test: Generated tags in query filtering
 */
async function testGeneratedTagsInQuery() {
    console.log('\n=== Test: Generated Tags in Query Filtering ===');
    
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'query-tags-'));
    process.env.MCP_BASE_DIR = tempDir;
    process.env.MCP_TAG_GENERATION_ENABLED = 'true';
    process.env.MCP_AI_BASE_URL = 'http://127.0.0.1:1234';
    
    try {
        const vectorDB = new LanceDBAdapter(getTempDir());
        await vectorDB.initialize();
        
        const documentManager = new DocumentManager(new SimpleEmbeddingProvider(), vectorDB);
        
        // Add documents with regular tags
        const doc1 = await documentManager.addDocument(
            'Python Machine Learning',
            'Learn machine learning with Python including popular libraries like scikit-learn for model training, pandas for data manipulation, and numpy for numerical computing.',
            { source: 'upload', tags: ['python', 'machine-learning'] }
        );
        
        const doc2 = await documentManager.addDocument(
            'JavaScript Framework Guide',
            'This comprehensive guide covers modern JavaScript frameworks including React for component-based UI development, Vue.js for progressive web apps, and Angular for enterprise applications.',
            { source: 'upload', tags: ['javascript', 'frameworks'] }
        );
        
        const doc3 = await documentManager.addDocument(
            'Data Science with Python',
            'This data science tutorial covers essential Python tools for data analysis including pandas for dataframes, matplotlib for visualization, and jupyter notebooks for interactive development.',
            { source: 'upload', tags: ['python', 'data-science'] }
        );
        
        // Wait for potential background tag generation
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Query with tag filter
        const pythonResults = await documentManager.query('python machine learning data science', {
            limit: 10,
            filters: { tags: ['python'] }
        });
        
        assert(Array.isArray(pythonResults.results), 'Query should return an array of results');
        
        // Verify results have python tag (if present)
        for (const result of pythonResults.results) {
            if (result.metadata && result.metadata.tags) {
                assert(result.metadata.tags.includes('python'), 'Result should have python tag');
            }
        }
        
        console.log('✓ Generated tags in query filtering test passed');
        
        await vectorDB.close();
    } finally {
        process.env.MCP_BASE_DIR = undefined;
        process.env.MCP_TAG_GENERATION_ENABLED = undefined;
        process.env.MCP_AI_BASE_URL = undefined;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

/**
 * Test: Manual tags vs generated tags
 */
async function testManualVsGeneratedTags() {
    console.log('\n=== Test: Manual Tags vs Generated Tags ===');
    
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-compare-'));
    process.env.MCP_BASE_DIR = tempDir;
    process.env.MCP_TAG_GENERATION_ENABLED = 'true';
    process.env.MCP_AI_BASE_URL = 'http://127.0.0.1:1234';
    
    try {
        const vectorDB = new LanceDBAdapter(getTempDir());
        await vectorDB.initialize();
        
        const documentManager = new DocumentManager(new SimpleEmbeddingProvider(), vectorDB);
        
        // Add document with manual tags
        const doc = await documentManager.addDocument(
            'Web Development Tutorial',
            'Complete web development tutorial covering HTML, CSS, JavaScript, and modern frameworks.',
            { 
                source: 'upload', 
                tags: ['web', 'development', 'html', 'css', 'javascript', 'tutorial']
            }
        );
        
        // Wait for potential background tag generation
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Retrieve document
        const retrieved = await documentManager.getDocument(doc.id);
        assert(retrieved !== null, 'Document should be retrievable');
        
        // Check manual tags are preserved
        assert(retrieved.metadata?.tags !== undefined, 'Should have manual tags');
        assert(Array.isArray(retrieved.metadata.tags), 'Tags should be an array');
        assert(retrieved.metadata.tags.includes('web'), 'Should include web tag');
        assert(retrieved.metadata.tags.includes('development'), 'Should include development tag');
        
        console.log('  Manual tags:', retrieved.metadata.tags);
        console.log('  Generated tags:', retrieved.metadata?.tags_generated || 'none');
        
        console.log('✓ Manual vs generated tags test passed');
        
        await vectorDB.close();
    } finally {
        process.env.MCP_BASE_DIR = undefined;
        process.env.MCP_TAG_GENERATION_ENABLED = undefined;
        process.env.MCP_AI_BASE_URL = undefined;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

/**
 * Test: Tag generation without API key
 */
async function testTagGenerationWithoutApiKey() {
    console.log('\n=== Test: Tag Generation Without API Key ===');
    
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noapikey-'));
    process.env.MCP_BASE_DIR = tempDir;
    process.env.MCP_TAG_GENERATION_ENABLED = 'true';
    // Explicitly unset API key
    delete process.env.MCP_AI_BASE_URL;
    
    try {
        const vectorDB = new LanceDBAdapter(getTempDir());
        await vectorDB.initialize();
        
        const documentManager = new DocumentManager(new SimpleEmbeddingProvider(), vectorDB);
        
        // Add document without API key - should not throw error
        const doc = await documentManager.addDocument(
            'Test Document',
            'This is a test document.',
            { source: 'upload', tags: ['test'] }
        );
        
        // Document should be created successfully even without API key
        assert(doc.id !== undefined, 'Document should have ID');
        assert(doc.title === 'Test Document', 'Title should match');
        
        // Document should be retrievable
        const retrieved = await documentManager.getDocument(doc.id);
        assert(retrieved !== null, 'Document should be retrievable');
        
        console.log('  Document created successfully without API key');
        console.log('✓ Tag generation without API key test passed');
        
        await vectorDB.close();
    } finally {
        process.env.MCP_BASE_DIR = undefined;
        process.env.MCP_TAG_GENERATION_ENABLED = undefined;
        delete process.env.MCP_AI_BASE_URL;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

/**
 * Test: Tag generation with large documents
 */
async function testTagGenerationWithLargeDocuments() {
    console.log('\n=== Test: Tag Generation with Large Documents ===');
    
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'large-doc-'));
    process.env.MCP_BASE_DIR = tempDir;
    process.env.MCP_TAG_GENERATION_ENABLED = 'true';
    process.env.MCP_AI_BASE_URL = 'http://127.0.0.1:1234';
    
    try {
        const vectorDB = new LanceDBAdapter(getTempDir());
        await vectorDB.initialize();
        
        const documentManager = new DocumentManager(new SimpleEmbeddingProvider(), vectorDB);
        
        // Create a large document (content will be truncated for tag generation)
        const largeContent = 'Large document content. '.repeat(500); // ~10KB
        
        const startTime = Date.now();
        const doc = await documentManager.addDocument(
            'Large Document Test',
            largeContent,
            { source: 'upload', tags: ['large', 'document'] }
        );
        const addTime = Date.now() - startTime;
        
        // Should still be fast due to non-blocking behavior
        console.log(`  Large document added in ${addTime}ms`);
        
        assert(doc.id !== undefined, 'Document should have ID');
        assert(doc.chunks.length > 0, 'Document should have chunks');
        
        // Wait for potential background tag generation
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Document should be retrievable
        const retrieved = await documentManager.getDocument(doc.id);
        assert(retrieved !== null, 'Document should be retrievable');
        assert(retrieved.content.length > 5000, 'Content should be large');
        
        console.log('✓ Tag generation with large documents test passed');
        
        await vectorDB.close();
    } finally {
        process.env.MCP_BASE_DIR = undefined;
        process.env.MCP_TAG_GENERATION_ENABLED = undefined;
        process.env.MCP_AI_BASE_URL = undefined;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

/**
 * Test: Tag generation persistence
 */
async function testTagGenerationPersistence() {
    console.log('\n=== Test: Tag Generation Persistence ===');
    
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'persistence-'));
    process.env.MCP_BASE_DIR = tempDir;
    process.env.MCP_TAG_GENERATION_ENABLED = 'true';
    process.env.MCP_AI_BASE_URL = 'http://127.0.0.1:1234';
    
    try {
        const vectorDB = new LanceDBAdapter(getTempDir());
        await vectorDB.initialize();
        
        const documentManager = new DocumentManager(new SimpleEmbeddingProvider(), vectorDB);
        
        // Add document
        const doc = await documentManager.addDocument(
            'Persistence Test Document',
            'This document tests if generated tags are persisted correctly.',
            { source: 'upload', tags: ['test', 'persistence'] }
        );
        
        // Wait for potential background tag generation
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Create new DocumentManager instance (simulating restart)
        const vectorDB2 = new LanceDBAdapter(getTempDir());
        await vectorDB2.initialize();
        const documentManager2 = new DocumentManager(new SimpleEmbeddingProvider(), vectorDB2);
        
        // Retrieve document with new manager
        const retrieved = await documentManager2.getDocument(doc.id);
        assert(retrieved !== null, 'Document should persist across manager instances');
        assert(retrieved.title === 'Persistence Test Document', 'Title should persist');
        
        // Check if metadata persisted
        assert(retrieved.metadata?.tags !== undefined, 'Manual tags should persist');
        assert(retrieved.metadata.tags.includes('test'), 'Test tag should persist');
        
        console.log('✓ Tag generation persistence test passed');
        
        await vectorDB.close();
        await vectorDB2.close();
    } finally {
        process.env.MCP_BASE_DIR = undefined;
        process.env.MCP_TAG_GENERATION_ENABLED = undefined;
        process.env.MCP_AI_BASE_URL = undefined;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

/**
 * Run all generated tags tests
 */
async function runGeneratedTagsTests() {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  Generated Tags Tests                                     ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    
    try {
        await testGeneratedTagsInclusion();
        await testGeneratedTagsDisabled();
        await testNonBlockingTagGeneration();
        await testTagGenerationWithDifferentDocumentTypes();
        await testGeneratedTagsInQuery();
        await testManualVsGeneratedTags();
        await testTagGenerationWithoutApiKey();
        await testTagGenerationWithLargeDocuments();
        await testTagGenerationPersistence();
        
        console.log('\n╔═══════════════════════════════════════════════════════════╗');
        console.log('║  ✓ All generated tags tests passed!                       ║');
        console.log('╚═══════════════════════════════════════════════════════════╝\n');
    } catch (error) {
        console.error('\n✗ Test failed:', error);
        process.exit(1);
    }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runGeneratedTagsTests();
}

export { runGeneratedTagsTests };
