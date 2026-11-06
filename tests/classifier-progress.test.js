import { describe, test, expect, vi } from 'vitest';

// Replace the model download with a stub that emits transformers.js-style progress events
vi.mock('@huggingface/transformers', () => ({
  env: { backends: { onnx: { wasm: {} } } },
  pipeline: vi.fn(async (_task, _model, options) => {
    options.progress_callback({ status: 'progress', file: 'model.onnx', progress: 40, loaded: 4, total: 10 });
    options.progress_callback({ status: 'progress_total', progress: 40, loaded: 4, total: 10 });
    options.progress_callback({ status: 'progress_total', progress: 100, loaded: 10, total: 10 });
    return async () => ({ data: new Float32Array(384) });
  })
}));

const { EmbeddingTaskClassifier } = await import('../src/lib/classification/EmbeddingTaskClassifier.js');

describe('EmbeddingTaskClassifier download progress', () => {
  test('reports the combined download percentage emitted by transformers.js', async () => {
    const events = [];
    const classifier = new EmbeddingTaskClassifier({ onProgress: e => events.push(e) });

    const result = await classifier.initialize({ taskTaxonomy: {} });

    expect(result.success).toBe(true);
    const downloads = events.filter(e => e.status === 'downloading').map(e => e.progress);
    expect(downloads).toEqual([40, 100]);
  });
});
