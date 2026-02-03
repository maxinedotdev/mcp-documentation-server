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
 * Sanitize filename by removing invalid characters
 */
export function sanitizeFilename(filename: string): string {
    return filename.replace(/[<>:"/\\|?*]/g, '_').trim();
}

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Truncate text to specified length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Extract meaningful excerpt from text around search terms
 */
export function extractExcerpt(text: string, searchTerms: string[], maxLength: number = 200): string {
    if (!searchTerms.length) {
        return truncateText(text, maxLength);
    }

    const lowerText = text.toLowerCase();
    const lowerTerms = searchTerms.map(term => term.toLowerCase());

    // Find the first occurrence of any search term
    let firstIndex = -1;
    for (const term of lowerTerms) {
        const index = lowerText.indexOf(term);
        if (index !== -1 && (firstIndex === -1 || index < firstIndex)) {
            firstIndex = index;
        }
    }

    if (firstIndex === -1) {
        return truncateText(text, maxLength);
    }

    // Calculate excerpt boundaries
    const halfLength = Math.floor(maxLength / 2);
    const start = Math.max(0, firstIndex - halfLength);
    const end = Math.min(text.length, start + maxLength);

    let excerpt = text.substring(start, end);

    // Add ellipsis if truncated
    if (start > 0) excerpt = '...' + excerpt;
    if (end < text.length) excerpt = excerpt + '...';

    return excerpt;
}

/**
 * Validate document content type
 */
export function validateContentType(contentType: string): boolean {
    const validTypes = [
        'text/plain',
        'text/markdown',
        'text/html',
        'application/json',
        'application/xml',
        'text/csv'
    ];
    return validTypes.includes(contentType);
}

/**
 * Infer content type from file extension or content
 */
export function inferContentType(filename: string, content: string): string {
    const ext = path.extname(filename).toLowerCase();

    switch (ext) {
        case '.md':
        case '.markdown':
            return 'text/markdown';
        case '.html':
        case '.htm':
            return 'text/html';
        case '.json':
            return 'application/json';
        case '.xml':
            return 'application/xml';
        case '.csv':
            return 'text/csv';
        default:
            // Try to infer from content
            if (content.trim().startsWith('<') && content.trim().endsWith('>')) {
                return 'text/html';
            }
            if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
                try {
                    JSON.parse(content);
                    return 'application/json';
                } catch {
                    // Not valid JSON
                }
            }
            return 'text/plain';
    }
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
 * Calculate similarity score as percentage
 */
export function formatSimilarityScore(score: number): string {
    return `${Math.round(score * 100)}%`;
}

/**
 * Convert Date to ISO string for JSON serialization
 */
export function serializeDate(date: Date): string {
    return date.toISOString();
}

/**
 * Parse ISO string back to Date
 */
export function parseDate(dateString: string): Date {
    return new Date(dateString);
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
