# Phase 2 Design: Refocus on Edge/Browser AI

Date: 2026-03-09
Status: Approved
References: docs/research/edge-browser-ai-direction.md, project-vision.md

## Context

The AI Model Advisor MVP is live with 153 models across 4 categories. Phase 2 pivots the project from "general AI model advisor" to "edge/browser AI advisor" — answering "what AI can I run without a server?" Research validates this direction: no competing tool exists, the Transformers.js ecosystem has 2,734 browser-compatible models, and developer pain around edge model discovery is well-documented.

## Approach: Data Cleanup First, Then Edge Metadata

Phase 2 is split into a prerequisite cleanup step followed by the four parallel workstreams from the project vision. The cleanup is essential because the current model database has data quality issues that would undermine any edge-readiness claims.

### Step 0: Data Quality Fix (prerequisite)

The automated HuggingFace scraper has introduced several problems that need fixing before edge metadata can be added reliably.

Problem 1 — incorrect model sizes: Some LLMs appear in the lightweight tier at impossibly small sizes (e.g. 8B-parameter models listed at 100MB). These are likely quantized variant sizes or scraper errors that need manual verification.

Problem 2 — framework/deployment tag mismatches: 38 models are tagged "browser" in deploymentOptions, but most only list PyTorch and TensorFlow in their frameworks array. Only 3 list Transformers.js and 1 lists TensorFlow.js. A model tagged "browser" with only "PyTorch" as its framework is misleading.

Problem 3 — missing browser tags: Some small models with known ONNX exports (Xenova/* or onnx-community/* huggingFaceIds) aren't tagged "browser" when they should be.

The fix involves a single pass through models.json to correct sizes, align framework fields with deployment tags, and validate that "browser"-tagged models have at least one browser-compatible framework listed.

### Workstream A: Data and Metadata Enhancement

Add a `runtime` metadata object to models that are verified edge-compatible. This is the core data that everything else depends on.

New schema per model (additive, existing fields unchanged):

```json
{
  "runtime": {
    "browser": {
      "framework": "transformers.js",
      "backend": ["wasm", "webgpu"],
      "tested": true
    },
    "mobile": {
      "framework": "TensorFlow Lite",
      "tested": false
    }
  },
  "quantization": "q4",
  "edgeMaturity": "excellent"
}
```

Task maturity labels per subcategory (added to tasks.json):

```json
{
  "image_classification": {
    "edgeMaturity": "excellent",
    "edgeNotes": "MobileNet/EfficientNet models under 20MB, real-time on mobile"
  }
}
```

Maturity levels based on the research: "excellent" (rich ecosystem, multiple sub-50MB models, verified working), "good" (working models, some size constraints), "limited" (feasible but needs WebGPU, 500MB+), "emerging" (experimental, few options).

Target: 40-50 models with verified runtime metadata, all 10 subcategories with maturity labels.

### Workstream B: UX and Messaging Refresh

Update the UI to surface edge readiness. Changes to the Svelte components:

1. "Edge-Ready" badge on models with `runtime.browser.tested === true` in RecommendationDisplay.svelte
2. Task maturity indicator when displaying classification results — show users whether their task is well-supported at the edge
3. Updated hero text and environmental messaging in +page.svelte to reflect the "no server required" positioning
4. Structural environmental story: frame edge AI as "no data center, no network round-trip, data stays on your device"

No architectural changes needed — this is all UI copy and conditional rendering based on the new metadata fields.

### Workstream C: Build-Time Embedding Pre-computation

Pre-compute the ~320 reference example embeddings at build time into a static JSON file so the browser skips embedding them on first load.

This involves a build script that runs the MiniLM model against all examples in tasks.json, produces a JSON file with pre-computed vectors, and EmbeddingTaskClassifier.js loads these instead of computing them. Cuts initial classification latency significantly on first visit.

### Workstream D: Cross-Browser Testing

Validate the app works on Firefox, Safari, and Edge. Fix any issues found. Add tests for the new runtime metadata and edge-ready flags. Benefits from Workstream A completing first (more data to validate against).

## What Does NOT Change

All 153 current models stay in the database. Cloud/server models are not removed — they're deprioritized in the ranking when edge-compatible alternatives exist. The ModelSelector "smaller is better" algorithm stays. The classification pipeline (MiniLM embeddings) stays. The PWA, accessibility, and static deployment architecture all stay.

## Execution Order

```
Step 0: Data cleanup ──→ Workstream A: Runtime metadata ──┐
                         Workstream B: UX refresh ─────────┼──→ Phase 2 done
                         Workstream C: Pre-compute embeds ─┤
                         Workstream D: Cross-browser tests ┘
```

Step 0 must complete first. Workstreams A-D can then run in parallel, though B benefits from A's data and D benefits from A completing.

## Success Criteria

- Zero models with incorrect sizes in the database
- All "browser"-tagged models have a browser-compatible framework listed
- 40-50 models with verified runtime metadata
- All 10 subcategories have edge maturity labels
- Pre-computed embeddings ship at build time (Workstream C)
- App works on Chrome, Firefox, Safari, Edge (Workstream D)
- Updated positioning visible on live site
