import type { EmbeddingProvider } from '../types.js';

/**
 * Mock embedding provider for testing
 * Generates deterministic embeddings based on text content hash
 * This allows tests to run without requiring an external embedding service
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
    private dimensions: number;

    constructor(dimensions: number = 384) {
        this.dimensions = dimensions;
    }

    /**
     * Generate a deterministic embedding for a text
     * Uses a simple hash-based approach to generate consistent embeddings
     */
    async generateEmbedding(text: string): Promise<number[]> {
        return this.generateEmbeddingVector(text, this.dimensions);
    }

    /**
     * Generate embeddings for multiple texts in a batch
     * More efficient than calling generateEmbedding multiple times
     */
    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        return texts.map(text => this.generateEmbeddingVector(text, this.dimensions));
    }

    /**
     * Always available for tests
     */
    isAvailable(): boolean {
        return true;
    }

    /**
     * Returns mock model name
     */
    getModelName(): string {
        return 'mock-embedding-provider';
    }

    /**
     * Returns configured dimensions
     */
    getDimensions(): number {
        return this.dimensions;
    }

    /**
     * Generate a deterministic embedding vector from text
     * Uses character code sum as seed for consistent, reproducible embeddings
     */
    private generateEmbeddingVector(text: string, dimensions: number): number[] {
        // Create a seed from the text
        let seed = 0;
        for (let i = 0; i < text.length; i++) {
            seed += text.charCodeAt(i) * (i + 1);
        }

        // Generate embedding values using sine/cosine for smooth distribution
        const embedding: number[] = [];
        for (let i = 0; i < dimensions; i++) {
            const value = Math.sin(seed * i * 0.1) * Math.cos(seed * i * 0.05);
            embedding.push(value);
        }

        // Normalize to unit vector
        const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        if (norm > 0) {
            return embedding.map(val => val / norm);
        }

        return embedding;
    }
}
