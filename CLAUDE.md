# Claude Configuration - AI Model Advisor

## Project Overview

**Mission:** Build sustainable AI by helping users choose environmentally efficient models ("smaller is better" philosophy)

**Live:** https://ismaelmartinez.github.io/ai-model-advisor
**Status:** MVP Complete ✅ + PWA Support (98.3% accuracy, installable)
**Tech:** SvelteKit 2 + Vite 5 + Transformers.js (MiniLM embedding classifier, 23MB)
**Platform:** Desktop & Mobile (PWA installable, ~23MB model download)
**Details:** See `project-status.md`, `project-vision.md`, `README.md`

---

## Quick Commands

```bash
# Development
npm install && npm run dev     # Start dev server (localhost:5173)
npm run build && npm run preview  # Build + preview production

# Testing
npm test                       # Run tests (~2s) - Use for CI

# Data
npm run update-models          # Update model database from HuggingFace
npm run update-models:dry-run  # Preview updates
```

---

## Core Architecture

### Key Files

**Application Core:**
- `src/routes/+page.svelte` - Main UI and application logic
- `src/lib/recommendation/ModelSelector.js` - "Smaller is better" ranking algorithm
- `src/lib/classification/EmbeddingTaskClassifier.js` - MiniLM embeddings (23MB, 98.3% accuracy)
- `src/lib/environmental/EnvironmentalImpactCalculator.js` - Environmental scoring (1-3 scale)

**Data:**
- `src/lib/data/models.json` - Model database (7 categories, 3 tiers: lightweight/standard/advanced)
- `src/lib/data/tasks.json` - Task taxonomy with keywords

**Config:**
- `vite.config.js` - WebGPU headers, transformers.js exclusions
- `svelte.config.js` - Static adapter for GitHub Pages
- `.github/workflows/deploy.yml` - Auto-deploy on push to main

### Classification Pipeline

**Embedding Mode with Voting** (default, ~2ms):
1. **MiniLM Embeddings** (Primary) → Sentence similarity with 5-vote consensus (98.3% accuracy)
2. **Semantic** (Fallback 1) → N-gram matching with keywords
3. **Keyword** (Fallback 2) → Direct lookup
4. **Default** (Final) → Returns natural_language_processing

**Model Download:**
- ~23MB on first visit (cached in IndexedDB)
- Instant on subsequent visits
- Works on mobile devices

### Environmental Scoring

| Score | Size | Label | Priority |
|-------|------|-------|----------|
| 1 (Low) | ≤500MB | Low Impact | Highest |
| 2 (Medium) | ≤4GB | Medium Impact | Medium |
| 3 (High) | >4GB | High Impact | Lowest |

Implementation: `src/lib/environmental/EnvironmentalImpactCalculator.js`

---

## Development Workflows

### Standard Flow
```bash
git checkout -b feature/your-feature
npm run dev              # Develop with hot reload
npm test                 # Run fast tests
npm run build            # Verify build
git commit -m "feat: ..." && git push
```

### Adding Models
1. Edit `src/lib/data/models.json` (follow category → subcategory → tier structure)
2. Run `npm test` to validate
3. Check UI with `npm run dev`

Reference: See "Adding a New Model" in this file or `docs/model-curation-process.md`

### Adding Categories
1. Edit `src/lib/data/tasks.json` (add keywords and examples)
2. Edit `src/lib/data/models.json` (create tier structure)
3. Add tests in `tests/integration.test.js`

---

## Critical Conventions

### 1. "Smaller is Better" Philosophy
**Always prioritize lightweight models** - See `ModelSelector.rankBySize()` in `src/lib/recommendation/ModelSelector.js`

Ranking: lightweight tier > standard tier > advanced tier (within tier, smaller first)

### 2. Testing Strategy
- **CI/CD:** Run `npm test` for all tests (~2s)
- Tests cover acceptance, integration, accuracy filtering, and code assistant workflows

### 3. Static-First Architecture
- No backend/API calls during runtime
- All ML runs in browser (transformers.js)
- Target: <50KB bundle, <1s load time
- **PWA Enabled:** Installable on desktop & mobile, works offline after first visit

### 4. Accessibility Required
- Full keyboard navigation (Tab, Enter, Ctrl+Enter)
- ARIA labels and live regions
- Screen reader support
- Reference: `src/routes/+page.svelte` for patterns

### 5. WebGPU Configuration
**Required in vite.config.js:**
```javascript
headers: {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin'
},
optimizeDeps: {
  exclude: ['@huggingface/transformers']
}
```
*Do not modify - breaks WASM loading and WebGPU acceleration*

---

## Code Style

**Naming:**
- Components: PascalCase (TaskInput.svelte)
- Functions: camelCase (calculateScore)
- Constants: UPPER_SNAKE_CASE (MAX_SIZE_MB)

**Svelte Components:**
```svelte
<script>
  // Imports → Props → State → Reactive ($:) → Functions → Lifecycle
</script>
<!-- Markup -->
<style>/* Component styles */</style>
```

**Testing:**
```javascript
describe('Module', () => {
  test('should behavior', () => {
    // Arrange → Act → Assert
  });
});
```

---

## Common Tasks

### Adding a New Model
```json
// In src/lib/data/models.json under appropriate category/subcategory/tier:
{
  "id": "unique-id",
  "name": "Model Name",
  "huggingFaceId": "org/model-name",
  "sizeMB": 75,
  "accuracy": 0.92,
  "environmentalScore": 1,
  "deploymentOptions": ["browser"],
  "frameworks": ["transformers.js"],
  "lastUpdated": "2025-01-15"
}
```

### Debugging Classification
1. Check browser console for LLM initialization
2. Verify input length (10-500 chars)
3. Test with keywords from `src/lib/data/tasks.json`
4. Check fallback chain in `BrowserTaskClassifier.js`

### Deployment
**Auto:** Push to `main` → GitHub Actions builds → GitHub Pages deploys
**Manual:** `npm run build` → Upload `dist/` to any static host

---

## Key Principles for AI Assistants

1. **Environmental Focus** - Prioritize smaller, efficient models always
2. **Maintain 98.3% Accuracy** - Test against LLM suite before committing classification changes
3. **Accessibility First** - Keyboard navigation and screen readers are required
4. **Static & Fast** - No APIs, <50KB bundle, client-side processing only
5. **Test Smart** - Run `npm test` before commits
6. **Document Decisions** - Create ADRs in `docs/adrs/` for architectural changes
7. **Progressive Enhancement** - PWA support, multiple browsers with graceful fallbacks

---

## Resources

**Project Docs:**
- `project-status.md` - Current status, test results, known issues
- `project-vision.md` - Mission, roadmap, success metrics
- `docs/adrs/` - Architecture Decision Records
- `docs/environmental-methodology.md` - Impact calculation details
- `docs/model-curation-process.md` - Data curation guide

**External:**
- [SvelteKit](https://kit.svelte.dev/docs) | [Vite](https://vitejs.dev/) | [Transformers.js](https://huggingface.co/docs/transformers.js) | [Vitest](https://vitest.dev/)

---

**Last Updated:** 2025-12-18
**License:** MIT
