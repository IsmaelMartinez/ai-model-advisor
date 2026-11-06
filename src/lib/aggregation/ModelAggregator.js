/**
 * Model Metadata Aggregation System
 * Aggregates model information from multiple sources for quarterly updates
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tierForSize } from '../data/constants.js';

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
const MAX_MODELS_PER_TIER = 5;

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

      // Step 3: Validate and merge with existing data
      console.log('✅ Validating and merging with existing dataset...');
      const mergedData = this.mergeWithExistingData(processedModels);

      const changes = this.summarizeChanges(this.currentModels, mergedData);
      this.stats.added = changes.added.length;
      this.stats.updated = changes.updated.length;

      // Step 4: Save updated dataset (if not dry run AND has substantive changes)
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
    // One raw model per Hugging Face id; `tasks` lists every category it was found for
    const byId = new Map();
    const add = (model, category) => {
      const task = { category: category.category, subcategory: category.subcategory };
      const known = byId.get(model.id);
      if (!known) {
        byId.set(model.id, { ...model, tasks: [task] });
        this.stats.processed++;
        return true;
      }
      if (!known.tasks.some(t => t.category === task.category && t.subcategory === task.subcategory)) {
        known.tasks.push(task);
      }
      return false;
    };

    // Pass 1: Fetch most popular models by downloads
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
        models.forEach(model => add(model, category));
        await this.sleep(500);

      } catch (error) {
        console.warn(`   ⚠️ Failed to fetch ${category.task}: ${error.message}`);
        this.stats.errors++;
      }
    }

    // Pass 2: Fetch browser-ready models from known ONNX-publishing organizations
    // These orgs publish pre-converted ONNX models that actually work in browsers
    const browserReadyOrgs = ['Xenova', 'onnx-community'];

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

          const added = models.filter(model => add(model, category)).length;
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

    return [...byId.values()];
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
    const sizeMB = this.estimateModelSize(rawModel, detailedInfo);
    const frameworks = this.extractFrameworks(rawModel, detailedInfo);
    const deploymentOptions = this.determineDeploymentOptions(sizeMB, rawModel, frameworks);

    const model = {
      id: this.generateModelId(rawModel),
      name: this.extractModelName(rawModel),
      huggingFaceId: rawModel.id,
      description: this.extractDescription(rawModel, detailedInfo),
      sizeMB: sizeMB,
      accuracy: this.extractAccuracy(),
      deploymentOptions,
      frameworks: frameworks,
      tasks: rawModel.tasks,
      lastUpdated: (rawModel.lastModified || new Date().toISOString()).split('T')[0],

      // Used for ranking only, stripped before saving
      downloads: rawModel.downloads || 0
    };

    // Browser models get runtime metadata; nothing has been tested in a browser by this script
    if (deploymentOptions.includes('browser')) {
      model.runtime = {
        browser: {
          framework: frameworks.includes('Transformers.js') ? 'transformers.js' : 'onnx-runtime-web',
          backend: ['wasm'],
          tested: false
        }
      };
    }
    return model;
  }

  /**
   * Merge freshly fetched models into the existing dataset.
   * Fresh Hub data replaces the stale copy of a model, curated fields and
   * existing task assignments are kept, and each task keeps at most
   * MAX_MODELS_PER_TIER models per tier (curated first, then by relevance).
   */
  mergeWithExistingData(freshModels) {
    const byId = new Map(this.currentModels.models.map(m => [m.huggingFaceId, m]));

    for (const fresh of freshModels) {
      const { downloads, ...model } = fresh;
      const old = byId.get(model.huggingFaceId);
      if (old) {
        this.preserveCuratedFields(model, old);
        if (model.browserModelId) {
          // A mirror supplies the ONNX weights the native repo lacks, so judge
          // browser support with ONNX available but still apply the size limits
          const frameworks = [...new Set([...model.frameworks, 'ONNX'])];
          model.deploymentOptions = this.determineDeploymentOptions(model.sizeMB, { id: model.huggingFaceId }, frameworks);
          if (!model.deploymentOptions.includes('browser')) {
            delete model.runtime;
            delete model.browserModelId;
          }
        }
        model.tasks = [...old.tasks];
        for (const task of fresh.tasks) {
          if (!model.tasks.some(t => t.category === task.category && t.subcategory === task.subcategory)) {
            model.tasks.push(task);
          }
        }
      }
      model.downloads = downloads;
      byId.set(model.huggingFaceId, model);
    }

    const kept = this.limitModelsPerTask(
      [...byId.values()],
      new Set(freshModels.map(m => m.huggingFaceId))
    );
    const models = kept.map(({ downloads, ...model }) => model);

    const merged = { ...this.currentModels, models };
    const changes = this.summarizeChanges(this.currentModels, merged);
    this.stats.hasSubstantiveChanges =
      changes.added.length + changes.removed.length + changes.updated.length > 0;

    // Only bump the timestamp when something changed
    merged.lastUpdated = this.stats.hasSubstantiveChanges
      ? new Date().toISOString().split('T')[0]
      : this.currentModels.lastUpdated;

    return merged;
  }

  /**
   * Keep the best MAX_MODELS_PER_TIER models per task and tier, for the
   * task/tier groups that received a fresh model (other groups are left as
   * they are). A model loses the tasks it no longer ranks in and is dropped
   * when none are left.
   */
  limitModelsPerTask(models, freshIds) {
    const groups = new Map();
    for (const model of models) {
      for (const task of model.tasks) {
        const key = `${task.category}/${task.subcategory}/${tierForSize(model.sizeMB)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ model, task });
      }
    }

    const keptTasks = new Map(models.map(model => [model, new Set()]));
    for (const group of groups.values()) {
      const touched = group.some(entry => freshIds.has(entry.model.huggingFaceId));
      const ranked = touched
        ? this.sortModelsByRelevance(group.map(entry => entry.model)).slice(0, MAX_MODELS_PER_TIER)
        : group.map(entry => entry.model);
      for (const model of ranked) {
        keptTasks.get(model).add(group.find(entry => entry.model === model).task);
      }
    }

    return models
      .filter(model => keptTasks.get(model).size > 0)
      .map(model => ({ ...model, tasks: model.tasks.filter(task => keptTasks.get(model).has(task)) }));
  }

  // === Utility Methods ===

  /**
   * Estimate model size in MB based on file sizes or parameter count
   * Priority: weight file sizes (needs ?blobs=true) > safetensors dtype sizes > name pattern > heuristics
   */
  estimateModelSize(rawModel, detailedInfo) {
    // 1. Weight file sizes from siblings (MOST ACCURATE)
    // Formats are alternative copies of the same weights, so count only one:
    // safetensors, else pickled checkpoints, else the largest single variant of
    // the repo's ONNX or GGUF files.
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
    const task = (rawModel.pipeline_tag || 'general use').replace(/-/g, ' ');
    return `${name} model for ${task}`;
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
    const required = ['id', 'name', 'huggingFaceId', 'sizeMB', 'tasks'];
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
   * Carry curated fields over from the existing entry onto the fresh one.
   * Specialization, runtime and browserModelId are assigned by hand and win
   * over the generated defaults; accuracy is kept because the Hub cannot
   * supply one, so a sourced value must survive a refresh.
   */
  preserveCuratedFields(model, existing) {
    for (const field of ['specialization', 'runtime', 'browserModelId']) {
      if (existing[field]) {
        model[field] = existing[field];
      }
    }
    if (existing.accuracy && !model.accuracy) {
      model.accuracy = existing.accuracy;
    }
    return model;
  }

  /**
   * Compare two datasets by huggingFaceId and list what was added, removed,
   * refreshed (any field other than lastUpdated changed) and resized.
   */
  summarizeChanges(oldData, newData) {
    const index = data => new Map((data?.models || []).map(m => [m.huggingFaceId, m]));
    const comparable = ({ lastUpdated, ...rest }) => canonical(rest);

    const before = index(oldData);
    const after = index(newData);
    const summary = { added: [], removed: [], updated: [], sizeChanged: [] };

    for (const [id, model] of after) {
      const old = before.get(id);
      if (!old) {
        summary.added.push({ id, sizeMB: model.sizeMB });
        continue;
      }
      if (comparable(old) !== comparable(model)) summary.updated.push(id);
      if (old.sizeMB !== model.sizeMB) {
        summary.sizeChanged.push({ id, from: old.sizeMB, to: model.sizeMB });
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
      const accuracyDiff = (b.accuracy?.value ?? 0) - (a.accuracy?.value ?? 0);
      if (Math.abs(accuracyDiff) > 0.05) return accuracyDiff;
      
      // Then: smaller size is better
      const sizeDiff = a.sizeMB - b.sizeMB;
      if (Math.abs(sizeDiff) > 50) return sizeDiff;
      
      // Finally: more downloads
      return (b.downloads || 0) - (a.downloads || 0);
    });
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
      { category: 'time_series', subcategory: 'forecasting', task: 'time-series-forecasting' },
      { category: 'natural_language_processing', subcategory: 'translation', task: 'translation' },
      { category: 'natural_language_processing', subcategory: 'summarization', task: 'summarization' },
      { category: 'natural_language_processing', subcategory: 'named_entity_recognition', task: 'token-classification' },
      { category: 'computer_vision', subcategory: 'semantic_segmentation', task: 'image-segmentation' }
    ];
  }

  /**
   * Empty dataset used when models.json cannot be read
   */
  getDefaultModelsStructure() {
    return {
      schemaVersion: 2,
      lastUpdated: new Date().toISOString().split('T')[0],
      models: []
    };
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