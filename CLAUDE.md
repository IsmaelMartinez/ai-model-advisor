# Claude Configuration - AI Model Advisor

## Project Overview

**Mission:** Find AI models you can run in the browser, on mobile, or at the edge, with no server required. Focused on sustainability, privacy and simplicity.

**Live:** https://ismaelmartinez.github.io/ai-model-advisor
**Tech:** SvelteKit 3 + Vite 8 + Transformers.js (MiniLM embedding classifier, about 23 MB, loaded only when "Describe your task" opens)
**Active plan:** `ROADMAP.md` (tracking issue #227). "Continue" means the first unchecked item there.

---

## Quick Commands

```bash
npm install && npm run dev        # Dev server (localhost:5173)
npm run build && npm run preview  # Production build and preview
npm test                          # Run the tests once
npm run precompute-embeddings     # Regenerate src/lib/data/reference-embeddings.json
npm run update-models             # Refresh models.json from Hugging Face (see docs/model-data.md)
npm run update-models:dry-run     # Preview an update
```

---

## Core Architecture

**Application:**
- `src/routes/+page.svelte` - main UI and application logic
- `src/components/TaskForm.svelte`, `RecommendationDisplay.svelte` - form and results
- `src/lib/recommendation/ModelSelector.js` - "smaller is better" ranking; derives tier and environmental score from `sizeMB`
- `src/lib/classification/EmbeddingTaskClassifier.js` - MiniLM similarity classifier, dynamically imported on demand
- `src/lib/classification/BrowserTaskClassifier.js` - keyword classifier used until (or instead of) the embedding classifier
- `src/service-worker.js` - offline cache, named per build

**Data (`src/lib/data/`):**
- `models.json` - flat list of models with their tasks, validated by `models.schema.json` in `npm test`; see `docs/model-data.md`
- `tasks.json` - task taxonomy with keywords, examples and edge maturity
- `reference-embeddings.json` - precomputed MiniLM embeddings of the `tasks.json` examples
- `constants.js` - tiers and the size thresholds for tier and environmental score

**Scripts:** `scripts/update-models/` (weekly model updater) and `scripts/precompute-embeddings.js`.

**Config:** `vite.config.js` holds the SvelteKit config (static adapter, base path, CSP) because SvelteKit 3 no longer reads `svelte.config.js`. The CSP is emitted as a meta tag; ONNX Runtime is bundled so no CDN is allowed.

### Classification

The embedding classifier compares the text with the reference examples and takes a similarity-weighted vote of the top 5 (measured leave-one-out: 95.3% category, 74.7% subcategory; a floor is enforced in `tests/embedding-classifier.test.js`). Until it has loaded, or if it fails, the keyword classifier answers. The dropdowns and shared links (`?category=&task=&deploy=`) work without any classifier.

### Environmental scoring

A size heuristic derived at load time: up to 500 MB scores 1, up to 4 GB scores 2, larger scores 3. Details in `docs/environmental-methodology.md`.

---

## Conventions

- **Smaller is better:** rank by tier, then size (`ModelSelector.rankBySize`).
- **Static only:** no backend; all inference runs in the browser. Keep the initial JavaScript small and load heavy code lazily.
- **Accessibility:** keyboard navigation, ARIA labels and live regions (see `+page.svelte`).
- **WebGPU:** keep the COOP/COEP headers and the `optimizeDeps.exclude` for `@huggingface/transformers` in `vite.config.js`.
- **Tests:** `npm test`. Ranking and selection tests use the fixture in `tests/fixtures/models.js`, not the live `models.json`, so data updates cannot break them.
- **Decisions:** record architectural changes as ADRs in `docs/adrs/`.

## Common tasks

**Adding a model:** see "Adding a model by hand" in `docs/model-data.md`.

**Adding a task:** add keywords and examples to `tasks.json`, run `npm run precompute-embeddings`, add models for it in `models.json` (the data tests list tasks that have none), then `npm test`.

**Deployment:** push to `main` and GitHub Actions builds and deploys to GitHub Pages; manual deploys upload `dist/`.

---

## Resources

- `ROADMAP.md` - plan, vision and history
- `docs/model-data.md` - model data schema and update workflow
- `docs/adrs/` - architecture decision records
- `docs/environmental-methodology.md` - scoring caveats

## Repo Butler

This repo is monitored by [Repo Butler](https://github.com/IsmaelMartinez/repo-butler), a portfolio health agent that observes repo health daily and generates dashboards, governance proposals, and tier classifications.

**Your report:** https://ismaelmartinez.github.io/repo-butler/ai-model-advisor.html
**Portfolio dashboard:** https://ismaelmartinez.github.io/repo-butler/
**Consumer guide:** https://github.com/IsmaelMartinez/repo-butler/blob/main/docs/consumer-guide.md

### Querying Reginald (the butler MCP server)

To query your repo's health tier, governance findings, and portfolio data from any Claude Code session, add the MCP server once (adjust the path to your local repo-butler checkout):

```bash
claude mcp add repo-butler node /path/to/repo-butler/src/mcp.js
```

Available tools: `get_health_tier`, `get_campaign_status`, `query_portfolio`, `get_snapshot_diff`, `get_governance_findings`.

When working on health improvements, check the per-repo report for the current tier checklist and use the consumer guide for fix instructions.

If this repo deploys a page, set its GitHub repository Homepage URL (the Website field in the repo's About section — not `package.json`'s `homepage`) to the canonical URL. That's how repo-butler surfaces the deployed link in dashboards and agent cards.
