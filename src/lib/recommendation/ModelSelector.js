/**
 * ModelSelector - Simple "smaller is better" model selection logic
 * Prioritizes lightweight models and smaller sizes within each tier
 */

import { TIERS } from '../data/constants.js';

export class ModelSelector {
  constructor(modelsData) {
    this.modelsData = modelsData;
  }

  /**
   * Select best models for a task using "smaller is better" logic
   * @param {string} category - Main category (e.g., 'computer_vision')
   * @param {string} subcategory - Subcategory (e.g., 'image_classification')
   * @param {number} maxResults - Maximum number of models to return
   * @returns {Array} Array of recommended models, prioritized by size efficiency
   */
  selectModels(category, subcategory, maxResults = 3) {
    const models = this.getTaskModels(category, subcategory);
    return this.rankBySize(models).slice(0, maxResults);
  }

  /**
   * Get all models for a specific task, organized by tier
   * @param {string} category - Main category
   * @param {string} subcategory - Subcategory  
   * @returns {Array} Flat array of all models for the task with tier info
   */
  getTaskModels(category, subcategory) {
    const taskData = this.modelsData.models[category]?.[subcategory];
    if (!taskData) return [];
    
    return TIERS.flatMap((tier, index) => 
      (taskData[tier] || []).map(model => ({
        ...model, 
        tier, 
        tierPriority: index,
        category,
        subcategory
      }))
    );
  }

  /**
   * Rank models by "smaller is better" logic:
   * 1. Tier priority (lightweight > standard > advanced > xlarge)
   * 2. Size within tier (smaller > larger)
   * @param {Array} models - Models to rank
   * @returns {Array} Models ranked by efficiency (best first)
   */
  rankBySize(models) {
    return models.sort((a, b) =>
      a.tierPriority - b.tierPriority || a.sizeMB - b.sizeMB
    );
  }

  /**
   * Filter models by accuracy threshold
   * Models with missing accuracy data are treated as 0%
   * @param {Array} models - Models to filter
   * @param {number} threshold - Minimum accuracy (0-95, where 0 means show all)
   * @returns {Object} Object with filtered models and metadata
   */
  filterByAccuracy(models, threshold = 0) {
    if (threshold === 0) {
      return {
        filtered: models,
        total: models.length,
        hidden: 0
      };
    }

    const thresholdDecimal = threshold / 100;
    const filtered = models.filter(model => {
      const accuracy = model.accuracy ?? 0;
      return accuracy >= thresholdDecimal;
    });

    return {
      filtered,
      total: models.length,
      hidden: models.length - filtered.length
    };
  }

  /**
   * Filter models by deployment target
   * @param {Array} models - Models to filter
   * @param {string|null} deploymentTarget - Target: 'browser', 'edge', 'cloud', or null for all
   * @returns {Object} Object with filtered models and metadata
   */
  filterByDeployment(models, deploymentTarget = null) {
    if (!deploymentTarget) {
      return { filtered: models, total: models.length, hidden: 0 };
    }

    const targetMatches = {
      browser: ['browser'],
      edge: ['browser', 'edge', 'mobile'],
      cloud: ['cloud', 'server', 'edge', 'browser', 'mobile']
    };

    const allowed = targetMatches[deploymentTarget] || [deploymentTarget];
    const filtered = models.filter(model =>
      (model.deploymentOptions || []).some(opt => allowed.includes(opt))
    );

    return {
      filtered,
      total: models.length,
      hidden: models.length - filtered.length
    };
  }

  /**
   * Get models grouped by tier with accuracy and deployment filtering
   * @param {string} category - Main category
   * @param {string} subcategory - Subcategory
   * @param {number} accuracyThreshold - Minimum accuracy threshold (0-95)
   * @param {string|null} deploymentTarget - Deployment target filter
   * @returns {Object} Models grouped by tier with filter metadata
   */
  getTaskModelsGroupedByTier(category, subcategory, accuracyThreshold = 0, deploymentTarget = null) {
    const taskData = this.modelsData.models[category]?.[subcategory];
    if (!taskData) {
      return {
        lightweight: { models: [], hidden: 0 },
        standard: { models: [], hidden: 0 },
        advanced: { models: [], hidden: 0 },
        xlarge: { models: [], hidden: 0 },
        totalHidden: 0,
        totalShown: 0
      };
    }

    const result = {
      totalHidden: 0,
      totalShown: 0
    };

    TIERS.forEach(tier => {
      const tierModels = (taskData[tier] || []).map(model => ({
        ...model,
        tier,
        category,
        subcategory
      }));

      const accuracyResult = this.filterByAccuracy(tierModels, accuracyThreshold);
      const deployResult = this.filterByDeployment(accuracyResult.filtered, deploymentTarget);

      result[tier] = {
        models: this.rankBySize(deployResult.filtered),
        hidden: accuracyResult.hidden + deployResult.hidden
      };

      result.totalHidden += accuracyResult.hidden + deployResult.hidden;
      result.totalShown += deployResult.filtered.length;
    });

    return result;
  }

  /**
   * Get all categories and subcategories that have models
   * @returns {Object} Map of category → subcategory[] with model counts
   */
  getAvailableCategories() {
    const result = {};
    for (const [category, subcats] of Object.entries(this.modelsData.models)) {
      const subs = {};
      for (const [subcategory, tiers] of Object.entries(subcats)) {
        let count = 0;
        TIERS.forEach(tier => {
          if (Array.isArray(tiers[tier])) count += tiers[tier].length;
        });
        if (count > 0) subs[subcategory] = count;
      }
      if (Object.keys(subs).length > 0) result[category] = subs;
    }
    return result;
  }
}

export default ModelSelector;