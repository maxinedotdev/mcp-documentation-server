/**
 * Unit tests for Cheerio-based HTML extraction
 */

import { describe, it, expect } from 'vitest';
import { extractHtmlContent, looksLikeHtml } from '../html-extraction.js';

describe('HTML Extraction', () => {
    describe('HTML Detection', () => {
        it('should detect HTML tags', () => {
            expect(looksLikeHtml('<html><body></body></html>')).toBe(true);
        });

        it('should reject plain text', () => {
            expect(looksLikeHtml('plain text content')).toBe(false);
        });
    });

    describe('Title and Text Extraction', () => {
        it('should extract and decode title', () => {
            const html = `
                <!doctype html>
                <html>
                <head><title>Doc & Title</title></head>
                <body>
                    <nav>SHOULD-NOT-INCLUDE</nav>
                    <main>
                        <h1>Heading</h1>
                        <p>Paragraph text.</p>
                        <script>malicious()</script>
                        <style>.hidden{display:none;}</style>
                    </main>
                </body>
                </html>
            `;

            const result = extractHtmlContent(html, { sourceUrl: 'https://example.com/docs/intro' });

            expect(result.title).toBe('Doc & Title');
        });

        it('should include visible text', () => {
            const html = `
                <html>
                <body>
                    <main>
                        <h1>Heading</h1>
                        <p>Paragraph text.</p>
                    </main>
                </body>
                </html>
            `;

            const result = extractHtmlContent(html, { sourceUrl: 'https://example.com/docs/intro' });

            expect(result.text).toContain('Heading');
            expect(result.text).toContain('Paragraph text.');
        });

        it('should remove script contents', () => {
            const html = `
                <html>
                <body>
                    <script>malicious()</script>
                </body>
                </html>
            `;

            const result = extractHtmlContent(html, { sourceUrl: 'https://example.com/docs/intro' });

            expect(result.text).not.toContain('malicious()');
        });

        it('should remove nav content', () => {
            const html = `
                <html>
                <body>
                    <nav>SHOULD-NOT-INCLUDE</nav>
                    <main>Content</main>
                </body>
                </html>
            `;

            const result = extractHtmlContent(html, { sourceUrl: 'https://example.com/docs/intro' });

            expect(result.text).not.toContain('SHOULD-NOT-INCLUDE');
        });
    });

    describe('Link and Code Extraction', () => {
        it('should extract expected links', () => {
            const html = `
                <html>
                <body>
                    <a href="/docs/start">Docs</a>
                    <a href="https://example.com/abs">Absolute</a>
                    <a href="mailto:test@example.com">Mail</a>
                    <a href="javascript:alert('x')">Script</a>
                    <a href="#section">Anchor</a>
                </body>
                </html>
            `;

            const result = extractHtmlContent(html, { sourceUrl: 'https://example.com/base/' });

            const expectedLinks = new Set([
                'https://example.com/docs/start',
                'https://example.com/abs',
            ]);

            expect(result.links.length).toBe(expectedLinks.size);
            result.links.forEach(link => {
                expect(expectedLinks.has(link)).toBe(true);
            });
        });

        it('should extract one code block', () => {
            const html = `
                <html>
                <body>
                    <pre><code class="language-js">const x = 1;</code></pre>
                </body>
                </html>
            `;

            const result = extractHtmlContent(html, { sourceUrl: 'https://example.com/base/' });

            expect(result.codeBlocks.length).toBe(1);
        });

        it('should normalize language', () => {
            const html = `
                <html>
                <body>
                    <pre><code class="language-js">const x = 1;</code></pre>
                </body>
                </html>
            `;

            const result = extractHtmlContent(html, { sourceUrl: 'https://example.com/base/' });

            expect(result.codeBlocks[0].language).toBe('javascript');
        });

        it('should extract code block content', () => {
            const html = `
                <html>
                <body>
                    <pre><code class="language-js">const x = 1;</code></pre>
                </body>
                </html>
            `;

            const result = extractHtmlContent(html, { sourceUrl: 'https://example.com/base/' });

            expect(result.codeBlocks[0].content).toBe('const x = 1;');
        });
    });

    describe('Title Fallback from URL', () => {
        it('should derive title from URL when missing', () => {
            const html = `
                <html>
                <body>
                    <p>Content</p>
                </body>
                </html>
            `;

            const result = extractHtmlContent(html, { sourceUrl: 'https://example.com/path/to/page' });

            expect(result.title).toBe('page');
        });
    });
});
