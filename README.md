# MCP Documentation Server

A TypeScript-based [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for local-first document management and semantic search using embeddings. Features LanceDB vector storage, web crawling, and optional LLM integration.

## Installation

### Local Development

Since the package is not yet published to npm, clone and link locally:

```bash
# Clone and build
git clone https://github.com/maxinedotdev/saga.git
cd saga
npm install
npm run build

# Link globally so it's available in other MCP consumers
npm link
```

After linking, the `saga` command will be available globally across all VSCode windows.

### Direct Path Method (Alternative)

If you prefer not to use `npm link`, you can reference the server directly in your MCP configuration:

```json
{
  "mcpServers": {
    "saga": {
      "command": "node",
      "args": ["/full/path/to/saga/dist/server.js"],
      "env": {
        "MCP_BASE_DIR": "~/.saga",
        "MCP_EMBEDDING_PROVIDER": "openai",
        "MCP_EMBEDDING_BASE_URL": "http://127.0.0.1:1234",
        "MCP_EMBEDDING_MODEL": "text-embedding-multilingual-e5-large-instruct"
      }
    }
  }
}
```

### Via npm (When Published)

> **Note:** This method requires the package to be published to npm first.

```bash
npm install -g @maxinedotdev/saga
```

## Quick Start

### Configure an MCP Client

Add to your MCP client configuration (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "documentation": {
      "command": "saga",
      "env": {
        "MCP_BASE_DIR": "~/.saga",
        "MCP_EMBEDDING_PROVIDER": "openai",
        "MCP_EMBEDDING_BASE_URL": "http://127.0.0.1:1234",
        "MCP_EMBEDDING_MODEL": "text-embedding-multilingual-e5-large-instruct"
      }
    }
  }
}
```

> **Note:** If you didn't run `npm link` during installation, use the direct path method shown in the Installation section above.

### Basic Usage

1. **Add documents**: Use `add_document` tool or place `.txt`/`.md` files in the uploads folder and call `process_uploads`
2. **Search**: Use `query` for semantic document discovery
3. **Analyze**: Use `search_documents_with_ai` for LLM-powered analysis (requires LLM configuration)

## Features

- **Semantic Search**: Vector-based search with LanceDB and HNSW indexing
- **Query-First Discovery**: Find relevant documents quickly with hybrid ranking (vector + keyword fallback)
- **Web Crawling**: Crawl public documentation with `crawl_documentation`
- **LLM Integration**: Optional AI-powered analysis via OpenAI-compatible providers (LM Studio, synthetic.new)
- **Performance**: LRU caching, parallel processing, streaming file reads
- **Local-First**: All data stored in `~/.saga/` - no external services required

## Available Tools

### Document Management
- `add_document` - Add a document with title, content, and metadata
- `list_documents` - List documents with pagination
- `get_document` - Retrieve full document by ID
- `delete_document` - Remove a document and its chunks
- `query` - Query-first document discovery with semantic ranking

### File Processing
- `process_uploads` - Convert files in uploads folder to documents
- `get_uploads_path` - Get the absolute uploads folder path
- `list_uploads_files` - List files in uploads folder

### Search & Analysis
- `search_documents_with_ai` - LLM-powered analysis (requires provider config)
- `get_context_window` - Get neighboring chunks for context
- `crawl_documentation` - Crawl public docs from a seed URL
- `delete_crawl_session` - Remove all documents from a crawl session

## Configuration

Configure via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_BASE_DIR` | Data storage directory | `~/.saga` |
| `MCP_EMBEDDING_PROVIDER` | `openai` (OpenAI-compatible API only) | `openai` |
| `MCP_EMBEDDING_MODEL` | Embedding model name | `text-embedding-multilingual-e5-large-instruct` |
| `MCP_EMBEDDING_BASE_URL` | OpenAI-compatible base URL (required) | - |
| `MCP_AI_BASE_URL` | LLM provider URL (LM Studio/synthetic.new) | - |
| `MCP_AI_MODEL` | LLM model name | Provider default |
| `MCP_AI_API_KEY` | API key for remote providers | - |
| `MCP_TAG_GENERATION_ENABLED` | Auto-generate tags with AI | `false` |
| `MCP_SIMILARITY_THRESHOLD` | Min similarity score (0.0-1.0) | `0.3` |

### Request Timeouts

The server supports configurable HTTP request timeouts to handle slow or unresponsive providers. All timeout values are in milliseconds.

**Timeout Hierarchy** (from highest to lowest priority):
1. **Operation-specific timeout** (e.g., `MCP_AI_SEARCH_TIMEOUT_MS`)
2. **Global timeout** (`MCP_REQUEST_TIMEOUT_MS`)
3. **Default** (30000ms = 30 seconds)

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_REQUEST_TIMEOUT_MS` | Global timeout for all HTTP requests | `30000` |
| `MCP_AI_SEARCH_TIMEOUT_MS` | Timeout for AI search requests (`search_documents_with_ai`) | Global timeout |
| `MCP_EMBEDDING_TIMEOUT_MS` | Timeout for embedding generation requests | Global timeout |

**Timeout Error Behavior:**

When a request exceeds its timeout, a `RequestTimeoutError` is thrown with details:
- Error message includes the timeout duration and URL
- The `isTimeout` property is set to `true` for programmatic detection
- Provider health tracking marks the failure and may trigger fallback to other providers (in multi-provider mode)

**Example Configurations:**

```env
# Fast local setup (15 second global timeout)
MCP_REQUEST_TIMEOUT_MS=15000

# Slow remote APIs (60 second global timeout)
MCP_REQUEST_TIMEOUT_MS=60000

# Different timeouts per operation
MCP_REQUEST_TIMEOUT_MS=30000        # 30s default
MCP_AI_SEARCH_TIMEOUT_MS=120000     # 2 min for AI search (slow LLMs)
MCP_EMBEDDING_TIMEOUT_MS=45000      # 45s for embeddings
```

**Validation:**
- Values must be positive integers (e.g., `30000`, not `30s`)
- Non-numeric, zero, or negative values are rejected with a warning
- Invalid values fall back to the next level in the hierarchy

### LLM Provider Examples

**LM Studio (local)**:
```env
MCP_AI_BASE_URL=http://127.0.0.1:1234
MCP_AI_MODEL=ministral-3-8b-instruct-2512
```

**synthetic.new (remote)**:
```env
MCP_AI_BASE_URL=https://api.synthetic.new/openai/v1
MCP_AI_API_KEY=your-api-key
```

## Troubleshooting

### MCP Server Keeps Restarting

**Symptom**: VS Code shows MCP server continuously restarting

**Common causes**:
- LanceDB data corruption in `~/.saga/lancedb/`
- Embedding provider not running (e.g., LM Studio on port 1234)
- Missing or incorrect environment variables

**Solutions**:
1. **Clear LanceDB data**: `rm -rf ~/.saga/lancedb/`
2. **Verify embedding endpoint**: 
   ```bash
   curl http://127.0.0.1:1234/v1/embeddings \
     -H "Content-Type: application/json" \
     -d '{"input": ["test"], "model": "text-embedding-multilingual-e5-large-instruct"}'
   ```
3. **Check VS Code MCP logs**: Open Output panel → Select "MCP Documentation Server"
4. **Restart VS Code** after applying fixes

### Graceful Degradation

If the vector database fails to initialize, the server will continue running without vector search capabilities. Document management tools (add, list, delete) remain functional, but semantic search will be unavailable. Check the MCP logs to identify and resolve the underlying issue.

## Storage Layout

```
~/.saga/
├── data/        # Document JSON files
├── lancedb/     # Vector storage
└── uploads/     # Drop files here to import
```

## Development

```bash
npm run dev      # Development mode
npm run build    # Build TypeScript
```

### Testing

The project uses Vitest for testing. Available test commands:

```bash
npm run test:unit        # Run unit tests only
npm run test:integration # Run integration tests only
npm run test:benchmark   # Run performance benchmarks
npm run test:all         # Run all tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage report
```

**Coverage Reporting:**
- Coverage reports are generated in the `coverage/` directory
- HTML reports can be opened at `coverage/index.html`
- Coverage thresholds are enforced: 80% for statements, branches, functions, and lines

**CI/CD Integration:**
- JUnit XML reports are generated for CI environments
- Reports are saved to `test-results/junit.xml` when running in CI

**Test Output Control:**
- By default, console output from tests is suppressed to keep results clean and readable
- To enable verbose output for debugging, set the `MCP_VERBOSE_TESTS` environment variable:
  ```bash
  MCP_VERBOSE_TESTS=true npm run test:all
  ```
- This is useful when debugging test failures or investigating specific test behavior

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/name`
3. Follow [Conventional Commits](https://conventionalcommits.org/)
4. Open a pull request

## License

MIT - see [LICENSE](LICENSE) file

---

**Built with [FastMCP](https://github.com/punkpeye/fastmcp) and TypeScript**
