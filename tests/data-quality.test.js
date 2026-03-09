import { describe, test, expect } from 'vitest';
import { TIERS } from '../src/lib/data/constants.js';
import modelsData from '../src/lib/data/models.json';

const TIER_SIZE_LIMITS = {
  lightweight: 500,
  standard: 4000,
  advanced: 20000,
  xlarge: Infinity
};

const BROWSER_COMPATIBLE_FRAMEWORKS = [
  'Transformers.js',
  'TensorFlow.js',
  'ONNX',
  'MediaPipe',
  'ONNX Runtime Web'
];

const REQUIRED_FIELDS = [
  'id',
  'name',
  'huggingFaceId',
  'sizeMB',
  'environmentalScore',
  'deploymentOptions',
  'frameworks'
];

/**
 * Collect all models from the nested structure with their tier and location metadata.
 */
function getAllModels() {
  const models = [];
  const categories = modelsData.models;

  for (const [category, subcategories] of Object.entries(categories)) {
    for (const [subcategory, tiers] of Object.entries(subcategories)) {
      for (const [tier, modelList] of Object.entries(tiers)) {
        for (const model of modelList) {
          models.push({ ...model, tier, category, subcategory });
        }
      }
    }
  }

  return models;
}

const allModels = getAllModels();

describe('Data Quality - Model Validation', () => {
  test('TIERS constant matches expected tiers', () => {
    expect(TIERS).toEqual(['lightweight', 'standard', 'advanced', 'xlarge']);
  });

  describe('Size/Tier consistency', () => {
    for (const tier of TIERS) {
      const modelsInTier = allModels.filter((m) => m.tier === tier);

      if (modelsInTier.length === 0) continue;

      test(`all ${tier} models should be within the ${TIER_SIZE_LIMITS[tier]}MB limit`, () => {
        const violations = modelsInTier.filter(
          (m) => m.sizeMB > TIER_SIZE_LIMITS[tier]
        );

        if (violations.length > 0) {
          const details = violations
            .map(
              (m) =>
                `${m.id} (${m.sizeMB}MB in ${m.category}/${m.subcategory})`
            )
            .join(', ');
          expect(violations, `Size violations: ${details}`).toHaveLength(0);
        }
      });
    }
  });

  describe('Browser deployment requires browser-compatible framework', () => {
    const browserModels = allModels.filter((m) =>
      m.deploymentOptions.includes('browser')
    );

    test('all models with browser deployment should have a browser-compatible framework', () => {
      const violations = browserModels.filter((m) => {
        return !m.frameworks.some((f) =>
          BROWSER_COMPATIBLE_FRAMEWORKS.includes(f)
        );
      });

      if (violations.length > 0) {
        const details = violations
          .map(
            (m) =>
              `${m.id} (frameworks: [${m.frameworks.join(', ')}] in ${m.category}/${m.subcategory}/${m.tier})`
          )
          .join(', ');
        expect(
          violations,
          `Browser models without browser-compatible framework: ${details}`
        ).toHaveLength(0);
      }
    });
  });

  describe('Required fields', () => {
    test('every model should have all required fields', () => {
      const violations = [];

      for (const model of allModels) {
        const missing = REQUIRED_FIELDS.filter(
          (field) => model[field] === undefined || model[field] === null
        );
        if (missing.length > 0) {
          violations.push(
            `${model.id || 'unknown'} missing: ${missing.join(', ')} (${model.category}/${model.subcategory}/${model.tier})`
          );
        }
      }

      if (violations.length > 0) {
        expect(
          violations,
          `Models with missing fields: ${violations.join('; ')}`
        ).toHaveLength(0);
      }
    });
  });
});
