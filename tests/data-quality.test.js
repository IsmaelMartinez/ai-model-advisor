import { describe, test, expect } from 'vitest';
import Ajv from 'ajv';
import modelsData from '../src/lib/data/models.json';
import schema from '../src/lib/data/models.schema.json';
import tasksData from '../src/lib/data/tasks.json';
import { TIERS, tierForSize, TIER_MAX_SIZE_MB } from '../src/lib/data/constants.js';
import { ModelSelector } from '../src/lib/recommendation/ModelSelector.js';

const BROWSER_COMPATIBLE_FRAMEWORKS = ['Transformers.js', 'TensorFlow.js', 'ONNX'];

const allModels = modelsData.models;

describe('Data Quality - models.json', () => {
  test('matches models.schema.json', () => {
    const validate = new Ajv({ allErrors: true }).compile(schema);

    const valid = validate(modelsData);

    expect(valid, JSON.stringify(validate.errors?.slice(0, 5), null, 2)).toBe(true);
  });

  test('ids and Hugging Face ids are unique', () => {
    for (const field of ['id', 'huggingFaceId']) {
      const values = allModels.map(m => m[field]);
      const duplicates = values.filter((v, i) => values.indexOf(v) !== i);
      expect(duplicates, `Duplicate ${field}`).toEqual([]);
    }
  });

  test('every task exists in tasks.json', () => {
    const unknown = allModels.flatMap(m =>
      m.tasks
        .filter(t => !tasksData.taskTaxonomy[t.category]?.subcategories?.[t.subcategory])
        .map(t => `${m.id}: ${t.category}/${t.subcategory}`)
    );
    expect(unknown).toEqual([]);
  });

  test('every task in tasks.json has at least one model', () => {
    const available = new ModelSelector(modelsData).getAvailableCategories();
    const empty = Object.entries(tasksData.taskTaxonomy).flatMap(([category, { subcategories }]) =>
      Object.keys(subcategories)
        .filter(subcategory => !available[category]?.[subcategory])
        .map(subcategory => `${category}/${subcategory}`)
    );
    // No suitable Hub models exist for anomaly detection yet (the two former entries were
    // placeholders that are not on the Hub). Remove it from this list once it is seeded or dropped.
    expect(empty).toEqual(['time_series/anomaly_detection']);
  });

  test('TIERS constant matches expected tiers', () => {
    expect(TIERS).toEqual(['lightweight', 'standard', 'advanced', 'xlarge']);
  });

  describe('Derived tier and environmental score', () => {
    const selector = new ModelSelector(modelsData);

    test('tier always agrees with size', () => {
      for (const model of selector.models) {
        expect(model.tier, model.id).toBe(tierForSize(model.sizeMB));
        const limit = TIER_MAX_SIZE_MB[model.tier] ?? Infinity;
        expect(model.sizeMB, model.id).toBeLessThanOrEqual(limit);
      }
    });
  });

  describe('Browser deployment', () => {
    test('requires a browser-compatible framework', () => {
      const violations = allModels
        .filter(m => m.deploymentOptions.includes('browser'))
        .filter(m => !m.frameworks.some(f => BROWSER_COMPATIBLE_FRAMEWORKS.includes(f)))
        .map(m => `${m.id} (frameworks: ${m.frameworks.join(', ')})`);
      expect(violations).toEqual([]);
    });

    test('browser runtime metadata only on browser-tagged models', () => {
      const violations = allModels
        .filter(m => m.runtime?.browser && !m.deploymentOptions.includes('browser'))
        .map(m => m.id);
      expect(violations).toEqual([]);
    });
  });
});
