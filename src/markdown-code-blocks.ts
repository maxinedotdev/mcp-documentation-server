import type { CodeBlock } from './types.js';
import { normalizeLanguageTag } from './code-block-utils.js';

/**
 * Extract fenced code blocks from markdown-like content.
 */
export function extractMarkdownCodeBlocks(content: string): CodeBlock[] {
    const codeBlocks: CodeBlock[] = [];
    if (!content) {
        return codeBlocks;
    }

    const fenceRegex = /(^|\n)(```|~~~)([^\n]*)\n([\s\S]*?)\n\2(?=\n|$)/g;
    let match: RegExpExecArray | null;
    let blockIndex = 0;

    while ((match = fenceRegex.exec(content)) !== null) {
        const info = match[3] ? match[3].trim() : '';
        const language = normalizeLanguageTag(info);
        const codeContent = match[4] ? match[4].trim() : '';

        if (!codeContent) {
            continue;
        }

        codeBlocks.push({
            id: `${blockIndex}`,
            document_id: '',
            block_id: `block-${blockIndex}`,
            block_index: blockIndex,
            language,
            content: codeContent,
            metadata: {
                extraction_method: 'markdown-fence',
            },
        });
        blockIndex += 1;
    }

    return codeBlocks;
}
