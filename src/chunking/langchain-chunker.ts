import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import type { EmbeddingProvider, DocumentChunk } from "../types.js";

export interface ChunkOptions {
    maxSize?: number;
    overlap?: number;
}

enum ContentType {
    CODE = "code",
    MARKDOWN = "markdown",
    HTML = "html",
    TEXT = "text",
    MIXED = "mixed",
}

const DEFAULTS: Record<ContentType, Required<ChunkOptions>> = {
    [ContentType.CODE]: { maxSize: 500, overlap: 100 },
    [ContentType.MARKDOWN]: { maxSize: 800, overlap: 160 },
    [ContentType.HTML]: { maxSize: 600, overlap: 120 },
    [ContentType.TEXT]: { maxSize: 1000, overlap: 200 },
    [ContentType.MIXED]: { maxSize: 600, overlap: 120 },
};

function detectContentType(content: string): ContentType {
    const codePatterns = [
        /```/,
        /function\s+\w+/i,
        /class\s+\w+/i,
        /import\s+.+from/i,
        /const\s+\w+\s*=/i,
        /def\s+\w+/i,
    ];
    const markdownPatterns = [
        /^#{1,6}\s+/m,
        /\*\*.+\*\*/,
        /\[.+\]\(.+\)/,
        /^>\s+/m,
        /^-\s+/m,
    ];
    const htmlPatterns = [
        /<html/i,
        /<body/i,
        /<div/i,
        /<p>/i,
        /<h[1-6]>/i,
    ];

    const codeScore = codePatterns.reduce((score, pattern) => score + (pattern.test(content) ? 1 : 0), 0);
    const markdownScore = markdownPatterns.reduce((score, pattern) => score + (pattern.test(content) ? 1 : 0), 0);
    const htmlScore = htmlPatterns.reduce((score, pattern) => score + (pattern.test(content) ? 1 : 0), 0);

    if (
        (codeScore > 0 && markdownScore > 0) ||
        (codeScore > 0 && htmlScore > 0) ||
        (markdownScore > 0 && htmlScore > 0) ||
        (codeScore >= 2 && content.length > 1000)
    ) {
        return ContentType.MIXED;
    }

    if (htmlScore >= 2) return ContentType.HTML;
    if (markdownScore >= 2) return ContentType.MARKDOWN;
    if (codeScore >= 2) return ContentType.CODE;
    return ContentType.TEXT;
}

function resolveOptions(contentType: ContentType, options: ChunkOptions): Required<ChunkOptions> {
    const base = DEFAULTS[contentType];
    return {
        maxSize: options.maxSize ?? base.maxSize,
        overlap: options.overlap ?? base.overlap,
    };
}

function findChunkOffsets(content: string, chunks: string[]): Array<{ start: number; end: number }> {
    const offsets: Array<{ start: number; end: number }> = [];
    let cursor = 0;
    for (const chunk of chunks) {
        let start = content.indexOf(chunk, cursor);
        if (start === -1) {
            start = content.indexOf(chunk);
        }
        if (start === -1) {
            start = cursor;
        }
        const end = start + chunk.length;
        offsets.push({ start, end });
        cursor = end;
    }
    return offsets;
}

async function splitWithSplitter(
    splitter: RecursiveCharacterTextSplitter,
    content: string,
): Promise<string[]> {
    return splitter.splitText(content);
}

export class LangChainChunker {
    constructor(private embeddingProvider: EmbeddingProvider) {}

    async createChunks(
        documentId: string,
        content: string,
        options: ChunkOptions = {},
    ): Promise<DocumentChunk[]> {
        const contentType = detectContentType(content);
        const resolvedOptions = resolveOptions(contentType, options);

        const splitter =
            contentType === ContentType.CODE
                ? this.createCodeSplitter(resolvedOptions)
                : new RecursiveCharacterTextSplitter({
                      chunkSize: resolvedOptions.maxSize,
                      chunkOverlap: resolvedOptions.overlap,
                  });

        const texts = await splitWithSplitter(splitter, content);
        const offsets = findChunkOffsets(content, texts);

        let embeddings: number[][] = [];
        try {
            if (this.embeddingProvider.generateEmbeddings) {
                embeddings = await this.embeddingProvider.generateEmbeddings(texts);
            } else {
                for (const text of texts) {
                    embeddings.push(await this.embeddingProvider.generateEmbedding(text));
                }
            }
        } catch (error) {
            embeddings = [];
            for (const text of texts) {
                try {
                    embeddings.push(await this.embeddingProvider.generateEmbedding(text));
                } catch {
                    embeddings.push([]);
                }
            }
        }

        return texts.map((text, index) => ({
            id: `${documentId}_chunk_${index}`,
            document_id: documentId,
            chunk_index: index,
            content: text,
            embeddings: embeddings[index] ?? [],
            start_position: offsets[index]?.start ?? 0,
            end_position: offsets[index]?.end ?? text.length,
            metadata: {},
        }));
    }

    private createCodeSplitter(options: Required<ChunkOptions>): RecursiveCharacterTextSplitter {
        try {
            return RecursiveCharacterTextSplitter.fromLanguage("js", {
                chunkSize: options.maxSize,
                chunkOverlap: options.overlap,
            });
        } catch {
            return new RecursiveCharacterTextSplitter({
                chunkSize: options.maxSize,
                chunkOverlap: options.overlap,
            });
        }
    }
}
