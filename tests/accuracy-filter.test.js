/**
 * Unit tests for accuracy filtering functionality in ModelSelector
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ModelSelector } from '../src/lib/recommendation/ModelSelector.js';

// Mock model data for testing
const mockModelsData = {
  models: {
    computer_vision: {
      image_classification: {
        lightweight: [
          { id: 'model1', name: 'Model 1', accuracy: 0.75, sizeMB: 50 },
          { id: 'model2', name: 'Model 2', accuracy: 0.82, sizeMB: 60 },
          { id: 'model3', name: 'Model 3', accuracy: null, sizeMB: 40 } // Missing accuracy
        ],
        standard: [
          { id: 'model4', name: 'Model 4', accuracy: 0.88, sizeMB: 200 },
          { id: 'model5', name: 'Model 5', accuracy: 0.70, sizeMB: 150 }
        ],
        advanced: [
          { id: 'model6', name: 'Model 6', accuracy: 0.95, sizeMB: 500 },
          { id: 'model7', name: 'Model 7', accuracy: 0.65, sizeMB: 450 }
        ]
      }
    }
  }
};

describe('ModelSelector - Accuracy Filtering', () => {
  let modelSelector;

  beforeEach(() => {
    modelSelector = new ModelSelector(mockModelsData);
  });

  describe('filterByAccuracy', () => {
    test('returns all models when threshold is 0', () => {
      const models = [
        { id: 'model1', accuracy: 0.75 },
        { id: 'model2', accuracy: 0.82 },
        { id: 'model3', accuracy: 0.65 }
      ];

      const result = modelSelector.filterByAccuracy(models, 0);

      expect(result.filtered).toHaveLength(3);
      expect(result.hidden).toBe(0);
      expect(result.total).toBe(3);
    });

    test('filters models below threshold', () => {
      const models = [
        { id: 'model1', accuracy: 0.75 },
        { id: 'model2', accuracy: 0.82 },
        { id: 'model3', accuracy: 0.65 }
      ];

      const result = modelSelector.filterByAccuracy(models, 75);

      expect(result.filtered).toHaveLength(2);
      expect(result.hidden).toBe(1);
      expect(result.filtered[0].id).toBe('model1');
      expect(result.filtered[1].id).toBe('model2');
    });

    test('treats missing accuracy as 0', () => {
      const models = [
        { id: 'model1', accuracy: 0.75 },
        { id: 'model2', accuracy: null },
        { id: 'model3', accuracy: undefined }
      ];

      const result = modelSelector.filterByAccuracy(models, 50);

      expect(result.filtered).toHaveLength(1);
      expect(result.hidden).toBe(2);
      expect(result.filtered[0].id).toBe('model1');
    });

    test('returns empty array when all models below threshold', () => {
      const models = [
        { id: 'model1', accuracy: 0.60 },
        { id: 'model2', accuracy: 0.65 },
        { id: 'model3', accuracy: 0.70 }
      ];

      const result = modelSelector.filterByAccuracy(models, 75);

      expect(result.filtered).toHaveLength(0);
      expect(result.hidden).toBe(3);
    });

    test('handles edge case of exact threshold match', () => {
      const models = [
        { id: 'model1', accuracy: 0.75 },
        { id: 'model2', accuracy: 0.7499 }
      ];

      const result = modelSelector.filterByAccuracy(models, 75);

      expect(result.filtered).toHaveLength(1);
      expect(result.filtered[0].id).toBe('model1');
    });

    test('handles maximum threshold (95%)', () => {
      const models = [
        { id: 'model1', accuracy: 0.95 },
        { id: 'model2', accuracy: 0.96 },
        { id: 'model3', accuracy: 0.90 }
      ];

      const result = modelSelector.filterByAccuracy(models, 95);

      expect(result.filtered).toHaveLength(2);
      expect(result.hidden).toBe(1);
    });
  });

  describe('getTaskModelsGroupedByTier', () => {
    test('returns all models when threshold is 0', () => {
      const result = modelSelector.getTaskModelsGroupedByTier(
        'computer_vision',
        'image_classification',
        0
      );

      expect(result.lightweight.models).toHaveLength(3);
      expect(result.standard.models).toHaveLength(2);
      expect(result.advanced.models).toHaveLength(2);
      expect(result.totalHidden).toBe(0);
      expect(result.totalShown).toBe(7);
    });

    test('filters models by accuracy threshold across all tiers', () => {
      const result = modelSelector.getTaskModelsGroupedByTier(
        'computer_vision',
        'image_classification',
        80
      );

      // Lightweight: model2 (0.82) only
      expect(result.lightweight.models).toHaveLength(1);
      expect(result.lightweight.models[0].id).toBe('model2');
      expect(result.lightweight.hidden).toBe(2);

      // Standard: model4 (0.88) only
      expect(result.standard.models).toHaveLength(1);
      expect(result.standard.models[0].id).toBe('model4');
      expect(result.standard.hidden).toBe(1);

      // Advanced: model6 (0.95) only
      expect(result.advanced.models).toHaveLength(1);
      expect(result.advanced.models[0].id).toBe('model6');
      expect(result.advanced.hidden).toBe(1);

      expect(result.totalHidden).toBe(4);
      expect(result.totalShown).toBe(3);
    });

    test('handles missing category gracefully', () => {
      const result = modelSelector.getTaskModelsGroupedByTier(
        'nonexistent',
        'category',
        0
      );

      expect(result.lightweight.models).toHaveLength(0);
      expect(result.standard.models).toHaveLength(0);
      expect(result.advanced.models).toHaveLength(0);
      expect(result.totalHidden).toBe(0);
      expect(result.totalShown).toBe(0);
    });

    test('maintains "smaller is better" ranking within filtered results', () => {
      const result = modelSelector.getTaskModelsGroupedByTier(
        'computer_vision',
        'image_classification',
        70
      );

      // Within lightweight tier, models should be sorted by size
      // model3 (40MB, null accuracy) filtered out
      // model1 (50MB, 0.75), model2 (60MB, 0.82)
      expect(result.lightweight.models[0].id).toBe('model1'); // 50MB
      expect(result.lightweight.models[1].id).toBe('model2'); // 60MB
    });

    test('returns all tiers empty when threshold filters everything', () => {
      const result = modelSelector.getTaskModelsGroupedByTier(
        'computer_vision',
        'image_classification',
        95
      );

      // Only model6 has 0.95 accuracy
      expect(result.lightweight.models).toHaveLength(0);
      expect(result.lightweight.hidden).toBe(3);
      expect(result.standard.models).toHaveLength(0);
      expect(result.standard.hidden).toBe(2);
      expect(result.advanced.models).toHaveLength(1);
      expect(result.advanced.hidden).toBe(1);
      expect(result.totalHidden).toBe(6);
      expect(result.totalShown).toBe(1);
    });
  });
});
