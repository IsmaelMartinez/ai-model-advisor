# ADR-0008: Embedding Similarity Classification

## Status
Accepted (Supersedes ADR-0003 and ADR-0007)

## Date
2025-12-17

## Context

The browser-based LLM classification (ADR-0003) using Llama 3.2 1B achieved 95.2% accuracy but had significant drawbacks:

- **Large model size**: ~500MB download
- **Slow initial load**: 15-30 seconds on first use
- **High memory usage**: ~2GB RAM for inference
- **Complex ensemble**: ADR-0007 added 3x parallel LLM calls for higher accuracy

Research evaluation (`docs/research/rag-classification-evaluation.md` at commit 92d7de6, since removed) concluded that:
1. RAG is overkill for 7 categories
2. Embedding similarity is simpler and more efficient
3. A ~23MB embedding model can match or exceed LLM accuracy

### Validation Spikes Conducted

Four validation spikes were executed to validate the approach:

| Spike | Goal | Result |
|-------|------|--------|
| Model Benchmark | Test MiniLM, BGE, GTE, E5 models | MiniLM best balance of size/accuracy |
| Threshold Calibration | Find 70% confidence cutoff | 0.70 threshold optimal |
| Coverage Analysis | Determine example count needed | ~33 examples per category sufficient |
| Cold Start Performance | Validate load times | <3s desktop, <5s mobile achieved |

## Decision

**Replace Llama 3.2 1B with MiniLM embedding-based k-NN classification.**

### Architecture

```
User Input
    │
    ▼
┌───────────────────┐
│ MiniLM Embedding  │  (~23MB, lazy loaded)
│ Model             │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Cosine Similarity │  Compare with reference examples
│ Calculation       │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ k-NN Voting       │  Top-5 examples vote
│ (k=5)             │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Confidence Check  │  >= 70%? → Show results
│                   │  < 70%? → Clarification flow
└───────────────────┘
```

### Implementation

```javascript
// EmbeddingTaskClassifier.js
const classifier = new EmbeddingTaskClassifier({
  modelName: 'Xenova/all-MiniLM-L6-v2',  // 23MB
  topK: 5,                                // 5 nearest neighbors
  confidenceThreshold: 0.70               // 70% minimum
});

const result = await classifier.classify(taskDescription);
// Returns: { predictions, confidence, votesForWinner, totalVotes }
```

### Classification Modes

| Mode | Top-K | Description |
|------|-------|-------------|
| Fast | 1 | Single best match |
| Voting | 5 | 5 examples vote for category |

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/classification/EmbeddingTaskClassifier.js` | Main classifier |
| `src/lib/classification/classifierConfig.js` | Configuration |
| `src/lib/classification/BrowserTaskClassifier.js` | Keyword fallback |

## Consequences

### Positive

1. **20x smaller model**: 23MB vs 500MB
2. **10x faster inference**: ~2ms vs ~400ms
3. **Higher accuracy**: 98.3% with voting (vs 95.2% LLM)
4. **Simpler architecture**: No LLM generation, just similarity
5. **Explainable**: Shows which examples matched
6. **Deterministic**: Same input always gives same output
7. **Browser-friendly**: Lower memory, faster load

### Negative

1. **Fixed vocabulary**: Limited to trained example set
2. **Initial download**: Still requires 23MB model
3. **Less flexible**: Can't handle truly novel phrasings

### Mitigation

1. **Clarification flow**: Low confidence (< 70%) triggers user clarification
2. **Keyword fallback**: Works without model for clear-cut cases
3. **Progressive loading**: Model loads lazily on first uncertain classification

## Performance Comparison

| Metric | Llama 3.2 1B (ADR-0003) | MiniLM (This ADR) |
|--------|-------------------------|-------------------|
| Model Size | ~500MB | ~23MB |
| Load Time | 15-30s | 3-5s |
| Inference | ~400ms | ~2ms |
| Accuracy | 95.2% | 98.3% |
| Memory | ~2GB | ~200MB |
| Ensemble | 3x LLM calls | k-NN voting |

## Alternatives Considered

### Alternative 1: Keep Llama 3.2 1B
**Why Rejected**: Too large, slow, resource-intensive for marginal accuracy gain

### Alternative 2: Full RAG System
**Why Rejected**: Overkill for 7 categories; added complexity without benefit

### Alternative 3: Server-Side Classification
**Why Rejected**: Violates offline-first principle; adds infrastructure cost

### Alternative 4: Enhanced Keyword Rules Only
**Why Rejected**: Can't handle semantic similarity; misses novel phrasings

## Migration

The old LLM classifier (`LLMTaskClassifier.js`) and associated test files have been removed from the codebase. The embedding classifier is now the sole classification mechanism.

## Related Decisions

- **ADR-0003**: Browser-based LLM classification (superseded)
- **ADR-0007**: Ensemble classification mode (superseded)
- **ADR-0006**: Model accuracy filtering (still applies)

## References

- Research: `docs/research/rag-classification-evaluation.md` at commit 92d7de6 (removed from the tree)
- Model: [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2)
- Framework: [Transformers.js](https://huggingface.co/docs/transformers.js)

---

**Decision made**: 2025-12-17
**Status**: Accepted - Implemented
**Supersedes**: ADR-0003, ADR-0007

