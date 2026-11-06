import { describe, test, expect, vi } from 'vitest';
import referenceData from '../src/lib/data/reference-embeddings.json';
import tasksData from '../src/lib/data/tasks.json';

// The production classifier is exercised without downloading the model: the pipeline is
// replaced and each test supplies its own embedder.
vi.mock('@huggingface/transformers', () => ({
  env: { backends: { onnx: { wasm: {} } } },
  pipeline: vi.fn()
}));

const { EmbeddingTaskClassifier } = await import('../src/lib/classification/EmbeddingTaskClassifier.js');

/** A classifier whose embedder maps every text to the vector given by `embed`. */
function classifierWith(references, embed, options = {}) {
  const classifier = new EmbeddingTaskClassifier(options);
  classifier.initialized = true;
  classifier.referenceEmbeddings = references;
  classifier.embedder = async text => ({ data: Float32Array.from(embed(text)) });
  return classifier;
}

const ref = (category, subcategory, embedding, text = `${category}/${subcategory}`) => ({
  text, category, subcategory, label: category, embedding
});

describe('EmbeddingTaskClassifier.classify (stub embedder)', () => {
  const references = [
    ref('computer_vision', 'image_classification', [1, 0, 0]),
    ref('computer_vision', 'object_detection', [0.9, 0.1, 0]),
    ref('speech_processing', 'speech_recognition', [0, 1, 0]),
    ref('time_series', 'forecasting', [0, 0, 1])
  ];

  test('returns the category and subcategory of the closest examples', async () => {
    const classifier = classifierWith(references, () => [1, 0.05, 0]);

    const result = await classifier.classify('anything', { topK: 3 });

    expect(result.method).toBe('embedding_similarity');
    expect(result.predictions[0].category).toBe('computer_vision');
    expect(result.subcategoryPredictions[0]).toMatchObject({
      category: 'computer_vision',
      subcategory: 'image_classification'
    });
    expect(result.votesForWinner).toBe(2);
    expect(result.totalVotes).toBe(3);
  });

  test('weights votes by similarity, so one very close example can outvote several distant ones', async () => {
    const lopsided = [
      ref('speech_processing', 'speech_recognition', [0, 1, 0]),
      ref('computer_vision', 'image_classification', [0.1, 0.1, 0.1]),
      ref('computer_vision', 'object_detection', [0.1, 0.1, 0.1])
    ];
    const classifier = classifierWith(lopsided, () => [0, 1, 0]);

    const result = await classifier.classify('anything', { topK: 3 });

    // 1 exact match (similarity 1.0) beats 2 weak ones (0.1 each) although a plain majority would say vision
    expect(result.predictions[0].category).toBe('speech_processing');
    expect(result.predictions[0].score).toBeCloseTo(1 / 1.2, 5);
    expect(result.votesForWinner).toBe(1);
    expect(result.predictions.reduce((sum, p) => sum + p.score, 0)).toBeCloseTo(1, 5);
  });

  test('honours topK and reports confidence as the winning share of the vote', async () => {
    const classifier = classifierWith(references, () => [0, 1, 0]);

    const top1 = await classifier.classify('speech', { topK: 1 });

    expect(top1.predictions).toHaveLength(1);
    expect(top1.confidence).toBeCloseTo(1, 5);
    expect(top1.confidenceLevel).toBe('high');
    expect(top1.similarExamples[0]).toMatchObject({ category: 'speech_processing', similarity: '100%' });
  });

  test('embeds the input text exactly once per classification', async () => {
    const embed = vi.fn(() => [0, 0, 1]);
    const classifier = classifierWith(references, embed);

    await classifier.classify('forecast sales');

    expect(embed).toHaveBeenCalledTimes(1);
    expect(embed).toHaveBeenCalledWith('forecast sales');
    expect(classifier.metrics.classificationCount).toBe(1);
  });
});

describe('reference-embeddings.json', () => {
  test('is built from the examples in tasks.json', () => {
    const fromTasks = Object.entries(tasksData.taskTaxonomy).flatMap(([category, { subcategories }]) =>
      Object.entries(subcategories).flatMap(([subcategory, { examples = [] }]) =>
        examples.map(text => `${category}/${subcategory}/${text}`)
      )
    );
    const fromEmbeddings = referenceData.embeddings.map(e => `${e.category}/${e.subcategory}/${e.text}`);

    expect([...fromEmbeddings].sort()).toEqual([...fromTasks].sort());
    expect(referenceData.count).toBe(fromEmbeddings.length);
  });

  test('has one 384-dimension vector per example', () => {
    expect(referenceData.embeddings.length).toBeGreaterThan(100);
    for (const e of referenceData.embeddings) {
      expect(e.embedding, e.text).toHaveLength(referenceData.embeddingDimension);
    }
  });

  test('leave-one-out accuracy stays above the floor', async () => {
    const all = referenceData.embeddings;
    let categoryHits = 0;
    let subcategoryHits = 0;

    for (let i = 0; i < all.length; i++) {
      const others = all.filter((_, j) => j !== i);
      const classifier = classifierWith(others, () => all[i].embedding);

      const result = await classifier.classify(all[i].text, { topK: 5 });

      if (result.predictions[0].category === all[i].category) {
        categoryHits++;
        if (result.subcategoryPredictions[0]?.subcategory === all[i].subcategory) subcategoryHits++;
      }
    }

    const category = categoryHits / all.length;
    const subcategory = subcategoryHits / all.length;
    // Measured at 95.3% / 74.7% (the earlier 98.3% claim could not be reproduced).
    expect(category).toBeGreaterThanOrEqual(0.94);
    expect(subcategory).toBeGreaterThanOrEqual(0.72);
  });
});
