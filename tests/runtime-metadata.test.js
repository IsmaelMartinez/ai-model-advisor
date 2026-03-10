import { describe, test, expect } from 'vitest';
import modelsData from '../src/lib/data/models.json';
import { TIERS } from '../src/lib/data/constants.js';

describe('Runtime Metadata', () => {
  test('models tagged "browser" in lightweight tier should have runtime metadata', () => {
    const missing = [];

    for (const [category, subcats] of Object.entries(modelsData.models)) {
      for (const [subcategory, tiers] of Object.entries(subcats)) {
        const models = tiers.lightweight || [];
        for (const model of models) {
          const hasBrowserTag = (model.deploymentOptions || []).includes('browser');
          if (hasBrowserTag && !model.runtime) {
            missing.push(`${model.id} in ${category}/${subcategory}`);
          }
        }
      }
    }

    expect(missing, `Lightweight browser models without runtime metadata:\n${missing.join('\n')}`).toHaveLength(0);
  });

  test('runtime metadata should have valid structure', () => {
    for (const [category, subcats] of Object.entries(modelsData.models)) {
      for (const [subcategory, tiers] of Object.entries(subcats)) {
        for (const tier of TIERS) {
          const models = tiers[tier] || [];
          for (const model of models) {
            if (model.runtime) {
              const targets = Object.keys(model.runtime);
              expect(targets.length, `${model.id} runtime has no targets`).toBeGreaterThan(0);

              for (const [target, config] of Object.entries(model.runtime)) {
                expect(config.framework, `${model.id} runtime.${target} missing framework`).toBeDefined();
                expect(typeof config.tested, `${model.id} runtime.${target} missing tested flag`).toBe('boolean');
              }
            }
          }
        }
      }
    }
  });
});
