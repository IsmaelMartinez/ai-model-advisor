# Tasks for Model Code Snippets (Phase 3 Workstream 1)

**PRD:** [1-prd-model-code-snippets.md](1-prd-model-code-snippets.md)
**Status:** Sub-tasks generated — ready for execution.

---

## Parent Task 1: Audit runtime metadata and extend the schema for multi-framework support

- [ ] 1.1 Write `scripts/audit-runtime-metadata.js` that loads `src/lib/data/models.json`, iterates every category → subcategory → tier, and prints a table of: model id, tier, `deploymentOptions`, and any existing `runtime.browser.framework` values.
- [ ] 1.2 From the audit output, compute current snippet-eligible coverage across Lightweight + Standard tiers (models with at least one framework vs. total) and record the baseline in a comment at the top of `tasks-1-prd-model-code-snippets.md`.
- [ ] 1.3 Extend the `runtime.browser` schema in `src/lib/data/models.json` so `framework` may be either a string (legacy, still valid) or an array of strings (new). Capture the grammar in a short "Schema" section added to `docs/model-curation-process.md`.
- [ ] 1.4 Update `tests/runtime-metadata.test.js` to accept both the string and array form of `framework` without breaking existing assertions.
- [ ] 1.5 Add a normalization helper `src/lib/data/runtimeSchema.js` exporting `listFrameworks(model)` that returns an array regardless of input shape, so consumers can iterate uniformly.
- [ ] 1.6 Run `npm test` to confirm the audit script, schema change, and normalization helper leave the existing suite green.

## Parent Task 2: Build the snippet generator core and framework template modules

- [ ] 2.1 Create `src/lib/snippets/SnippetGenerator.js` exposing `generateSnippets(model, tasksData)` which returns `Array<{ framework: string, minimal: string, full: string }>`, one entry per framework declared in the model's runtime metadata.
- [ ] 2.2 Define a small internal contract (JSDoc typedef) for `TemplateFn: (model, task) => { minimal: string, full: string }` inside `src/lib/snippets/templates/index.js`, plus a registry map `{ 'transformers.js': transformersTemplate, ... }`.
- [ ] 2.3 Implement `src/lib/snippets/templates/transformersjs.js` covering at least: text classification, feature extraction, token classification, image classification, and zero-shot — one `switch` on `task.category`/`task.subcategory` selecting the correct `pipeline()` call. Return Minimal (5–10 lines) and Full (standalone `.html`) variants.
- [ ] 2.4 Implement `src/lib/snippets/templates/onnxruntimeweb.js` with a generic `InferenceSession.create` + feeds/fetches skeleton; include a TODO placeholder section for task-specific tensor shapes where the model's subcategory doesn't map cleanly. Gate emission on an explicit `runtime.browser.onnxruntime` entry (per PRD §9.3 lean).
- [ ] 2.5 Implement `src/lib/snippets/templates/tensorflowjs.js` covering the core TF.js task mapping (image classification via MobileNet-style `model.predict`, text tasks via USE-style encoders). Minimal + Full variants as above.
- [ ] 2.6 Pin framework versions in all templates (Transformers.js `@huggingface/transformers@4.x`, ONNX `onnxruntime-web@1.x`, TF.js `@tensorflow/tfjs@4.x`) per PRD §9.6.
- [ ] 2.7 Add graceful fallback: if the template cannot handle the task, `generateSnippets` returns `[]` for that framework rather than throwing — logged via `console.warn` in dev.

## Parent Task 3: Add the test harness (unit + integration + coverage gate)

- [ ] 3.1 Create `tests/fixtures/snippet-models.json` with one minimal model fixture per task category × framework combination (covers the matrix used in template switches).
- [ ] 3.2 Create `tests/snippets.test.js` with a `describe('SnippetGenerator')` block that unit-tests each template: render the fixture, assert exact Minimal and Full strings (use snapshot-style `toBe` on inlined expected strings so diffs are obvious).
- [ ] 3.3 Add an integration test: iterate `models.json`, filter to Lightweight + Standard tiers, assert that for every model with a framework in `runtime.browser`, `generateSnippets` returns at least one non-empty `{ minimal, full }` for that framework.
- [ ] 3.4 Add a coverage test: compute `(models with ≥1 snippet) / (Lightweight + Standard total)`; fail if < 0.80. Emit the computed percentage via `console.log` so CI logs surface regressions.
- [ ] 3.5 Add a negative test: a model missing `runtime.browser` entirely must return `[]` from `generateSnippets` (and the UI must not show an empty panel — covered in Task 6).
- [ ] 3.6 Verify `npm test` runs in ≤ ~3s total (small best-effort budget slip acceptable given new tests) and all tests pass.

## Parent Task 4: Fill runtime metadata gaps to clear the 80% coverage bar

- [ ] 4.1 Run the audit script from Task 1.1 and write its output to `tasks/audit-runtime-coverage.md` (gitignored-safe, kept for traceability during this task; can be deleted after ship).
- [ ] 4.2 For each Lightweight + Standard tier model missing a framework, research on Hugging Face whether a Transformers.js / ONNX / TF.js export exists and record findings directly in the audit file.
- [ ] 4.3 Update `src/lib/data/models.json` in small batches (grouped by category), adding the correct `runtime.browser` entries. Commit each batch separately with a descriptive message.
- [ ] 4.4 After each batch, re-run `npm test` to confirm the coverage test is trending up and nothing else broke.
- [ ] 4.5 Stop when the coverage test passes at ≥ 80%; any remaining gaps beyond that bar get logged in `project-status.md` under "Future Improvements" for a later curation pass.

## Parent Task 5: Produce UI wireframes and select the UI treatment

- [ ] 5.1 Sketch four wireframes — inline expandable / modal / dedicated route / tabbed panel — as simple ASCII or low-fi PNG/SVG; save under `docs/design/snippet-ui-wireframes/`.
- [ ] 5.2 Record trade-offs per option in a short table in `docs/adrs/adr-0009-snippet-ui-treatment.md` (mobile ergonomics, discoverability, navigation cost, build complexity).
- [ ] 5.3 Pick one option, document the rationale in the ADR, and update PRD §9.1 with the resolved decision.
- [ ] 5.4 Update this task file's Parent Task 6 sub-tasks if the chosen treatment materially changes the integration shape (e.g. new route vs. inline).

## Parent Task 6: Implement the snippet UI with tabs, variant toggle, copy button, and a11y

- [ ] 6.1 Wire `generateSnippets` into the recommendation flow: wherever the recommendation list is rendered, pass `tasksData` and `model` through to the UI layer.
- [ ] 6.2 Create `src/components/SnippetPanel.svelte` rendering framework tabs (`role="tablist"`, `role="tab"`, `role="tabpanel"`), Minimal/Full toggle, code block (`<pre><code>`), and a Copy button with screen-reader feedback ("Copied to clipboard").
- [ ] 6.3 Integrate `SnippetPanel` into `src/components/RecommendationDisplay.svelte` per the UI treatment chosen in Task 5.
- [ ] 6.4 Add keyboard navigation: ArrowLeft/Right cycle tabs, Enter activates, Tab moves to code block, Ctrl/Cmd+C copies when focused.
- [ ] 6.5 Handle the empty state: if `generateSnippets` returns `[]`, hide the panel entirely (no empty framework tabs, no disabled Copy button).
- [ ] 6.6 Integrate a lightweight syntax highlighter — start with a hand-rolled regex-based JS/HTML highlighter (~2KB); upgrade to Prism/Shiki only if visual quality demands it (decision logged in Task 7).
- [ ] 6.7 Style to match existing minimalist aesthetic (use existing CSS custom properties / design tokens from `+page.svelte` / `RecommendationDisplay.svelte`).
- [ ] 6.8 Manual UX pass: open in `npm run dev`, verify the golden path (classify → see recommendation → copy a snippet → paste into a sandbox → it runs) on desktop Chrome + one mobile viewport via devtools.

## Parent Task 7: Verify bundle-size budget and emit a build-time coverage report

- [ ] 7.1 Capture a baseline bundle size: `npm run build` on `main`, record total JS/CSS gzipped in `docs/design/bundle-baseline.md`.
- [ ] 7.2 Build the feature branch, compare, and record the delta. Fail the task if delta > 20KB gzipped; iterate on highlighter choice if needed.
- [ ] 7.3 Decide between the hand-rolled highlighter, Prism core, or Shiki static output based on measured delta and visual quality. Record the decision in the ADR from Task 5.2.
- [ ] 7.4 Add a `scripts/snippet-coverage-report.js` (or extend the Task 1 audit script) that emits a JSON summary of coverage and is invoked by `npm run build` (via a `prebuild` script or Vite plugin). Output path: `build-artifacts/snippet-coverage.json`.
- [ ] 7.5 Add a build-log line like `"Snippet coverage (L+S tiers): 84% (131/156)"` so regressions are visible in CI output.

## Parent Task 8: Update documentation and ship

- [ ] 8.1 Update `CLAUDE.md`: add a "Model Snippets" subsection under "Core Architecture" documenting `SnippetGenerator`, the template registry, and the schema extension.
- [ ] 8.2 Update `README.md`: add "Copy-paste code for every recommendation" to the feature list, and a brief section on how to contribute snippet templates.
- [ ] 8.3 Update `project-status.md`: mark Phase 3 Workstream 1 ✅, add test counts, update the component tree listing.
- [ ] 8.4 Update `project-vision.md`: update the "Code snippet coverage" success metric from `0% → 80%` to the actual achieved number, move Phase 3 WS1 to the "Complete" column.
- [ ] 8.5 Promote the ADR from Task 5.2 (UI treatment + highlighter) to final status; cross-link it from the PRD and from `docs/adrs/README.md` (or index file if present).
- [ ] 8.6 Final `npm test` + `npm run build` + `npm run preview` sanity pass; commit, push, and let GitHub Actions auto-deploy.
- [ ] 8.7 Announce in the repo (optional short blurb in README "What's new" or a tagged release) and hand off to Workstream 2 planning.

---

## Relevant Files

**New files**
- `src/lib/snippets/SnippetGenerator.js` — snippet orchestration entry point
- `src/lib/snippets/templates/index.js` — framework template registry + typedefs
- `src/lib/snippets/templates/transformersjs.js` — Transformers.js template
- `src/lib/snippets/templates/onnxruntimeweb.js` — ONNX Runtime Web template
- `src/lib/snippets/templates/tensorflowjs.js` — TensorFlow.js template
- `src/lib/data/runtimeSchema.js` — `listFrameworks(model)` normalization helper
- `src/components/SnippetPanel.svelte` — tabs / toggle / copy UI
- `tests/snippets.test.js` — unit + integration + coverage gate
- `tests/fixtures/snippet-models.json` — per-framework × per-category fixtures
- `scripts/audit-runtime-metadata.js` — metadata audit + (extended) coverage report
- `docs/design/snippet-ui-wireframes/` — wireframes (Task 5)
- `docs/design/bundle-baseline.md` — bundle size baseline + delta log
- `docs/adrs/adr-0009-snippet-ui-treatment.md` — UI + highlighter decision

**Modified files**
- `src/lib/data/models.json` — schema extension + metadata backfill
- `src/components/RecommendationDisplay.svelte` — integrate `SnippetPanel`
- `tests/runtime-metadata.test.js` — accept array-form `framework`
- `docs/model-curation-process.md` — runtime schema docs
- `CLAUDE.md`, `README.md`, `project-status.md`, `project-vision.md` — feature docs

---

## Notes

- Tasks 1 → 2 → 3 are the critical path and can proceed before UI wireframes (Task 5).
- Task 4 depends on Task 1's audit output; finish it before Task 3's coverage gate is enforced at 80%, or temporarily set the gate to the current baseline and ratchet up.
- Task 5 gates Task 6 — do not start the UI component work until the treatment is chosen.
- Syntax highlighter decision (PRD §9.2) is finalized inside Task 7 based on measured bundle impact; the ADR from Task 5 will be updated to record it.
- Follow existing patterns: Vitest test structure (see `tests/runtime-metadata.test.js`), Svelte component conventions (`src/components/RecommendationDisplay.svelte`), JSDoc typedefs (also in `RecommendationDisplay.svelte`).
- Static-first constraint holds: no runtime API calls to generate snippets.
- Commit after each parent task completion to keep history legible; push to `claude/review-roadmap-planning-QuPfq` (or a feature branch once the user signals readiness).
