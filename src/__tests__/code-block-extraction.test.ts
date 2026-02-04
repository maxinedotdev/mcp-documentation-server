/**
 * Unit tests for code block extraction from documentation crawler
 * Tests for multi-language code block detection and extraction
 */

import { describe, it, expect } from 'vitest';
import { extractCodeBlocks, normalizeLanguageTag } from '../documentation-crawler.js';

describe('Language Tag Normalization', () => {
    it('should normalize javascript language tags', () => {
        expect(normalizeLanguageTag('javascript')).toBe('javascript');
        expect(normalizeLanguageTag('JavaScript')).toBe('javascript');
        expect(normalizeLanguageTag('js')).toBe('javascript');
    });

    it('should normalize typescript language tags', () => {
        expect(normalizeLanguageTag('typescript')).toBe('typescript');
        expect(normalizeLanguageTag('TypeScript')).toBe('typescript');
        expect(normalizeLanguageTag('ts')).toBe('typescript');
    });

    it('should normalize python language tags', () => {
        expect(normalizeLanguageTag('python')).toBe('python');
        expect(normalizeLanguageTag('py')).toBe('python');
    });

    it('should normalize csharp language tags', () => {
        expect(normalizeLanguageTag('c#')).toBe('csharp');
        expect(normalizeLanguageTag('csharp')).toBe('csharp');
    });

    it('should normalize cpp language tags', () => {
        expect(normalizeLanguageTag('c++')).toBe('cpp');
        expect(normalizeLanguageTag('cpp')).toBe('cpp');
    });

    it('should normalize shell language tags', () => {
        expect(normalizeLanguageTag('shell')).toBe('shell');
        expect(normalizeLanguageTag('bash')).toBe('shell');
        expect(normalizeLanguageTag('sh')).toBe('shell');
    });

    it('should handle edge cases', () => {
        expect(normalizeLanguageTag('')).toBe('unknown');
        expect(normalizeLanguageTag('  ')).toBe('unknown');
        expect(normalizeLanguageTag('UNKNOWN-LANG')).toBe('unknown-lang');
    });
});

describe('Standard Code Block Extraction', () => {
    it('should extract standard code blocks with language classes', () => {
        const html = `
            <html>
            <body>
            <pre><code class="language-javascript">const x = 1;
console.log(x);</code></pre>
            <pre><code class="python">x = 1
print(x)</code></pre>
            <pre><code class="language-typescript">const x: number = 1;</code></pre>
            </body>
            </html>
        `;

        const codeBlocks = extractCodeBlocks(html, 'https://example.com');

        expect(codeBlocks.length).toBe(3);

        // Verify first code block (javascript)
        expect(codeBlocks[0].language).toBe('javascript');
        expect(codeBlocks[0].content).toBe('const x = 1;\nconsole.log(x);');

        // Verify second code block (python)
        expect(codeBlocks[1].language).toBe('python');
        expect(codeBlocks[1].content).toBe('x = 1\nprint(x)');

        // Verify third code block (typescript)
        expect(codeBlocks[2].language).toBe('typescript');

        // Verify metadata
        codeBlocks.forEach(cb => {
            expect(cb.source_url).toBe('https://example.com');
            expect(cb.metadata?.extraction_method).toBe('standard');
        });
    });
});

describe('Plain Code Block Extraction', () => {
    it('should extract plain code blocks without language class', () => {
        const html = `
            <html>
            <body>
            <pre><code>def hello():
    print("Hello")</code></pre>
            <pre><code>function hello() {
    console.log("Hello");
}</code></pre>
            </body>
            </html>
        `;

        const codeBlocks = extractCodeBlocks(html, 'https://example.com');

        expect(codeBlocks.length).toBe(2);

        // Both should have 'unknown' language
        expect(codeBlocks[0].language).toBe('unknown');
        expect(codeBlocks[1].language).toBe('unknown');

        // Verify extraction method
        expect(codeBlocks[0].metadata?.extraction_method).toBe('plain');
    });
});

describe('Tabbed Code Block Extraction', () => {
    it('should extract tabbed code block variants', () => {
        const html = `
            <html>
            <body>
            <div class="tabs">
                <div class="tab" data-lang="javascript">
                    <pre><code>const x = 1;</code></pre>
                </div>
                <div class="tab" data-lang="python">
                    <pre><code>x = 1</code></pre>
                </div>
                <div class="tab" data-lang="typescript">
                    <pre><code>const x: number = 1;</code></pre>
                </div>
            </div>
            </body>
            </html>
        `;

        const codeBlocks = extractCodeBlocks(html, 'https://example.com');

        expect(codeBlocks.length).toBe(3);

        // Verify all three languages are present
        const languages = codeBlocks.map(cb => cb.language);
        expect(languages).toContain('javascript');
        expect(languages).toContain('python');
        expect(languages).toContain('typescript');

        // Verify all have the same block_id (indicating they're variants)
        const blockIds = [...new Set(codeBlocks.map(cb => cb.block_id))];
        expect(blockIds.length).toBe(1);

        // Verify metadata indicates tabbed extraction
        expect(codeBlocks[0].metadata?.extraction_method).toBe('tabbed');
        expect(codeBlocks[0].metadata?.is_variant).toBe(true);
        expect(codeBlocks[0].metadata?.variant_count).toBe(3);
    });
});

describe('Data-Language Attribute Extraction', () => {
    it('should extract code blocks with data-language attribute', () => {
        const html = `
            <html>
            <body>
            <pre data-language="rust"><code>fn main() {
    println!("Hello");
}</code></pre>
            <pre data-lang="go"><code>func main() {
    fmt.Println("Hello")
}</code></pre>
            </body>
            </html>
        `;

        const codeBlocks = extractCodeBlocks(html, 'https://example.com');

        expect(codeBlocks.length).toBe(2);

        expect(codeBlocks[0].language).toBe('rust');
        expect(codeBlocks[0].metadata?.extraction_method).toBe('data-lang');

        expect(codeBlocks[1].language).toBe('go');
        expect(codeBlocks[1].metadata?.extraction_method).toBe('data-lang-short');
    });
});

describe('HTML Entity Decoding', () => {
    it('should decode HTML entities in code blocks', () => {
        const html = `
            <html>
            <body>
            <pre><code class="language-javascript">const x = "hello";
console.log('world');</code></pre>
            </body>
            </html>
        `;

        const codeBlocks = extractCodeBlocks(html, 'https://example.com');

        expect(codeBlocks.length).toBe(1);
        expect(codeBlocks[0].content).toBe('const x = "hello";\nconsole.log(\'world\');');
    });
});

describe('Empty Code Block Skipping', () => {
    it('should skip empty and invalid code blocks', () => {
        const html = `
            <html>
            <body>
            <pre><code class="language-javascript"></code></pre>
            <pre><code class="language-python">   </code></pre>
            <pre><code class="language-typescript">const x = 1;</code></pre>
            <pre><code></code></pre>
            </body>
            </html>
        `;

        const codeBlocks = extractCodeBlocks(html, 'https://example.com');

        // Only the non-empty code block should be extracted
        expect(codeBlocks.length).toBe(1);
        expect(codeBlocks[0].language).toBe('typescript');
    });
});

describe('Mixed Code Block Formats', () => {
    it('should extract code blocks from mixed formats in single document', () => {
        const html = `
            <html>
            <body>
            <pre><code class="language-javascript">const x = 1;</code></pre>
            <div class="tabs">
                <div class="tab" data-lang="python">
                    <pre><code>x = 1</code></pre>
                </div>
                <div class="tab" data-lang="ruby">
                    <pre><code>x = 1</code></pre>
                </div>
            </div>
            <pre data-language="go"><code>func main() {}</code></pre>
            <pre><code>plain code</code></pre>
            </body>
            </html>
        `;

        const codeBlocks = extractCodeBlocks(html, 'https://example.com');

        expect(codeBlocks.length).toBe(5);

        // Verify we have different extraction methods
        const extractionMethods = [...new Set(codeBlocks.map(cb => cb.metadata?.extraction_method))];
        expect(extractionMethods).toContain('standard');
        expect(extractionMethods).toContain('tabbed');
        expect(extractionMethods).toContain('data-lang');
        expect(extractionMethods).toContain('plain');
    });
});
