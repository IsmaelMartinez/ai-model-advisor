import { describe, test, expect, beforeEach } from 'vitest';
import { ModelSelector } from '../src/lib/recommendation/ModelSelector.js';

const tasks = [{ category: 'computer_vision', subcategory: 'image_classification' }];
const acc = value => ({ metric: 'top-1', value, source: 'fixture' });

// Mock model data with deployment options. Tiers are derived from sizeMB (<=500, <=4000, <=20000).
const mockModelsData = {
  models: [
    { id: 'browser-model', name: 'Browser Model', sizeMB: 20, accuracy: acc(0.77), deploymentOptions: ['browser', 'mobile'], tasks },
    { id: 'edge-model', name: 'Edge Model', sizeMB: 50, accuracy: acc(0.85), deploymentOptions: ['edge', 'cloud'], tasks },
    { id: 'cloud-only', name: 'Cloud Only', sizeMB: 100, accuracy: acc(0.90), deploymentOptions: ['cloud', 'server'], tasks },
    { id: 'standard-browser', name: 'Standard Browser', sizeMB: 1300, accuracy: acc(0.88), deploymentOptions: ['browser'], tasks },
    { id: 'standard-cloud', name: 'Standard Cloud', sizeMB: 2500, accuracy: acc(0.92), deploymentOptions: ['cloud'], tasks },
    { id: 'advanced-server', name: 'Advanced Server', sizeMB: 9000, accuracy: acc(0.95), deploymentOptions: ['server'], tasks }
  ]
};

describe('ModelSelector - Deployment Filtering', () => {
  let modelSelector;

  beforeEach(() => {
    modelSelector = new ModelSelector(mockModelsData);
  });

  describe('filterByDeployment', () => {
    test('returns all models when no deployment target specified', () => {
      const models = [
        { id: 'm1', deploymentOptions: ['browser'] },
        { id: 'm2', deploymentOptions: ['cloud'] }
      ];
      const result = modelSelector.filterByDeployment(models, null);
      expect(result.filtered).toHaveLength(2);
      expect(result.hidden).toBe(0);
    });

    test('filters to browser-only models', () => {
      const models = [
        { id: 'm1', deploymentOptions: ['browser', 'mobile'] },
        { id: 'm2', deploymentOptions: ['cloud', 'server'] },
        { id: 'm3', deploymentOptions: ['browser'] }
      ];
      const result = modelSelector.filterByDeployment(models, 'browser');
      expect(result.filtered).toHaveLength(2);
      expect(result.filtered.map(m => m.id)).toEqual(['m1', 'm3']);
      expect(result.hidden).toBe(1);
    });

    test('edge includes browser, edge, and mobile', () => {
      const models = [
        { id: 'm1', deploymentOptions: ['browser'] },
        { id: 'm2', deploymentOptions: ['edge'] },
        { id: 'm3', deploymentOptions: ['mobile'] },
        { id: 'm4', deploymentOptions: ['server'] }
      ];
      const result = modelSelector.filterByDeployment(models, 'edge');
      expect(result.filtered).toHaveLength(3);
      expect(result.hidden).toBe(1);
    });

    test('cloud includes everything', () => {
      const models = [
        { id: 'm1', deploymentOptions: ['browser'] },
        { id: 'm2', deploymentOptions: ['cloud'] },
        { id: 'm3', deploymentOptions: ['server'] },
        { id: 'm4', deploymentOptions: ['edge'] }
      ];
      const result = modelSelector.filterByDeployment(models, 'cloud');
      expect(result.filtered).toHaveLength(4);
      expect(result.hidden).toBe(0);
    });

    test('handles models with no deployment options', () => {
      const models = [
        { id: 'm1', deploymentOptions: ['browser'] },
        { id: 'm2' }
      ];
      const result = modelSelector.filterByDeployment(models, 'browser');
      expect(result.filtered).toHaveLength(1);
      expect(result.filtered[0].id).toBe('m1');
    });
  });

  describe('getTaskModelsGroupedByTier with deployment filter', () => {
    test('returns all models when deployment is null', () => {
      const result = modelSelector.getTaskModelsGroupedByTier(
        'computer_vision', 'image_classification', 0, null
      );
      expect(result.totalShown).toBe(6);
    });

    test('filters to browser models across all tiers', () => {
      const result = modelSelector.getTaskModelsGroupedByTier(
        'computer_vision', 'image_classification', 0, 'browser'
      );
      expect(result.lightweight.models).toHaveLength(1);
      expect(result.lightweight.models[0].id).toBe('browser-model');
      expect(result.standard.models).toHaveLength(1);
      expect(result.standard.models[0].id).toBe('standard-browser');
      expect(result.advanced.models).toHaveLength(0);
      expect(result.totalShown).toBe(2);
    });

    test('combines accuracy and deployment filters', () => {
      const result = modelSelector.getTaskModelsGroupedByTier(
        'computer_vision', 'image_classification', 85, 'browser'
      );
      // browser-model has 0.77 accuracy — filtered out by accuracy
      // standard-browser has 0.88 — passes both filters
      expect(result.lightweight.models).toHaveLength(0);
      expect(result.standard.models).toHaveLength(1);
      expect(result.standard.models[0].id).toBe('standard-browser');
      expect(result.totalShown).toBe(1);
    });

    test('returns empty results for impossible filter combination', () => {
      // No browser models in advanced tier
      const result = modelSelector.getTaskModelsGroupedByTier(
        'computer_vision', 'image_classification', 94, 'browser'
      );
      expect(result.totalShown).toBe(0);
    });
  });

  describe('getAvailableCategories', () => {
    test('returns categories with model counts', () => {
      const categories = modelSelector.getAvailableCategories();
      expect(categories.computer_vision).toBeDefined();
      expect(categories.computer_vision.image_classification).toBe(6);
    });

    test('excludes empty categories', () => {
      const emptySelector = new ModelSelector({ models: [] });
      const categories = emptySelector.getAvailableCategories();
      expect(categories).toEqual({});
    });
  });
});

describe('Deployment Filter with Real Data', () => {
  let modelSelector;

  beforeEach(async () => {
    const modelsData = (await import('../src/lib/data/models.json')).default;
    modelSelector = new ModelSelector(modelsData);
  });

  test('browser filter returns fewer models than unfiltered', () => {
    const all = modelSelector.getTaskModelsGroupedByTier('computer_vision', 'image_classification', 0, null);
    const browser = modelSelector.getTaskModelsGroupedByTier('computer_vision', 'image_classification', 0, 'browser');

    expect(browser.totalShown).toBeLessThan(all.totalShown);
    expect(browser.totalShown).toBeGreaterThan(0);
  });

  test('browser filter works across NLP categories', () => {
    const result = modelSelector.getTaskModelsGroupedByTier('natural_language_processing', 'text_classification', 0, 'browser');
    expect(result.totalShown).toBeGreaterThan(0);
  });

  test('all deployment targets return results for common categories', () => {
    const targets = [null, 'browser', 'edge', 'cloud'];
    for (const target of targets) {
      const result = modelSelector.getTaskModelsGroupedByTier('computer_vision', 'image_classification', 0, target);
      expect(result.totalShown).toBeGreaterThan(0);
    }
  });
});
