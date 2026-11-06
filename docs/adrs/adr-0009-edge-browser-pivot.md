# ADR-0009: Refocus on Edge and Browser AI

## Status
Accepted

## Date
2026-03-09

## Context
The project began as a general "which AI model should I use" advisor, ranking Hugging Face models by size and task. Most of what it listed (7B+ LLMs, full-precision vision models) needs a server, which contradicts its own "smaller is better" premise: the environmentally cheapest model is one that runs on the visitor's device with no data center and no network round-trip. Transformers.js, ONNX Runtime Web and WebGPU have made on-device inference practical for many tasks, and no tool answers "I want to do X without a cloud API, what are my options?".

## Decision
Position the product as "find AI you can run without a server".

- Models carry `deploymentOptions` and, where verified, `runtime.browser` metadata (framework, backend, tested), and the UI shows an Edge-Ready or Edge-Compatible badge.
- `tasks.json` labels each task with an edge maturity level so the UI is honest about which tasks work well on-device.
- Results can be filtered by where the model should run (browser, edge or mobile, cloud) and are always ranked smaller first.
- Large server-class models stay in the data but rank last (the xlarge tier is still undecided, see `ROADMAP.md`).
- Reference embeddings are precomputed at build time so the classifier starts faster.

## Consequences
- A model only counts as browser-ready when ONNX weights exist, either in its own repo or in the `browserModelId` mirror (Xenova or onnx-community); `models.json` is validated against `src/lib/data/models.schema.json`.
- The tested flag is false for most models; nothing in CI runs a model in a browser.
- Cloud-only models are less prominent, so the data is less useful as a general model catalogue.
