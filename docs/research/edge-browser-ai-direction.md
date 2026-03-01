# Research: Repositioning as an Edge/Browser AI Advisor

**Date**: 2026-02-20 (updated 2026-03-01 with verified research)
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

**Well-supported edge tasks** (rich model ecosystem, verified Feb 2026):
| Task | Edge Maturity | Key Models | Browser Size |
|------|--------------|------------|-------------|
| Image Classification | Excellent | MobileNet (~8-16MB), EfficientNet-Lite0, ViT-Tiny | <20MB |
| Object Detection | Excellent | COCO-SSD (~7MB), EfficientDet-Lite0/2, NanoDet | <15MB |
| Text Classification | Excellent | DistilBERT (~67MB), MiniLM (~23MB), TinyBERT | <70MB |
| Sentiment Analysis | Excellent | Same as text classification | <70MB |
| Embeddings/Search | Excellent | all-MiniLM-L6-v2 (~23MB), BGE-Small (~25MB) | <30MB |
| Speech Recognition | Good | Whisper-tiny.en (~38MB), Whisper-base.en (~74MB) | <80MB, WebGPU helps |
| Face/Hand/Pose | Excellent | MediaPipe solutions (<10MB each) | <10MB |
| Semantic Segmentation | Good | DeepLab (TF.js), MediaPipe selfie segmenter | <20MB |
| Named Entity Recognition | Good | DistilBERT-NER, GLiNER-small | <70MB |

**Harder at the edge** (should be flagged honestly, verified Feb 2026):
| Task | Edge Maturity | Challenge | Smallest Viable |
|------|--------------|-----------|-----------------|
| Text Generation | Limited | Even 1B models need q4 quantization + WebGPU; 3B is sweet spot but ~1.8GB | SmolLM2-135M (tiny), Qwen2.5-0.5B (usable) |
| Translation | Limited | Bilingual pairs work with specialized models; general needs generative | ~200MB–1GB for decent quality |
| Summarization | Limited | Abstractive summarization needs generative models; extractive is feasible | ~500MB+ for abstractive |
| Code Assistant | Very Limited | Smallest usable: Qwen2.5-Coder-0.5B (~500MB q4); decent quality needs 3B+ | ~500MB minimum |
| Text-to-Speech | Emerging | Piper TTS works on-device; browser support limited | ~50-200MB |
| Time Series | Varies | Lightweight statistical models work; deep learning less so | Task-specific, small |

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

### Industry trends supporting this direction (verified Feb 2026)

- **WebGPU adoption**: Now in Chrome 113+ (desktop), Chrome 121+ (Android), Safari 26+, Edge, Firefox 141+ (Windows). Broad but fragmented — shader compilation bugs remain on mobile.
- **Transformers.js v3 stable** (120 architectures), **v4 preview** (~200 architectures, Feb 2026): Rapidly expanding model support. 1,200+ models tagged on HuggingFace Hub.
- **WebNN specification** (emerging): Native ML acceleration via browser APIs — not yet widely deployed.
- **On-device AI hardware**: Qualcomm Snapdragon 8 Elite delivers 80+ TOPS NPU; Apple A18 with 16-core Neural Engine; Raspberry Pi AI HAT+ 2 ($130, 40 TOPS) launched Jan 2026.
- **Small model revolution**: Sub-4B models now competitive — Llama 3.2 1B with inference-time compute beats the 8B model; Phi-3.5-mini (3.8B) hits scores that previously required 540B.
- **ExecuTorch 1.0 GA** (Oct 2025): Meta's 50KB-footprint runtime for mobile, 12+ hardware backends.
- **Regulation** (EU AI Act, GDPR): Data locality requirements favor on-device processing.
- **80% of AI inference now happens on edge** — driven by economics (90% cost savings vs. cloud), privacy compliance, and latency requirements.

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

## Appendix B: Key Edge AI Runtimes (Updated Feb 2026)

| Runtime | Language | Browser | Mobile | Desktop | Models | Notes |
|---------|----------|---------|--------|---------|--------|-------|
| **Transformers.js v3/v4** | JS | Yes (WASM/WebGPU) | Via WebView | Via Electron | 1,200+ on HF Hub | v4 adds ~200 architectures, new WebGPU C++ runtime |
| **ONNX Runtime Web** | JS | Yes (WASM/WebGPU/WebNN) | Via WebView | Via Electron | Any ONNX export | 4GB WASM limit; WebGL deprecated |
| **TensorFlow.js** | JS | Yes (WebGL/WASM/WebGPU) | Via WebView | Via Node.js | ~15 pre-built models | Strongest for vision/media; no LLM support |
| **MediaPipe** | JS/Native | Yes (WASM) | Native SDK | Limited | ~20 pre-built solutions | Tiny models (<10MB), production-ready, no flexibility |
| **WebLLM** | JS | Yes (WebGPU required) | Limited | Via Electron | LLMs only | 80% of native MLC-LLM speed; needs 4GB+ VRAM |
| **ExecuTorch** | C++/Python | No | Yes (iOS/Android, 12+ backends) | Yes | Meta ecosystem | 50KB footprint, GA since Oct 2025 |
| **TensorFlow Lite / LiteRT** | Native | No | Yes (Android/iOS) | No | TF model zoo | Google rebranding to LiteRT |
| **Core ML / MLX** | Swift/Python | No | Yes (iOS/macOS) | Yes (macOS) | Apple ecosystem | MLX excellent for M-series Macs |
| **llama.cpp** | C++ | Via wllama (WASM) | Via termux | Yes | GGUF models | De facto standard for CPU inference; ~10-20% faster than Ollama |

## Appendix C: Browser Model Size Limits (Verified Feb 2026)

### Desktop Browser

| Model Size | Experience | Backend Needed |
|------------|-----------|----------------|
| <50MB | Instant load, works everywhere including mobile | WASM fine |
| 50–200MB | Fast with IndexedDB cache. WASM fine for encoder models. | WASM or WebGPU |
| 200MB–1GB | Noticeable first load. WebGPU needed for LLMs. Good UX on desktop. | WebGPU preferred |
| 1–4GB | Long first load (minutes on slow connections). WebGPU required. | WebGPU required |
| >4GB | Hits WASM 32-bit address limit. Requires external data splits. Unreliable. | Not recommended |

### Mobile Browser

| Model Size | Experience |
|------------|-----------|
| <50MB | Works well |
| 50–200MB | Generally fine for encoder models |
| >200MB | LLMs: shader compilation often times out on Android |
| >500MB | Risky; many devices run out of memory or crash |

### Edge/Native Devices

| Platform | Practical Ceiling |
|----------|-------------------|
| Raspberry Pi 5 (8GB, no HAT) | 3B q4 comfortable (4-7 tok/sec), 7B marginal (1-3 tok/sec) |
| Pi 5 + AI HAT+ 2 (40 TOPS) | 3B fast, 7B coming |
| Mid-range phone (8GB RAM) | 1-3B q4 |
| Flagship phone (12GB+ RAM) | 3-7B q4 (Llama 2-7B at 12-18 tok/sec on Snapdragon 8 Gen 3) |
| Laptop no GPU (16GB RAM) | 7B q4 workable (3-8 tok/sec via llama.cpp) |
| Apple M2/M3 (16GB unified) | 13B q4 comfortable (20-40 tok/sec via MLX) |

## Appendix D: WebGPU vs WASM Performance (Verified Feb 2026)

| Metric | WASM | WebGPU | Notes |
|--------|------|--------|-------|
| Matrix multiply (1024×1024) | Baseline | ~50x faster | Microbenchmark, best-case |
| BERT-class inference | Baseline | 3-5x faster | Real-world transformer models |
| LLM inference (WebLLM) | Not viable for LLMs | 71-80% of native speed | Phi-3.5-mini: 71 tok/sec; Llama 3.1-8B: 41 tok/sec |
| Small model (<50MB encoder) | Fine, ~2ms | Overhead not worth it | GPU setup cost exceeds inference time |
| First load shader compilation | N/A | 2-30 seconds | Major UX pain point; cached on subsequent visits |
| Browser support | Universal | Chrome, Edge, Safari 26+, Firefox 141+ (Windows) | Firefox Linux/Android still in progress |

**Key insight**: The "up to 100x faster" claims are from matrix multiply microbenchmarks. Real-world LLM inference sees 5-20x speedup. For small encoder models (<100MB), WASM is often better due to GPU setup overhead.

## Appendix E: Verified Browser-Runnable Models (Feb 2026)

### Transformers.js — Confirmed Working

| Model | Task | Size | Notes |
|-------|------|------|-------|
| `Xenova/all-MiniLM-L6-v2` | Embeddings | ~23MB | **What this project uses.** Rock solid. |
| `Xenova/bge-small-en-v1.5` | Embeddings | ~25MB | Slightly better quality |
| `Xenova/whisper-tiny.en` | ASR | ~38MB | Good with WebGPU |
| `Xenova/whisper-base.en` | ASR | ~74MB | Best accuracy/size tradeoff for ASR |
| DistilBERT variants | NLP (classify, QA, NER) | ~67MB | Reliable, fast on WASM |
| `onnx-community/Qwen2.5-0.5B-Instruct` | Text generation | ~500MB (q4) | Needs WebGPU |
| `onnx-community/Llama-3.2-1B-Instruct-ONNX` | Text generation | ~600MB (q4) | Needs WebGPU, 4-8GB RAM |
| `onnx-community/Qwen3-0.6B-ONNX` | Text generation | ~600MB (q4) | Needs WebGPU |

### TensorFlow.js — Pre-built Models

| Model | Task | Size | Notes |
|-------|------|------|-------|
| MobileNet | Image classification | ~8-16MB | Very fast |
| COCO-SSD | Object detection | ~7MB | Real-time |
| MoveNet/PoseNet | Pose estimation | ~5-10MB | Real-time on mobile |
| Face Landmarks | 486 3D face points | ~5MB | |
| Hand Pose | Hand tracking | ~5MB | Real-time |
| Universal Sentence Encoder | Text embeddings (512-dim) | ~30MB | |
| DeepLab | Semantic segmentation | ~10MB | |

### MediaPipe — Pre-built Solutions

| Solution | Tasks | Size | Notes |
|----------|-------|------|-------|
| Object Detection | EfficientDet-Lite0/2, SSD-MobileNetV2 | <10MB | |
| Image Classification | EfficientNet-Lite0/2 | <10MB | |
| Face Landmarks | 486 points + blendshapes | <5MB | |
| Hand/Pose Landmarks | Real-time tracking | <5MB each | |
| Image Segmentation | Selfie, hair, multi-class | <10MB | |
| Text Classification | General | <5MB | |
| LLM Inference | Gemma 2B/7B, Phi-2, Falcon, StableLM | 1-5GB | On-device, Web + Android + iOS |

### WebLLM — Browser LLMs (WebGPU Required)

| Model | Size (q4) | Min VRAM | Desktop tok/sec | Notes |
|-------|-----------|----------|-----------------|-------|
| SmolLM2-135M | ~100MB | 2GB | ~60+ | Coherent but very limited |
| Qwen2.5-0.5B-Instruct | ~350MB | 2GB | ~40-50 | Usable for simple tasks |
| Llama 3.2-1B | ~600MB | 4GB | ~30-40 | Good for basic tasks |
| Phi-3.5-mini (3.8B) | ~1.8GB | 4GB | ~71 | Sweet spot quality/feasibility |
| Llama 3.1-8B | ~4.5GB | 8GB | ~41 | Needs high-end hardware |

## Appendix F: Related Prior Research

- `docs/research/browser-slm-learnings.md` — Our evaluation of browser-based SLMs; confirms that small, specialized models outperform large generic ones in-browser
- `docs/adrs/adr-0008-embedding-similarity-classification.md` — Decision to use MiniLM (23MB) over Llama 3.2 1B (500MB); validates the edge-first approach
- `docs/adrs/adr-0004-slm-model-selection.md` — Earlier SLM evaluation work

---

**Next step**: Decide whether to proceed. If yes, Phase 1 can begin immediately — it's mostly editorial work on the existing database and UI copy, with no architectural changes required.

**Research validation note (2026-03-01)**: Web research conducted across 8 areas confirms the original direction is sound. Key finding: the 23MB MiniLM model used by this project sits firmly in the "works great everywhere" zone (<50MB). The practical browser ceiling for good UX is ~200MB (WASM) or ~1-2GB (WebGPU, desktop only). The edge AI ecosystem has matured significantly — Transformers.js v4 now supports ~200 architectures, WebGPU is broadly available, and small models (1-4B) are closing the quality gap with much larger ones. The proposed pivot to "edge/browser AI advisor" is well-timed.
