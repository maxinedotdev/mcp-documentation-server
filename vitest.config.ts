import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/__tests__/**',
        '**/*.config.ts',
        '**/*.config.js',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
    reporters: process.env.CI ? ['junit', 'verbose'] : ['default'],
    outputFile: process.env.CI ? './test-results/junit.xml' : undefined,
  },
  plugins: [tsconfigPaths()],
});
