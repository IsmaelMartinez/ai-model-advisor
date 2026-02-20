# Research: Repositioning as an Edge/Browser AI Advisor

**Date**: 2026-02-20
**Status**: Draft - For Discussion
**Author**: Development Team

## Executive Summary

The AI Model Advisor has a working MVP that recommends environmentally efficient models across all deployment targets. This document evaluates **narrowing the scope to edge and browser AI** — answering the question: *"What AI can I run without a server?"*

This pivot sharpens the project's identity, aligns with the existing "smaller is better" philosophy, and targets a fast-growing niche where no good tooling exists today.

---

## The Problem with the Current Scope

### What we have
A general-purpose AI model recommender covering 169 models across 4 categories, all deployment targets (browser, mobile, edge, cloud, server), and all size tiers (23MB to 70B+).

### Why it's fuzzy
1. **Competing with everything**: Hugging Face, Papers With Code, and dozens of model leaderboards already help people pick cloud models. We offer a subset of their data with an environmental spin.
2. **Mixed audience**: Someone deploying a 70B model on A100s has fundamentally different needs than someone running inference in a browser tab. Serving both dilutes the UX.
3. **Environmental scoring is too coarse**: A 3-point scale (low/medium/high) based on size alone doesn't tell users much they couldn't guess themselves.

### The missed opportunity
Our **strongest technical asset** — a 23MB MiniLM classifier running entirely in the browser with 98.3% accuracy — is itself a proof of what edge AI can do. The app demonstrates the thesis it should be selling.

---

## The Proposed Direction

### New positioning
> **AI Model Advisor: Find AI models you can run in the browser, on mobile, or at the edge — no server required.**

### Core question we answer
*"I want to do [task X] without sending data to a cloud API. What are my options?"*

### Why this works

| Factor | Current (General) | Proposed (Edge/Browser) |
|--------|-------------------|------------------------|
| **Competition** | Hugging Face, Papers With Code, dozens more | Almost nothing dedicated |
| **Audience clarity** | Vague ("anyone picking a model") | Sharp ("devs shipping client-side AI") |
| **Alignment with tech** | We run in the browser... like some of our recommendations | We run in the browser, recommending browser-runnable models |
| **Environmental story** | "Smaller is better" as a preference | "No server = no data center" as a structural advantage |
| **Actionability** | "Here's a model name, go figure it out" | "Here's a model, here's the framework, here's a code snippet" |

---

## What Changes (and What Doesn't)

### Stays the same
- SvelteKit + Vite + static deployment
- MiniLM embedding classifier (it's already edge AI)
- "Smaller is better" ranking algorithm
- PWA, accessibility, offline support
- GitHub Pages deployment

### Changes

#### 1. Model Database: Curate for Edge Deployability

**Current state** (from `models.json`):
- 169 total models
- ~40 tagged with "browser" deployment
- ~73 tagged with "edge"
- ~34 tagged with "mobile"
- Many models listed have no realistic edge deployment path (e.g., 70B LLMs)

**Proposed**:
- Primary focus on models ≤500MB (current "lightweight" tier) that have verified edge runtime support
- Secondary coverage of models ≤2GB that work on-device with quantization
- Drop or de-emphasize models that require dedicated GPU servers
- Add new metadata fields:

```json
{
  "id": "xenova-all-minilm-l6-v2",
  "name": "MiniLM L6 v2",
  "huggingFaceId": "Xenova/all-MiniLM-L6-v2",
  "sizeMB": 23,
  "quantization": "fp32",
  "runtime": {
    "browser": {
      "framework": "transformers.js",
      "backend": ["wasm", "webgpu"],
      "coldStartMs": 800,
      "inferenceMs": 2,
      "tested": true
    },
    "mobile": {
      "framework": "TensorFlow Lite",
      "tested": false
    },
    "edge": {
      "framework": "ONNX Runtime",
      "tested": false
    }
  },
  "environmentalScore": 1,
  "lastUpdated": "2026-02-20"
}
```

#### 2. Runtime Information: From Model Names to Deployment Guidance

The biggest gap in the current output is actionability. Users get a model name and a Hugging Face link. For edge AI, they need to know:

- **Which runtime?** Transformers.js, ONNX Runtime Web, TensorFlow.js, MediaPipe, WebLLM
- **Which backend?** WASM, WebGPU, WebNN (emerging)
- **What's the real performance?** Cold start time, inference latency, memory footprint
- **Does it actually work?** Verified vs. theoretical browser compatibility

**Proposed output enhancement** — each recommendation includes:
- Runtime compatibility matrix (which frameworks support this model)
- Estimated cold start and inference time in-browser
- Code snippet for the primary framework
- Known limitations (e.g., "WebGPU only", "no Safari support")

#### 3. Environmental Story: Structural, Not Just Comparative

**Current**: "This model is 75MB so it scores 1/3 on environmental impact."

**Proposed**: Frame edge AI as an environmental architecture choice:
- **No data center**: Running inference on the user's device eliminates server-side compute entirely
- **No network round-trip**: No data transmission energy cost
- **Amortized hardware**: The user's device is already powered on
- **Privacy bonus**: Data never leaves the device

This makes the environmental message structural rather than just "pick the smaller number."

#### 4. Task Taxonomy: Refine for Edge-Realistic Tasks

Not every AI task is realistic at the edge today. The taxonomy should reflect this honestly.

**Well-supported edge tasks** (rich model ecosystem):
| Task | Edge Maturity | Key Models |
|------|--------------|------------|
| Image Classification | Excellent | MobileNet, EfficientNet, ViT-Tiny |
| Object Detection | Good | YOLO-NAS, MobileDet, NanoDet |
| Text Classification | Excellent | DistilBERT, MiniLM, TinyBERT |
| Sentiment Analysis | Excellent | Same as text classification |
| Embeddings/Search | Good | MiniLM, BGE-Small, all-MiniLM |
| Speech Recognition | Good | Whisper Tiny/Base, Sherpa-ONNX |
| Text-to-Speech | Emerging | Piper, Coqui TTS (small) |

**Harder at the edge** (should be flagged honestly):
| Task | Edge Maturity | Challenge |
|------|--------------|-----------|
| Text Generation | Limited | Even 1B models need quantization + WebGPU |
| Translation | Limited | Bilingual pairs work; general translation needs larger models |
| Summarization | Limited | Abstractive summarization needs generative models |
| Code Assistant | Very Limited | Smallest usable code models are ~1-3GB quantized |
| Time Series | Varies | Lightweight statistical models work; deep learning models less so |

#### 5. New Feature: "Can I Run This?" Checker

A natural extension: let users input a model name or Hugging Face URL and get a deployment feasibility report:
- Estimated browser memory requirement
- Compatible runtimes (Transformers.js, ONNX Runtime Web, etc.)
- Quantization options to reduce size
- WebGPU vs WASM performance expectations
- "Try it now" button for models with Transformers.js support

This is a unique feature no other tool offers.

---

## Market Context

### Who needs this?

1. **Privacy-sensitive applications**: Healthcare, legal, finance — anywhere data can't leave the device
2. **Offline-first products**: Field apps, developing regions, military/government
3. **Cost-sensitive startups**: Inference API costs are a real problem; client-side inference is free at scale
4. **Web developers entering AI**: The fastest-growing segment. They think in terms of npm packages, not CUDA drivers
5. **Mobile developers**: On-device ML is table stakes for modern mobile apps

### What exists today?

| Tool | Focus | Gap |
|------|-------|-----|
| Hugging Face Hub | All models, all sizes | No edge-specific guidance |
| TensorFlow.js Model Gallery | TF.js-compatible models only | Single framework, limited curation |
| ONNX Model Zoo | ONNX-compatible models | No task-based discovery |
| Papers With Code | Research benchmarks | Academic, not deployment-oriented |
| MediaPipe Solutions | Google's pre-built solutions | Closed ecosystem, limited tasks |

**Nobody is answering**: "I need to do [X] on-device — what model should I use, in what framework, and how do I get started?"

### Industry trends supporting this direction

- **WebGPU adoption** (2024-2026): GPU-accelerated inference in browsers is becoming mainstream
- **WebNN specification** (emerging): Native ML acceleration via browser APIs
- **Transformers.js growth**: 300K+ weekly npm downloads, expanding model coverage
- **Apple/Google on-device push**: Core ML, ML Kit driving mobile expectations
- **Regulation** (EU AI Act, GDPR): Data locality requirements favor on-device processing

---

## Implementation Phases

### Phase 1: Refocus (4-6 weeks effort)

**Goal**: Reposition existing MVP without breaking anything.

1. **Filter the model database**: Tag models with verified edge runtime support; surface edge-compatible models first
2. **Add runtime metadata**: Framework, backend, and basic performance data for top 30-40 edge models
3. **Update copy and framing**: Hero text, descriptions, environmental messaging
4. **Add "Edge-Ready" badge**: Visual indicator on models with verified browser/mobile support
5. **Honest task maturity labels**: Show which tasks are well-supported vs. experimental at the edge

**Keeps**: All current models still accessible (just de-prioritized if not edge-friendly).

### Phase 2: Make It Actionable (4-6 weeks effort)

**Goal**: Turn recommendations into starting points for implementation.

1. **Code snippets**: "Get started" snippets for Transformers.js, ONNX Runtime Web, TensorFlow.js
2. **Runtime comparison**: Side-by-side framework comparison for each model
3. **Performance estimates**: Cold start, inference time, memory usage (from community benchmarks + our own testing)
4. **"Can I Run This?" feature**: Input a model name → get edge deployment feasibility

### Phase 3: Community & Data (ongoing)

**Goal**: Build the dataset that makes this tool indispensable.

1. **Community-reported benchmarks**: Users submit real-world performance data
2. **Automated compatibility testing**: CI job that tests top models in headless Chrome
3. **Framework update tracking**: Monitor Transformers.js, ONNX Runtime Web releases for new model support
4. **Expanded model coverage**: Systematically test and add models from HF Hub that have ONNX/WASM exports

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Edge AI ecosystem is still niche | Medium | It's growing fast; early positioning is an advantage, not a risk |
| Model compatibility data is hard to verify | High | Start with "tested" vs "untested" flags; be honest about gaps |
| WebGPU support is inconsistent | Medium | Always show WASM fallback; flag WebGPU-only models |
| Scope creep back to general-purpose | Medium | Strict editorial policy: if it needs a server, it's out of primary scope |
| Transformers.js model coverage gaps | Low | ONNX Runtime Web and TensorFlow.js cover additional models |

---

## What We'd Stop Doing

To maintain focus, some current features would be de-emphasized:

1. **Extra Large tier** (>20GB models): Still listed but clearly marked as "requires server infrastructure"
2. **Server-only deployment options**: No longer a primary recommendation path
3. **Categories with no edge story**: e.g., if a category has zero edge-viable models, be transparent about it rather than recommending server models

---

## Success Metrics

| Metric | Current | Target (6 months) |
|--------|---------|-------------------|
| Monthly users | ~unknown | 2,000+ |
| Models with verified edge runtime data | 0 | 50+ |
| Code snippet coverage | 0% | 80% of recommended models |
| Average session depth | 1 query | 2+ queries |
| "Can I Run This?" usage | N/A | 500+ checks/month |
| Community benchmark submissions | 0 | 50+ |

---

## Decision Framework

### Do this if:
- You want a sharp, defensible niche with low competition
- You believe edge/browser AI will grow significantly (the trends say yes)
- You want the project's technology (browser-based MiniLM) to be the proof of its own thesis
- You want to build something people can't easily get elsewhere

### Don't do this if:
- You want to remain a general-purpose model catalog (competing with HF Hub)
- Your primary users are ML engineers deploying to cloud GPU clusters
- You don't want to maintain runtime compatibility data (it's the hardest part)

---

## Appendix A: Current Edge-Compatible Models in Database

Based on current `models.json` deployment tags:
- **"browser" tagged**: ~40 model entries
- **"edge" tagged**: ~73 model entries
- **"mobile" tagged**: ~34 model entries
- **Edge-friendly frameworks** (Transformers.js, ONNX, TensorFlow.js, TF Lite, MediaPipe): ~16 framework mentions

The overlap between these tags and actual verified browser runnability is unknown — which is exactly the gap this direction would fill.

## Appendix B: Key Edge AI Runtimes

| Runtime | Language | Browser | Mobile | Desktop | Models |
|---------|----------|---------|--------|---------|--------|
| **Transformers.js** | JS | Yes (WASM/WebGPU) | Via WebView | Via Electron | 1000+ HF models |
| **ONNX Runtime Web** | JS | Yes (WASM/WebGPU) | Via WebView | Via Electron | Any ONNX export |
| **TensorFlow.js** | JS | Yes (WebGL/WASM/WebGPU) | Via WebView | Via Node.js | TF model zoo |
| **MediaPipe** | JS/Native | Yes (WASM) | Native SDK | Limited | ~20 pre-built solutions |
| **WebLLM** | JS | Yes (WebGPU required) | Limited | Via Electron | LLM-specific |
| **TensorFlow Lite** | Native | No | Yes (Android/iOS) | No | TF model zoo |
| **Core ML** | Swift | No | Yes (iOS/macOS) | Yes (macOS) | Apple ecosystem |
| **NNAPI/ML Kit** | Kotlin/Java | No | Yes (Android) | No | Android ecosystem |

## Appendix C: Related Prior Research

- `docs/research/browser-slm-learnings.md` — Our evaluation of browser-based SLMs; confirms that small, specialized models outperform large generic ones in-browser
- `docs/adrs/adr-0008-embedding-similarity-classification.md` — Decision to use MiniLM (23MB) over Llama 3.2 1B (500MB); validates the edge-first approach
- `docs/adrs/adr-0004-slm-model-selection.md` — Earlier SLM evaluation work

---

**Next step**: Decide whether to proceed. If yes, Phase 1 can begin immediately — it's mostly editorial work on the existing database and UI copy, with no architectural changes required.
