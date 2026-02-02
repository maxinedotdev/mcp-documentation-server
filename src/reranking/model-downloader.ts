/**
 * Model downloader utility for MLX reranker
 * 
 * This module provides functionality to automatically download the Jina Reranker V3 MLX
 * model from Hugging Face to a local directory.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { getDefaultModelPath } from './apple-silicon-detection.js';

/**
 * Configuration for model download
 */
export interface ModelDownloadConfig {
    /** Hugging Face model repository ID */
    modelRepo: string;
    /** Local directory to download the model to */
    localPath: string;
    /** Whether to verify model integrity after download */
    verify: boolean;
    /** Maximum number of retry attempts */
    maxRetries: number;
    /** Delay between retries in milliseconds */
    retryDelay: number;
}

/**
 * Result of model download operation
 */
export interface ModelDownloadResult {
    success: boolean;
    modelPath: string;
    downloaded: boolean;
    error?: string;
}

/**
 * Progress callback for download operations
 */
export type ProgressCallback = (progress: {
    stage: 'checking' | 'downloading' | 'verifying' | 'complete';
    message: string;
    percent?: number;
}) => void;

/**
 * Default model download configuration
 */
const DEFAULT_CONFIG: ModelDownloadConfig = {
    modelRepo: 'jinaai/jina-reranker-v3-mlx',
    localPath: getDefaultModelPath(),
    verify: true,
    maxRetries: 3,
    retryDelay: 2000,
};

/**
 * Check if the model already exists at the specified path
 * @param modelPath - Path to check for model existence
 * @returns True if model exists, false otherwise
 */
export async function modelExists(modelPath: string): Promise<boolean> {
    try {
        // Check if the directory exists
        const stats = await fs.stat(modelPath);
        if (!stats.isDirectory()) {
            return false;
        }

        // Check for essential model files
        const requiredFiles = ['config.json', 'model.safetensors'];
        for (const file of requiredFiles) {
            try {
                await fs.access(join(modelPath, file));
            } catch {
                return false;
            }
        }

        return true;
    } catch {
        return false;
    }
}

/**
 * Download the MLX model from Hugging Face
 * @param config - Download configuration
 * @param onProgress - Optional progress callback
 * @returns Download result
 */
export async function downloadModel(
    config: Partial<ModelDownloadConfig> = {},
    onProgress?: ProgressCallback
): Promise<ModelDownloadResult> {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    const { modelRepo, localPath, verify, maxRetries, retryDelay } = finalConfig;

    // Report checking stage
    onProgress?.({
        stage: 'checking',
        message: `Checking if model exists at ${localPath}`,
    });

    // Check if model already exists
    const exists = await modelExists(localPath);
    if (exists) {
        console.error(`[MLX Auto-Config] Model already exists at ${localPath}`);
        onProgress?.({
            stage: 'complete',
            message: 'Model already downloaded',
        });
        return {
            success: true,
            modelPath: localPath,
            downloaded: false,
        };
    }

    // Create the model directory
    try {
        await fs.mkdir(localPath, { recursive: true });
        console.error(`[MLX Auto-Config] Created model directory: ${localPath}`);
    } catch (error) {
        const errorMessage = `Failed to create model directory: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[MLX Auto-Config] ${errorMessage}`);
        return {
            success: false,
            modelPath: localPath,
            downloaded: false,
            error: errorMessage,
        };
    }

    // Download the model using git (preferred method for Hugging Face)
    onProgress?.({
        stage: 'downloading',
        message: `Downloading model from ${modelRepo}...`,
    });

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await downloadModelViaGit(modelRepo, localPath, onProgress);
            lastError = null;
            break;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.error(`[MLX Auto-Config] Download attempt ${attempt}/${maxRetries} failed: ${lastError.message}`);
            
            if (attempt < maxRetries) {
                console.error(`[MLX Auto-Config] Retrying in ${retryDelay}ms...`);
                await sleep(retryDelay);
            }
        }
    }

    if (lastError) {
        const errorMessage = `Failed to download model after ${maxRetries} attempts: ${lastError.message}`;
        console.error(`[MLX Auto-Config] ${errorMessage}`);
        return {
            success: false,
            modelPath: localPath,
            downloaded: false,
            error: errorMessage,
        };
    }

    // Verify the model if requested
    if (verify) {
        onProgress?.({
            stage: 'verifying',
            message: 'Verifying model integrity...',
        });

        const verified = await modelExists(localPath);
        if (!verified) {
            const errorMessage = 'Model verification failed: required files not found';
            console.error(`[MLX Auto-Config] ${errorMessage}`);
            return {
                success: false,
                modelPath: localPath,
                downloaded: false,
                error: errorMessage,
            };
        }
    }

    console.error(`[MLX Auto-Config] Model successfully downloaded to ${localPath}`);
    onProgress?.({
        stage: 'complete',
        message: 'Model download complete',
    });

    return {
        success: true,
        modelPath: localPath,
        downloaded: true,
    };
}

/**
 * Download model using git clone from Hugging Face
 * @param modelRepo - Hugging Face model repository ID
 * @param localPath - Local path to download to
 * @param onProgress - Optional progress callback
 */
async function downloadModelViaGit(
    modelRepo: string,
    localPath: string,
    onProgress?: ProgressCallback
): Promise<void> {
    const { spawn } = await import('child_process');
    
    return new Promise((resolve, reject) => {
        const gitUrl = `https://huggingface.co/${modelRepo}`;
        console.error(`[MLX Auto-Config] Cloning ${gitUrl} to ${localPath}`);
        
        const git = spawn('git', ['clone', '--depth', '1', gitUrl, localPath]);
        
        let stderr = '';
        
        git.stderr.on('data', (data) => {
            stderr += data.toString();
            // Parse git progress for percentage
            const match = stderr.match(/Receiving objects:\s*(\d+)%/);
            if (match) {
                onProgress?.({
                    stage: 'downloading',
                    message: `Downloading model: ${match[1]}%`,
                    percent: parseInt(match[1], 10),
                });
            }
        });
        
        git.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`git clone failed with code ${code}: ${stderr}`));
                return;
            }
            resolve();
        });
        
        git.on('error', (error) => {
            reject(new Error(`Failed to spawn git process: ${error.message}`));
        });
    });
}

/**
 * Sleep for a specified duration
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Ensure the model is available, downloading if necessary
 * @param config - Optional download configuration
 * @param onProgress - Optional progress callback
 * @returns Path to the model
 */
export async function ensureModel(
    config?: Partial<ModelDownloadConfig>,
    onProgress?: ProgressCallback
): Promise<string> {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    const result = await downloadModel(finalConfig, onProgress);
    
    if (!result.success) {
        throw new Error(result.error || 'Failed to ensure model availability');
    }
    
    return result.modelPath;
}

// Re-export getDefaultModelPath for convenience
export { getDefaultModelPath } from './apple-silicon-detection.js';
