# Investigation: RuVector as Replacement for MiniLM Embeddings

## Date
2026-02-27

## Status
**Investigated — Not Recommended**

## Summary

This investigation examined whether [RuVector](https://github.com/ruvnet/ruvector), a Rust-based vector database with WASM bindings, could replace or improve upon the current MiniLM embedding classification system in ai-model-advisor. After thorough code inspection of both systems, hands-on package analysis, and comparison with alternatives, **the conclusion is that RuVector is not a suitable replacement and would add complexity without meaningful benefit**.

---

## Current System Analysis

### What We Have (works well)

| Aspect | Value |
|--------|-------|
| **Embedding model** | MiniLM-L6-v2 (Xenova/all-MiniLM-L6-v2) |
| **Model size** | ~23MB (quantized ONNX, cached in IndexedDB) |
| **Accuracy** | 98.3% on task classification |
| **Classification speed** | ~2ms per query |
| **Catalog size** | 169 models across 4 categories, 16 subcategories |
| **Reference examples** | 68 training examples from tasks.json |
| **Embedding dimensions** | 384-dim vectors |
| **Method** | 5-vote weighted ensemble (top-5 cosine similarity) |
| **Fallback chain** | Embedding → Semantic (Jaccard) → Keyword (n-gram) → Priority |

### How Classification Actually Works

1. MiniLM encodes the user's query into a 384-dim vector (~2ms)
2. This vector is compared against 68 pre-computed reference embeddings via cosine similarity
3. Top-5 matches vote (weighted by similarity) for the winning category
4. Result: category + subcategory prediction with confidence score

**The critical insight**: the "search" is over **68 vectors**, not thousands or millions. Computing cosine similarity against 68 vectors of 384 dimensions is ~26K multiply-adds — trivially fast in JavaScript, taking microseconds.

---

## RuVector Package Analysis (Hands-On)

### What RuVector Claims
- Sub-millisecond HNSW vector search via WASM
- Auto-detection of native Rust bindings vs WASM fallback
- 52,000+ inserts/sec, ~50 bytes per vector
- Browser-ready with IndexedDB persistence

### What We Actually Found

#### 1. The "WASM fallback" is a stub

Inspecting `ruvector/dist/index.js` (v0.1.100), the fallback chain is:

```
1. Try @ruvector/core (native Rust N-API bindings) — Node.js only
2. Try @ruvector/rvf (persistent store) — has WasmBackend
3. Fall back to StubVectorDb — returns empty arrays
```

When native bindings aren't available (i.e., in a browser), and `@ruvector/rvf` isn't explicitly installed, the "vector database" is a **stub that returns no results**. The package reports `implementationType = 'wasm'` even when using the stub, which is misleading.

#### 2. @ruvector/core is Node.js only

The `@ruvector/core` package (11.4KB) is a thin loader that `require()`s platform-specific native binaries:
- `ruvector-core-linux-x64-gnu`
- `ruvector-core-darwin-arm64`
- `ruvector-core-win32-x64-msvc`

It uses `process.platform` and `process.arch` — **cannot run in browsers**.

#### 3. @ruvector/rvf-wasm exists but is severely limited

The `@ruvector/rvf-wasm` package contains a real 42KB WASM binary with low-level C-ABI exports (`rvf_store_create`, `rvf_store_query`, etc.). However:

- **Cannot load pre-built indexes from files**: `WasmBackend.open()` and `openReadonly()` throw: *"WASM backend does not support file-based open (in-memory only)"*
- **In-memory only**: Vectors must be inserted at runtime, defeating the purpose of pre-computing
- **Missing features**: `deleteByFilter`, `derive`, `fileId`, `segments` all throw "not supported"
- **No HNSW navigation in the high-level API**: The low-level WASM exports show `rvf_greedy_step` and `rvf_load_neighbors`, but these aren't exposed through the JavaScript SDK

**This breaks the proposed architecture**: The whole premise was "build index offline → ship as static file → load in browser." The WASM backend can't do step 3.

#### 4. The only real WASM binary is for ONNX embeddings

The main `ruvector` package includes `ruvector_onnx_embeddings_wasm_bg.wasm` (7.1MB) — this is for **embedding generation**, not vector search. It's essentially a competing approach to the same MiniLM ONNX runtime we already use, but larger (7.1MB vs our transformers.js loader).

#### 5. Package maturity concerns

| Metric | Value | Concern |
|--------|-------|---------|
| npm downloads (all-time) | ~4,500 | Very low |
| Rust crate downloads | ~1,900 | Very low |
| GitHub stars | 77 | Low |
| Contributors | Primarily 1 (rUv) | Bus factor = 1 |
| First npm publish | Late 2025 | Very new |
| 100 versions in ~3 months | Many published minutes apart | Rapid churn, not stable releases |
| Independent benchmarks | None found | Self-reported only |
| Production deployments | None documented | Unvalidated |
| `@ruvector/wasm` package size | 2.8KB | Just a meta-package, no WASM |
| `@ruvector/wasm` entry point | **Missing** | `index.js` declared but not published |
| Contributors | 1 human + AI (claude: 652 commits) | Heavy AI-generated code |
| Open issues | 55 open | Including garbled LLM output (#103), missing binaries (#110) |
| `ruvector-wasm` Rust crate downloads | 107 total | Almost nobody building WASM from source |
| WASM status per project docs | "BLOCKED by architecture" | Core deps (redb, mmap-rs) don't support WASM |

---

## Why RuVector Doesn't Fit ai-model-advisor

### 1. Solving the wrong problem

HNSW (Hierarchical Navigable Small Worlds) is designed for approximate nearest-neighbour search over **millions** of vectors, with O(log n) complexity. Our system searches **68 reference vectors**. A brute-force linear scan over 68 vectors is already sub-millisecond. HNSW adds overhead (graph construction, navigation) that only pays off at scale we don't have.

### 2. Doesn't replace MiniLM

RuVector replaces the *search/ranking* step, not the *embedding generation* step. We'd still need MiniLM (23MB) to embed user queries. The 23MB download — the main cost — remains unchanged. We'd just be swapping a simple `for` loop over 68 vectors for an HNSW index over 68 vectors.

### 3. The pre-built index architecture doesn't work

The proposed workflow was:
1. Build HNSW index offline with model embeddings
2. Export as static file
3. Load in browser WASM

Step 3 fails: the RuVector WASM backend is in-memory only and cannot load serialized indexes. You'd have to insert all vectors at runtime, which is what we already do (but simpler).

### 4. Adds complexity without benefit

| Current System | With RuVector |
|----------------|---------------|
| 1 dependency (transformers.js) | transformers.js + ruvector + @ruvector/rvf + @ruvector/rvf-wasm |
| 23MB download | 23MB + WASM runtime + index file |
| Simple cosine similarity loop | HNSW graph navigation |
| 98.3% accuracy | Same (search method doesn't affect accuracy) |
| ~2ms classification | ~2ms classification (bottleneck is embedding, not search) |

### 5. Bundle size would increase

Current system downloads ~23MB (MiniLM model). Adding RuVector WASM would add the 42KB WASM binary plus the runtime overhead of the RVF SDK, but also the 7.1MB ONNX WASM if using RuVector's embedding generation. For a PWA that prides itself on being lean, this is the wrong direction.

---

## What About "Pre-Training" / Self-Learning?

The task description mentions "pre-training so it knows how to direct to the right model/category." This is worth addressing:

### Current approach is already pre-trained
The 68 reference examples in `tasks.json` ARE the training data. MiniLM was pre-trained on 1 billion sentence pairs. Our system fine-tunes it (implicitly) by choosing which reference examples to compare against. At 98.3% accuracy, there's very little room for improvement.

### RuVector's GNN learning
RuVector offers a GNN (Graph Neural Network) layer that can "learn from queries to improve ranking." In theory:
- You'd log user queries and their correct categories
- Train the GNN offline to re-rank results
- Deploy updated embeddings

In practice:
- We have 4 categories and 16 subcategories — not enough complexity for GNN to add value
- 98.3% accuracy means ~1.7% error rate — the remaining errors are likely genuinely ambiguous queries
- The GNN crate (`ruvector-gnn`) has only 1,700 downloads total and no documented browser deployment
- This would require a training pipeline, data collection, and ongoing maintenance for marginal gain

---

## Alternatives Considered (If We DID Need Better Search)

If the catalog grew to thousands of models and search performance became an issue, these alternatives are more mature:

| Library | Type | Browser WASM | Size | Maturity |
|---------|------|-------------|------|----------|
| [Voy](https://github.com/tantaraio/voy) | k-d tree (Rust→WASM) | Yes, proven | ~75KB gzipped | LangChain integration |
| [EdgeVec](https://dev.to/matteo_panzeri_2c5930e196/building-production-ready-vector-search-for-the-browser-with-rust-and-webassembly-2mhi) | HNSW (Rust→WASM) | Yes, IndexedDB | TBD | New but focused |
| [Orama](https://orama.com/) | Full-text + vector | Yes, pure JS | Small | Production-grade |
| [client-vector-search](https://github.com/yusufhilmi/client-vector-search) | Cosine (JS) | N/A (pure JS) | Tiny | Simple, browser-native |
| Pure JS cosine | Brute force | N/A | 0 | What we already do |

For 169 models / 68 reference embeddings, pure JS cosine similarity (our current approach) is the correct choice.

---

## Recommendation

**Do not adopt RuVector.** The current MiniLM embedding system is:

1. **Accurate** (98.3%) — minimal room for improvement
2. **Fast** (~2ms) — not a bottleneck
3. **Simple** — one dependency, clear fallback chain
4. **Appropriate** — brute-force cosine similarity is optimal for 68 vectors
5. **Proven** — works offline, mobile-friendly, PWA-cached

### When to revisit this decision

- If the model catalog grows beyond **10,000+ models** with diverse descriptions → consider HNSW-based search
- If classification accuracy drops below **95%** with new categories → consider fine-tuning or additional reference examples
- If RuVector reaches **v1.0** with documented browser deployment and independent benchmarks → re-evaluate

### Suggested improvements instead

If classification quality is a concern, higher-impact improvements would be:
1. **Add more reference examples** to `tasks.json` (currently 68, could add more per subcategory)
2. **Add new categories** as the AI landscape evolves (e.g., multimodal, agents)
3. **Test with real user queries** to find edge cases in the 1.7% error rate
4. **Consider upgrading to a slightly larger embedding model** (e.g., MiniLM-L12) if accuracy on new categories is insufficient

---

## References

- [RuVector GitHub](https://github.com/ruvnet/ruvector)
- [RuVector npm](https://www.npmjs.com/package/ruvector)
- [ruvector-core (crates.io)](https://crates.io/crates/ruvector-core)
- [ADR-0008: Embedding Similarity Classification](../adrs/adr-0008-embedding-similarity-classification.md)
- [Voy — WASM vector search](https://github.com/tantaraio/voy)
- [EdgeVec — browser HNSW](https://dev.to/matteo_panzeri_2c5930e196/building-production-ready-vector-search-for-the-browser-with-rust-and-webassembly-2mhi)
- [hnswlib-wasm](https://github.com/shravansunder/hnswlib-wasm)
- [USearch](https://github.com/unum-cloud/USearch)
- [Orama](https://nearform.com/digital-community/browser-based-vector-search-fast-private-and-no-backend-required/)
