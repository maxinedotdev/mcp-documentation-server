# Migration Guide: Remove Legacy Components

This guide helps you migrate from legacy components (Transformers.js, SearchEngine, searchDocuments) to the modern API-based architecture.

## Overview

This is a **breaking change** that removes the following legacy components:

- **`TransformersEmbeddingProvider`** - Local embedding provider using `@xenova/transformers`
- **`SimpleEmbeddingProvider`** - Fallback hash-based embedding provider
- **`SearchEngine`** - Thin wrapper around `DocumentManager`
- **`searchDocuments()`** - Single-document vector search method
- **`@xenova/transformers`** - npm dependency for local model execution

### Why This Change?

- **Reduce memory usage**: 100-500MB RAM savings
- **Improve cold start time**: 1-5 minutes faster initialization
- **Simplify codebase**: Remove ~400 lines of redundant code
- **Eliminate model versioning overhead**: No need to manage local model files
- **Reduce bundle size**: Remove large dependency from node_modules

## Quick Start Migration

If you were using local embeddings with Transformers.js, follow these steps:

### 1. Set up an OpenAI-compatible embedding API

Choose one of the following options:

#### Option A: LM Studio (Recommended for Local Use)

1. Download and install [LM Studio](https://lmstudio.ai/)
2. Open LM Studio and go to the "Discover" tab
3. Search for `text-embedding-multilingual-e5-large-instruct`
4. Download the model (GGUF format recommended)
5. Go to the "Local Server" tab
6. Load the model and start the server
7. Note the server URL (default: `http://127.0.0.1:1234/v1`)

#### Option B: Ollama

1. Install [Ollama](https://ollama.ai/)
2. Pull an embedding model:
   ```bash
   ollama pull nomic-embed-text
   ```
3. Start Ollama server (default: `http://127.0.0.1:11434`)

#### Option C: Cloud Provider (OpenAI, etc.)

1. Sign up for an API key from your preferred provider
2. Note the API endpoint URL

### 2. Update Environment Variables

```bash
# Before (legacy configuration)
MCP_EMBEDDING_PROVIDER=transformers
MCP_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2

# After (new configuration)
MCP_EMBEDDING_PROVIDER=openai
MCP_EMBEDDING_BASE_URL=http://127.0.0.1:1234/v1  # Your API endpoint
MCP_EMBEDDING_MODEL=text-embedding-multilingual-e5-large-instruct  # Your model name
```

For LM Studio:
```bash
MCP_EMBEDDING_PROVIDER=openai
MCP_EMBEDDING_BASE_URL=http://127.0.0.1:1234/v1
MCP_EMBEDDING_MODEL=text-embedding-multilingual-e5-large-instruct
```

For Ollama:
```bash
MCP_EMBEDDING_PROVIDER=openai
MCP_EMBEDDING_BASE_URL=http://127.0.0.1:11434/v1
MCP_EMBEDDING_MODEL=nomic-embed-text
```

For OpenAI:
```bash
MCP_EMBEDDING_PROVIDER=openai
MCP_EMBEDDING_BASE_URL=https://api.openai.com/v1
MCP_EMBEDDING_API_KEY=sk-your-api-key-here
MCP_EMBEDDING_MODEL=text-embedding-3-small
```

### 3. Restart Saga Server

```bash
# Stop the server (if running)
# Then start it again
npm run dev
# or
node dist/server.js
```

### 4. Verify Configuration

Test that your embedding provider is working:

```bash
# Add a test document
echo "Test document content" > test.txt
# Use the saga MCP tools to add and search
```

## Code Migration

### Migrating from `searchDocuments()`

If you were using the `searchDocuments()` method for single-document search:

#### Before

```typescript
const results = await documentManager.searchDocuments(docId, query, limit);
// results is an array of { chunk, score }
```

#### After

```typescript
const response = await documentManager.query(query, {
  filters: { document_id: docId },
  limit
});
// Access results from the response object
const results = response.results;
```

**Note**: The `query()` method returns a `QueryResponse` object with a `results` property, not an array directly.

### Migrating from `SearchEngine`

If you were using the `SearchEngine` class:

#### Before

```typescript
import { SearchEngine } from './search-engine';

const searchEngine = new SearchEngine(documentManager, embeddingProvider);
const results = await searchEngine.searchDocument(docId, query, limit);
```

#### After

```typescript
// Use DocumentManager directly
const response = await documentManager.query(query, {
  filters: { document_id: docId },
  limit
});
const results = response.results;
```

### Migrating from `TransformersEmbeddingProvider`

If you were using the `TransformersEmbeddingProvider` class:

#### Before

```typescript
import { TransformersEmbeddingProvider } from './embedding-provider';

const embeddingProvider = new TransformersEmbeddingProvider({
  modelName: 'Xenova/all-MiniLM-L6-v2'
});
```

#### After

```typescript
import { OpenAiEmbeddingProvider } from './embedding-provider';

const embeddingProvider = new OpenAiEmbeddingProvider({
  baseUrl: process.env.MCP_EMBEDDING_BASE_URL,
  model: process.env.MCP_EMBEDDING_MODEL,
  apiKey: process.env.MCP_EMBEDDING_API_KEY
});
```

Or use the factory function:

```typescript
import { createEmbeddingProvider } from './embedding-provider';

const embeddingProvider = createEmbeddingProvider();
```

## Multi-Provider Configuration

You can configure multiple embedding providers with fallback logic:

```bash
MCP_EMBEDDING_PROVIDERS='[
  {
    "provider": "openai",
    "priority": 1,
    "baseUrl": "http://127.0.0.1:1234/v1",
    "model": "text-embedding-multilingual-e5-large-instruct"
  },
  {
    "provider": "openai",
    "priority": 2,
    "baseUrl": "https://api.openai.com/v1",
    "model": "text-embedding-3-small",
    "apiKey": "sk-your-api-key-here"
  }
]'
```

This configuration will:
1. Try the local LM Studio server first (priority 1)
2. Fall back to OpenAI if the local server fails (priority 2)

## Testing Your Migration

### 1. Test Document Ingestion

```bash
# Create a test document
echo "This is a test document for migration verification." > test.txt

# Add it to Saga (using MCP tools)
# Verify it was added successfully
```

### 2. Test Query Functionality

```bash
# Search for content
# Verify results are returned
```

### 3. Test Code Block Search

```bash
# Add a code file
# Search for code blocks
# Verify results are returned
```

### 4. Check Memory Usage

```bash
# Monitor memory usage before and after migration
# You should see 100-500MB reduction
```

### 5. Check Cold Start Time

```bash
# Time how long it takes to start the server
# You should see 1-5 minute improvement
```

## Troubleshooting

### Error: "Embedding provider not configured"

**Cause**: Missing or incorrect environment variables.

**Solution**:
```bash
# Verify your environment variables are set
echo $MCP_EMBEDDING_PROVIDER
echo $MCP_EMBEDDING_BASE_URL
echo $MCP_EMBEDDING_MODEL

# Ensure MCP_EMBEDDING_PROVIDER is set to "openai"
```

### Error: "Failed to connect to embedding API"

**Cause**: Embedding API server is not running or URL is incorrect.

**Solution**:
- Verify your embedding API server is running
- Check the URL in `MCP_EMBEDDING_BASE_URL`
- Test the API endpoint directly:
  ```bash
  curl http://127.0.0.1:1234/v1/embeddings
  ```

### Error: "Model not found"

**Cause**: Model name is incorrect or not loaded.

**Solution**:
- Verify the model name in `MCP_EMBEDDING_MODEL`
- For LM Studio: Ensure the model is loaded in the server
- For Ollama: Ensure the model is pulled (`ollama list`)

### Error: "searchDocuments is not a function"

**Cause**: Code still using the removed `searchDocuments()` method.

**Solution**: Update your code to use `query()` with filters (see Code Migration section above).

### Error: "SearchEngine is not defined"

**Cause**: Code still importing or using the removed `SearchEngine` class.

**Solution**: Update your code to use `DocumentManager` directly (see Code Migration section above).

### Performance Issues

**Symptom**: Queries are slower than expected.

**Possible causes**:
1. Network latency to embedding API
2. Embedding API server is overloaded
3. Model is too large for your hardware

**Solutions**:
- Use a local embedding API (LM Studio, Ollama) for better performance
- Use a smaller/faster embedding model
- Check your embedding API server logs for errors

## Example Configurations

### LM Studio (Local, Recommended)

```bash
# .env file
MCP_EMBEDDING_PROVIDER=openai
MCP_EMBEDDING_BASE_URL=http://127.0.0.1:1234/v1
MCP_EMBEDDING_MODEL=text-embedding-multilingual-e5-large-instruct
MCP_VECTOR_DB=true
MCP_BASE_DIR=~/.saga
```

### Ollama (Local)

```bash
# .env file
MCP_EMBEDDING_PROVIDER=openai
MCP_EMBEDDING_BASE_URL=http://127.0.0.1:11434/v1
MCP_EMBEDDING_MODEL=nomic-embed-text
MCP_VECTOR_DB=true
MCP_BASE_DIR=~/.saga
```

### OpenAI (Cloud)

```bash
# .env file
MCP_EMBEDDING_PROVIDER=openai
MCP_EMBEDDING_BASE_URL=https://api.openai.com/v1
MCP_EMBEDDING_API_KEY=sk-your-api-key-here
MCP_EMBEDDING_MODEL=text-embedding-3-small
MCP_VECTOR_DB=true
MCP_BASE_DIR=~/.saga
```

### Multi-Provider with Fallback

```bash
# .env file
MCP_EMBEDDING_PROVIDERS='[
  {
    "provider": "openai",
    "priority": 1,
    "baseUrl": "http://127.0.0.1:1234/v1",
    "model": "text-embedding-multilingual-e5-large-instruct"
  },
  {
    "provider": "openai",
    "priority": 2,
    "baseUrl": "https://api.openai.com/v1",
    "model": "text-embedding-3-small",
    "apiKey": "sk-your-api-key-here"
  }
]'
MCP_VECTOR_DB=true
MCP_BASE_DIR=~/.saga
```

## Rollback

If you need to rollback to the previous version with legacy components:

### Quick Rollback

1. Restore the previous version from git:
   ```bash
   git checkout <previous-commit>
   ```

2. Reinstall dependencies:
   ```bash
   npm install
   ```

3. Restore your old environment variables:
   ```bash
   MCP_EMBEDDING_PROVIDER=transformers
   MCP_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
   ```

4. Restart the server

### Detailed Rollback Procedure

#### Step 1: Find the Previous Commit

```bash
# View git history to find the commit before the change
git log --oneline -20

# Look for a commit like "Implement remove-legacy-components change"
# The commit before that is your rollback target
```

#### Step 2: Create a Rollback Branch (Recommended)

```bash
# Create a branch for the rollback
git checkout -b rollback-legacy-components <previous-commit>
```

#### Step 3: Restore Source Files

The following files were removed or modified:

**Removed Files:**
- `src/search-engine.ts` (162 lines)

**Modified Files:**
- `src/server.ts` - Removed SearchEngine imports and usage
- `src/embedding-provider.ts` - Removed TransformersEmbeddingProvider, SimpleEmbeddingProvider, and related functions
- `src/document-manager.ts` - Removed searchDocuments() method and cosineSimilarity() method
- `src/ai-search-provider.ts` - Updated to use VectorDatabase directly
- `src/__tests__/test-utils.ts` - Removed SearchEngine and SimpleEmbeddingProvider
- `src/__tests__/validation.test.ts` - Updated to use query() instead of searchDocuments()
- `src/__tests__/integration.test.ts` - Removed SearchEngine tests
- `package.json` - Removed @xenova/transformers dependency

**Documentation Files:**
- `README.md` - Updated configuration examples
- `.env.example` - Updated default configuration
- `CHANGELOG.md` - Added breaking change notice
- `docs/REMOVE-LEGACY-COMPONENTS.md` - Created migration guide

#### Step 4: Restore Dependencies

```bash
# Remove node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall dependencies
npm install

# This will reinstall @xenova/transformers and all other dependencies
```

#### Step 5: Restore Environment Variables

Update your `.env` file:

```bash
# Legacy configuration (before migration)
MCP_EMBEDDING_PROVIDER=transformers
MCP_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
# Remove MCP_EMBEDDING_BASE_URL (not needed for transformers)
```

#### Step 6: Rebuild the Project

```bash
# Build the project
npm run build

# Or if you're using TypeScript directly
npx tsc
```

#### Step 7: Verify the Rollback

```bash
# Run tests to verify everything works
npm test

# Start the server
npm run dev
# or
node dist/server.js
```

### Manual File Restoration

If you need to manually restore specific files instead of using git:

#### Restore `src/search-engine.ts`

The file was 162 lines and contained the `SearchEngine` class. You'll need to restore it from git:

```bash
git checkout <previous-commit> -- src/search-engine.ts
```

#### Restore `src/embedding-provider.ts`

The file had these removed components:
- `TransformersEmbeddingProvider` class (lines ~328-459)
- `SimpleEmbeddingProvider` class (lines ~579-627)
- `getModelDimensions()` function
- `resolveEmbeddingProviderType()` function and `EmbeddingProviderType` type
- `@xenova/transformers` import

Restore from git:

```bash
git checkout <previous-commit> -- src/embedding-provider.ts
```

#### Restore `src/document-manager.ts`

The file had these removed components:
- `searchDocuments()` method (lines ~717-764)
- `cosineSimilarity()` private method (lines ~766-780)

Restore from git:

```bash
git checkout <previous-commit> -- src/document-manager.ts
```

#### Restore `src/server.ts`

The file had these changes:
- Removed SearchEngine import
- Removed SearchEngine instantiation in `search_code_blocks` tool
- Removed SearchEngine instantiation in `get_code_blocks` tool
- Updated `search_documents` tool to use VectorDatabase directly

Restore from git:

```bash
git checkout <previous-commit> -- src/server.ts
```

#### Restore Test Files

```bash
git checkout <previous-commit> -- src/__tests__/test-utils.ts
git checkout <previous-commit> -- src/__tests__/validation.test.ts
git checkout <previous-commit> -- src/__tests__/integration.test.ts
```

#### Restore Documentation

```bash
git checkout <previous-commit> -- README.md
git checkout <previous-commit> -- .env.example
git checkout <previous-commit> -- CHANGELOG.md
```

#### Restore package.json

```bash
git checkout <previous-commit> -- package.json
```

### Rollback Checklist

- [ ] Find the previous commit hash
- [ ] Create a rollback branch (optional but recommended)
- [ ] Restore removed source files from git
- [ ] Restore modified files from git
- [ ] Restore documentation files from git
- [ ] Restore package.json from git
- [ ] Remove node_modules and package-lock.json
- [ ] Run `npm install` to reinstall dependencies
- [ ] Verify @xenova/transformers is installed
- [ ] Restore environment variables to legacy configuration
- [ ] Build the project (`npm run build`)
- [ ] Run tests (`npm test`)
- [ ] Start the server and verify it works
- [ ] Test document ingestion
- [ ] Test search functionality
- [ ] Test code block search

### Common Rollback Issues

#### Issue: "Cannot find module '@xenova/transformers'"

**Solution**: Run `npm install` to reinstall the dependency.

#### Issue: "SearchEngine is not defined"

**Solution**: Ensure `src/search-engine.ts` was restored from git.

#### Issue: "searchDocuments is not a function"

**Solution**: Ensure `src/document-manager.ts` was restored from git.

#### Issue: Tests fail after rollback

**Solution**: Ensure all test files were restored from git and run `npm install` again.

### After Rollback

Once you've successfully rolled back:

1. **Document the rollback**: Note why you rolled back and what issues you encountered
2. **Report issues**: Open a GitHub issue describing the problems that led to the rollback
3. **Consider alternatives**: If API-based embeddings don't work for you, consider:
   - Using a local embedding API (LM Studio, Ollama) instead of transformers.js
   - Using a different embedding provider
   - Contributing improvements to the API-based implementation

### Re-applying the Change

After resolving the issues that caused the rollback, you can re-apply the change:

```bash
# Switch back to the branch with the change
git checkout <branch-with-change>

# Or cherry-pick the commit
git cherry-pick <commit-hash>

# Follow the migration guide again
```

## Additional Resources

- [README.md](../README.md) - Main documentation
- [CHANGELOG.md](../CHANGELOG.md) - Release notes and breaking changes
- [OpenSpec Change](../openspec/changes/remove-legacy-components/) - Detailed change proposal and design

## Support

If you encounter issues during migration:

1. Check the troubleshooting section above
2. Review the error messages carefully
3. Verify your environment variables are set correctly
4. Test your embedding API endpoint directly
5. Check the [GitHub Issues](https://github.com/maxinedotdev/saga/issues) for similar problems
6. Open a new issue if needed

## Summary of Changes

| Component | Status | Replacement |
|-----------|--------|-------------|
| `TransformersEmbeddingProvider` | Removed | `OpenAiEmbeddingProvider` |
| `SimpleEmbeddingProvider` | Removed | `OpenAiEmbeddingProvider` |
| `SearchEngine` | Removed | `DocumentManager` (direct use) |
| `searchDocuments()` | Removed | `query()` with `document_id` filter |
| `@xenova/transformers` | Removed | API-based embeddings |

## Benefits After Migration

✅ **Reduced Memory Usage**: 100-500MB RAM savings  
✅ **Faster Cold Starts**: 1-5 minute improvement  
✅ **Simpler Codebase**: ~400 lines of redundant code removed  
✅ **No Model Management**: No need to download or update local models  
✅ **Smaller Bundle Size**: 50-100MB reduction in node_modules  
✅ **Better Reliability**: API-based embeddings are more reliable  
✅ **Easier Maintenance**: No local model versioning overhead

---

**Last Updated**: 2026-02-02  
**Version**: 1.0.0
