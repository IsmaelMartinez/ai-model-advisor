/**
 * Preferences storage utility for persisting user settings
 * Uses localStorage with graceful fallbacks
 */

const STORAGE_KEY = 'modelSelector';

/**
 * Get all preferences from localStorage
 * @returns {Object} Preferences object
 */
function getPreferences() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};

    // Security: Protect against JSON bomb attacks
    // Limit stored data to 10KB to prevent excessive memory usage
    if (stored.length > 10000) {
      console.error('localStorage data too large (>10KB), resetting to defaults');
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      return {};
    }

    const parsed = JSON.parse(stored);

    // Security: Validate schema - must be a plain object
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.error('Invalid preferences format, expected object');
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      return {};
    }

    return parsed;
  } catch (error) {
    console.warn('Failed to read from localStorage:', error);
    try {
      localStorage.removeItem(STORAGE_KEY); // Clear corrupted data
    } catch {}
    return {};
  }
}

/**
 * Save preferences to localStorage
 * @param {Object} preferences - Preferences object to save
 * @returns {boolean} Success status
 */
function savePreferences(preferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch (error) {
    console.warn('Failed to save to localStorage:', error);
    return false;
  }
}

/**
 * Get accuracy threshold preference
 * @returns {number} Threshold value (0-95), default 0
 */
export function getAccuracyThreshold() {
  const prefs = getPreferences();
  const threshold = prefs.accuracyThreshold;

  // Validate and return
  if (typeof threshold === 'number' && threshold >= 0 && threshold <= 95) {
    return threshold;
  }

  return 0; // Default: show all models
}

/**
 * Save accuracy threshold preference
 * @param {number} threshold - Threshold value (0-95)
 * @returns {boolean} Success status
 */
export function saveAccuracyThreshold(threshold) {
  // Validate input
  if (typeof threshold !== 'number' || threshold < 0 || threshold > 95) {
    console.error('Invalid threshold value:', threshold);
    return false;
  }

  const prefs = getPreferences();
  prefs.accuracyThreshold = threshold;
  return savePreferences(prefs);
}

/**
 * Get classification mode preference
 * @returns {string} Mode ('fast' or 'ensemble'), default 'fast'
 */
export function getClassificationMode() {
  const prefs = getPreferences();
  const mode = prefs.classificationMode;

  // Validate and return
  if (mode === 'fast' || mode === 'ensemble') {
    return mode;
  }

  return 'fast'; // Default: fast mode
}

/**
 * Save classification mode preference
 * @param {string} mode - Mode ('fast' or 'ensemble')
 * @returns {boolean} Success status
 */
export function saveClassificationMode(mode) {
  // Validate input
  if (mode !== 'fast' && mode !== 'ensemble') {
    console.error('Invalid classification mode:', mode);
    return false;
  }

  const prefs = getPreferences();
  prefs.classificationMode = mode;
  return savePreferences(prefs);
}

/**
 * Clear all preferences (useful for testing/reset)
 * @returns {boolean} Success status
 */
export function clearPreferences() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.warn('Failed to clear localStorage:', error);
    return false;
  }
}
