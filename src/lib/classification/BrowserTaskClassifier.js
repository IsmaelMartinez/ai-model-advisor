/**
 * Browser-Compatible Enhanced Task Classification System
 * Client-side fallback classifier using keyword and semantic matching.
 * 
 * Note: This is a fallback classifier for when the primary EmbeddingTaskClassifier
 * is unavailable. The API-based classification path was intentionally removed
 * to maintain the static-first architecture (no external API calls at runtime).
 */

import tasksData from '../data/tasks.json' assert { type: 'json' };

export class BrowserTaskClassifier {
  constructor() {
    this.taskTaxonomy = tasksData.taskTaxonomy;
    this.mappingRules = tasksData.taskMappingRules;
    
    // Build enhanced keyword index from taxonomy
    this.keywordIndex = this.buildKeywordIndex();
    this.categoryPriority = this.buildCategoryPriority();
    
    // Classification thresholds
    this.confidenceThresholds = {
      high: 0.8,
      medium: 0.6,
      low: 0.4
    };
    
    // Performance tracking
    this.stats = {
      totalClassifications: 0,
      methodUsage: {
        semantic: 0,
        keyword: 0,
        fallback: 0
      }
    };
  }

  /**
   * Main classification method with enhanced multi-tier approach
   */
  async classify(taskDescription, options = {}) {
    this.stats.totalClassifications++;
    
    const result = {
      input: taskDescription,
      predictions: [],
      subcategoryPredictions: [],
      method: '',
      confidence: 0,
      confidenceLevel: 'low',
      timestamp: new Date().toISOString(),
      processingTime: 0
    };

    const startTime = Date.now();

    try {
      // Method 1: Enhanced Semantic Similarity
      const semanticResult = this.classifyWithEnhancedSemantics(taskDescription);
      if (semanticResult.confidence > 0.5) {
        result.predictions = semanticResult.predictions;
        result.subcategoryPredictions = semanticResult.subcategoryPredictions;
        result.method = 'enhanced_semantic';
        result.confidence = semanticResult.confidence;
        result.confidenceLevel = this.getConfidenceLevel(semanticResult.confidence);
        this.stats.methodUsage.semantic++;
        return this.finalizeResult(result, startTime);
      }

      // Method 2: Enhanced Keyword Classification
      const keywordResult = this.classifyWithEnhancedKeywords(taskDescription);
      result.predictions = keywordResult.predictions;
      result.subcategoryPredictions = keywordResult.subcategoryPredictions;
      result.method = 'enhanced_keyword';
      result.confidence = keywordResult.confidence;
      result.confidenceLevel = this.getConfidenceLevel(keywordResult.confidence);
      this.stats.methodUsage.keyword++;
      return this.finalizeResult(result, startTime);

    } catch (error) {
      console.error('Classification error:', error);
      
      // Ultimate fallback with priority-based suggestions
      result.predictions = this.getFallbackPredictions();
      result.method = 'priority_fallback';
      result.confidence = 0.1;
      result.confidenceLevel = 'low';
      result.error = error.message;
      this.stats.methodUsage.fallback++;
      return this.finalizeResult(result, startTime);
    }
  }

  /**
   * Build keyword index from task taxonomy
   */
  buildKeywordIndex() {
    const index = {};
    
    for (const [category, categoryData] of Object.entries(this.taskTaxonomy)) {
      for (const [subcategory, subcategoryData] of Object.entries(categoryData.subcategories)) {
        const keywords = subcategoryData.keywords || [];
        
        // Add category and subcategory as implicit keywords
        const allKeywords = [
          ...keywords,
          category.replace(/_/g, ' '),
          subcategory.replace(/_/g, ' '),
          categoryData.label.toLowerCase(),
          subcategoryData.label.toLowerCase()
        ];
        
        for (const keyword of allKeywords) {
          const normalizedKeyword = this.normalizeText(keyword);
          if (!index[normalizedKeyword]) {
            index[normalizedKeyword] = [];
          }
          
          index[normalizedKeyword].push({
            category,
            subcategory,
            categoryLabel: categoryData.label,
            subcategoryLabel: subcategoryData.label,
            weight: this.calculateKeywordWeight(keyword, keywords),
            isExact: keywords.includes(keyword)
          });
        }
      }
    }
    
    return index;
  }

  /**
   * Build category priority mapping
   */
  buildCategoryPriority() {
    const priority = {};
    const order = this.mappingRules.priorityOrder || [];
    
    order.forEach((category, index) => {
      priority[category] = order.length - index; // Higher number = higher priority
    });
    
    return priority;
  }

  /**
   * Calculate keyword weight based on specificity and context
   */
  calculateKeywordWeight(keyword, allKeywords) {
    // More specific (longer) keywords get higher weight
    const lengthWeight = Math.min(keyword.split(' ').length / 3, 1);
    
    // Less common keywords get higher weight
    const rarityWeight = 1 / Math.sqrt(allKeywords.length);
    
    return 0.5 + (lengthWeight * 0.3) + (rarityWeight * 0.2);
  }

  /**
   * Enhanced Semantic Similarity Classification
   */
  classifyWithEnhancedSemantics(taskDescription) {
    console.log('🔄 Using enhanced semantic similarity classification...');
    
    const text = this.normalizeText(taskDescription);
    const categoryScores = {};
    const subcategoryScores = {};
    
    // Enhanced semantic matching with multiple techniques
    for (const [keyword, matches] of Object.entries(this.keywordIndex)) {
      const similarity = this.calculateSemanticSimilarity(text, keyword);
      
      if (similarity > 0.1) {
        for (const match of matches) {
          const score = similarity * match.weight;
          
          // Aggregate category scores
          if (!categoryScores[match.category]) {
            categoryScores[match.category] = { score: 0, matches: 0, label: match.categoryLabel };
          }
          categoryScores[match.category].score += score;
          categoryScores[match.category].matches++;
          
          // Aggregate subcategory scores
          const subcatKey = `${match.category}.${match.subcategory}`;
          if (!subcategoryScores[subcatKey]) {
            subcategoryScores[subcatKey] = { 
              score: 0, 
              matches: 0, 
              category: match.category,
              subcategory: match.subcategory,
              label: match.subcategoryLabel
            };
          }
          subcategoryScores[subcatKey].score += score;
          subcategoryScores[subcatKey].matches++;
        }
      }
    }
    
    // Normalize and rank predictions
    const predictions = this.normalizePredictions(categoryScores);
    const subcategoryPredictions = this.normalizeSubcategoryPredictions(subcategoryScores);
    
    return {
      predictions,
      subcategoryPredictions,
      confidence: predictions[0]?.score || 0
    };
  }

  /**
   * Enhanced Keyword Classification
   */
  classifyWithEnhancedKeywords(taskDescription) {
    console.log('🔄 Using enhanced keyword classification...');
    
    const text = this.normalizeText(taskDescription);
    const words = text.split(/\s+/);
    const categoryScores = {};
    const subcategoryScores = {};

    // Match unigrams, bigrams, and trigrams
    const allNgrams = [...words, ...this.generateNgrams(words, 2), ...this.generateNgrams(words, 3)];
    
    for (const ngram of allNgrams) {
      const normalizedNgram = this.normalizeText(ngram);
      const matches = this.keywordIndex[normalizedNgram] || [];
      
      for (const match of matches) {
        const score = match.weight * (match.isExact ? 1.5 : 1.0);
        
        // Aggregate category scores
        if (!categoryScores[match.category]) {
          categoryScores[match.category] = { score: 0, matches: 0, label: match.categoryLabel };
        }
        categoryScores[match.category].score += score;
        categoryScores[match.category].matches++;
        
        // Aggregate subcategory scores
        const subcatKey = `${match.category}.${match.subcategory}`;
        if (!subcategoryScores[subcatKey]) {
          subcategoryScores[subcatKey] = { 
            score: 0, 
            matches: 0, 
            category: match.category,
            subcategory: match.subcategory,
            label: match.subcategoryLabel
          };
        }
        subcategoryScores[subcatKey].score += score;
        subcategoryScores[subcatKey].matches++;
      }
    }
    
    // Apply priority weighting
    for (const [category, data] of Object.entries(categoryScores)) {
      const priority = this.categoryPriority[category] || 1;
      data.score *= (1 + priority * 0.1);
    }
    
    const predictions = this.normalizePredictions(categoryScores);
    const subcategoryPredictions = this.normalizeSubcategoryPredictions(subcategoryScores);
    
    // Return fallback if no matches
    if (predictions.length === 0) {
      return this.getFallbackClassification();
    }
    
    return {
      predictions,
      subcategoryPredictions,
      confidence: predictions[0]?.score || 0
    };
  }

  /**
   * Calculate semantic similarity between text and keyword
   */
  calculateSemanticSimilarity(text, keyword) {
    // Jaccard similarity based on word overlap
    const textWords = new Set(text.split(/\s+/));
    const keywordWords = new Set(keyword.split(/\s+/));
    
    const intersection = new Set([...textWords].filter(x => keywordWords.has(x)));
    const union = new Set([...textWords, ...keywordWords]);
    
    const jaccardSimilarity = intersection.size / union.size;
    
    // Substring matching for partial matches
    const containsKeyword = text.includes(keyword) ? 0.5 : 0;
    const containsPartial = keywordWords.size > 1 && [...keywordWords].some(word => text.includes(word)) ? 0.3 : 0;
    
    // Combined similarity with weights
    return (jaccardSimilarity * 0.5) + containsKeyword + containsPartial;
  }

  /**
   * Get subcategory predictions (simplified for browser)
   */
  async getSubcategoryPredictions(taskDescription, categoryPredictions) {
    const subcategoryPredictions = [];
    
    // Use enhanced keyword matching for subcategories
    const text = this.normalizeText(taskDescription);
    
    for (const prediction of categoryPredictions.slice(0, 2)) {
      const categoryData = this.taskTaxonomy[prediction.category];
      if (!categoryData) continue;
      
      const subcategoryScores = {};
      
      for (const [subcategoryKey, subcategoryData] of Object.entries(categoryData.subcategories)) {
        const keywords = subcategoryData.keywords || [];
        let score = 0;
        
        for (const keyword of keywords) {
          if (text.includes(keyword.toLowerCase())) {
            score += 1;
          }
        }
        
        if (score > 0) {
          subcategoryScores[subcategoryKey] = {
            score: score * prediction.score,
            label: subcategoryData.label
          };
        }
      }
      
      // Add top subcategories for this category
      const sortedSubcategories = Object.entries(subcategoryScores)
        .map(([key, data]) => ({
          category: prediction.category,
          subcategory: key,
          label: data.label,
          score: data.score
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 2);
      
      subcategoryPredictions.push(...sortedSubcategories);
    }
    
    return subcategoryPredictions;
  }

  /**
   * Normalize and rank score entries
   * @param {Object} scores - Map of key -> { score, matches, label, ... }
   * @param {Function} mapFn - Transforms (key, data) to prediction object
   * @param {Object} options - { limit, normalizeScores }
   */
  normalizeScores(scores, mapFn, { limit = 3, normalizeScoresToOne = false } = {}) {
    const predictions = Object.entries(scores)
      .map(([key, data]) => ({
        ...mapFn(key, data),
        score: data.score / Math.max(1, data.matches),
        matchCount: data.matches
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    if (normalizeScoresToOne) {
      const totalScore = predictions.reduce((sum, p) => sum + p.score, 0);
      if (totalScore > 0) {
        predictions.forEach(p => p.score = Math.min(1, p.score / totalScore));
      }
    }

    return predictions;
  }

  normalizePredictions(categoryScores) {
    return this.normalizeScores(
      categoryScores,
      (category, data) => ({ category, label: data.label }),
      { limit: 3, normalizeScoresToOne: true }
    );
  }

  normalizeSubcategoryPredictions(subcategoryScores) {
    return this.normalizeScores(
      subcategoryScores,
      (_key, data) => ({ category: data.category, subcategory: data.subcategory, label: data.label }),
      { limit: 5 }
    );
  }

  /**
   * Get fallback predictions based on priority
   */
  getFallbackPredictions() {
    const priorityOrder = this.mappingRules.priorityOrder || ['natural_language_processing', 'computer_vision', 'data_preprocessing'];
    
    return priorityOrder.slice(0, 3).map((category, index) => {
      const categoryData = this.taskTaxonomy[category];
      return {
        category,
        label: categoryData?.label || category,
        score: 0.3 - (index * 0.1)
      };
    });
  }

  /**
   * Get fallback classification result
   */
  getFallbackClassification() {
    return {
      predictions: this.getFallbackPredictions(),
      subcategoryPredictions: [],
      confidence: 0.2
    };
  }

  /**
   * Normalize text: lowercase, strip punctuation, collapse whitespace
   * Used for both preprocessing input text and normalizing keywords
   */
  normalizeText(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Generate n-grams (bigrams, trigrams, etc.) from words
   */
  generateNgrams(words, n) {
    const ngrams = [];
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.push(words.slice(i, i + n).join(' '));
    }
    return ngrams;
  }

  /**
   * Get confidence level label
   */
  getConfidenceLevel(confidence) {
    if (confidence >= this.confidenceThresholds.high) return 'high';
    if (confidence >= this.confidenceThresholds.medium) return 'medium';
    return 'low';
  }

  /**
   * Finalize classification result
   */
  finalizeResult(result, startTime) {
    result.processingTime = Date.now() - startTime;
    return result;
  }

  /**
   * Get classification statistics
   */
  getStats() {
    return {
      ...this.stats,
      accuracyEstimates: {
        semantic: '75-85%',
        keyword: '65-75%',
        fallback: '40-60%'
      },
      totalCategories: Object.keys(this.taskTaxonomy).length,
      totalSubcategories: Object.values(this.taskTaxonomy).reduce((sum, cat) => 
        sum + Object.keys(cat.subcategories).length, 0
      ),
      keywordIndexSize: Object.keys(this.keywordIndex).length
    };
  }

  /**
   * Get detailed category information
   */
  getCategoryInfo(categoryKey) {
    const categoryData = this.taskTaxonomy[categoryKey];
    if (!categoryData) return null;
    
    return {
      key: categoryKey,
      label: categoryData.label,
      description: categoryData.description,
      subcategories: Object.entries(categoryData.subcategories).map(([key, data]) => ({
        key,
        label: data.label,
        description: data.description,
        keywords: data.keywords,
        examples: data.examples
      })),
      priority: this.categoryPriority[categoryKey] || 0
    };
  }

  /**
   * Suggest improvements for low-confidence classifications
   */
  suggestImprovements(result) {
    const suggestions = [];
    
    if (result.confidence < 0.3) {
      suggestions.push('Task description is too vague. Try adding more specific details about what you want to accomplish.');
    }
    
    if (result.confidence < 0.5) {
      suggestions.push('Consider mentioning the type of data you\'re working with (text, images, audio, etc.).');
    }
    
    if (result.method === 'priority_fallback') {
      suggestions.push('No clear task indicators found. Try using keywords like "classify", "detect", "generate", or "predict".');
    }
    
    // Suggest specific categories if partially matched
    if (result.predictions.length > 0 && result.confidence < 0.6) {
      const topCategory = result.predictions[0];
      const categoryInfo = this.getCategoryInfo(topCategory.category);
      
      if (categoryInfo) {
        suggestions.push(`This seems related to ${categoryInfo.label}. Try using terms like: ${categoryInfo.subcategories.map(s => s.keywords.slice(0, 2).join(', ')).join(' or ')}.`);
      }
    }
    
    return suggestions;
  }
}