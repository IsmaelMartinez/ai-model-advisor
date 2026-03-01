/**
 * Model Metadata Aggregation System
 * Aggregates model information from multiple sources for quarterly updates
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ModelAggregator {
  constructor(options = {}) {
    this.huggingFaceToken = options.huggingFaceToken || process.env.HF_TOKEN;
    this.dataPath = options.dataPath || join(__dirname, '../data');
    this.sources = {
      huggingface: true,
      papersWithCode: options.includePapersWithCode || false
    };
    
    // Load current data
    this.currentModels = this.loadCurrentModels();
    this.currentTasks = this.loadCurrentTasks();
    
    // Aggregation statistics
    this.stats = {
      processed: 0,
      added: 0,
      updated: 0,
      errors: 0,
      startTime: null
    };
  }

  /**
   * Load current models.json file
   */
  loadCurrentModels() {
    try {
      const modelsPath = join(this.dataPath, 'models.json');
      return JSON.parse(readFileSync(modelsPath, 'utf8'));
    } catch (error) {
      console.warn('⚠️ Could not load current models.json, starting fresh');
      return this.getDefaultModelsStructure();
    }
  }

  /**
   * Load current tasks.json file
   */
  loadCurrentTasks() {
    try {
      const tasksPath = join(this.dataPath, 'tasks.json');
      return JSON.parse(readFileSync(tasksPath, 'utf8'));
    } catch (error) {
      console.warn('⚠️ Could not load current tasks.json');
      return null;
    }
  }

  /**
   * Main aggregation method - updates model dataset from multiple sources
   */
  async aggregateModels(options = {}) {
    console.log('🚀 Starting model metadata aggregation...\n');
    this.stats.startTime = Date.now();

    const config = {
      maxModelsPerCategory: options.maxModelsPerCategory || 10,
      includeUpdated: options.includeUpdated || true,
      validateAccuracy: options.validateAccuracy || true,
      dryRun: options.dryRun || false,
      categories: options.categories || this.getDefaultCategories()
    };

    try {
      // Step 1: Fetch models from Hugging Face
      console.log('📡 Fetching models from Hugging Face Hub...');
      const hfModels = await this.fetchHuggingFaceModels(config.categories);
      console.log(`   Found ${hfModels.length} potential models\n`);

      // Step 2: Process and categorize models
      console.log('🔄 Processing and categorizing models...');
      const processedModels = await this.processModels(hfModels, config);
      console.log(`   Processed ${processedModels.length} models\n`);

      // Step 3: Organize into tiers
      console.log('📊 Organizing models into performance tiers...');
      const tieredModels = this.organizeIntoTiers(processedModels);
      this.logTierSummary(tieredModels);

      // Step 4: Validate and merge with existing data
      console.log('✅ Validating and merging with existing dataset...');
      const mergedData = this.mergeWithExistingData(tieredModels, config);

      // Step 5: Save updated dataset (if not dry run AND has substantive changes)
      if (!config.dryRun) {
        if (this.stats.hasSubstantiveChanges) {
          console.log('💾 Saving updated model dataset...');
          this.saveModelsData(mergedData);
          console.log('   ✅ Dataset saved successfully\n');
        } else {
          console.log('⏭️  No substantive changes - skipping file write\n');
        }
      } else {
        console.log('🧪 Dry run complete - no files modified\n');
      }

      // Print summary statistics
      this.printAggregationSummary();

      return {
        success: true,
        stats: this.stats,
        data: mergedData
      };

    } catch (error) {
      console.error('❌ Aggregation failed:', error.message);
      return {
        success: false,
        error: error.message,
        stats: this.stats
      };
    }
  }

  /**
   * Fetch models from Hugging Face Hub API
   * Two passes: (1) popular models by downloads, (2) browser-ready models from ONNX orgs
   */
  async fetchHuggingFaceModels(categories) {
    const allModels = [];

    // Pass 1: Fetch most popular models by downloads (existing behavior)
    for (const category of categories) {
      try {
        console.log(`   Fetching ${category.task} models...`);
        const models = await this.fetchModelsFromHF({
          pipeline_tag: category.task,
          sort: 'downloads',
          direction: '-1',
          limit: '50',
          full: 'true'
        });

        console.log(`   Found ${models.length} ${category.task} models`);

        const categorizedModels = models.map(model => ({
          ...model,
          sourceCategory: category.category,
          sourceSubcategory: category.subcategory,
          sourceTask: category.task
        }));

        allModels.push(...categorizedModels);
        this.stats.processed += models.length;
        await this.sleep(500);

      } catch (error) {
        console.warn(`   ⚠️ Failed to fetch ${category.task}: ${error.message}`);
        this.stats.errors++;
      }
    }

    // Pass 2: Fetch browser-ready models from known ONNX-publishing organizations
    // These orgs publish pre-converted ONNX models that actually work in browsers
    const browserReadyOrgs = ['Xenova', 'onnx-community'];
    const seenIds = new Set(allModels.map(m => m.id));

    console.log('\n   📦 Fetching browser-ready models (Xenova, onnx-community)...');

    for (const org of browserReadyOrgs) {
      for (const category of categories) {
        try {
          const models = await this.fetchModelsFromHF({
            author: org,
            pipeline_tag: category.task,
            sort: 'downloads',
            direction: '-1',
            limit: '20',
            full: 'true'
          });

          // Only add models we haven't already seen
          let added = 0;
          for (const model of models) {
            if (!seenIds.has(model.id)) {
              seenIds.add(model.id);
              allModels.push({
                ...model,
                sourceCategory: category.category,
                sourceSubcategory: category.subcategory,
                sourceTask: category.task
              });
              added++;
              this.stats.processed++;
            }
          }

          if (added > 0) {
            console.log(`   Found ${added} new ${category.task} models from ${org}`);
          }

          await this.sleep(300);

        } catch (error) {
          // Non-fatal: browser-ready models are a bonus, not a requirement
          this.stats.errors++;
        }
      }
    }

    return allModels;
  }

  /**
   * Low-level HuggingFace API fetch with configurable params
   */
  async fetchModelsFromHF(params) {
    const url = new URL('https://huggingface.co/api/models');
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const headers = {};
    if (this.huggingFaceToken) {
      headers['Authorization'] = `Bearer ${this.huggingFaceToken}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Process raw models into our standardized format
   */
  async processModels(rawModels, config) {
    const processed = [];

    for (const rawModel of rawModels) {
      try {
        // Skip models without sufficient metadata
        if (!rawModel.id || !rawModel.downloads) {
          continue;
        }

        // Skip test/mock/internal models
        if (this.isExcludedModel(rawModel.id)) {
          continue;
        }

        // Get detailed model info
        const modelInfo = await this.getDetailedModelInfo(rawModel.id);
        
        // Extract and validate metadata
        const processedModel = await this.extractModelMetadata(rawModel, modelInfo);
        
        if (processedModel && this.validateModelData(processedModel)) {
          processed.push(processedModel);
        }

      } catch (error) {
        console.warn(`   ⚠️ Failed to process ${rawModel.id}: ${error.message}`);
        this.stats.errors++;
      }
    }

    return processed;
  }

  /**
   * Get detailed model information from Hugging Face
   */
  async getDetailedModelInfo(modelId) {
    try {
      const url = `https://huggingface.co/api/models/${modelId}`;
      const headers = {};
      
      if (this.huggingFaceToken) {
        headers['Authorization'] = `Bearer ${this.huggingFaceToken}`;
      }

      const response = await fetch(url, { headers });
      
      if (response.ok) {
        return await response.json();
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract and standardize model metadata
   */
  async extractModelMetadata(rawModel, detailedInfo) {
    // Estimate model size (simplified logic)
    const sizeMB = this.estimateModelSize(rawModel, detailedInfo);
    
    // Determine tier based on size
    const tier = this.determineTier(sizeMB);
    
    // Extract accuracy if available (simplified)
    const accuracy = this.extractAccuracy(rawModel, detailedInfo);
    
    // Calculate environmental score based on size
    const environmentalScore = this.calculateEnvironmentalScore(sizeMB);

    // Extract supported frameworks (must come before deployment options)
    const frameworks = this.extractFrameworks(rawModel, detailedInfo);

    // Determine deployment options based on size AND framework compatibility
    const deploymentOptions = this.determineDeploymentOptions(sizeMB, rawModel, frameworks);

    return {
      id: this.generateModelId(rawModel),
      name: this.extractModelName(rawModel),
      huggingFaceId: rawModel.id,
      description: this.extractDescription(rawModel, detailedInfo),
      sizeMB: sizeMB,
      accuracy: accuracy,
      environmentalScore: environmentalScore,
      deploymentOptions: deploymentOptions,
      frameworks: frameworks,
      lastUpdated: rawModel.lastModified || new Date().toISOString().split('T')[0],
      
      // Internal metadata for processing
      category: rawModel.sourceCategory,
      subcategory: rawModel.sourceSubcategory,
      tier: tier,
      downloads: rawModel.downloads || 0,
      likes: rawModel.likes || 0
    };
  }

  /**
   * Organize processed models into performance tiers
   */
  organizeIntoTiers(processedModels) {
    const tiered = {
      computer_vision: {
        image_classification: { lightweight: [], standard: [], advanced: [], xlarge: [] },
        object_detection: { lightweight: [], standard: [], advanced: [], xlarge: [] }
      },
      natural_language_processing: {
        text_classification: { lightweight: [], standard: [], advanced: [], xlarge: [] },
        sentiment_analysis: { lightweight: [], standard: [], advanced: [], xlarge: [] },
        text_generation: { lightweight: [], standard: [], advanced: [], xlarge: [] },
        code_assistant: { lightweight: [], standard: [], advanced: [], xlarge: [] }
      },
      speech_processing: {
        speech_recognition: { lightweight: [], standard: [], advanced: [], xlarge: [] },
        text_to_speech: { lightweight: [], standard: [], advanced: [], xlarge: [] }
      },
      time_series: {
        forecasting: { lightweight: [], standard: [], advanced: [], xlarge: [] }
      }
    };

    for (const model of processedModels) {
      const { category, subcategory, tier } = model;
      
      if (tiered[category] && tiered[category][subcategory] && tiered[category][subcategory][tier]) {
        // Remove processing metadata before adding to tiers
        const cleanModel = { ...model };
        delete cleanModel.category;
        delete cleanModel.subcategory;
        delete cleanModel.tier;
        delete cleanModel.downloads;
        delete cleanModel.likes;
        
        tiered[category][subcategory][tier].push(cleanModel);
      }
    }

    // Sort models within each tier by relevance (downloads, accuracy, size)
    this.sortModelsInTiers(tiered);

    return tiered;
  }

  /**
   * Merge new data with existing dataset
   */
  mergeWithExistingData(newTieredModels, config) {
    const merged = {
      ...this.currentModels,
      models: { ...this.currentModels.models }
    };

    // Track whether we made substantive changes
    let hasSubstantiveChanges = false;

    // Merge each category/subcategory/tier
    for (const [category, subcategories] of Object.entries(newTieredModels)) {
      if (!merged.models[category]) {
        merged.models[category] = {};
      }

      for (const [subcategory, tiers] of Object.entries(subcategories)) {
        if (!merged.models[category][subcategory]) {
          merged.models[category][subcategory] = {};
        }

        for (const [tier, models] of Object.entries(tiers)) {
          if (models.length > 0) {
            // Keep best models from existing + new (limit per tier)
            const existing = merged.models[category][subcategory][tier] || [];

            // Preserve curated fields (specialization) on new models
            const modelsWithCuratedFields = models.map(m => this.preserveCuratedFields(m, existing));

            const combined = [...existing, ...modelsWithCuratedFields];

            // Remove duplicates based on huggingFaceId (preserves curated fields)
            const deduped = this.deduplicateModels(combined);

            // Sort and limit - prioritize models with curated specialization
            const sorted = this.sortModelsByRelevance(deduped);
            const finalModels = sorted.slice(0, 5); // Max 5 per tier

            // Check if this tier has substantive changes
            if (this.hasModelListChanged(existing, finalModels)) {
              hasSubstantiveChanges = true;
            }

            merged.models[category][subcategory][tier] = finalModels;

            // Update statistics
            const newCount = models.length;
            const existingCount = existing.length;
            if (newCount > 0) {
              this.stats.added += Math.max(0, finalModels.length - existingCount);
            }
          }
        }
      }
    }

    // Only update timestamp if there are substantive changes
    if (hasSubstantiveChanges) {
      merged.lastUpdated = new Date().toISOString().split('T')[0];
    } else {
      // Preserve existing timestamp
      merged.lastUpdated = this.currentModels.lastUpdated || new Date().toISOString().split('T')[0];
    }

    // Store whether we had substantive changes for reporting
    this.stats.hasSubstantiveChanges = hasSubstantiveChanges;

    return merged;
  }

  /**
   * Check if two model lists have substantive differences
   * Compares model content excluding lastUpdated fields
   */
  hasModelListChanged(oldModels, newModels) {
    // Different number of models = change
    if (oldModels.length !== newModels.length) {
      return true;
    }

    // Compare each model (excluding lastUpdated)
    for (let i = 0; i < oldModels.length; i++) {
      const oldModel = oldModels[i];
      const newModel = newModels[i];

      // Compare all fields except lastUpdated
      const oldWithoutTimestamp = { ...oldModel };
      const newWithoutTimestamp = { ...newModel };
      delete oldWithoutTimestamp.lastUpdated;
      delete newWithoutTimestamp.lastUpdated;

      if (JSON.stringify(oldWithoutTimestamp) !== JSON.stringify(newWithoutTimestamp)) {
        return true;
      }
    }

    return false;
  }

  // === Utility Methods ===

  /**
   * Estimate model size in MB based on file sizes or parameter count
   * Priority: siblings file sizes > safetensors params > name pattern > heuristics
   */
  estimateModelSize(rawModel, detailedInfo) {
    // 1. Sum siblings file sizes (MOST ACCURATE)
    // The siblings array contains actual file info with sizes in bytes
    if (detailedInfo?.siblings) {
      const modelFiles = detailedInfo.siblings.filter(f => 
        f.rfilename?.endsWith('.safetensors') || 
        f.rfilename?.endsWith('.bin') ||
        f.rfilename?.endsWith('.onnx')
      );
      if (modelFiles.length > 0) {
        const totalBytes = modelFiles.reduce((sum, f) => sum + (f.size || 0), 0);
        if (totalBytes > 0) {
          return Math.round(totalBytes / (1024 * 1024));
        }
      }
    }

    // 2. Use safetensors param count (NOTE: safetensors.total is PARAMS, not bytes!)
    // Estimate ~2 bytes per param for fp16 quantization
    if (detailedInfo?.safetensors?.total) {
      const params = detailedInfo.safetensors.total;
      return Math.round((params * 2) / (1024 * 1024)); // fp16: 2 bytes per param
    }

    // 3. Try safetensors.parameters.total as alternative param source
    if (detailedInfo?.safetensors?.parameters?.total) {
      const params = detailedInfo.safetensors.parameters.total;
      return Math.round((params * 2) / (1024 * 1024)); // fp16: 2 bytes per param
    }

    // 4. Try to extract parameter count from model name (e.g., "7b", "70b", "1.3b")
    const modelName = rawModel.id.toLowerCase();
    const paramMatch = modelName.match(/(\d+\.?\d*)b(?:-|_|$)/);
    if (paramMatch) {
      const billions = parseFloat(paramMatch[1]);
      // Estimate: ~2GB per billion params (fp16)
      return Math.round(billions * 2000);
    }

    // 5. Fallback heuristics for non-LLM models
    if (modelName.includes('nano') || modelName.includes('tiny')) return 50;
    if (modelName.includes('small') || modelName.includes('mobile')) return 150;
    if (modelName.includes('base') && !modelName.includes('large')) return 400;
    if (modelName.includes('medium')) return 800;
    if (modelName.includes('large') || modelName.includes('xl')) return 1500;
    if (modelName.includes('xxl') || modelName.includes('huge')) return 5000;
    
    return 200; // Default estimate for unknown models
  }

  /**
   * Determine performance tier based on size
   * Tiers: lightweight (≤500MB), standard (≤4GB), advanced (≤20GB), xlarge (>20GB)
   */
  determineTier(sizeMB) {
    if (sizeMB <= 500) return 'lightweight';
    if (sizeMB <= 4000) return 'standard';
    if (sizeMB <= 20000) return 'advanced';
    return 'xlarge';
  }

  /**
   * Calculate environmental impact score based on model size
   * Simple heuristic: smaller models = lower environmental impact
   * 
   * @param {number} sizeMB - Model size in megabytes
   * @returns {number} Environmental score (1-3)
   */
  calculateEnvironmentalScore(sizeMB) {
    if (sizeMB <= 500) return 1;   // Low impact (lightweight)
    if (sizeMB <= 4000) return 2;  // Medium impact (standard)
    return 3;                       // High impact (advanced/xlarge)
  }

  /**
   * Determine deployment options based on model size AND runtime compatibility
   * "browser" requires both: (a) size within browser limits AND (b) a browser-compatible framework
   * Browser-compatible frameworks: ONNX, Transformers.js, TensorFlow.js
   */
  determineDeploymentOptions(sizeMB, rawModel, frameworks = []) {
    const options = new Set();
    const browserFrameworks = ['ONNX', 'Transformers.js', 'TensorFlow.js'];
    const hasBrowserRuntime = frameworks.some(f => browserFrameworks.includes(f));

    // Browser: needs browser runtime + size under 500MB (comfortable limit for desktop browsers)
    if (hasBrowserRuntime && sizeMB <= 500) {
      options.add('browser');
    }

    // Mobile: browser runtime + under 100MB (realistic for phones)
    if (hasBrowserRuntime && sizeMB <= 100) {
      options.add('mobile');
    }

    // Edge: under 500MB (Pi, cheap laptops, etc.)
    if (sizeMB <= 500) {
      options.add('edge');
    }

    // Cloud/Server based on size
    if (sizeMB <= 4000) {
      options.add('cloud');
      options.add('server');
    } else {
      options.add('server');
    }

    return [...options];
  }

  /**
   * Extract supported frameworks, including browser-compatible runtimes
   * Detects ONNX/Transformers.js from file siblings, tags, library_name, and known orgs
   */
  extractFrameworks(rawModel, detailedInfo) {
    const frameworks = new Set();

    // 1. Check library_name from HuggingFace metadata
    if (detailedInfo) {
      const lib = detailedInfo.library_name;
      if (lib === 'transformers') { frameworks.add('PyTorch'); frameworks.add('TensorFlow'); }
      if (lib === 'pytorch') frameworks.add('PyTorch');
      if (lib === 'tensorflow' || lib === 'keras') frameworks.add('TensorFlow');
      if (lib === 'transformers.js') frameworks.add('Transformers.js');
      if (lib === 'onnx') frameworks.add('ONNX');
    }

    // 2. Check for .onnx files in siblings (proves browser-deployable)
    if (detailedInfo?.siblings) {
      const hasOnnx = detailedInfo.siblings.some(f => f.rfilename?.endsWith('.onnx'));
      if (hasOnnx) {
        frameworks.add('ONNX');
        frameworks.add('Transformers.js');
      }
    }

    // 3. Check model tags for browser-compatible runtimes
    const tags = detailedInfo?.tags || rawModel.tags || [];
    if (tags.includes('transformers.js')) frameworks.add('Transformers.js');
    if (tags.includes('onnx')) frameworks.add('ONNX');

    // 4. Known ONNX-publishing organizations (pre-converted, browser-ready)
    const modelId = rawModel.id || '';
    const org = modelId.split('/')[0]?.toLowerCase();
    const browserReadyOrgs = ['xenova', 'onnx-community'];
    if (browserReadyOrgs.includes(org)) {
      frameworks.add('ONNX');
      frameworks.add('Transformers.js');
    }

    // 5. Default fallback: if nothing detected, assume PyTorch
    if (frameworks.size === 0) {
      frameworks.add('PyTorch');
      if (modelId.includes('tensorflow')) frameworks.add('TensorFlow');
    }

    return [...frameworks];
  }

  /**
   * Generate standardized model ID
   */
  generateModelId(rawModel) {
    return rawModel.id.replace(/[\/\\]/g, '_').toLowerCase();
  }

  /**
   * Extract clean model name
   */
  extractModelName(rawModel) {
    const parts = rawModel.id.split('/');
    return parts[parts.length - 1].replace(/[-_]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Extract model description
   */
  extractDescription(rawModel, detailedInfo) {
    if (detailedInfo && detailedInfo.cardData && detailedInfo.cardData.description) {
      return detailedInfo.cardData.description.slice(0, 150);
    }
    
    // Generate basic description
    const name = this.extractModelName(rawModel);
    const task = rawModel.sourceTask.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    return `${name} model for ${task.toLowerCase()}`;
  }

  /**
   * Extract accuracy metrics (simplified)
   */
  extractAccuracy(rawModel, detailedInfo) {
    // This would be more sophisticated in production
    // For now, return a reasonable estimate based on model characteristics
    const modelName = rawModel.id.toLowerCase();
    
    if (modelName.includes('large')) return 0.85;
    if (modelName.includes('base')) return 0.78;
    if (modelName.includes('small') || modelName.includes('mobile')) return 0.72;
    
    return 0.75; // Default
  }

  /**
   * Validate model data completeness
   */
  validateModelData(model) {
    const required = ['id', 'name', 'huggingFaceId', 'sizeMB', 'environmentalScore'];
    return required.every(field => model[field] !== undefined && model[field] !== null);
  }

  /**
   * Check if a model should be excluded (test, mock, internal, etc.)
   */
  isExcludedModel(modelId) {
    const lowerModelId = modelId.toLowerCase();
    
    // Patterns that indicate test/mock/internal models
    const excludePatterns = [
      // Test and internal namespaces
      /^trl-internal-testing\//,
      /^hf-internal-testing\//,
      /^test-/,
      /^testing-/,
      /-test$/,
      /-testing$/,
      /^dummy[-_]/,
      /[-_]dummy$/,
      /^mock[-_]/,
      /[-_]mock$/,
      /^fake[-_]/,
      /[-_]fake$/,
      /^placeholder/,
      /^example[-_]/,
      /^sample[-_]/,
      /^demo[-_]/,
      
      // Internal testing patterns
      /internal[-_]test/,
      /test[-_]model/,
      /tiny[-_]random/,
      /random[-_]tiny/,
      
      // Debug/dev models
      /^debug[-_]/,
      /[-_]debug$/,
      /^dev[-_]/,
      
      // CI/CD test models
      /[-_]ci[-_]test/,
      /[-_]unittest/,
      
      // Specific known test orgs/patterns
      /^sshleifer\/tiny/,
      /^patrickvonplaten\/tiny/,
      /^fxmarty\/tiny/,
      /^hf-tiny/,
    ];
    
    for (const pattern of excludePatterns) {
      if (pattern.test(lowerModelId)) {
        console.log(`   ⏭️  Skipping test/mock model: ${modelId}`);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Remove duplicate models based on huggingFaceId
   * Preserves curated fields (specialization) from existing models
   */
  deduplicateModels(models) {
    const seen = new Map(); // Map huggingFaceId -> model with curated fields
    const result = [];
    
    for (const model of models) {
      if (seen.has(model.huggingFaceId)) {
        // Model already exists - preserve curated fields from first occurrence
        const existing = seen.get(model.huggingFaceId);
        
        // If the new model has updated data but existing has specialization, merge them
        if (existing.specialization && !model.specialization) {
          // Keep existing specialization on the model we already have
          continue;
        }
      } else {
        seen.set(model.huggingFaceId, model);
        result.push(model);
      }
    }
    
    return result;
  }

  /**
   * Preserve curated fields when merging models
   * Curated fields: specialization (manually assigned based on research)
   */
  preserveCuratedFields(newModel, existingModels) {
    const existing = existingModels.find(m => m.huggingFaceId === newModel.huggingFaceId);
    if (existing) {
      // Preserve manually curated fields
      if (existing.specialization && !newModel.specialization) {
        newModel.specialization = existing.specialization;
      }
    }
    return newModel;
  }

  /**
   * Sort models by relevance (curated status, accuracy, size, downloads)
   */
  sortModelsByRelevance(models) {
    return models.sort((a, b) => {
      // First: prioritize manually curated models (have specialization field)
      const aCurated = a.specialization ? 1 : 0;
      const bCurated = b.specialization ? 1 : 0;
      if (aCurated !== bCurated) return bCurated - aCurated;
      
      // Then: prioritize accuracy
      const accuracyDiff = (b.accuracy || 0) - (a.accuracy || 0);
      if (Math.abs(accuracyDiff) > 0.05) return accuracyDiff;
      
      // Then: smaller size is better
      const sizeDiff = a.sizeMB - b.sizeMB;
      if (Math.abs(sizeDiff) > 50) return sizeDiff;
      
      // Finally: more downloads
      return (b.downloads || 0) - (a.downloads || 0);
    });
  }

  /**
   * Sort models within tiers
   */
  sortModelsInTiers(tiered) {
    for (const [category, subcategories] of Object.entries(tiered)) {
      for (const [subcategory, tiers] of Object.entries(subcategories)) {
        for (const [tier, models] of Object.entries(tiers)) {
          tiered[category][subcategory][tier] = this.sortModelsByRelevance(models);
        }
      }
    }
  }

  /**
   * Save updated models data
   */
  saveModelsData(data) {
    const modelsPath = join(this.dataPath, 'models.json');
    writeFileSync(modelsPath, JSON.stringify(data, null, 2), 'utf8');
  }

  /**
   * Get default model categories to fetch
   */
  getDefaultCategories() {
    return [
      { category: 'computer_vision', subcategory: 'image_classification', task: 'image-classification' },
      { category: 'computer_vision', subcategory: 'object_detection', task: 'object-detection' },
      { category: 'natural_language_processing', subcategory: 'text_classification', task: 'text-classification' },
      { category: 'natural_language_processing', subcategory: 'sentiment_analysis', task: 'text-classification' },
      { category: 'natural_language_processing', subcategory: 'text_generation', task: 'text-generation' },
      { category: 'natural_language_processing', subcategory: 'code_assistant', task: 'text-generation' },
      { category: 'speech_processing', subcategory: 'speech_recognition', task: 'automatic-speech-recognition' },
      { category: 'speech_processing', subcategory: 'text_to_speech', task: 'text-to-speech' },
      { category: 'time_series', subcategory: 'forecasting', task: 'time-series-forecasting' }
    ];
  }

  /**
   * Get default models structure
   */
  getDefaultModelsStructure() {
    return {
      version: "1.0",
      lastUpdated: new Date().toISOString().split('T')[0],
      tiers: {
        lightweight: {
          label: "Lightweight Models",
          description: "Small, efficient models optimized for edge deployment and mobile devices",
          priority: 1,
          maxSizeMB: 500,
          environmentalScore: 1
        },
        standard: {
          label: "Standard Models", 
          description: "Production-ready models including quantized LLMs, suitable for most hardware",
          priority: 2,
          maxSizeMB: 4000,
          environmentalScore: 2
        },
        advanced: {
          label: "Advanced Models",
          description: "Large models including full-precision 7B+ LLMs for maximum capability",
          priority: 3,
          maxSizeMB: 20000,
          environmentalScore: 3
        },
        xlarge: {
          label: "Extra Large Models",
          description: "Very large models (13B+, 70B+) requiring significant infrastructure",
          priority: 4,
          maxSizeMB: null,
          environmentalScore: 3
        }
      },
      models: {},
      environmentalImpact: {
        scoringCriteria: {
          "1": {
            label: "Low Impact",
            description: "Lightweight models (≤500MB), suitable for edge/mobile",
            sizeThreshold: "≤ 500 MB"
          },
          "2": {
            label: "Medium Impact", 
            description: "Standard models (≤4GB), suitable for cloud deployment",
            sizeThreshold: "≤ 4 GB"
          },
          "3": {
            label: "High Impact",
            description: "Large models (>4GB), require significant compute resources",
            sizeThreshold: "> 4 GB"
          }
        },
        methodology: "Simple size-based heuristic: larger models require more compute.",
        caveat: "This is a rough approximation for comparison only, not a scientific measurement."
      },
      selectionRules: {
        defaultTierPriority: ["lightweight", "standard", "advanced"],
        environmentalWeighting: 0.4,
        accuracyWeighting: 0.4,
        deploymentWeighting: 0.2,
        maxRecommendations: 3
      }
    };
  }

  /**
   * Print tier summary
   */
  logTierSummary(tiered) {
    for (const [category, subcategories] of Object.entries(tiered)) {
      for (const [subcategory, tiers] of Object.entries(subcategories)) {
        const counts = {
          lightweight: tiers.lightweight.length,
          standard: tiers.standard.length,
          advanced: tiers.advanced.length,
          xlarge: tiers.xlarge.length
        };
        const total = counts.lightweight + counts.standard + counts.advanced + counts.xlarge;
        
        if (total > 0) {
          console.log(`   ${category}/${subcategory}: L:${counts.lightweight} S:${counts.standard} A:${counts.advanced} XL:${counts.xlarge}`);
        }
      }
    }
    console.log();
  }

  /**
   * Print aggregation summary
   */
  printAggregationSummary() {
    const duration = Date.now() - this.stats.startTime;

    console.log('📈 Aggregation Summary:');
    console.log(`   Processed: ${this.stats.processed} models`);
    console.log(`   Added: ${this.stats.added} new models`);
    console.log(`   Updated: ${this.stats.updated} existing models`);
    console.log(`   Errors: ${this.stats.errors} failed models`);
    console.log(`   Substantive changes: ${this.stats.hasSubstantiveChanges ? 'Yes' : 'No'}`);
    console.log(`   Duration: ${Math.round(duration / 1000)}s\n`);
  }

  /**
   * Sleep utility for rate limiting
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export for CLI usage
export default ModelAggregator;