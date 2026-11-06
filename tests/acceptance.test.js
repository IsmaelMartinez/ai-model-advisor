import { describe, test, expect, beforeAll } from 'vitest';
import { BrowserTaskClassifier } from '../src/lib/classification/BrowserTaskClassifier.js';
import { ModelSelector } from '../src/lib/recommendation/ModelSelector.js';
import { fixtureModels } from './fixtures/models.js';
import tasksData from '../src/lib/data/tasks.json'; // Used for taxonomy validation

describe('MVP Acceptance Tests', () => {
  let taskClassifier;
  let modelSelector;

  beforeAll(() => {
    taskClassifier = new BrowserTaskClassifier();
    modelSelector = new ModelSelector(fixtureModels);
  });

  describe('Core Functionality', () => {
    test('system initializes successfully', () => {
      expect(taskClassifier.classify).toBeTypeOf('function');
      expect(modelSelector.selectModels).toBeTypeOf('function');
      expect(tasksData.taskTaxonomy).toBeDefined();
    });

    test('classification returns results for various inputs', async () => {
      const testInputs = [
        'classify images',
        'sentiment analysis', 
        'speech recognition',
        'time series forecasting',
        'help me with AI'
      ];

      for (const input of testInputs) {
        const result = await taskClassifier.classify(input);
        
        // Basic structure check
        expect(result).toHaveProperty('predictions');
        expect(result).toHaveProperty('confidence');
        expect(result).toHaveProperty('method');
        
        // Should have at least one prediction
        expect(result.predictions.length).toBeGreaterThan(0);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        
        // Predictions should have required structure
        result.predictions.forEach(pred => {
          expect(pred).toHaveProperty('category');
          expect(pred).toHaveProperty('score');
        });
      }
    });

    test('model selection works for known good categories', () => {
      const knownGoodCombinations = [
        ['computer_vision', 'image_classification'],
        ['natural_language_processing', 'text_classification'],
        ['speech_processing', 'speech_recognition'],
        ['time_series', 'forecasting']
      ];

      knownGoodCombinations.forEach(([category, subcategory]) => {
        const models = modelSelector.selectModels(category, subcategory, 3);
        
        expect(models).toBeDefined();
        expect(Array.isArray(models)).toBe(true);
        
        // If we get models, they should be properly structured
        models.forEach(model => {
          expect(model).toHaveProperty('id');
          expect(model).toHaveProperty('name');
          expect(model).toHaveProperty('sizeMB');
          expect(model).toHaveProperty('environmentalScore');
          expect(model).toHaveProperty('tier');
          expect(typeof model.sizeMB).toBe('number');
        });
      });
    });
  });

  describe('Environmental Focus', () => {
    test('models have environmental scores', () => {
      const models = modelSelector.selectModels('computer_vision', 'image_classification', 5);
      
      models.forEach(model => {
        expect(model.environmentalScore).toBeGreaterThanOrEqual(1);
        expect(model.environmentalScore).toBeLessThanOrEqual(3);
        expect(['lightweight', 'standard', 'advanced', 'xlarge']).toContain(model.tier);
      });
    });
  });

  describe('Data Completeness', () => {
    test('has models for main AI domains', () => {
      const expectedDomains = [
        'computer_vision',
        'natural_language_processing', 
        'speech_processing',
        'time_series'
      ];

      expectedDomains.forEach(domain => {
        expect(modelSelector.getAvailableCategories()[domain]).toBeDefined();
      });
    });

    test('task taxonomy covers main categories', () => {
      const expectedCategories = [
        'computer_vision',
        'natural_language_processing',
        'speech_processing',
        'time_series'
      ];

      expectedCategories.forEach(category => {
        expect(tasksData.taskTaxonomy[category]).toBeDefined();
        expect(tasksData.taskTaxonomy[category]).toHaveProperty('subcategories');
      });
    });

    test('task taxonomy has enough subcategories', () => {
      // Count task categories
      let totalSubcategories = 0;
      Object.values(tasksData.taskTaxonomy).forEach(category => {
        totalSubcategories += Object.keys(category.subcategories).length;
      });

      expect(totalSubcategories).toBeGreaterThanOrEqual(10); // 12 focused subcategories
    });
  });

  describe('Performance Requirements', () => {
    test('classification completes quickly', async () => {
      const start = Date.now();
      
      await taskClassifier.classify('I want to classify images of animals');
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    test('model selection is instant', () => {
      const start = Date.now();
      
      modelSelector.selectModels('computer_vision', 'image_classification', 3);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // Should be nearly instant
    });
  });

  describe('Error Handling', () => {
    test('handles invalid inputs gracefully', async () => {
      // Should not throw errors
      const emptyResult = await taskClassifier.classify('');
      expect(emptyResult).toBeDefined();
      
      const invalidModels = modelSelector.selectModels('invalid_category', 'invalid_subcategory', 3);
      expect(Array.isArray(invalidModels)).toBe(true);
    });
  });
});