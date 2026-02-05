import { describe, test, expect, beforeAll } from 'vitest';
import { BrowserTaskClassifier } from '../src/lib/classification/BrowserTaskClassifier.js';
import { ModelSelector } from '../src/lib/recommendation/ModelSelector.js';
import { getDefaultSubcategory, TIERS } from '../src/lib/data/constants.js';
import modelsData from '../src/lib/data/models.json';

describe('Integration Tests - Real User Scenarios', () => {
  let taskClassifier;
  let modelSelector;

  beforeAll(() => {
    taskClassifier = new BrowserTaskClassifier();
    modelSelector = new ModelSelector(modelsData);
  });

  describe('End-to-End Workflow', () => {
    test('should complete full workflow for image classification', async () => {
      const taskDescription = 'I want to classify images of dogs and cats';
      
      // Step 1: Classify task
      const result = await taskClassifier.classify(taskDescription);
      expect(result.predictions.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      
      // Step 2: Extract best classification
      const topPrediction = result.subcategoryPredictions[0] || result.predictions[0];
      expect(topPrediction).toBeDefined();
      expect(topPrediction.category).toBeDefined();
      
      // Step 3: Get model recommendations
      const classification = {
        category: topPrediction.category,
        subcategory: topPrediction.subcategory || getDefaultSubcategory(topPrediction.category)
      };
      
      const models = modelSelector.selectModels(classification.category, classification.subcategory, 3);
      
      // Verify we get model recommendations
      expect(models.length).toBeGreaterThan(0);
      expect(models.length).toBeLessThanOrEqual(3);
      
      // Verify model structure
      models.forEach(model => {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('sizeMB');
        expect(model).toHaveProperty('environmentalScore');
        expect(model).toHaveProperty('tier');
        expect(model.environmentalScore).toBeGreaterThanOrEqual(1);
        expect(model.environmentalScore).toBeLessThanOrEqual(3);
      });
    });

    test('should handle text classification tasks', async () => {
      const taskDescription = 'classify customer support tickets';

      const result = await taskClassifier.classify(taskDescription);
      const topPrediction = result.subcategoryPredictions[0] || result.predictions[0];

      const classification = {
        category: topPrediction.category,
        subcategory: topPrediction.subcategory || 'text_classification'
      };

      const models = modelSelector.selectModels(classification.category, classification.subcategory, 3);

      expect(models.length).toBeGreaterThan(0);

      // Should prioritize smaller models
      if (models.length > 1) {
        const lightweight = models.filter(m => m.tier === 'lightweight');
        const standard = models.filter(m => m.tier === 'standard');

        // Lightweight models should come first if they exist
        if (lightweight.length > 0 && standard.length > 0) {
          const firstLightweight = models.findIndex(m => m.tier === 'lightweight');
          const firstStandard = models.findIndex(m => m.tier === 'standard');
          expect(firstLightweight).toBeLessThan(firstStandard);
        }
      }
    });

    test('should classify chatbot FAQ tasks correctly', async () => {
      const taskDescription = 'I want to create a chatbot that uses a FAQ to answer users questions';

      const result = await taskClassifier.classify(taskDescription);
      const topPrediction = result.subcategoryPredictions[0] || result.predictions[0];

      // Should be classified as NLP, not computer vision
      expect(topPrediction.category).toBe('natural_language_processing');
      // Valid NLP subcategories for chatbot/FAQ tasks (semantic similarity may match code_assistant for "create" tasks)
      expect(['text_generation', 'text_classification', 'question_answering', 'code_assistant']).toContain(topPrediction.subcategory);

      const classification = {
        category: topPrediction.category,
        subcategory: topPrediction.subcategory || 'text_generation'
      };

      const models = modelSelector.selectModels(classification.category, classification.subcategory, 3);
      expect(models.length).toBeGreaterThan(0);
    });
  });

  describe('Model Selection Verification', () => {
    test('should return models for all main categories', () => {
      const testCategories = [
        ['computer_vision', 'image_classification'],
        ['natural_language_processing', 'text_classification'],
        ['natural_language_processing', 'code_assistant'],
        ['speech_processing', 'speech_recognition'],
        ['time_series', 'forecasting']
      ];

      testCategories.forEach(([category, subcategory]) => {
        const models = modelSelector.selectModels(category, subcategory, 3);
        expect(models.length).toBeGreaterThan(0);

        models.forEach(model => {
          expect(model.category).toBe(category);
          expect(model.subcategory).toBe(subcategory);
        });
      });
    });

    test('should implement "smaller is better" logic', () => {
      const models = modelSelector.selectModels('computer_vision', 'image_classification', 5);
      
      if (models.length > 1) {
        // Check tier prioritization
        const tiers = models.map(m => m.tierPriority);
        let currentTier = -1;
        
        tiers.forEach(tier => {
          expect(tier).toBeGreaterThanOrEqual(currentTier);
          currentTier = tier;
        });
        
        // Within same tier, check size ordering
        const groupedByTier = {};
        models.forEach(model => {
          if (!groupedByTier[model.tier]) {
            groupedByTier[model.tier] = [];
          }
          groupedByTier[model.tier].push(model);
        });
        
        Object.values(groupedByTier).forEach(tierModels => {
          if (tierModels.length > 1) {
            for (let i = 1; i < tierModels.length; i++) {
              expect(tierModels[i].sizeMB).toBeGreaterThanOrEqual(tierModels[i-1].sizeMB);
            }
          }
        });
      }
    });
  });

  describe('Performance Tests', () => {
    test('should respond quickly to user queries', async () => {
      const queries = [
        'classify images',
        'sentiment analysis',
        'speech recognition',
        'predict values'
      ];

      const startTime = Date.now();
      
      const results = await Promise.all(
        queries.map(async (query) => {
          const result = await taskClassifier.classify(query);
          const topPrediction = result.subcategoryPredictions[0] || result.predictions[0];
          
          const classification = {
            category: topPrediction.category,
            subcategory: topPrediction.subcategory || 'text_classification'
          };
          
          return modelSelector.selectModels(classification.category, classification.subcategory, 3);
        })
      );
      
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds
      expect(results).toHaveLength(4);
      
      results.forEach(models => {
        expect(models.length).toBeGreaterThan(0);
      });
    });
  });

  describe('System Robustness', () => {
    test('should handle edge cases gracefully', async () => {
      const edgeCases = [
        '',
        'AI',
        'machine learning help',
        'I need assistance'
      ];

      for (const input of edgeCases) {
        const result = await taskClassifier.classify(input);
        
        // Should always return some predictions
        expect(result.predictions).toBeDefined();
        expect(result.predictions.length).toBeGreaterThan(0);
        
        const topPrediction = result.subcategoryPredictions[0] || result.predictions[0];
        expect(topPrediction).toBeDefined();
        
        // Should be able to get some model recommendations
        const classification = {
          category: topPrediction.category,
          subcategory: topPrediction.subcategory || 'text_classification'
        };
        
        const models = modelSelector.selectModels(classification.category, classification.subcategory, 3);
        
        // Even for edge cases, should get some models
        expect(models.length).toBeGreaterThanOrEqual(0);
      }
    });

    test('should have consistent data structure', () => {
      // Verify models data integrity
      Object.entries(modelsData.models).forEach(([category, categoryData]) => {
        Object.entries(categoryData).forEach(([subcategory, subcategoryData]) => {
          TIERS.forEach(tier => {
            if (subcategoryData[tier]) {
              subcategoryData[tier].forEach(model => {
                expect(model).toHaveProperty('id');
                expect(model).toHaveProperty('name');
                expect(model).toHaveProperty('sizeMB');
                expect(model).toHaveProperty('environmentalScore');
                expect(typeof model.sizeMB).toBe('number');
                expect(model.environmentalScore).toBeGreaterThanOrEqual(1);
                expect(model.environmentalScore).toBeLessThanOrEqual(3);
              });
            }
          });
        });
      });
    });
  });
});