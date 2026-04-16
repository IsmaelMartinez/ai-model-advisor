# Tasks for Model Code Snippets (Phase 3 Workstream 1)

**PRD:** [1-prd-model-code-snippets.md](1-prd-model-code-snippets.md)
**Status:** Parent tasks drafted — awaiting confirmation before sub-task expansion.

---

## Parent Tasks

- [ ] **1. Audit runtime metadata and extend the schema for multi-framework support**
      Inventory which models already declare a framework, extend `runtime.browser` to allow multiple frameworks per model, and document the schema so contributors and tests can rely on it.

- [ ] **2. Build the snippet generator core and framework template modules**
      Create `src/lib/snippets/SnippetGenerator.js` plus one template module per framework (Transformers.js, ONNX Runtime Web, TensorFlow.js), each producing Minimal and Full variants driven by model + task metadata.

- [ ] **3. Add the test harness (unit + integration + coverage thresholds)**
      New `tests/snippets.test.js` plus fixtures; template unit tests, integration test across Lightweight + Standard tiers, and a coverage gate that fails the build under 80%.

- [ ] **4. Fill runtime metadata gaps to clear the 80% coverage bar**
      Use the audit output from Task 1 to identify models missing runtime entries on Lightweight + Standard tiers, add correct metadata, and re-run the coverage test.

- [ ] **5. Produce UI wireframes and select the UI treatment (resolves PRD §9.1)**
      Sketch the four candidates (inline expandable / modal / dedicated route / tabbed panel), review them, pick one, and record the decision in the PRD or a short ADR.

- [ ] **6. Implement the snippet UI with tabs, variant toggle, copy button, and a11y**
      Integrate into `RecommendationDisplay.svelte` (or the chosen route) with framework tabs, Minimal/Full toggle, clipboard copy, ARIA roles, keyboard navigation, and a lightweight syntax highlighter.

- [ ] **7. Verify bundle-size budget and emit a build-time coverage report**
      Measure before/after bundle delta (< 20KB gzipped target), decide highlighter approach, and produce a coverage summary artifact / log line during `npm run build`.

- [ ] **8. Update documentation and ship**
      Refresh `CLAUDE.md`, `README.md`, `project-status.md`, `project-vision.md`; add an ADR if the UI treatment or highlighter choice warrants one; commit, push, verify auto-deploy, and mark Phase 3 WS1 complete.

---

## Relevant Files (preliminary — will expand in Phase 2)

- `src/lib/snippets/SnippetGenerator.js` — new, snippet orchestration
- `src/lib/snippets/templates/transformersjs.js` — new, Transformers.js template
- `src/lib/snippets/templates/onnxruntimeweb.js` — new, ONNX Runtime Web template
- `src/lib/snippets/templates/tensorflowjs.js` — new, TensorFlow.js template
- `src/lib/data/models.json` — modify, extend `runtime.browser` to multi-framework
- `src/components/RecommendationDisplay.svelte` — modify, render snippet UI
- `tests/snippets.test.js` — new, unit + integration + coverage tests
- `tests/fixtures/snippet-models.json` — new, test fixtures
- `scripts/audit-runtime-metadata.js` — new (one-off or kept), audit + coverage report
- `docs/adrs/adr-0009-snippet-ui-treatment.md` — possibly new, records UI + highlighter decision
- `CLAUDE.md`, `README.md`, `project-status.md`, `project-vision.md` — modify, documentation refresh

---

## Notes

- Tasks 1 → 2 → 3 can proceed before UI wireframes (Task 5) are done; the data/template/test layer is independent of UI placement.
- Task 4 (metadata filling) depends on Task 1's audit output and must complete before Task 3's coverage test will pass.
- Task 5 is the gating decision for Task 6 — do not start Task 6 until the UI treatment is chosen.
- Syntax highlighter choice (PRD §9.2) is decided inside Task 7 based on measured bundle impact.
- Follow existing Vitest patterns in `tests/` and Svelte conventions in `src/components/` (see CLAUDE.md §Code Style).
- Keep the static-first constraint: no runtime API calls to generate snippets.

---

**Next step:** Confirm the parent-task breakdown looks right, then I'll expand each into concrete sub-tasks.
