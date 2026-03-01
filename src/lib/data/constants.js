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
 * Get the default subcategory for a given category
 * @param {string} category - The main category key
 * @returns {string} The default subcategory key
 */
export function getDefaultSubcategory(category) {
  return CATEGORY_DEFAULTS[category] || 'text_classification';
}

