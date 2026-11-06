import { describe, test, expect } from 'vitest';
import modelsData from '../src/lib/data/models.json';
import { ModelSelector } from '../src/lib/recommendation/ModelSelector.js';

const models = new ModelSelector(modelsData).models;

describe('Runtime Metadata', () => {
  test('models tagged "browser" in lightweight tier should have runtime metadata', () => {
    const missing = models
      .filter(model => model.tier === 'lightweight' && model.deploymentOptions.includes('browser') && !model.runtime)
      .map(model => model.id);

    expect(missing, `Lightweight browser models without runtime metadata:\n${missing.join('\n')}`).toHaveLength(0);
  });

  test('runtime metadata should have valid structure', () => {
    for (const model of models.filter(m => m.runtime)) {
      const targets = Object.keys(model.runtime);
      expect(targets.length, `${model.id} runtime has no targets`).toBeGreaterThan(0);

      for (const [target, config] of Object.entries(model.runtime)) {
        expect(config.framework, `${model.id} runtime.${target} missing framework`).toBeDefined();
        expect(typeof config.tested, `${model.id} runtime.${target} missing tested flag`).toBe('boolean');
      }
    }
  });
});
