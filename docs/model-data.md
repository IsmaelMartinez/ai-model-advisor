# Model data

`src/lib/data/models.json` is a flat list of models. `src/lib/data/models.schema.json` describes it and `npm test` validates the file against the schema, so a bad edit or a bad updater run fails the tests.

## Fields

Each entry in `models` has an `id` (unique), `name`, `huggingFaceId` (unique, never a placeholder), `description`, `sizeMB`, `accuracy`, `tasks` (a list of `{category, subcategory}` taken from `tasks.json`), `deploymentOptions` (`browser`, `mobile`, `edge`, `cloud`, `server`), `frameworks` and `lastUpdated` (an ISO date). Optional fields are `specialization`, `runtime.browser` and `browserModelId`.

Tier and environmental score are not stored. They are derived from `sizeMB` when the data is loaded (`src/lib/data/constants.js`): up to 500 MB is lightweight with score 1, up to 4 GB is standard with score 2, up to 20 GB is advanced and anything larger is xlarge, both with score 3. See [environmental-methodology.md](environmental-methodology.md) for what the score means.

`accuracy` is `null` unless a figure has a source, in which case it is `{metric, value, source}` with a value between 0 and 1. The updater never estimates it.

`browserModelId` names an ONNX mirror (for example `Xenova/whisper-tiny`) to load in the browser when the original repository has no ONNX weights. `specialization` tags a model that is task, domain or language specific (`task:tables`, `domain:finance`, `language:english`); tag it when reviewing the update PR after checking the model card.

## Adding a model by hand

1. Add an entry to `models` in `models.json` with the fields above. Take `sizeMB` from the Hub (the size of one complete set of weights, in MB), not from a guess.
2. List every task it serves in `tasks`; a model that serves several tasks is one entry, not several.
3. Only add `browser` to `deploymentOptions` if it has ONNX weights, and then add `runtime.browser`.
4. Run `npm test`.

## Weekly update

`.github/workflows/models-updater.yml` runs on Mondays at 03:00 UTC (and on demand) and opens a pull request with the changes; nothing is merged automatically. The PR body lists added and removed models and size changes, and the PR runs the same checks as any other.

The script (`npm run update-models`, code in `scripts/update-models/`) fetches the most downloaded models per task plus the Xenova and onnx-community ONNX models, reads file sizes from the Hub (`?blobs=true`) or safetensors parameter counts, retries rate-limited requests with backoff, and fails if more than 10% of requests fail. Fresh data replaces the stored copy of a model; `specialization`, `runtime` and `browserModelId` are kept. Add an `HF_TOKEN` repository secret to raise the Hub rate limit. `npm run update-models:dry-run` previews a run locally.
