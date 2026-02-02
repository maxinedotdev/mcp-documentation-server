import { getLogger } from '../utils.js';

const logger = getLogger('http-timeout');

/**
 * Default timeout values in milliseconds
 */
export const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Environment variable names for timeout configuration
 */
export const ENV_TIMEOUT_GLOBAL = 'MCP_REQUEST_TIMEOUT_MS';
export const ENV_TIMEOUT_AI_SEARCH = 'MCP_AI_SEARCH_TIMEOUT_MS';
export const ENV_TIMEOUT_EMBEDDING = 'MCP_EMBEDDING_TIMEOUT_MS';

/**
 * Operation types for timeout configuration
 */
export type TimeoutOperationType = 'ai-search' | 'embedding' | 'global';

/**
 * Custom error class for request timeout errors.
 * Extends Error with an `isTimeout` property for easy identification.
 */
export class RequestTimeoutError extends Error {
    /** Indicates this is a timeout error */
    public readonly isTimeout = true;

    /** The timeout duration that was exceeded (in milliseconds) */
    public readonly timeoutMs: number;

    /** The URL that was being requested when the timeout occurred */
    public readonly url: string;

    constructor(timeoutMs: number, url: string) {
        super(`Request timed out after ${timeoutMs}ms: ${url}`);
        this.name = 'RequestTimeoutError';
        this.timeoutMs = timeoutMs;
        this.url = url;

        // Maintain proper stack trace in V8 environments
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, RequestTimeoutError);
        }
    }
}

/**
 * Validates and parses a timeout value from an environment variable.
 * Rejects non-numeric values, zero, and negative values.
 * Logs warnings for invalid values.
 *
 * @param value - The environment variable value to parse
 * @param fallback - The fallback value to use if parsing fails
 * @param varName - The name of the environment variable (for logging)
 * @returns The parsed timeout value or the fallback
 */
export function parseTimeoutValue(
    value: string | undefined,
    fallback: number,
    varName: string
): number {
    if (value === undefined || value === null || value.trim() === '') {
        return fallback;
    }

    const trimmed = value.trim();

    // Check if it's a valid numeric string (integer only)
    const numericRegex = /^-?\d+$/;
    if (!numericRegex.test(trimmed)) {
        logger.warn(
            `Invalid ${varName} value "${value}": not a valid integer. Using default ${fallback}ms.`
        );
        return fallback;
    }

    const parsed = Number.parseInt(trimmed, 10);

    // Check for NaN (shouldn't happen due to regex, but defensive)
    if (Number.isNaN(parsed)) {
        logger.warn(
            `Invalid ${varName} value "${value}": could not parse. Using default ${fallback}ms.`
        );
        return fallback;
    }

    // Reject zero or negative values
    if (parsed <= 0) {
        logger.warn(
            `Invalid ${varName} value "${value}": must be a positive integer. Using default ${fallback}ms.`
        );
        return fallback;
    }

    return parsed;
}

/**
 * Gets the global default timeout from environment variables.
 * Falls back to DEFAULT_TIMEOUT_MS (30000ms) if not set or invalid.
 *
 * @returns The global timeout value in milliseconds
 */
export function getGlobalTimeout(): number {
    return parseTimeoutValue(
        process.env[ENV_TIMEOUT_GLOBAL],
        DEFAULT_TIMEOUT_MS,
        ENV_TIMEOUT_GLOBAL
    );
}

/**
 * Gets the appropriate timeout for a specific operation type.
 * Supports per-operation overrides that fall back to the global default.
 *
 * @param operation - The type of operation ('ai-search' | 'embedding' | 'global')
 * @returns The timeout value in milliseconds for the operation
 */
export function getRequestTimeout(operation: TimeoutOperationType): number {
    const globalTimeout = getGlobalTimeout();

    switch (operation) {
        case 'ai-search': {
            return parseTimeoutValue(
                process.env[ENV_TIMEOUT_AI_SEARCH],
                globalTimeout,
                ENV_TIMEOUT_AI_SEARCH
            );
        }
        case 'embedding': {
            return parseTimeoutValue(
                process.env[ENV_TIMEOUT_EMBEDDING],
                globalTimeout,
                ENV_TIMEOUT_EMBEDDING
            );
        }
        case 'global':
        default: {
            return globalTimeout;
        }
    }
}

/**
 * Options for the fetchWithTimeout function
 */
export interface FetchWithTimeoutOptions extends RequestInit {
    /** Timeout in milliseconds (overrides default) */
    timeoutMs?: number;
}

/**
 * Wraps the native fetch API with timeout support using AbortController.
 * Automatically cancels the request if it exceeds the specified timeout.
 *
 * @param url - The URL to fetch
 * @param options - Fetch options including optional timeoutMs
 * @returns Promise that resolves to the Response or rejects with RequestTimeoutError
 * @throws {RequestTimeoutError} When the request exceeds the timeout duration
 * @throws {Error} When the fetch fails for other reasons (network, etc.)
 *
 * @example
 * ```typescript
 * // Use default timeout (30 seconds)
 * const response = await fetchWithTimeout('https://api.example.com/data');
 *
 * // Use custom timeout
 * const response = await fetchWithTimeout('https://api.example.com/data', {
 *   method: 'POST',
 *   body: JSON.stringify({ key: 'value' }),
 *   timeoutMs: 60000 // 60 seconds
 * });
 *
 * // Handle timeout errors
 * try {
 *   const response = await fetchWithTimeout('https://slow-api.example.com');
 * } catch (error) {
 *   if (error instanceof RequestTimeoutError) {
 *     console.error(`Request timed out after ${error.timeoutMs}ms`);
 *   }
 * }
 * ```
 */
export async function fetchWithTimeout(
    url: string,
    options: FetchWithTimeoutOptions = {}
): Promise<Response> {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;

    // Log all HTTP requests to identify HEAD requests
    const method = fetchOptions.method || 'GET';
    logger.info(`[HTTP_REQUEST] ${method} ${url}`);

    // If timeout is invalid or zero, fall back to native fetch without timeout
    if (!timeoutMs || timeoutMs <= 0) {
        logger.warn(`Invalid timeout value ${timeoutMs}, using native fetch without timeout`);
        return fetch(url, fetchOptions);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...fetchOptions,
            signal: controller.signal,
        });
        logger.info(`[HTTP_RESPONSE] ${method} ${url} - Status: ${response.status}`);
        return response;
    } catch (error) {
        // Check if this is an abort error (timeout)
        if (error instanceof Error && error.name === 'AbortError') {
            logger.error(`[HTTP_TIMEOUT] ${method} ${url} - Timed out after ${timeoutMs}ms`);
            throw new RequestTimeoutError(timeoutMs, url);
        }

        // Re-throw other errors (network errors, etc.)
        logger.error(`[HTTP_ERROR] ${method} ${url} - Error: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    } finally {
        // Always clear the timeout to prevent memory leaks
        clearTimeout(timeoutId);
    }
}
