/**
 * Model Metadata Aggregation System
 * Aggregates model information from multiple sources for quarterly updates
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Bytes per element for the dtypes reported in safetensors.parameters
const DTYPE_BYTES = {
  F64: 8, I64: 8, U64: 8,
  F32: 4, I32: 4, U32: 4,
  BF16: 2, F16: 2, I16: 2, U16: 2,
  F8_E4M3: 1, F8_E5M2: 1, I8: 1, U8: 1, BOOL: 1
};

// Fail the run when more than this share of Hugging Face requests fail after retries
const MAX_FAILURE_RATE = 0.1;
const MAX_RETRIES = 5;

// JSON with sorted object keys, so equal models compare equal whatever their field order
const canonical = value => JSON.stringify(value, (key, val) =>
  val && typeof val === 'object' && !Array.isArray(val)
    ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : val
);

export class ModelAggregator {
  constructor(options = {}) {
    this.huggingFaceToken = options.huggingFaceToken || process.env.HF_TOKEN;
    this.dataPath = options.dataPath || join(__dirname, '../data');
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 2000;
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
      requests: 0,
      failedRequests: 0,
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
      this.assertFailureRateAcceptable();

      // Step 3: Organize into tiers
      console.log('📊 Organizing models into performance tiers...');
      const tieredModels = this.organizeIntoTiers(processedModels);
      this.logTierSummary(tieredModels);

      // Step 4: Validate and merge with existing data
      console.log('✅ Validating and merging with existing dataset...');
      const mergedData = this.mergeWithExistingData(tieredModels, config);

      const changes = this.summarizeChanges(this.currentModels, mergedData);
      this.stats.updated = changes.updated.length;

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
        changes,
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

    const response = await this.fetchFromHF(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Fetch a Hugging Face API URL, retrying 429 and 5xx responses with backoff.
   * Returns the final response; network errors and exhausted retries count
   * towards the failure rate checked by assertFailureRateAcceptable().
   * A 404 is a valid answer (model gone) and is not counted as a failure.
   */
  async fetchFromHF(url) {
    const headers = {};
    if (this.huggingFaceToken) {
      headers['Authorization'] = `Bearer ${this.huggingFaceToken}`;
    }

    this.stats.requests++;
    let response;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        response = await fetch(url, { headers });
      } catch (error) {
        this.stats.failedRequests++;
        throw error;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) break;
      if (attempt === MAX_RETRIES) break;

      const retryAfterSec = Number(response.headers?.get?.('retry-after'));
      const delay = Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? retryAfterSec * 1000
        : this.retryBaseDelayMs * 2 ** attempt;
      await this.sleep(delay);
    }

    if (!response.ok && response.status !== 404) {
      this.stats.failedRequests++;
    }
    return response;
  }

  /**
   * Throw when too many Hugging Face requests failed, so a rate-limited run
   * cannot report success with a silently degraded dataset.
   */
  assertFailureRateAcceptable() {
    const { requests, failedRequests } = this.stats;
    if (requests > 0 && failedRequests / requests > MAX_FAILURE_RATE) {
      throw new Error(
        `${failedRequests} of ${requests} Hugging Face requests failed (limit ${MAX_FAILURE_RATE * 100}%). ` +
        'Set HF_TOKEN to raise the rate limit.'
      );
    }
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

        // Without details the size and frameworks would be guesses, and
        // a refresh would overwrite known data with them
        if (!modelInfo) {
          continue;
        }
        
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
    // blobs=true adds file sizes to the siblings list
    const url = `https://huggingface.co/api/models/${modelId}?blobs=true`;

    try {
      const response = await this.fetchFromHF(url);
      return response.ok ? await response.json() : null;
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
    // Work on a copy so currentModels stays intact for the change summary
    const merged = structuredClone(this.currentModels);

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
            // A refreshed model can move tier when its size changes: drop its
            // stale copy from the other tiers of this task, keeping curated fields
            for (const [otherTier, otherModels] of Object.entries(merged.models[category][subcategory])) {
              if (otherTier === tier) continue;
              const moving = models.map(m => m.huggingFaceId);
              const stale = otherModels.filter(m => moving.includes(m.huggingFaceId));
              stale.forEach(old => {
                const fresh = models.find(m => m.huggingFaceId === old.huggingFaceId);
                this.preserveCuratedFields(fresh, [old]);
              });
              if (stale.length > 0) hasSubstantiveChanges = true;
              merged.models[category][subcategory][otherTier] =
                otherModels.filter(m => !moving.includes(m.huggingFaceId));
            }

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

      if (canonical(oldWithoutTimestamp) !== canonical(newWithoutTimestamp)) {
        return true;
      }
    }

    return false;
  }

  // === Utility Methods ===

  /**
   * Estimate model size in MB based on file sizes or parameter count
   * Priority: weight file sizes (needs ?blobs=true) > safetensors dtype sizes > name pattern > heuristics
   */
  estimateModelSize(rawModel, detailedInfo) {
    // 1. Weight file sizes from siblings (MOST ACCURATE)
    // Formats are alternative copies of the same weights, so count only one:
    // safetensors, else pickled checkpoints, else the largest variant of the
    // repo's ONNX or GGUF files.
    const files = (detailedInfo?.siblings || []).filter(f => f.size > 0);
    const sizes = exts => files
      .filter(f => exts.some(ext => f.rfilename?.endsWith(ext)))
      .map(f => f.size);
    const sum = list => list.reduce((total, size) => total + size, 0);
    const totalBytes =
      sum(sizes(['.safetensors'])) ||
      sum(sizes(['.bin', '.pt', '.pth', '.ckpt'])) ||
      Math.max(0, ...this.variantSizes(files));
    if (totalBytes > 0) {
      return this.bytesToMB(totalBytes);
    }

    // 2. Safetensors parameter counts per dtype (safetensors.total is a bare count
    // and unreliable, e.g. 664944 for a 35B model whose BF16 count is 35107181936)
    const byDtype = detailedInfo?.safetensors?.parameters;
    if (byDtype) {
      let bytes = 0;
      for (const [dtype, count] of Object.entries(byDtype)) {
        if (DTYPE_BYTES[dtype]) bytes += count * DTYPE_BYTES[dtype];
      }
      if (bytes > 0) {
        return this.bytesToMB(bytes);
      }
    }

    // 3. Only a bare total: assume fp16 (2 bytes per param)
    if (detailedInfo?.safetensors?.total) {
      return this.bytesToMB(detailedInfo.safetensors.total * 2);
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
   * Whole megabytes, at least 1 so tiny models never get a size of 0
   */
  bytesToMB(bytes) {
    return Math.max(1, Math.round(bytes / (1024 * 1024)));
  }

  /**
   * Sizes of the complete ONNX variants and the GGUF files in a file list.
   * An ONNX variant is one precision (fp32, fp16, q4, ...) of every graph in
   * the repo, e.g. encoder and decoder together, plus the external data files
   * stored next to them (model_q4.onnx, model_q4.onnx_data_1, ...).
   */
  variantSizes(files) {
    const variants = new Map();
    for (const { rfilename = '', size } of files) {
      const onnxAt = rfilename.indexOf('.onnx');
      if (onnxAt !== -1) {
        const precision = rfilename.slice(0, onnxAt).match(/_(?:fp16|q4f16|q4|int8|uint8|quantized|bnb4)$/)?.[0] ?? '';
        variants.set(precision, (variants.get(precision) || 0) + size);
      } else if (rfilename.endsWith('.gguf')) {
        // Split files (model.Q8_0-00001-of-00002.gguf) are shards of one quantization
        const quantization = rfilename.replace(/-\d{5}-of-\d{5}(?=\.gguf$)/, '');
        variants.set(quantization, (variants.get(quantization) || 0) + size);
      }
    }
    return [...variants.values()];
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
   * Accuracy is not available from the Hub API, so record it as unknown
   * rather than inventing a value from the model name.
   */
  extractAccuracy() {
    return null;
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
   * Remove duplicate models based on huggingFaceId.
   * Later entries win, so fresh Hub data (listed after the existing copy)
   * replaces the stale entry; preserveCuratedFields() has already carried the
   * curated fields over.
   */
  deduplicateModels(models) {
    const byId = new Map();
    for (const model of models) {
      byId.set(model.huggingFaceId, model);
    }
    return [...byId.values()];
  }

  /**
   * Preserve curated fields when merging models
   * Curated fields: specialization and runtime (manually assigned based on research)
   */
  preserveCuratedFields(newModel, existingModels) {
    const existing = existingModels.find(m => m.huggingFaceId === newModel.huggingFaceId);
    if (existing) {
            for (const field of ['specialization', 'runtime']) {
        if (existing[field] && !newModel[field]) {
          newModel[field] = existing[field];
        }
      }
      // Only a sourced {metric, value, source} record counts; legacy bare numbers were
      // estimated from the model name and are dropped
      if (existing.accuracy?.source && !newModel.accuracy) {
        newModel.accuracy = existing.accuracy;
      }
    }
    return newModel;
  }

  /**
   * Compare two datasets by huggingFaceId and list what was added, removed,
   * refreshed (any field other than lastUpdated changed) and resized.
   */
  summarizeChanges(oldData, newData) {
    // A Hub id can appear under several tasks, so keep every occurrence
    const index = data => {
      const byId = new Map();
      for (const subcategories of Object.values(data?.models || {})) {
        for (const tiers of Object.values(subcategories)) {
          for (const models of Object.values(tiers)) {
            for (const model of models) {
              if (!byId.has(model.huggingFaceId)) byId.set(model.huggingFaceId, []);
              byId.get(model.huggingFaceId).push(model);
            }
          }
        }
      }
      return byId;
    };
    const comparable = ({ lastUpdated, ...rest }) => canonical(rest);

    const before = index(oldData);
    const after = index(newData);
    const summary = { added: [], removed: [], updated: [], sizeChanged: [] };

    for (const [id, models] of after) {
      const olds = before.get(id);
      if (!olds) {
        summary.added.push({ id, sizeMB: models[0].sizeMB });
        continue;
      }
      const oldForms = new Set(olds.map(comparable));
      if (models.some(model => !oldForms.has(comparable(model)))) summary.updated.push(id);

      const oldSizes = new Set(olds.map(m => m.sizeMB));
      const newSizes = new Set(models.map(m => m.sizeMB));
      const from = [...oldSizes].find(size => !newSizes.has(size));
      const to = [...newSizes].find(size => !oldSizes.has(size));
      if (from !== undefined || to !== undefined) {
        summary.sizeChanged.push({ id, from: from ?? [...oldSizes][0], to: to ?? [...newSizes][0] });
      }
    }
    for (const id of before.keys()) {
      if (!after.has(id)) summary.removed.push(id);
    }
    return summary;
  }

  /**
   * Render the change summary as markdown for the pull request body
   */
  formatChangeSummary(summary) {
    const section = (title, items) =>
      items.length ? `\n### ${title} (${items.length})\n${items.map(i => `- ${i}`).join('\n')}\n` : '';

    return [
      '## Automated model dataset update',
      `\nRefreshed ${summary.updated.length} existing models.`,
      section('Added', summary.added.map(m => `\`${m.id}\` (${m.sizeMB} MB)`)),
      section('Removed', summary.removed.map(id => `\`${id}\``)),
      section('Size changes', summary.sizeChanged.map(c => `\`${c.id}\`: ${c.from} MB to ${c.to} MB`))
    ].join('\n');
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