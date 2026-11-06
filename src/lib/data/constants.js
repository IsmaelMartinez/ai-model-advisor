/**
 * Shared constants for the AI Model Advisor
 * Centralizes configuration that's used across multiple modules
 */

/**
 * Default subcategory for each main category
 * Used when classification doesn't determine a specific subcategory
 */
export const CATEGORY_DEFAULTS = {
  natural_language_processing: 'text_classification',
  computer_vision: 'image_classification',
  speech_processing: 'speech_recognition',
  time_series: 'forecasting'
};

/**
 * Model performance tiers ordered by priority (smaller is better)
 */
export const TIERS = ['lightweight', 'standard', 'advanced', 'xlarge'];

/**
 * Upper size bound (MB) of each tier. xlarge has no upper bound.
 */
export const TIER_MAX_SIZE_MB = { lightweight: 500, standard: 4000, advanced: 20000 };

/**
 * Tier a model belongs to, derived from its size
 * @param {number} sizeMB
 * @returns {string} One of TIERS
 */
export function tierForSize(sizeMB) {
  return TIERS.find(tier => sizeMB <= (TIER_MAX_SIZE_MB[tier] ?? Infinity));
}

/**
 * Environmental impact score derived from size: 1 (<= 500 MB), 2 (<= 4 GB), 3 (larger).
 * A rough size-based heuristic, see docs/environmental-methodology.md.
 * @param {number} sizeMB
 * @returns {1|2|3}
 */
export function environmentalScoreForSize(sizeMB) {
  if (sizeMB <= TIER_MAX_SIZE_MB.lightweight) return 1;
  if (sizeMB <= TIER_MAX_SIZE_MB.standard) return 2;
  return 3;
}

/**
 * Get the default subcategory for a given category
 * @param {string} category - The main category key
 * @returns {string} The default subcategory key
 */
export function getDefaultSubcategory(category) {
  return CATEGORY_DEFAULTS[category] || 'text_classification';
}

