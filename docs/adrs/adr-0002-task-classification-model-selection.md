# ADR-0002: Task Classification Model Selection

## Status
Superseded by ADR-0008 (the Hugging Face Inference API tier was never built; classification runs only in the browser)

## Context
The AI Model Advisor MVP requires a task classification system to categorize user-provided task descriptions into appropriate ML/AI categories (computer vision, NLP, etc.). This classification drives the model recommendation engine.

Key requirements:
- Classify text descriptions into 8-12 ML task categories
- Support browser deployment or API access
- Reasonable accuracy for technical task descriptions
- Compatible with MVP constraints (offline-first, <2MB bundle target)
- Fallback mechanisms for reliability

## Decision
We will implement a **hybrid approach** with tiered classification methods:

### Primary: Zero-Shot Classification via Hugging Face API
- **Model**: `facebook/bart-large-mnli` or `MoritzLaurer/DeBERTa-v3-base-mnli-fever-anli`
- **Deployment**: Hugging Face Inference API
- **Use Case**: High-accuracy classification for online scenarios

### Secondary: Client-Side Semantic Similarity  
- **Model**: `all-MiniLM-L6-v2` sentence transformer
- **Deployment**: Browser-based with pre-computed category embeddings
- **Use Case**: Offline fallback with good generalization

### Tertiary: Keyword-Based Fallback
- **Implementation**: Simple keyword matching against predefined patterns
- **Use Case**: Ultimate fallback when other methods fail

## Consequences

### Positive:
- **High Accuracy**: Zero-shot classification provides excellent results for complex task descriptions
- **Offline Capability**: Semantic similarity matching works without internet
- **Reliability**: Multiple fallback layers ensure system always provides results
- **Scalability**: Easy to add new categories without retraining
- **Privacy**: Client-side options don't send data to external services

### Negative:
- **API Dependency**: Primary method requires Hugging Face API access and key
- **Complexity**: Multiple classification methods increase implementation complexity
- **Bundle Size**: Sentence transformer models add ~10-15MB to bundle
- **Latency**: API calls introduce network dependency and latency

## Alternatives Considered

**Pure Client-Side Transformers.js**: Rejected due to 60+ MB model size
**OpenAI/Anthropic APIs**: Rejected due to cost and vendor lock-in  
**Pure Keyword Matching**: Retained as final fallback only

## Implementation
1. Hugging Face API integration with error handling
2. Client-side semantic similarity fallback
3. Keyword pattern matching as ultimate fallback