import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**'
    ],
    // Allow tests to run for up to 10 seconds
    testTimeout: 10000
  }
});
