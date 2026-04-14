---
description: Run tests and interpret results for the AI Model Advisor project
tags: [testing, ci, quality]
---

# Test Runner Skill

You are helping run tests for the AI Model Advisor project.

## Test Commands

```bash
# Run the full test suite (~2s)
npm test
```

All tests run in Vitest under the default `npm test` command — there is no
separate slow/LLM test tier. The full suite is fast enough to run on every
commit.

## Expected Results

- 10 test files, 136 tests total
- Runtime: ~2 seconds
- All should pass ✅

Test files cover:
- Acceptance (`acceptance.test.js`)
- Integration (`integration.test.js`)
- Data quality (`data-quality.test.js`)
- Runtime metadata (`runtime-metadata.test.js`)
- Edge maturity (`edge-maturity.test.js`)
- Deployment filter (`deployment-filter.test.js`)
- Accuracy filter (`accuracy-filter.test.js`)
- Code assistant (`code-assistant.test.js`)
- Model aggregator (`model-aggregator.test.js`)
- Precomputed embeddings (`precomputed-embeddings.test.js`)

## After Running Tests

1. **If tests fail:**
   - Check the error messages
   - Fix the issues
   - Run `npm test` again
   - DO NOT commit if tests fail

2. **All tests pass:**
   - Proceed with commit
   - Build and preview: `npm run build && npm run preview`
   - Verify functionality in browser

## Usage

When the user asks to "run tests", run `npm test` and report results.
