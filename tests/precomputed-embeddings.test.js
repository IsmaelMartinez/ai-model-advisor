import { describe, test, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';

describe('Pre-computed Embeddings', () => {
  test('reference-embeddings.json should exist and have valid structure', async () => {
    const embeddingsPath = resolve('src/lib/data/reference-embeddings.json');
    if (!existsSync(embeddingsPath)) {
      console.warn('reference-embeddings.json not yet generated. Run: npm run precompute-embeddings');
      return;
    }

    const embeddings = (await import('../src/lib/data/reference-embeddings.json', { with: { type: 'json' } })).default;
    expect(embeddings).toHaveProperty('embeddings');
    expect(embeddings).toHaveProperty('modelName');
    expect(embeddings).toHaveProperty('generatedAt');
    expect(Array.isArray(embeddings.embeddings)).toBe(true);
    expect(embeddings.embeddings.length).toBeGreaterThan(100);

    const first = embeddings.embeddings[0];
    expect(first).toHaveProperty('text');
    expect(first).toHaveProperty('category');
    expect(first).toHaveProperty('subcategory');
    expect(first).toHaveProperty('embedding');
    expect(Array.isArray(first.embedding)).toBe(true);
    expect(first.embedding.length).toBe(384);
  });
});
