# Phase 2: Edge/Browser AI Pivot — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reposition AI Model Advisor from a general AI model recommender to an edge/browser AI advisor — answering "what AI can I run without a server?"

**Architecture:** No structural changes. The existing SvelteKit + Transformers.js stack stays. Changes are to the data layer (models.json, tasks.json), the ModelSelector ranking logic, the UI components (copy, badges, environmental messaging), and a new build-time script for pre-computing embeddings. All 153 existing models are kept; edge-compatible models get enriched metadata and higher visibility.

**Tech Stack:** SvelteKit 2, Vite 5, Vitest 4, Transformers.js (MiniLM), Node.js scripts

---

## Task 1: Install dependencies and verify tests pass

**Files:**
- Read: `package.json`

**Step 1: Install npm dependencies**

```bash
npm install
```

**Step 2: Run existing tests to establish baseline**

```bash
npx vitest run
```

Expected: All tests pass. Note the count — this is the baseline.

**Step 3: Commit (no changes — just verify)**

No commit needed. Baseline established.

---

## Task 2: Add data validation test for model size consistency

**Files:**
- Create: `tests/data-quality.test.js`

**Step 1: Write the failing test**

```javascript
import { describe, test, expect } from 'vitest';
import modelsData from '../src/lib/data/models.json';
import { TIERS } from '../src/lib/data/constants.js';

describe('Data Quality - Model Size Consistency', () => {
  const tierMaxSizes = {
    lightweight: 500,
    standard: 4000,
    advanced: 20000,
    xlarge: Infinity
  };

  test('every model size should be consistent with its tier', () => {
    const violations = [];

    for (const [category, subcats] of Object.entries(modelsData.models)) {
      for (const [subcategory, tiers] of Object.entries(subcats)) {
        for (const tier of TIERS) {
          const models = tiers[tier] || [];
          for (const model of models) {
            if (model.sizeMB > tierMaxSizes[tier]) {
              violations.push(
                `${model.id} (${model.sizeMB}MB) exceeds ${tier} max (${tierMaxSizes[tier]}MB) in ${category}/${subcategory}`
              );
            }
          }
        }
      }
    }

    expect(violations, `Size/tier violations:\n${violations.join('\n')}`).toHaveLength(0);
  });

  test('every model tagged "browser" should have a browser-compatible framework', () => {
    const browserFrameworks = ['Transformers.js', 'TensorFlow.js', 'ONNX', 'MediaPipe', 'ONNX Runtime Web'];
    const violations = [];

    for (const [category, subcats] of Object.entries(modelsData.models)) {
      for (const [subcategory, tiers] of Object.entries(subcats)) {
        for (const tier of TIERS) {
          const models = tiers[tier] || [];
          for (const model of models) {
            const hasBrowserTag = (model.deploymentOptions || []).includes('browser');
            const hasBrowserFramework = (model.frameworks || []).some(f => browserFrameworks.includes(f));

            if (hasBrowserTag && !hasBrowserFramework) {
              violations.push(
                `${model.id} tagged "browser" but frameworks are [${model.frameworks?.join(', ')}]`
              );
            }
          }
        }
      }
    }

    expect(violations, `Browser tag violations:\n${violations.join('\n')}`).toHaveLength(0);
  });

  test('every model should have required fields', () => {
    const requiredFields = ['id', 'name', 'huggingFaceId', 'sizeMB', 'environmentalScore', 'deploymentOptions', 'frameworks'];

    for (const [category, subcats] of Object.entries(modelsData.models)) {
      for (const [subcategory, tiers] of Object.entries(subcats)) {
        for (const tier of TIERS) {
          const models = tiers[tier] || [];
          for (const model of models) {
            for (const field of requiredFields) {
              expect(model, `${model.id || 'unknown'} in ${category}/${subcategory}/${tier} missing ${field}`).toHaveProperty(field);
            }
          }
        }
      }
    }
  });
});
```

**Step 2: Run test to see which data quality checks fail**

```bash
npx vitest run tests/data-quality.test.js
```

Expected: FAIL — this reveals the exact data problems to fix in Task 3.

**Step 3: Commit the test file**

```bash
git add tests/data-quality.test.js
git commit -m "test: add data quality validation for model size and browser tags"
```

---

## Task 3: Fix model data quality issues

**Files:**
- Modify: `src/lib/data/models.json`

This task fixes all violations identified by the data-quality tests. The exact fixes depend on what the tests reveal, but based on research the known issues are:

**Step 1: Fix size/tier mismatches**

Open `src/lib/data/models.json` and find models where `sizeMB` exceeds the tier's `maxSizeMB`. For each violation, either:
- Correct the `sizeMB` to the actual model size (check the HuggingFace model card)
- Move the model to the correct tier
- Remove the model if the size is unverifiable

Known suspects from research:
- LLMs in `lightweight` tier with impossibly small sizes (8B models at 100MB)
- Models with sizes that don't match their parameter count

**Step 2: Fix browser tag / framework mismatches**

For each model tagged `"browser"` in `deploymentOptions` that lacks a browser framework:
- If the model has a known ONNX export (Xenova/* or onnx-community/* huggingFaceId), add `"ONNX"` to frameworks
- If no browser runtime exists, remove `"browser"` from `deploymentOptions`
- If the model is small (<200MB) and has a known TensorFlow.js or Transformers.js version, add the appropriate framework

**Step 3: Run the data quality tests**

```bash
npx vitest run tests/data-quality.test.js
```

Expected: PASS — all violations fixed.

**Step 4: Run all tests to check nothing broke**

```bash
npx vitest run
```

Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/lib/data/models.json
git commit -m "fix: correct model sizes and browser tag/framework mismatches"
```

---

## Task 4: Add edge maturity labels to tasks.json

**Files:**
- Modify: `src/lib/data/tasks.json`
- Create: `tests/edge-maturity.test.js`

**Step 1: Write the failing test**

```javascript
import { describe, test, expect } from 'vitest';
import tasksData from '../src/lib/data/tasks.json';

describe('Edge Maturity Labels', () => {
  const validMaturityLevels = ['excellent', 'good', 'limited', 'emerging'];

  test('every subcategory should have an edgeMaturity field', () => {
    for (const [category, categoryData] of Object.entries(tasksData.taskTaxonomy)) {
      for (const [subcategory, subcategoryData] of Object.entries(categoryData.subcategories)) {
        expect(
          subcategoryData.edgeMaturity,
          `${category}/${subcategory} missing edgeMaturity`
        ).toBeDefined();
        expect(
          validMaturityLevels,
          `${category}/${subcategory} has invalid edgeMaturity: ${subcategoryData.edgeMaturity}`
        ).toContain(subcategoryData.edgeMaturity);
      }
    }
  });

  test('every subcategory should have edgeNotes', () => {
    for (const [category, categoryData] of Object.entries(tasksData.taskTaxonomy)) {
      for (const [subcategory, subcategoryData] of Object.entries(categoryData.subcategories)) {
        expect(
          subcategoryData.edgeNotes,
          `${category}/${subcategory} missing edgeNotes`
        ).toBeDefined();
        expect(subcategoryData.edgeNotes.length).toBeGreaterThan(10);
      }
    }
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/edge-maturity.test.js
```

Expected: FAIL — `edgeMaturity` and `edgeNotes` don't exist yet.

**Step 3: Add edgeMaturity and edgeNotes to each subcategory in tasks.json**

Add these fields to each subcategory object in `src/lib/data/tasks.json`. Based on the research findings:

```
computer_vision/image_classification:   edgeMaturity: "excellent", edgeNotes: "MobileNet and EfficientNet models under 20MB run in real-time on mobile via TensorFlow.js and Transformers.js"
computer_vision/object_detection:       edgeMaturity: "excellent", edgeNotes: "COCO-SSD (~7MB) and YOLOS-Tiny (~8MB) provide real-time detection. MediaPipe solutions under 10MB"
computer_vision/semantic_segmentation:  edgeMaturity: "good",      edgeNotes: "DeepLab and MediaPipe segmenter under 20MB work well. Finer-grained models need more resources"
nlp/text_classification:                edgeMaturity: "excellent", edgeNotes: "DistilBERT (~67MB) and TinyBERT (~8MB) work reliably in-browser via Transformers.js"
nlp/sentiment_analysis:                 edgeMaturity: "excellent", edgeNotes: "Same models as text classification. Pre-trained sentiment models under 70MB"
nlp/text_generation:                    edgeMaturity: "limited",   edgeNotes: "Needs WebGPU. Smallest usable: Qwen2.5-0.5B (~500MB q4). Good quality needs 3B+ (~1.8GB)"
nlp/named_entity_recognition:           edgeMaturity: "good",      edgeNotes: "DistilBERT-NER and GLiNER-small under 70MB work via Transformers.js"
nlp/code_assistant:                     edgeMaturity: "limited",   edgeNotes: "Smallest usable: Qwen2.5-Coder-0.5B (~500MB q4). Decent quality needs 3B+. WebGPU required"
nlp/embedding:                          edgeMaturity: "excellent", edgeNotes: "MiniLM (~23MB) and BGE-Small (~25MB) are production-proven in-browser. This app uses MiniLM"
nlp/translation:                        edgeMaturity: "limited",   edgeNotes: "Bilingual pairs work with MarianMT models (~300MB). General translation needs larger models"
nlp/summarization:                      edgeMaturity: "limited",   edgeNotes: "Extractive summarization feasible with small models. Abstractive needs generative models (500MB+)"
nlp/question_answering:                 edgeMaturity: "good",      edgeNotes: "DistilBERT-SQuAD (~261MB) and MiniLM-SQuAD (~127MB) work via ONNX in browser"
speech/speech_recognition:              edgeMaturity: "good",      edgeNotes: "Whisper-tiny.en (~38MB) and Whisper-base.en (~74MB) work well via Transformers.js. WebGPU helps"
speech/text_to_speech:                  edgeMaturity: "emerging",  edgeNotes: "VITS and Bark models exist but browser support is limited. Piper TTS works on-device natively"
time_series/forecasting:                edgeMaturity: "good",      edgeNotes: "Chronos-Bolt-Tiny (~8MB) and TTM (~1MB) are very small. Custom models may need ONNX export"
time_series/anomaly_detection:          edgeMaturity: "good",      edgeNotes: "Lightweight statistical and small ML models work well. Deep learning models may need ONNX export"
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/edge-maturity.test.js
```

Expected: PASS

**Step 5: Run all tests**

```bash
npx vitest run
```

Expected: All pass.

**Step 6: Commit**

```bash
git add src/lib/data/tasks.json tests/edge-maturity.test.js
git commit -m "feat: add edge maturity labels to all task subcategories"
```

---

## Task 5: Add runtime metadata schema and data to models.json

**Files:**
- Modify: `src/lib/data/models.json`
- Create: `tests/runtime-metadata.test.js`

**Step 1: Write the failing test**

```javascript
import { describe, test, expect } from 'vitest';
import modelsData from '../src/lib/data/models.json';
import { TIERS } from '../src/lib/data/constants.js';

describe('Runtime Metadata', () => {
  const validFrameworks = ['transformers.js', 'tensorflow.js', 'mediapipe', 'onnx-runtime-web', 'webllm'];
  const validBackends = ['wasm', 'webgpu', 'webgl', 'webnn'];

  test('models tagged "browser" in lightweight tier should have runtime metadata', () => {
    const missing = [];

    for (const [category, subcats] of Object.entries(modelsData.models)) {
      for (const [subcategory, tiers] of Object.entries(subcats)) {
        const models = tiers.lightweight || [];
        for (const model of models) {
          const hasBrowserTag = (model.deploymentOptions || []).includes('browser');
          if (hasBrowserTag && !model.runtime) {
            missing.push(`${model.id} in ${category}/${subcategory}`);
          }
        }
      }
    }

    expect(missing, `Lightweight browser models without runtime metadata:\n${missing.join('\n')}`).toHaveLength(0);
  });

  test('runtime metadata should have valid structure', () => {
    for (const [category, subcats] of Object.entries(modelsData.models)) {
      for (const [subcategory, tiers] of Object.entries(subcats)) {
        for (const tier of TIERS) {
          const models = tiers[tier] || [];
          for (const model of models) {
            if (model.runtime) {
              // runtime should have at least one target
              const targets = Object.keys(model.runtime);
              expect(targets.length, `${model.id} runtime has no targets`).toBeGreaterThan(0);

              for (const [target, config] of Object.entries(model.runtime)) {
                expect(config.framework, `${model.id} runtime.${target} missing framework`).toBeDefined();
                expect(typeof config.tested, `${model.id} runtime.${target} missing tested flag`).toBe('boolean');
              }
            }
          }
        }
      }
    }
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/runtime-metadata.test.js
```

Expected: FAIL — no models have `runtime` metadata yet.

**Step 3: Add runtime metadata to browser-tagged lightweight models**

Add a `runtime` object to each browser-tagged model in the lightweight tier. Example for a known Transformers.js model:

```json
{
  "id": "xenova-all-minilm-l6-v2",
  "runtime": {
    "browser": {
      "framework": "transformers.js",
      "backend": ["wasm"],
      "tested": true
    }
  }
}
```

Focus on the models identified in the research as verified browser-runnable. Use `"tested": true` only for models confirmed working, `"tested": false` for theoretical compatibility.

Priority models to add runtime metadata for (from research appendix E):
- All Xenova/* and onnx-community/* models (Transformers.js)
- EfficientNet B0, MobileNet variants (TensorFlow.js)
- YOLOS-Tiny, YOLOS-Small (Transformers.js)
- Whisper variants (Transformers.js)
- MiniLM, DistilBERT, TinyBERT variants (Transformers.js)
- Chronos, TTM time series models (Transformers.js)

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/runtime-metadata.test.js
```

Expected: PASS

**Step 5: Run all tests**

```bash
npx vitest run
```

Expected: All pass.

**Step 6: Commit**

```bash
git add src/lib/data/models.json tests/runtime-metadata.test.js
git commit -m "feat: add runtime metadata to browser-compatible lightweight models"
```

---

## Task 6: Add edge-ready badge to RecommendationDisplay

**Files:**
- Modify: `src/components/RecommendationDisplay.svelte`
- Modify: `tests/integration.test.js`

**Step 1: Write the failing test**

Add to `tests/integration.test.js`:

```javascript
test('browser-tagged lightweight models should have runtime metadata for display', () => {
  const models = modelSelector.getTaskModels('computer_vision', 'image_classification');
  const browserLightweight = models.filter(
    m => m.tier === 'lightweight' && (m.deploymentOptions || []).includes('browser')
  );

  for (const model of browserLightweight) {
    expect(model.runtime, `${model.id} missing runtime metadata`).toBeDefined();
  }
});
```

**Step 2: Run test to verify it passes** (should pass if Task 5 was done correctly)

```bash
npx vitest run tests/integration.test.js
```

Expected: PASS

**Step 3: Add edge-ready badge to RecommendationDisplay.svelte**

In `src/components/RecommendationDisplay.svelte`, add a helper function after the existing `getTierInfo` function (around line 80):

```javascript
function getEdgeReadyInfo(model) {
  if (!model.runtime?.browser) return null;
  const { framework, tested } = model.runtime.browser;
  return {
    label: tested ? 'Edge-Ready' : 'Edge-Compatible',
    class: tested ? 'edge-verified' : 'edge-compatible',
    tooltip: tested
      ? `Verified in-browser via ${framework}`
      : `Potentially runs in-browser via ${framework} (not yet verified)`
  };
}
```

In the markup, add the badge inside the `.badges` div (after the env-badge, around line 172):

```svelte
{@const edgeInfo = getEdgeReadyInfo(model)}
{#if edgeInfo}
  <span
    class="badge edge-badge {edgeInfo.class}"
    title={edgeInfo.tooltip}
  >
    {edgeInfo.label}
  </span>
{/if}
```

Add the CSS for the edge badge:

```css
.edge-badge {
  cursor: help;
  position: relative;
}

.edge-badge.edge-verified {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.edge-badge.edge-compatible {
  background: rgba(148, 163, 184, 0.15);
  color: #94a3b8;
}

.edge-badge[title]:hover::after {
  content: attr(title);
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: #1e293b;
  color: #e2e8f0;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 400;
  white-space: nowrap;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.edge-badge[title]:hover::before {
  content: '';
  position: absolute;
  bottom: calc(100% + 2px);
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: #1e293b;
  z-index: 10;
}
```

**Step 4: Verify visually**

```bash
npx vite dev
```

Open http://localhost:5173, search for an image classification task, and verify "Edge-Ready" badges appear on browser-tagged models.

**Step 5: Run all tests**

```bash
npx vitest run
```

Expected: All pass.

**Step 6: Commit**

```bash
git add src/components/RecommendationDisplay.svelte tests/integration.test.js
git commit -m "feat: add edge-ready badge to model cards"
```

---

## Task 7: Update hero text and environmental messaging

**Files:**
- Modify: `src/routes/+page.svelte`

**Step 1: Update the hero section**

In `src/routes/+page.svelte`, update lines 203-251.

Change the `<title>` tag (line 204):
```svelte
<title>AI Model Advisor — Find AI That Runs Without a Server</title>
```

Change the meta description (line 205):
```svelte
<meta name="description" content="Find AI models you can run in the browser, on mobile, or at the edge. No server required." />
```

Change the hero subtitle (lines 224-226):
```svelte
<p class="hero-subtitle">
  Find <em>AI models you can run</em> in the browser, on mobile, or at the edge — no server required.
</p>
```

Change the disclaimer card content (lines 245-249):
```svelte
<p>
  <strong>Run AI without a server.</strong>
  We recommend models that can run directly on your device — in the browser, on mobile, or at the edge.
  On-device inference means no data center, no network round-trip, and your data never leaves your device.
  Smaller, specialized models often match larger ones for specific tasks while using far fewer resources.
</p>
```

Change the efficiency banner text in `RecommendationDisplay.svelte` (line 149):
```svelte
<span>Ranked by efficiency — smaller models that run on your device first</span>
```

Change the footer brand text (line 315):
```svelte
<span>AI that runs on your device, not in a data center</span>
```

**Step 2: Run build to verify no errors**

```bash
npx vite build
```

Expected: Build succeeds.

**Step 3: Run all tests**

```bash
npx vitest run
```

Expected: All pass.

**Step 4: Commit**

```bash
git add src/routes/+page.svelte src/components/RecommendationDisplay.svelte
git commit -m "feat: update hero text and messaging for edge/browser AI focus"
```

---

## Task 8: Pre-compute reference embeddings at build time

**Files:**
- Create: `scripts/precompute-embeddings.js`
- Create: `src/lib/data/reference-embeddings.json` (generated)
- Modify: `src/lib/classification/EmbeddingTaskClassifier.js`
- Create: `tests/precomputed-embeddings.test.js`
- Modify: `package.json`

**Step 1: Write the test for pre-computed embeddings**

```javascript
import { describe, test, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';

describe('Pre-computed Embeddings', () => {
  test('reference-embeddings.json should exist after generation', async () => {
    const embeddingsPath = resolve('src/lib/data/reference-embeddings.json');
    // This test passes after running the precompute script
    if (!existsSync(embeddingsPath)) {
      console.warn('reference-embeddings.json not yet generated. Run: npm run precompute-embeddings');
      return;
    }

    const embeddings = (await import('../src/lib/data/reference-embeddings.json', { with: { type: 'json' } })).default;
    expect(embeddings).toHaveProperty('embeddings');
    expect(embeddings).toHaveProperty('modelName');
    expect(embeddings).toHaveProperty('generatedAt');
    expect(Array.isArray(embeddings.embeddings)).toBe(true);
    expect(embeddings.embeddings.length).toBeGreaterThan(100);

    // Each embedding should have the right structure
    const first = embeddings.embeddings[0];
    expect(first).toHaveProperty('text');
    expect(first).toHaveProperty('category');
    expect(first).toHaveProperty('subcategory');
    expect(first).toHaveProperty('embedding');
    expect(Array.isArray(first.embedding)).toBe(true);
    expect(first.embedding.length).toBe(384); // MiniLM L6 v2 dimension
  });
});
```

**Step 2: Create the precompute script**

Create `scripts/precompute-embeddings.js`:

```javascript
/**
 * Pre-compute reference embeddings at build time.
 * Generates a JSON file with embeddings for all task examples in tasks.json,
 * so the browser doesn't need to embed them on first load.
 *
 * Usage: node scripts/precompute-embeddings.js
 */
import { pipeline, env } from '@huggingface/transformers';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

env.allowLocalModels = true;
env.useBrowserCache = false;

async function main() {
  const tasksPath = resolve(__dirname, '../src/lib/data/tasks.json');
  const outputPath = resolve(__dirname, '../src/lib/data/reference-embeddings.json');
  const modelName = 'Xenova/all-MiniLM-L6-v2';

  console.log('Loading tasks data...');
  const tasksData = JSON.parse(readFileSync(tasksPath, 'utf-8'));

  // Extract examples
  const examples = [];
  for (const [category, categoryData] of Object.entries(tasksData.taskTaxonomy)) {
    for (const [subcategory, subcategoryData] of Object.entries(categoryData.subcategories || {})) {
      for (const text of (subcategoryData.examples || [])) {
        examples.push({
          text,
          category,
          subcategory,
          label: categoryData.label
        });
      }
    }
  }

  console.log(`Found ${examples.length} examples to embed.`);
  console.log(`Loading model: ${modelName}...`);

  const embedder = await pipeline('feature-extraction', modelName, { quantized: true });

  console.log('Computing embeddings...');
  const embeddings = [];
  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    const output = await embedder(example.text, { pooling: 'mean', normalize: true });
    embeddings.push({
      text: example.text,
      category: example.category,
      subcategory: example.subcategory,
      label: example.label,
      embedding: Array.from(output.data)
    });

    if ((i + 1) % 50 === 0) {
      console.log(`  ${i + 1}/${examples.length} done`);
    }
  }

  const result = {
    modelName,
    generatedAt: new Date().toISOString(),
    embeddingDimension: 384,
    count: embeddings.length,
    embeddings
  };

  writeFileSync(outputPath, JSON.stringify(result));
  console.log(`Wrote ${embeddings.length} embeddings to ${outputPath}`);
}

main().catch(console.error);
```

**Step 3: Add the npm script to package.json**

In `package.json`, add to the `"scripts"` section:

```json
"precompute-embeddings": "node scripts/precompute-embeddings.js"
```

**Step 4: Run the precompute script**

```bash
npm run precompute-embeddings
```

Expected: Script downloads the MiniLM model (or uses cache), computes ~320 embeddings, writes `src/lib/data/reference-embeddings.json`.

**Step 5: Modify EmbeddingTaskClassifier.js to use pre-computed embeddings**

In `src/lib/classification/EmbeddingTaskClassifier.js`, modify the `initialize` method (lines 59-147) to check for pre-computed embeddings first.

Add at the top of the file (after existing imports):

```javascript
let precomputedEmbeddings = null;
try {
  precomputedEmbeddings = (await import('../data/reference-embeddings.json', { with: { type: 'json' } })).default;
} catch {
  // Pre-computed embeddings not available; will compute at runtime
}
```

Actually, since this is a dynamic import in a module, restructure the initialize method. Replace the embedding computation loop (lines 104-119) with:

```javascript
// Try to load pre-computed embeddings
let precomputed = null;
try {
  const mod = await import('../data/reference-embeddings.json', { with: { type: 'json' } });
  precomputed = mod.default;
} catch {
  // Not available
}

if (precomputed && precomputed.modelName === this.modelName) {
  // Use pre-computed embeddings
  this.referenceEmbeddings = precomputed.embeddings;
  this.metrics.embeddingTimeMs = 0;
} else {
  // Compute embeddings at runtime (fallback)
  const embeddingStartTime = Date.now();
  const examples = this.extractExamples();

  for (const example of examples) {
    const embedding = await this.getEmbedding(example.text);
    this.referenceEmbeddings.push({
      text: example.text,
      category: example.category,
      subcategory: example.subcategory,
      label: example.label,
      embedding
    });
  }

  this.metrics.embeddingTimeMs = Date.now() - embeddingStartTime;
}
```

**Step 6: Run the test**

```bash
npx vitest run tests/precomputed-embeddings.test.js
```

Expected: PASS

**Step 7: Run all tests**

```bash
npx vitest run
```

Expected: All pass.

**Step 8: Build to verify**

```bash
npx vite build
```

Expected: Build succeeds. The reference-embeddings.json gets bundled.

**Step 9: Commit**

```bash
git add scripts/precompute-embeddings.js src/lib/data/reference-embeddings.json src/lib/classification/EmbeddingTaskClassifier.js tests/precomputed-embeddings.test.js package.json
git commit -m "feat: pre-compute reference embeddings at build time for faster first load"
```

---

## Task 9: Add edge maturity display to the UI

**Files:**
- Modify: `src/components/RecommendationDisplay.svelte`
- Modify: `src/routes/+page.svelte`

**Step 1: Pass tasks data to RecommendationDisplay**

In `src/routes/+page.svelte`, add `{tasksData}` as a prop to the RecommendationDisplay component (around line 302):

```svelte
<RecommendationDisplay
  {recommendations}
  {taskCategory}
  {taskSubcategory}
  {isLoading}
  {ensembleInfo}
  {tasksData}
/>
```

**Step 2: Add the prop and maturity display to RecommendationDisplay.svelte**

Add the prop declaration (after line 39):

```javascript
/** @type {Object|null} */
export let tasksData = null;

function getEdgeMaturity(category, subcategory) {
  if (!tasksData?.taskTaxonomy) return null;
  const subcat = tasksData.taskTaxonomy[category]?.subcategories?.[subcategory];
  if (!subcat?.edgeMaturity) return null;

  const maturityStyles = {
    excellent: { label: 'Excellent edge support', class: 'maturity-excellent', color: '#10b981' },
    good:      { label: 'Good edge support', class: 'maturity-good', color: '#3b82f6' },
    limited:   { label: 'Limited edge support', class: 'maturity-limited', color: '#f59e0b' },
    emerging:  { label: 'Emerging edge support', class: 'maturity-emerging', color: '#94a3b8' }
  };

  return {
    ...maturityStyles[subcat.edgeMaturity],
    notes: subcat.edgeNotes,
    level: subcat.edgeMaturity
  };
}
```

In the markup, add a maturity banner after the efficiency banner (after line 150):

```svelte
{@const maturity = getEdgeMaturity(taskCategory, taskSubcategory)}
{#if maturity}
  <div class="maturity-banner {maturity.class}" style="--maturity-color: {maturity.color}">
    <span class="maturity-label">{maturity.label}</span>
    <span class="maturity-notes">{maturity.notes}</span>
  </div>
{/if}
```

Add the CSS:

```css
.maturity-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: color-mix(in srgb, var(--maturity-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--maturity-color) 20%, transparent);
  border-radius: 10px;
  margin-bottom: 1.5rem;
  font-size: 0.875rem;
}

.maturity-label {
  font-weight: 600;
  color: var(--maturity-color);
}

.maturity-notes {
  color: #94a3b8;
}
```

**Step 3: Verify visually**

```bash
npx vite dev
```

Check that searching for various tasks shows the maturity banner with the right level and notes.

**Step 4: Run all tests**

```bash
npx vitest run
```

Expected: All pass.

**Step 5: Commit**

```bash
git add src/components/RecommendationDisplay.svelte src/routes/+page.svelte
git commit -m "feat: display edge maturity level for each task category"
```

---

## Task 10: Update CLAUDE.md, project-status.md, and project-vision.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `project-status.md`
- Modify: `project-vision.md`

**Step 1: Update CLAUDE.md**

Update the Project Overview section to reflect the edge/browser focus. Update the model count and categories. Add the new `runtime` schema to the "Adding a New Model" section. Add `npm run precompute-embeddings` to Quick Commands.

**Step 2: Update project-status.md**

Update the date, mark Phase 2 workstreams as completed, update model counts, note the new features (edge-ready badges, maturity labels, pre-computed embeddings).

**Step 3: Update project-vision.md**

Mark Phase 2 workstreams A, B, C as complete. Update the success metrics with actual numbers achieved.

**Step 4: Run build to verify everything still works**

```bash
npx vite build
```

Expected: Build succeeds.

**Step 5: Commit**

```bash
git add CLAUDE.md project-status.md project-vision.md
git commit -m "docs: update project docs for Phase 2 edge/browser pivot completion"
```

---

## Task 11: Final verification and cleanup

**Files:**
- All modified files

**Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

**Step 2: Build and preview**

```bash
npx vite build && npx vite preview
```

Open http://localhost:4173 and verify:
- Hero text reflects edge/browser focus
- Edge-ready badges appear on appropriate models
- Maturity banner shows for each task category
- Environmental messaging is updated
- All existing functionality works (classification, recommendations, filtering)

**Step 3: Check for any leftover temporary files**

```bash
git status
```

Remove any temporary or untracked files that shouldn't be committed.

**Step 4: Final commit if needed**

If any cleanup was needed, commit it.

---

## Summary

| Task | What | Files | Estimated Effort |
|------|------|-------|-----------------|
| 1 | Install deps, verify baseline | - | Setup |
| 2 | Data quality tests | tests/data-quality.test.js | Small |
| 3 | Fix model data issues | models.json | Medium (manual review) |
| 4 | Edge maturity labels | tasks.json, test | Small |
| 5 | Runtime metadata | models.json, test | Medium (research-backed) |
| 6 | Edge-ready badge UI | RecommendationDisplay.svelte | Small |
| 7 | Hero text and messaging | +page.svelte, RecommendationDisplay.svelte | Small |
| 8 | Pre-compute embeddings | script, classifier, test | Medium |
| 9 | Edge maturity display UI | RecommendationDisplay.svelte, +page.svelte | Small |
| 10 | Update docs | CLAUDE.md, project-status.md, project-vision.md | Small |
| 11 | Final verification | - | Verification |
