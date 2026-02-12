/**
 * Environmental Impact Scoring System
 *
 * Simple size-based heuristic for comparing AI model environmental impact.
 *
 * IMPORTANT CAVEAT: This is a rough approximation, not a scientific measurement.
 * Larger models generally require more compute resources and thus more energy,
 * but actual energy consumption depends on many factors not captured here
 * (hardware, batch size, inference time, data center efficiency, etc.)
 */

// Score tiers: ordered by size threshold (ascending)
const SCORE_TIERS = [
  { maxMB: 500,      score: 1, tier: 'lightweight', label: 'Low Impact' },
  { maxMB: 4000,     score: 2, tier: 'standard',    label: 'Medium Impact' },
  { maxMB: Infinity, score: 3, tier: 'advanced',     label: 'High Impact' }
];

function getTier(sizeMB) {
  return SCORE_TIERS.find(t => sizeMB <= t.maxMB);
}

export class EnvironmentalImpactCalculator {
  /**
   * Calculate environmental impact score (1-3) for a model
   * Based purely on model size as a proxy for compute requirements
   */
  calculateImpact(model) {
    const sizeMB = model.sizeMB || 0;
    const tier = getTier(sizeMB);

    return {
      environmentalScore: tier.score,
      sizeMB,
      scoreLabel: tier.label,
      tier: tier.tier
    };
  }

  /**
   * Compare environmental impact between models
   * @param {Array} models - Array of models to compare
   * @returns {Array} Models sorted by environmental score (lower is better)
   */
  compareModels(models) {
    return models
      .map(model => ({ model, impact: this.calculateImpact(model) }))
      .sort((a, b) =>
        a.impact.environmentalScore - b.impact.environmentalScore ||
        (a.model.sizeMB || 0) - (b.model.sizeMB || 0)
      );
  }
}
