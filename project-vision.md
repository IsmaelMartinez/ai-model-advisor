# AI Model Advisor - Project Vision

## Mission
Find AI models you can run in the browser, on mobile, or at the edge — no server required. Focused on sustainability, privacy, and simplicity.

## Core Principles
- **Edge First**: Recommend models that run on the user's device — no data center needed
- **Privacy First**: Runs locally in browser, no external data transmission
- **Environmental Consciousness**: "Smaller is better" — on-device inference eliminates server-side compute entirely
- **Simplicity First**: Prove concept before adding complexity
- **Open Source**: Community-driven development

## Current Status

### ✅ MVP Complete (Phase 1)
- ✅ SvelteKit project structure with static site generation
- ✅ Browser-based embedding classification (MiniLM, 98.3% accuracy)
- ✅ Tiered recommendation engine (Lightweight/Standard/Advanced)
- ✅ Environmental impact scoring (1-3 scale)
- ✅ Model accuracy filtering (50-95% threshold)
- ✅ Lightweight model (~23MB) enables mobile support
- ✅ Automated model dataset updates (daily via GitHub Actions)
- ✅ PWA with offline capability (installable on desktop & mobile)
- ✅ Full accessibility support
- ✅ 152 curated models across 4 categories, 10 subcategories

**Live**: https://ismaelmartinez.github.io/ai-model-advisor

---

## Roadmap

### Phase 1: MVP ✅ Complete
**Goals**: PWA with tiered recommendations and environmental scoring

**Achieved**:
- <1 second to recommendations (target was <30s)
- 4 AI task categories, 10 subcategories, 98.3% classification accuracy
- ~40KB bundle size (target was <2MB)
- Full accessibility support
- Mobile & desktop PWA support
- Daily automated model updates from Hugging Face

---

### Phase 2: Refocus on Edge/Browser AI ✅ Complete

**Goal**: Sharpen the project's identity around edge-deployable models. Reposition from "general AI model advisor" to "find AI you can run without a server."

**Why now**: The edge AI ecosystem has matured — Transformers.js v4 supports ~200 architectures, WebGPU is broadly available, and small models (1-4B) are closing the quality gap. No tool answers: *"I want to do [task X] without a cloud API — what are my options?"* See [edge-browser-ai-direction.md](docs/research/edge-browser-ai-direction.md) for full analysis.

Phase 2 is organized into **three parallel workstreams** plus one independent optimization:

#### Workstream A: Data & Metadata Enhancement ✅
*Can run independently — no UI or build changes needed*

1. **Tag models with verified edge runtime support** — Add `runtime` metadata (framework, backend, tested/untested) to the top 40-50 edge-compatible models already in the database
2. **Add task maturity labels** — Classify each subcategory as "excellent", "good", "limited", or "emerging" for edge deployment (see research doc Appendix tables)
3. **Curate for deployability** — Surface edge-compatible models first; de-emphasize models requiring dedicated GPU servers (keep them accessible, just deprioritized)
4. **Expand edge model coverage** — Add verified browser-runnable models from Transformers.js, TensorFlow.js, MediaPipe, and WebLLM ecosystems

#### Workstream B: UX & Messaging Refresh ✅
*Can run in parallel with Workstream A*

1. **Update positioning and copy** — Hero text, descriptions, and environmental messaging to reflect edge/browser focus
2. **"Edge-Ready" badge** — Visual indicator on models with verified browser/mobile support
3. **Structural environmental story** — Frame on-device AI as an architecture choice: no data center, no network round-trip, amortized hardware, privacy bonus
4. **Honest task maturity display** — Show users which tasks are well-supported at the edge vs. experimental

#### Workstream C: Build-Time Optimization ✅
*Fully independent — can run in parallel with A and B*

1. **Pre-compute reference embeddings** — Distill the ~320 reference example embeddings at build time into a static JSON file, so the browser skips embedding them on first load. Cuts initial classification latency significantly.

#### Workstream D: Cross-Browser & Testing ✅
*Can start in parallel, but benefits from A completing first*

1. **Cross-browser testing** — Validate Firefox, Safari, Edge support
2. **Fix any edge cases** — Address test failures found during broader browser testing
3. **Improve test coverage** — Add tests for new runtime metadata and edge-ready flags

**Parallelism map:**
```
         ┌─── A: Data & Metadata ───────────────┐
         │                                       │
Start ───┼─── B: UX & Messaging ────────────────┼──→ Phase 2 Complete
         │                                       │
         ├─── C: Build-Time Embeddings ──────────┤
         │                                       │
         └─── D: Cross-Browser (start early, ────┘
                  benefits from A finishing)
```

---

### Phase 3: Make It Actionable

**Goal**: Turn recommendations into starting points for implementation.

*Depends on Phase 2 data work being complete.*

1. **Code snippets** — "Get started" snippets for Transformers.js, ONNX Runtime Web, TensorFlow.js for each recommended model
2. **Runtime comparison** — Side-by-side framework comparison showing which runtimes support each model
3. **Performance estimates** — Cold start time, inference latency, memory footprint from community benchmarks and our own testing
4. **"Can I Run This?" feature** — Input a model name or Hugging Face URL → get an edge deployment feasibility report (estimated browser memory, compatible runtimes, quantization options, WebGPU vs WASM expectations)

---

### Phase 4: Community & Ecosystem

**Goal**: Build the dataset that makes this tool indispensable.

1. **Community-reported benchmarks** — Users submit real-world performance data for models they've tested
2. **Automated compatibility testing** — CI job that tests top models in headless Chrome to verify browser runnability
3. **Framework update tracking** — Monitor Transformers.js, ONNX Runtime Web releases for new model support
4. **Expanded model coverage** — Systematically test and add models from HF Hub that have ONNX/WASM exports

---

## Technical Architecture

```
User Input → Embedding Classification (MiniLM) → Model Selection → Environmental Scoring → Recommendations
```

**Fallback Chain**: Embedding Similarity → Semantic Matching → Keyword Matching → Default Category

## Success Metrics
- **Speed**: <1 second query to recommendation ✅
- **Accuracy**: 98.3% classification accuracy ✅
- **Performance**: ~40KB bundle, <1s load time ✅
- **Mobile Ready**: ~23MB model, PWA installable ✅
- **Edge models with runtime data**: 25+ models with verified runtime metadata ✅
- **Code snippet coverage**: 0% → 80% of recommended models (Phase 3 target)
- **Adoption**: Target 2,000+ monthly users within 6 months of Phase 2 launch

## Contributing
1. Test with real use cases
2. Curate model data (especially edge runtime metadata)
3. Improve algorithms
4. Report browser compatibility findings
5. Promote sustainability focus

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Documentation
- [project-status.md](project-status.md) - Detailed current status
- [docs/](docs/) - Technical documentation and ADRs
- [docs/research/edge-browser-ai-direction.md](docs/research/edge-browser-ai-direction.md) - Edge/browser pivot analysis
- [CLAUDE.md](CLAUDE.md) - AI assistant configuration

## Impact Goals
Help developers find and deploy AI models that run on their users' devices — eliminating server-side compute, protecting user privacy, and reducing the environmental footprint of AI inference.
