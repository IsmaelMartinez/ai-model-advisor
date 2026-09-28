# Roadmap

This is the active plan from the 2026-09-27 review. The review found that the live site ranks a 35B model as a 1 MB "lightweight" pick because the model updater misreads Hugging Face metadata, that production has served no CSP since #180, and that the project carries more code, data structure and documentation than it needs. The work below fixes what visitors see first, then simplifies the data model, code, tests and docs so the project is easier for others to use and contribute to.

Progress is tracked in #227, and each item links to an issue with the full findings and a task checklist. Tick the box here and in #227 when the PR for an item merges.

## How to continue

Pick the first unchecked item under Next Steps, read its issue, and do the work in a worktree with one PR per issue whose message ends with `Refs: #<issue>`. PRs are opened for review and never merged without the maintainer's explicit confirmation. Items are ordered by dependency: #220 needs #219 first so the bad entries do not come back, and #222 is easier after the Phase 0 data fixes land.

## Next Steps

### Phase 0 — fix what visitors see

- [ ] #218 CSP commented out in production; self-host the ONNX runtime so enforcing it does not break the classifier
- [ ] #219 Model updater writes wrong sizes, swallows HF 429s and auto-merges before CI
- [ ] #220 Clean up misleading `models.json` entries (after #219)
- [ ] #221 Deep links wait for the classifier download, plus small UI bugs

### Phase 1 — data model

- [ ] #222 Flat, schema-validated `models.json` with tier and environmental score derived from size

### Phase 2 — code

- [ ] #223 Remove dead code and lazy-load the embedding classifier

### Phase 3 — tests

- [ ] #224 Test the production classifier and decouple tests from live data

### Phase 4 — docs and CI

- [ ] #225 Consolidate docs (this file absorbs `project-status.md` and `project-vision.md`) and make the data reusable
- [ ] #226 CI hardening: `npm ci`, pinned actions, failing OSV scan

## Open decision

Whether to keep the MiniLM classifier, lazy-loaded behind "Describe your task", or drop it for keyword pre-fill only. The recommendation is to keep it: it measures 95.3% category accuracy on a leave-one-out check over the committed reference embeddings, and lazy loading removes the ~52 MB first-visit cost for everyone who uses the dropdowns. This is settled in #223.
