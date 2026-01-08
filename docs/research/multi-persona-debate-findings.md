# Multi‑Persona Debate Findings (10‑Meeting Convergence)

Date: 2025-12-17  
Personas: Staff Engineer, SRE, Security Engineer, Product Manager  
Output style: Final consolidated findings only (no meeting transcripts)

## Executive summary

This repo already has the core ingredients of a best‑in‑class, offline‑capable “eco‑first” model advisor: a strong UI, a tiered model dataset, and multiple classification strategies with fallbacks. The debate converged on one central theme: **trust** (correctness + transparency) must improve in parallel with **reliability/performance** (especially first‑run experience) and **security posture** (supply chain + “no secrets in the client”), otherwise the product won’t scale beyond a demo.

The agreed priority order:

1. **Correctness & user trust**: unify the classification story (docs + UI + code), make confidence/limitations explicit, and standardize the pipeline behavior.
2. **Reliability & performance**: first‑run model loading, caching semantics, offline behavior, and failure handling must be measurable and predictable.
3. **Security hardening**: treat this as a zero‑trust static app; lock down CSP, dependencies, and avoid any client‑side secrets.
4. **Product differentiation**: “eco‑first” becomes an interactive decision system (constraints, tradeoffs, explainability), not just a ranked list.

## Current system (grounded in code/docs)

### What the system does today

- **Frontend**: SvelteKit app (`src/routes/+page.svelte`) that collects a task description, optionally runs a clarification flow, classifies the task, and recommends models.
- **Classification**:
  - Default path in the UI uses **MiniLM embeddings** via `EmbeddingTaskClassifier` (~23MB download) and applies a confidence threshold with a clarification UI when low confidence.
  - Fallback path uses `BrowserTaskClassifier` (semantic/keyword taxonomy-based classification).
  - The repo also contains an **LLM classifier** (`LLMTaskClassifier.js`) and ADRs describing **Llama 3.2 1B** browser classification and ensemble mode.
- **Recommendation**: `ModelSelector.js` ranks “smaller is better” within tier, and supports an accuracy threshold filter.
- **Offline/PWA**: `public/sw.js` caches a small list of static assets; transformers/CDN resources are explicitly not cached.

### Mismatches surfaced by the debate

- **Docs vs implementation mismatch**: the main README emphasizes a ~700MB classification model and 95.2% accuracy, while the main app code path uses an embedding model (~23MB) with different stated accuracy in config. This harms credibility and confuses users.
- **Caching story is unclear**: service worker caches source paths that may not exist in production builds; transformer model caching is partly handled elsewhere (browser/IndexedDB), but the repo’s explicit caching strategy is not documented end-to-end.

## Converged critique and proposals by persona

### Staff engineer (architecture, correctness, maintainability)

**Critiques**

- **Multiple overlapping classification implementations** (taxonomy/keyword, embeddings, LLM) with inconsistent outputs and partially duplicated logic increase maintenance cost and make it hard to reason about “what happens for this user on this device.”
- **Selection semantics are under-specified**: “smaller is better” + accuracy threshold is a good baseline, but there’s no explicit policy layer that expresses product intent (eco-first, but not at any cost).
- **Data contracts are implicit** (models/tasks schema assumptions are spread across code).

**Proposed changes**

- **Define a single “Classification Pipeline Contract”**: a stable result schema (category/subcategory, confidence, evidence, method, timing, model/caching info).
- **Centralize strategy selection** with a capabilities-driven policy:
  - Default: embeddings (fast, smaller download)
  - Optional: LLM (higher semantic robustness) behind a capability check + explicit user opt-in
  - Always-available fallback: taxonomy keyword/semantic rules
- **Introduce a “Recommendation Policy” layer**: a small module that turns product intent into deterministic ranking rules (eco score, size, accuracy, deployment fit, user constraints).
- **Schema validation**: validate `models.json` and `tasks.json` at build/test time (and log issues at runtime for safety).

### SRE (reliability, performance, operability)

**Critiques**

- **First-run experience is the biggest reliability risk**: model download, initialization, and failures are not tracked as SLOs and not robustly recoverable.
- **Offline behavior isn’t well-defined**: service worker strategy is minimal and may not match the built asset graph, and external resources are excluded from caching.
- **Observability is mostly console logging**: no structured metrics, no budgets, no regression alarms.

**Proposed changes**

- **Define client-side SLOs** and track them (privacy-respecting):
  - classifierReady time
  - classification latency p50/p95
  - failure rate by stage (download/init/inference/fallback)
  - offline success rate
- **Make caching/versioning explicit**:
  - deterministic cache keys per model/version
  - clear invalidation on new releases
  - documented offline modes (“offline no downloads”, “offline with cached model”, etc.)
- **Ship a “resilience playbook”**: known failure modes and the UI behavior for each (retry, fallback, degrade gracefully).

### Security engineer (threat model, privacy, supply chain)

**Critiques**

- **Client-side API keys** are not a safe design pattern; any “HF token in browser” option must be treated as public.
- **Supply chain risk**: remote model and library fetching needs pinning and integrity controls; PWA caching should not accidentally cache untrusted content.
- **Telemetry vs privacy** must be explicitly designed, not incidental.

**Proposed changes**

- **Threat model document** and secure defaults:
  - no client secrets
  - least-privilege permissions
  - strict CSP and security headers (as applicable on GitHub Pages)
- **Dependency controls**:
  - lock versions, audit regularly
  - add SRI for CDN assets (or remove CDNs and bundle locally)
- **Privacy-by-design instrumentation**:
  - opt-in analytics only
  - never log raw task text unless explicitly enabled for debugging

### Product manager (UX, positioning, measurable outcomes)

**Critiques**

- **The value proposition is strong but not “self-evident”**: users need help translating their constraints (budget, device, latency, privacy) into model choices.
- **Confidence and ambiguity handling is good**, but it needs clearer copy and consistent behavior across modes.
- **Trust signals** (data freshness, accuracy provenance, environmental scoring methodology) are present but not “productized” in the UI.

**Proposed changes**

- **Turn recommendations into a “decision workflow”**:
  - ask for constraints (deployment target, min accuracy, latency, privacy)
  - explain why the first recommendation ranks highest (eco/size/accuracy tradeoffs)
  - provide “what if” comparisons
- **Improve first-run messaging** (download size, caching, device requirements) and add a no-download mode.
- **Add shareability/reproducibility**: encode inputs + constraints into the URL, and show a compact “recommendation report” users can export.

## Key tensions and how the group resolved them

### 1) LLM accuracy vs download size and device compatibility

- **Resolution**: default to embeddings (fast, smaller), keep LLM as an opt-in “high-accuracy / deep reasoning” mode with a clear “this will download ~1.2GB and needs WebGPU/RAM” gate.
- **Definition of done**: the UI and docs must match the actual defaults and provide a capabilities check before any large download.

### 2) Offline-first vs observability

- **Resolution**: implement **privacy-preserving** telemetry (counts and timings, no raw text by default) plus a local “diagnostics view” users can copy when reporting issues.

### 3) Eco-first ranking vs accuracy requirements

- **Resolution**: make ranking policy explicit and user-tunable:
  - “Eco-first” remains the default
  - add “Balanced” and “Accuracy-first” presets
  - ensure models with missing accuracy aren’t silently treated as 0 in a way that surprises users (surface “unknown” explicitly)

## Agreed roadmap (Now / Next / Later)

### Now (0–2 weeks): fix trust, stabilize behavior, measure the basics

- **Unify the classification story across docs/UI**
  - Update README/docs to reflect the actual default classifier and download size(s)
  - Explicitly document modes: embeddings default, optional LLM, taxonomy fallback
  - DoD: no contradictions between `README.md`, ADRs, and UI copy

- **Standardize classification result schema**
  - One result format regardless of method (method, confidence, evidence, timings, fallbackUsed)
  - DoD: UI renders confidence/evidence consistently and logs structured diagnostic objects

- **Define baseline SLOs and add measurement hooks**
  - Track: classifierReady p50/p95, classification latency p50/p95, fallback rate, failure rate
  - DoD: metrics visible locally (and optionally exported), with thresholds documented

- **Security quick wins**
  - Remove/avoid any implication of “private token in browser”
  - Add a minimal threat model summary + secure defaults checklist
  - DoD: no client secret paths; security assumptions are explicit

### Next (2–6 weeks): best-in-class offline experience and policy-driven recommendations

- **Explicit caching & offline modes**
  - Define supported offline states and user flows
  - Ensure service worker caching strategy matches built assets and doesn’t degrade correctness
  - DoD: offline works for app shell; cached classifier works reliably; failure modes are graceful

- **Recommendation Policy Layer + presets**
  - Introduce a policy module that ranks models based on eco/size/accuracy/deployment constraints
  - Add preset profiles (Eco-first / Balanced / Accuracy-first) and constraints (device, deployment)
  - DoD: deterministic ranking; explainable “why this model” output

- **Improve clarification & confidence UX**
  - Clarification becomes a standard step for low confidence across all classifier modes
  - DoD: reduced “wrong category” rate on ambiguous queries; better completion rate

- **Supply chain hardening**
  - Pin and verify remote resources; remove unnecessary CDNs if possible
  - DoD: documented dependency policy; automated checks in CI

### Later (6+ weeks): differentiation and research-grade rigor

- **Continuous evaluation harness**
  - Track classifier accuracy on a versioned test set; publish results per release
  - DoD: reproducible evaluation report per classifier version

- **User-facing sustainability reporting**
  - Move beyond a 1–3 score: show assumptions, scenarios, and sensitivity
  - DoD: explainable environmental methodology + “compare two models” view

- **Advanced features**
  - Ensemble classification as a user-selectable “high certainty” mode across methods (not just LLM)
  - Personalization: remember constraints, not just thresholds

## Metrics and targets (agreed)

### Reliability / performance (client SLOs)

- **Classifier readiness**: p95 < 5s on desktop broadband for embeddings; p95 < 2s when cached
- **Classification latency**: p95 < 300ms embeddings; p95 < 2s LLM mode (opt-in)
- **Fallback rate**: < 5% sessions should need taxonomy fallback due to init failures (excluding explicit “no download” mode)
- **Crash-free sessions**: > 99.5%

### Security

- **No client secrets**: 0 places where a “token” is required in browser for core UX
- **Dependency hygiene**: automated checks (lockfile integrity + audit) on PRs
- **CSP posture**: documented and as strict as hosting allows

### Product outcomes

- **Task→Recommendation completion rate**: +10–20% after first-run UX improvements
- **Clarification completion**: > 80% when shown
- **User trust signals**: show “data freshness” + “why this pick” for 100% of results

## Risks and open questions

- **Accuracy claims**: embedding expected accuracy numbers need a documented evaluation comparable to the LLM ADR methodology.
- **Model download constraints**: large-model mode can harm perception if users hit it unexpectedly; capability gating is mandatory.
- **Environmental scoring fidelity**: current scoring is intentionally simple; product should avoid over-precision without clearer assumptions.

## Recommended implementation sequencing (ownership suggestion)

- **Staff engineer**: unify pipeline contracts + policy layer; reduce duplication in classification code paths
- **SRE**: offline/caching strategy + SLO instrumentation and regression tracking
- **Security**: threat model + dependency/supply chain controls + CSP guidance
- **PM**: UX/content alignment, onboarding and trust signals, constraint-based recommendation flow







