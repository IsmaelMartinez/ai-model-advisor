# PRD: Model Code Snippets

**Status:** Draft
**Phase:** 3 (Make It Actionable) — Workstream 1
**Author:** AI Model Advisor team
**Last updated:** 2026-04-16

---

## 1. Introduction / Overview

Developers using AI Model Advisor currently end their journey at a recommendation card: "Use model X." They still have to go find the model on Hugging Face, figure out which JavaScript runtime supports it, read docs, and piece together working code. This feature closes that gap by generating copy-pasteable "Get started" code snippets for each recommended model across the three edge-deployable JavaScript runtimes: **Transformers.js**, **ONNX Runtime Web**, and **TensorFlow.js**.

Snippets are generated from per-framework templates using the existing `runtime` metadata already stored on models in `src/lib/data/models.json`. Each model displays every framework it supports as a tabbed view; users can toggle between a short "minimal" snippet and a full runnable example.

This is the first Workstream of Phase 3 and the highest-leverage conversion of an existing recommendation into a usable output.

---

## 2. Goals

1. **Reduce time-to-working-code** for a developer from ~15 minutes (find model → read docs → write code) to under 1 minute (copy → paste → run).
2. **Achieve 80% snippet coverage** of all models in the Lightweight and Standard tiers.
3. **Support all three target runtimes** (Transformers.js, ONNX Runtime Web, TensorFlow.js) via per-framework templates.
4. **Guarantee snippet correctness** through automated tests — every generated snippet must parse and match expected template output for its framework + task combination.
5. **Preserve bundle size discipline** — templates and snippet generation logic must not push the site bundle meaningfully past the current ~40KB target.

---

## 3. User Stories

- **As a developer evaluating edge-deployable models**, I want to see ready-to-run code for each recommendation so that I can try it in a sandbox immediately without reading framework docs.
- **As a developer new to browser-based ML**, I want to toggle between frameworks (Transformers.js / ONNX / TF.js) so that I can pick the runtime that matches my project's existing dependencies.
- **As a developer who needs a quick proof of concept**, I want a short, minimal snippet that fits on screen so that I can drop it into a REPL or `<script>` tag.
- **As a developer building a real feature**, I want a full runnable example with input/output so that I don't have to guess the I/O contract.
- **As a maintainer of this project**, I want snippet generation to be test-covered so that a bad template change cannot silently ship broken code to users.
- **As a contributor adding a new model**, I want snippets to appear automatically for my model (based on its runtime metadata) so that I don't have to hand-author code per model.

---

## 4. Functional Requirements

### 4.1 Snippet generation

1. The system MUST generate snippets by applying a **per-framework template** to a model's metadata (id, `huggingFaceId`, task category/subcategory, runtime backend).
2. Templates MUST exist for all three frameworks: Transformers.js, ONNX Runtime Web, TensorFlow.js.
3. Templates MUST produce **two variants** per (model, framework) pair:
   - **Minimal variant** — 5–10 lines, import + single call, fits on screen.
   - **Full variant** — complete runnable example including input, output handling, and any setup boilerplate (HTML wrapper for browser-only examples, or a Node script where applicable).
4. For a given model, the system MUST produce snippets ONLY for frameworks listed in that model's `runtime` metadata. Models without a framework in their metadata MUST NOT show a snippet for that framework.
5. Generated snippets MUST be plain strings — no runtime-side template evaluation in the user's browser beyond simple string interpolation.

### 4.2 Data model

6. A new field or structure (e.g. `runtime.browser.framework` already exists; may be extended to a list if a model supports multiple runtimes) MUST indicate every framework a model supports. Models currently tagged with a single-string framework MUST be migrated to support multiple frameworks where applicable.
7. Task-specific template variations (e.g. `text-classification` pipeline vs. `feature-extraction` pipeline in Transformers.js) MUST be driven by the model's task category/subcategory from `tasks.json`.

### 4.3 UI

8. Each recommended model card MUST expose a way to view snippets. *Exact UI treatment (inline expandable vs. modal vs. tabs-on-card vs. dedicated route) is deferred — see Open Questions §9.1.*
9. Snippets MUST be displayed with:
   - A language/framework tab switcher when multiple frameworks are available.
   - A toggle or "Expand" control to switch between Minimal and Full variants.
   - A **Copy** button that copies the currently visible snippet to clipboard.
   - Syntax highlighting (JavaScript/HTML).
10. The UI MUST remain fully keyboard-accessible per existing accessibility conventions (see CLAUDE.md §4).
11. If no framework is available for a model, the card MUST NOT render an empty snippet section; it MUST either hide the control entirely or show a clear "No edge runtime support yet" state.

### 4.4 Testing (hard requirement per user direction)

12. Every framework template MUST have unit tests that:
    - Render the template with a known fixture and assert exact string output.
    - Cover the Minimal and Full variants.
    - Cover each task category represented in `tasks.json`.
13. An integration test MUST iterate over every model in the Lightweight and Standard tiers and assert that a valid snippet is produced for each framework declared in that model's runtime metadata.
14. A coverage test MUST fail the suite if snippet coverage across Lightweight + Standard tiers drops below **80%**.
15. Tests MUST follow the existing Vitest patterns in `tests/` and run within the existing ~2s `npm test` budget (best effort — snippet tests are string comparisons, not model loads).

### 4.5 Coverage & content curation

16. At feature launch, **≥80% of Lightweight + Standard tier models** MUST produce at least one framework snippet.
17. Models in the Advanced and Extra Large tiers MAY produce snippets if their runtime metadata supports it, but are NOT counted toward the 80% metric.
18. A build-time report (e.g. log line or JSON artifact) SHOULD summarize coverage so maintainers can spot regressions.

---

## 5. Non-Goals (Out of Scope)

The following are explicitly **not** part of this workstream and belong to later Phase 3 workstreams:

- ❌ **Live in-browser snippet execution** (Workstream 4 — "Can I Run This?").
- ❌ **Performance numbers in snippets** (Workstream 3 — performance estimates).
- ❌ **Side-by-side framework comparison tables** (Workstream 2 — runtime comparison).
- ❌ **Auto-generating snippets from remote Hugging Face model cards** (kept deterministic via local templates).
- ❌ **Hand-curated per-model snippet overrides** (templates only in this slice; overrides may be added later if gaps emerge).
- ❌ **Non-JavaScript snippets** (Python, Rust, etc.) — this is a browser/edge tool.

---

## 6. Design Considerations

### 6.1 UI treatment — deferred

The user explicitly requested that UI placement decisions be backed by visual representations (wireframes / mockups) before a choice is made between:

- Inline expandable section on the model card
- Modal or drawer triggered from a "Get started" button
- Dedicated route per model (`/model/[id]`)
- Tabbed panel beneath the recommendation list

**Action item:** Produce wireframes for each option and add them to this PRD (or link from it) before implementation of the UI layer begins. Tracked as a planning item, not a Phase 3 WS1 blocker — template/data work can begin in parallel.

### 6.2 Accessibility

- Tab switcher must use proper ARIA roles (`role="tablist"`, `role="tab"`, `role="tabpanel"`).
- Copy button must provide screen-reader feedback ("Copied to clipboard").
- Code block must be focusable for keyboard users.

### 6.3 Visual consistency

Snippets should match the project's existing environmental-conscious, minimalist aesthetic. Syntax highlighting should be lightweight (prefer a tiny highlighter like `prismjs` core or Shiki's static output; avoid anything that loads a full editor).

---

## 7. Technical Considerations

### 7.1 Architecture

- **New module:** `src/lib/snippets/SnippetGenerator.js` — exposes `generateSnippets(model, tasksData): { framework, minimal, full }[]`.
- **New data:** `src/lib/snippets/templates/` containing one template module per framework:
  - `transformersjs.js`
  - `onnxruntimeweb.js`
  - `tensorflowjs.js`
- Each template module exports a function mapping `(model, task) → { minimal: string, full: string }`.

### 7.2 Data migration

- Existing `runtime.browser.framework` values are currently single strings (`"transformers.js"`, `"tensorflow.js"`). Two options:
  - **7.2.a** Keep single string, derive additional framework compatibility from task/architecture heuristics.
  - **7.2.b** Extend schema so `runtime.browser` can declare multiple framework entries.
- **Recommended:** 7.2.b (explicit metadata beats heuristics); migrate models opportunistically, not in a big-bang pass.

### 7.3 Bundle size

- Template strings are small, but a syntax highlighter can add weight. Target: total snippet-related bundle delta < 20KB gzipped.
- Consider generating syntax-highlighted HTML at build time (via a Vite plugin or pre-computation step similar to `precompute-embeddings`) so the runtime ships plain HTML.

### 7.4 Static-first constraint

- No API calls to generate snippets. Everything must work offline in the PWA.

### 7.5 Testing infrastructure

- New test file: `tests/snippets.test.js`.
- Fixtures: `tests/fixtures/snippet-models.json` — small curated set covering every task category × every framework.
- Coverage test reads `models.json`, filters to Lightweight + Standard tiers, computes percentage with snippets, asserts ≥ 80%.

---

## 8. Success Metrics

| Metric | Target | How measured |
|---|---|---|
| Snippet coverage (Lightweight + Standard tiers) | ≥ 80% | Automated coverage test in `npm test` |
| Frameworks supported | 3 (Transformers.js, ONNX Runtime Web, TF.js) | Presence of template modules + passing tests |
| Time to copy first snippet from recommendation | < 5 seconds | Manual UX review / stopwatch test |
| Template test coverage | 100% of templates have Minimal + Full variant tests | Test file assertions |
| Bundle size delta | < 20KB gzipped | `npm run build` comparison before/after |
| Full test suite time | Remains ~2s (best effort) | `npm test` timing |

Post-launch (tracked on project dashboard, not a launch blocker):
- User engagement with the "Copy" button (if analytics are added in a later phase).
- GitHub issues opened for broken snippets (target: < 5 in first month).

---

## 9. Open Questions

### 9.1 UI placement
Needs wireframes before choosing between inline expandable, modal, dedicated route, or tabbed panel. **Blocking for the UI implementation task only** — template and data work can proceed in parallel.

### 9.2 Syntax highlighter choice
Prism, Shiki, or hand-rolled? Decision depends on bundle-size measurements. Recommend spiking both during implementation.

### 9.3 ONNX Runtime Web model availability
Not every model in `models.json` has a published ONNX export. How should we detect this and degrade gracefully?
- Option A: Require an explicit `runtime.browser.onnxruntime` entry; only generate a snippet if present.
- Option B: Auto-probe Hugging Face at build time and cache results (adds build complexity).
- **Lean:** Option A — keeps the metadata contract explicit.

### 9.4 Full-variant boilerplate
For browser-only examples, should the "Full" variant be a complete standalone `.html` file, or a `<script type="module">` fragment a user embeds in their own page? Leaning toward full `.html` — maximizes copy-paste-to-run ergonomics.

### 9.5 Model migration scope
How many of the existing 156 models need `runtime` metadata updates to hit 80% coverage? Needs a quick audit script before implementation starts — likely a Phase 3 WS1 prerequisite task.

### 9.6 Snippet versioning
Framework APIs drift. Should snippets be pinned to a specific framework version (e.g. `@huggingface/transformers@4.x`) in the snippet itself, and how do we keep those pins current? Recommend: include version pin in the template and wire a dependabot-style reminder.

---

## Appendix A: Rollout plan (high-level)

1. **Audit & schema** — script to inventory existing `runtime` metadata; extend schema to support multi-framework declaration (§7.2.b).
2. **Template layer** — build `SnippetGenerator` + three framework templates + fixture-based tests.
3. **Coverage push** — fill runtime metadata gaps on Lightweight + Standard tiers until ≥ 80%.
4. **UI wireframes** — resolve Open Question §9.1.
5. **UI integration** — render snippets per chosen UI treatment with tabs, variant toggle, copy button, a11y.
6. **Polish** — bundle-size check, syntax highlighting decision, docs update (CLAUDE.md, README.md, project-status.md, project-vision.md).
7. **Launch** — merge to main, auto-deploy, update Phase 3 WS1 status to ✅.
