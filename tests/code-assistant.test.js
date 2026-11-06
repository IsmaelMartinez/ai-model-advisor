import { describe, test, expect, beforeAll } from 'vitest';
import { BrowserTaskClassifier } from '../src/lib/classification/BrowserTaskClassifier.js';
import { ModelSelector } from '../src/lib/recommendation/ModelSelector.js';
import { fixtureModels } from './fixtures/models.js';
import { TIERS } from '../src/lib/data/constants.js';
import tasksData from '../src/lib/data/tasks.json'; // Used for data integrity tests

describe('Code Assistant Classification Tests', () => {
  let taskClassifier;
  let modelSelector;

  beforeAll(() => {
    taskClassifier = new BrowserTaskClassifier();
    modelSelector = new ModelSelector(fixtureModels);
  });

  describe('Code Task Classification', () => {
    // Queries with explicit code keywords that semantic classifier can match
    const codeQueries = [
      'refactor this code module',
      'code review for this repository',
      'debug this javascript code',
      'write code for API handler',
      'write code to parse data',
      'code generation for typescript',
      'programming task to build function',
      'coding help with python class',
      'source code analysis needed',
      'write function to validate input'
    ];

    test.each(codeQueries)('should classify "%s" as code_assistant', async (query) => {
      const result = await taskClassifier.classify(query);

      expect(result.predictions.length).toBeGreaterThan(0);

      const topPrediction = result.subcategoryPredictions[0] || result.predictions[0];
      expect(topPrediction).toBeDefined();

      // Should be classified under natural_language_processing
      expect(topPrediction.category).toBe('natural_language_processing');

      // Should be classified as code_assistant
      expect(topPrediction.subcategory).toBe('code_assistant');
    });

    // Natural language queries that should be classified as code_assistant
    // These test the LLM's ability to understand code review intent
    const naturalLanguageCodeQueries = [
      'I want to review some code written in python',
      'I need help reviewing my javascript code',
      'can you help me review this python script',
      'looking to get some code reviewed',
      'need assistance with a code review task'
    ];

    test.each(naturalLanguageCodeQueries)('should classify natural language query "%s" as code_assistant', async (query) => {
      const result = await taskClassifier.classify(query);

      expect(result.predictions.length).toBeGreaterThan(0);

      const topPrediction = result.subcategoryPredictions[0] || result.predictions[0];
      expect(topPrediction).toBeDefined();

      // Should be classified under natural_language_processing
      expect(topPrediction.category).toBe('natural_language_processing');

      // Should be classified as code_assistant
      expect(topPrediction.subcategory).toBe('code_assistant');
    });

    test('should not classify general text tasks as code_assistant', async () => {
      const nonCodeQueries = [
        'classify customer support tickets',
        'analyze sentiment in reviews',
        'translate text to Spanish'
      ];

      for (const query of nonCodeQueries) {
        const result = await taskClassifier.classify(query);
        const topPrediction = result.subcategoryPredictions[0] || result.predictions[0];

        // These should NOT be classified as code_assistant
        if (topPrediction.category === 'natural_language_processing') {
          expect(topPrediction.subcategory).not.toBe('code_assistant');
        }
      }
    });
  });

  describe('Code Model Selection', () => {
    test('should return code models for code_assistant category', () => {
      const models = modelSelector.selectModels('natural_language_processing', 'code_assistant', 3);

      expect(models.length).toBeGreaterThan(0);
      expect(models.length).toBeLessThanOrEqual(3);

      models.forEach(model => {
        expect(model.category).toBe('natural_language_processing');
        expect(model.subcategory).toBe('code_assistant');
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('sizeMB');
        expect(model).toHaveProperty('environmentalScore');
      });
    });

    test('should prioritize lightweight code models (smaller is better)', () => {
      const models = modelSelector.selectModels('natural_language_processing', 'code_assistant', 5);

      expect(models.length).toBeGreaterThan(1);
      // Check tier prioritization - lightweight should come first
      expect(models.map(m => m.tier)).toEqual(['lightweight', 'standard', 'advanced', 'xlarge']);
    });

    test('should return code-specific models (not BERT)', () => {
      const models = modelSelector.selectModels('natural_language_processing', 'code_assistant', 5);

      // Verify we get code models, not text classification models
      const modelNames = models.map(m => m.name.toLowerCase());
      const codeModelKeywords = ['coder', 'code', 'starcoder', 'codellama', 'deepseek'];

      // At least some models should have code-related names
      const hasCodeModels = modelNames.some(name =>
        codeModelKeywords.some(keyword => name.includes(keyword))
      );

      expect(hasCodeModels).toBe(true);

      // Should NOT include BERT models
      const hasBert = modelNames.some(name => name.includes('bert'));
      expect(hasBert).toBe(false);
    });
  });

  describe('End-to-End Code Task Workflow', () => {
    test('should complete full workflow for code analysis task', async () => {
      const taskDescription = 'refactor code in this codebase';

      // Step 1: Classify task
      const result = await taskClassifier.classify(taskDescription);
      expect(result.predictions.length).toBeGreaterThan(0);

      // Step 2: Extract classification
      const topPrediction = result.subcategoryPredictions[0] || result.predictions[0];
      expect(topPrediction.category).toBe('natural_language_processing');
      expect(topPrediction.subcategory).toBe('code_assistant');

      // Step 3: Get model recommendations
      const models = modelSelector.selectModels(
        topPrediction.category,
        topPrediction.subcategory,
        3
      );

      // Step 4: Verify recommendations
      expect(models.length).toBeGreaterThan(0);

      // First model should come from the lowest tier that has any code models
      const firstModel = models[0];
      const allTiers = modelSelector.getTaskModels(topPrediction.category, topPrediction.subcategory)
        .map(m => m.tierPriority);
      expect(firstModel.tierPriority).toBe(Math.min(...allTiers));

      // Should return a model from the code_assistant category
      // Note: Model names may vary based on automated updates from HuggingFace
      expect(firstModel).toHaveProperty('id');
      expect(firstModel).toHaveProperty('name');
      expect(firstModel).toHaveProperty('environmentalScore');
    });

    test('should complete workflow for code generation task', async () => {
      const taskDescription = 'write code for python function';

      const result = await taskClassifier.classify(taskDescription);
      const topPrediction = result.subcategoryPredictions[0] || result.predictions[0];

      expect(topPrediction.category).toBe('natural_language_processing');
      expect(topPrediction.subcategory).toBe('code_assistant');

      const models = modelSelector.selectModels(
        topPrediction.category,
        topPrediction.subcategory,
        3
      );

      expect(models.length).toBeGreaterThan(0);
      models.forEach(model => {
        expect(model.environmentalScore).toBeGreaterThanOrEqual(1);
        expect(model.environmentalScore).toBeLessThanOrEqual(3);
      });
    });

    test('should complete workflow for code review task', async () => {
      const taskDescription = 'code review for this pull request';

      const result = await taskClassifier.classify(taskDescription);
      const topPrediction = result.subcategoryPredictions[0] || result.predictions[0];

      expect(topPrediction.category).toBe('natural_language_processing');
      expect(topPrediction.subcategory).toBe('code_assistant');

      const models = modelSelector.selectModels(
        topPrediction.category,
        topPrediction.subcategory,
        3
      );

      expect(models.length).toBeGreaterThan(0);
    });
  });

  describe('Code Assistant Data Integrity', () => {
    test('should have valid code_assistant models in all tiers', () => {
      const codeModels = modelSelector.getTaskModels('natural_language_processing', 'code_assistant');

      expect(codeModels.length).toBeGreaterThan(0);
      codeModels.forEach(model => {
        expect(TIERS).toContain(model.tier);
      });
    });

    test('should have code_assistant in tasks taxonomy', () => {
      const nlpSubcategories = tasksData.taskTaxonomy.natural_language_processing.subcategories;

      expect(nlpSubcategories.code_assistant).toBeDefined();
      expect(nlpSubcategories.code_assistant.label).toBe('Code Assistant');
      expect(nlpSubcategories.code_assistant.keywords.length).toBeGreaterThan(0);
      expect(nlpSubcategories.code_assistant.examples.length).toBeGreaterThan(0);

      // Should have code-related keywords
      const keywords = nlpSubcategories.code_assistant.keywords;
      expect(keywords).toContain('code');
      expect(keywords).toContain('refactor');
      expect(keywords).toContain('debug');
    });

    test('code models should have required properties', () => {
      const codeModels = modelSelector.getTaskModels('natural_language_processing', 'code_assistant');

      codeModels.forEach(model => {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('huggingFaceId');
        expect(model).toHaveProperty('description');
        expect(model).toHaveProperty('sizeMB');
        expect(model).toHaveProperty('accuracy');
        expect(model).toHaveProperty('environmentalScore');
        expect(model).toHaveProperty('deploymentOptions');
        expect(model).toHaveProperty('frameworks');

        expect(typeof model.sizeMB).toBe('number');
      });
    });
  });

  describe('Performance', () => {
    test('should classify code queries quickly', async () => {
      const queries = [
        'refactor this code',
        'write unit tests',
        'debug this function',
        'generate API handler'
      ];

      const startTime = Date.now();

      await Promise.all(queries.map(q => taskClassifier.classify(q)));

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });
  });
});
