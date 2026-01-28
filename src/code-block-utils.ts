const LANGUAGE_ALIASES: Record<string, string> = {
    'javascript': 'javascript',
    'js': 'javascript',
    'typescript': 'typescript',
    'ts': 'typescript',
    'python': 'python',
    'py': 'python',
    'java': 'java',
    'c#': 'csharp',
    'csharp': 'csharp',
    'c++': 'cpp',
    'cpp': 'cpp',
    'c': 'c',
    'go': 'go',
    'golang': 'go',
    'rust': 'rust',
    'rs': 'rust',
    'ruby': 'ruby',
    'rb': 'ruby',
    'php': 'php',
    'swift': 'swift',
    'kotlin': 'kotlin',
    'kt': 'kotlin',
    'scala': 'scala',
    'shell': 'shell',
    'bash': 'shell',
    'sh': 'shell',
    'powershell': 'powershell',
    'ps1': 'powershell',
    'sql': 'sql',
    'json': 'json',
    'xml': 'xml',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'yaml': 'yaml',
    'yml': 'yaml',
    'markdown': 'markdown',
    'md': 'markdown',
    'dockerfile': 'dockerfile',
    'docker': 'dockerfile',
};

/**
 * Normalize language tag to a consistent format.
 * Handles variants like "language-js hljs", "{.ts}", "JS" -> "javascript".
 */
export function normalizeLanguageTag(language: string): string {
    if (!language) return 'unknown';

    let normalized = language.toLowerCase().trim();
    if (!normalized) return 'unknown';

    // Use the first token to ignore extra classes/flags.
    normalized = normalized.split(/\s+/)[0];

    // Strip wrappers/prefixes like "{.lang-js}" or "language-js".
    normalized = normalized.replace(/^[{.(]+/, '').replace(/[)}]+$/, '');
    normalized = normalized.replace(/^(language|lang)[:_]/, '');
    if (normalized.startsWith('language-')) {
        normalized = normalized.slice('language-'.length);
    }
    if (normalized.startsWith('lang-')) {
        normalized = normalized.slice('lang-'.length);
    }

    if (!normalized) return 'unknown';

    return LANGUAGE_ALIASES[normalized] || normalized;
}
