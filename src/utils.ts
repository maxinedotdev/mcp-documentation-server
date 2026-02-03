import * as path from 'path';
import * as os from 'os';

/**
 * Get the default data directory for the server
 */
export function getDefaultDataDir(): string {
    // Check for MCP_BASE_DIR environment variable first
    const baseDir = process.env.MCP_BASE_DIR?.trim();
    if (baseDir) {
        return expandHomeDir(baseDir);
    }
    
    // Fall back to home directory
    const homeDir = os.homedir();
    return path.join(homeDir, '.saga');
}

export function expandHomeDir(value: string): string {
    if (value === '~') {
        return os.homedir();
    }
    if (value.startsWith('~/') || value.startsWith('~\\')) {
        return path.join(os.homedir(), value.slice(2));
    }
    return value;
}

/**
 * Clean and normalize text for processing
 */
export function normalizeText(text: string): string {
    return text
        .replace(/\r\n/g, '\n')  // Normalize line endings
        .replace(/\t/g, '  ')    // Replace tabs with spaces
        .trim();
}

/**
 * Default embedding batch size
 */
const DEFAULT_EMBEDDING_BATCH_SIZE = 100;

/**
 * Maximum embedding batch size (supports up to 4096 for models like text-embedding-llama-embed-nemotron-8b)
 */
const MAX_EMBEDDING_BATCH_SIZE = 4096;

/**
 * Minimum embedding batch size
 */
const MIN_EMBEDDING_BATCH_SIZE = 1;

/**
 * Get the configured embedding batch size
 * Reads from MCP_EMBEDDING_BATCH_SIZE environment variable
 * Validates and returns a value between MIN and MAX
 * @returns Validated batch size (default: 100)
 */
export function getEmbeddingBatchSize(): number {
    const envValue = process.env.MCP_EMBEDDING_BATCH_SIZE;
    
    if (!envValue) {
        return DEFAULT_EMBEDDING_BATCH_SIZE;
    }
    
    const parsed = parseInt(envValue, 10);
    
    if (isNaN(parsed)) {
        console.warn(`[Config] Invalid MCP_EMBEDDING_BATCH_SIZE value "${envValue}", using default: ${DEFAULT_EMBEDDING_BATCH_SIZE}`);
        return DEFAULT_EMBEDDING_BATCH_SIZE;
    }
    
    if (parsed < MIN_EMBEDDING_BATCH_SIZE) {
        console.warn(`[Config] MCP_EMBEDDING_BATCH_SIZE (${parsed}) is below minimum (${MIN_EMBEDDING_BATCH_SIZE}), using minimum`);
        return MIN_EMBEDDING_BATCH_SIZE;
    }
    
    if (parsed > MAX_EMBEDDING_BATCH_SIZE) {
        console.warn(`[Config] MCP_EMBEDDING_BATCH_SIZE (${parsed}) exceeds maximum (${MAX_EMBEDDING_BATCH_SIZE}), using maximum`);
        return MAX_EMBEDDING_BATCH_SIZE;
    }
    
    return parsed;
}

/**
 * Default embedding dimension
 * Current model (llama-nemotron-embed-1b-v2) produces 2048 dimensions
 */
const DEFAULT_EMBEDDING_DIMENSION = 2048;

/**
 * Minimum embedding dimension
 */
const MIN_EMBEDDING_DIMENSION = 64;

/**
 * Maximum embedding dimension
 */
const MAX_EMBEDDING_DIMENSION = 8192;

/**
 * Get the configured embedding dimension
 * Reads from MCP_EMBEDDING_DIMENSION environment variable
 * Validates and returns a value between MIN and MAX
 * @returns Validated embedding dimension (default: 2048)
 */
export function getEmbeddingDimension(): number {
    const envValue = process.env.MCP_EMBEDDING_DIMENSION;

    if (!envValue) {
        return DEFAULT_EMBEDDING_DIMENSION;
    }

    const parsed = parseInt(envValue, 10);

    if (isNaN(parsed)) {
        console.warn(`[Config] Invalid MCP_EMBEDDING_DIMENSION value "${envValue}", using default: ${DEFAULT_EMBEDDING_DIMENSION}`);
        return DEFAULT_EMBEDDING_DIMENSION;
    }

    if (parsed < MIN_EMBEDDING_DIMENSION) {
        console.warn(`[Config] MCP_EMBEDDING_DIMENSION (${parsed}) is below minimum (${MIN_EMBEDDING_DIMENSION}), using minimum`);
        return MIN_EMBEDDING_DIMENSION;
    }

    if (parsed > MAX_EMBEDDING_DIMENSION) {
        console.warn(`[Config] MCP_EMBEDDING_DIMENSION (${parsed}) exceeds maximum (${MAX_EMBEDDING_DIMENSION}), using maximum`);
        return MAX_EMBEDDING_DIMENSION;
    }

    return parsed;
}

/**
 * Get a logger for the specified prefix
 * Uses console.error for logging (MCP standard)
 */
export function getLogger(prefix: string): {
    debug: (...args: any[]) => void;
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
} {
    const log = (level: string, ...args: any[]) => {
        console.error(`[${prefix}] [${level.toUpperCase()}]`, ...args);
    };

    return {
        debug: (...args: any[]) => log('debug', ...args),
        info: (...args: any[]) => log('info', ...args),
        warn: (...args: any[]) => log('warn', ...args),
        error: (...args: any[]) => log('error', ...args)
    };
}
