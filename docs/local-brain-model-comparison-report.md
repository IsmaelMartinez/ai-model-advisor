# Local-Brain Model Comparison Report: qwen3:30b vs qwen3-coder:30b

## Summary

Testing local-brain v0.7.1 with two 30B parameter Qwen models on a real-world SvelteKit codebase (~150 files, nested `src/lib/` structure) revealed significant differences in navigation efficiency, tool usage patterns, and task completion rates.

## Environment

- local-brain version: 0.7.1 (via uvx)
- Ollama version: 0.13.x
- Models tested: `qwen3:30b`, `qwen3-coder:30b`
- Test repository: SvelteKit app with nested structure (`src/lib/classification/`, `src/lib/recommendation/`, etc.)
- Platform: macOS Darwin 25.2.0

## Test 1: Architecture Exploration

**Prompt**: "Analyze the architecture of this repository. First list the src/lib directory structure, then read the key files: ModelSelector.js, EmbeddingTaskClassifier.js, and EnvironmentalImpactCalculator.js."

### qwen3-coder:30b Results (Success)

| Step | Duration | Action | Result |
|------|----------|--------|--------|
| 1 | 19.47s | `list_directory(path="src/lib", pattern="**/*")` | Found all 19 files |
| 2 | 3.34s | `read_file(path="src/lib/recommendation/ModelSelector.js")` | Success |
| 3 | 6.27s | `read_file(path="src/lib/classification/EmbeddingTaskClassifier.js")` | Success |
| 4 | 8.09s | `read_file(path="src/lib/environmental/EnvironmentalImpactCalculator.js")` | Success |
| 5 | 16.48s | Synthesized findings and called `final_answer()` | Correct summary |

**Total**: ~53 seconds, 5 steps, 21.5K input tokens, 561 output tokens

### qwen3:30b Results (Failure)

| Step | Duration | Action | Result |
|------|----------|--------|--------|
| 1 | 189.98s | (thinking/empty output) | None |
| 2 | 186.70s | `list_directory(path=".", pattern="*.js")` | Found only root config files |
| 3 | 259.91s | `list_directory(path="src", pattern="*.js")` | Found only hooks.server.js, index.js |
| 4 | 119.37s | `list_directory(path="src/ai", pattern="*.js")` | Error: directory doesn't exist |
| 5 | 84.91s | `search_code(pattern="ModelSelector", file_path="src")` | Error: 'src' is not a file |
| 6 | 139.34s | `read_file("src/ModelSelector.js")` | Error: file not found |
| 7+ | ... | Continued searching wrong paths | Never found files |

**Total**: ~18 minutes (1100+ seconds), 9+ steps, 31K+ input tokens, 9.5K output tokens

**Final answer from qwen3:30b**: "The files ModelSelector.js, EmbeddingTaskClassifier.js, and EnvironmentalImpactCalculator.js do not exist in the project structure" (incorrect)

### Key Difference

qwen3-coder:30b immediately tried `src/lib` with a recursive glob pattern. qwen3:30b searched flat paths (`src/*.js`) and never discovered the nested `lib/` directory structure.

## Test 2: Critical Code Review

**Prompt**: "Be CRITICAL: Identify design flaws, anti-patterns, scalability issues, and potential bugs in this codebase. Read the key files in src/lib/ and provide specific code-level critique."

### qwen3-coder:30b Results (Tool Mismatch)

| Step | Duration | Action | Result |
|------|----------|--------|--------|
| 1 | 4.47s | `import os` | InterpreterError: Import of os is not allowed |
| 2 | 6.31s | `import os` (retry) | Same error |
| 3 | 67.62s | Gave up, provided generic framework | No actual code analysis |

**Issue**: qwen3-coder:30b's coding instincts led it to try native Python file operations instead of using local-brain's provided tools (`list_directory`, `read_file`). After import failures, it didn't pivot to using the available tools.

### qwen3:30b Results (Navigation Failure)

Similar to Test 1 - spent 18+ minutes searching wrong paths, eventually concluded files don't exist.

## Test 3: Simple Queries (Both Models)

For simpler queries that didn't require deep navigation, both models produced correct but terse answers:

| Query | qwen3:30b | qwen3-coder:30b |
|-------|-----------|-----------------|
| "ModelSelector philosophy" | "Tier priority followed by size within tier" | (not tested separately) |
| "Classification fallback chain" | "embedding -> semantic -> keyword" | (not tested separately) |
| "Environmental scoring critique" | Identified size-only limitation | (not tested separately) |

## Identified Issues

### Issue 1: qwen3:30b Poor Directory Navigation

qwen3:30b struggles with nested directory structures. It searches flat paths and doesn't discover subdirectories effectively.

**Reproduction**:
```bash
uvx local-brain -m qwen3:30b "List the files in src/lib/ and read ModelSelector.js"
```

**Expected**: Model finds `src/lib/recommendation/ModelSelector.js`
**Actual**: Model searches `src/ModelSelector.js`, concludes file doesn't exist

**Suggested fix**: Consider adding a "discovery" step in the system prompt that encourages models to use recursive glob patterns (`**/*`) when exploring unfamiliar directories.

### Issue 2: qwen3-coder:30b Uses Native Python Instead of Tools

qwen3-coder:30b attempts `import os` and native file operations instead of using provided tools like `list_directory()` and `read_file()`.

**Reproduction**:
```bash
uvx local-brain -m qwen3-coder:30b "Read all Python files in the current directory and analyze them"
```

**Expected**: Model uses `list_directory()` and `read_file()`
**Actual**: Model tries `import os`, `os.walk()`, `os.listdir()` - all blocked

**Suggested fix**:
1. Add explicit guidance in the system prompt: "Use the provided tools (list_directory, read_file, search_code) for file operations. Do not use Python's os module."
2. Or add `os` to authorized imports (security implications to consider)

### Issue 3: Slow Step Duration for qwen3:30b

Each step takes 2-4 minutes for qwen3:30b vs 3-20 seconds for qwen3-coder:30b.

| Model | Avg Step Duration | Token Efficiency |
|-------|-------------------|------------------|
| qwen3:30b | 120-260 seconds | Low (high output token count) |
| qwen3-coder:30b | 4-20 seconds | High (concise outputs) |

This appears to be model behavior rather than a local-brain issue, but it significantly impacts exploration breadth within reasonable time limits.

### Issue 4: Max Steps Reached Before Task Completion

qwen3:30b frequently hits max steps while still searching for files, resulting in incomplete or incorrect conclusions.

**Suggestion**: Consider adaptive step limits or early termination when the model is clearly stuck in a search loop.

## Recommendations

### For Documentation

1. Add qwen3-coder models to the "Recommended models" list - they're dramatically better for code exploration tasks
2. Document that qwen3:30b struggles with nested directories
3. Add examples showing correct tool usage patterns for directory exploration

### For System Prompt

Consider adding guidance like:
```
When exploring a codebase:
1. Use list_directory(path=".", pattern="**/*") to discover the full structure
2. Use read_file() to examine specific files - provide the full path
3. Do NOT use Python's os module - use the provided tools instead
```

### For Model Selection Logic

Current tier system in `--list-models`:
```
Tier 1: qwen3:latest (general purpose)
Tier 2: qwen2.5:3b (resource-constrained)
```

Suggested addition:
```
Tier 1: qwen3-coder:* (code analysis - BEST for codebase exploration)
Tier 1: qwen3:latest (general purpose)
```

## Raw Performance Data

### qwen3-coder:30b Architecture Analysis
```
Step 1: 19.47s | Input: 2,595 | Output: 58
Step 2: 3.34s  | Input: 5,487 | Output: 116
Step 3: 6.27s  | Input: 9,516 | Output: 168
Step 4: 8.09s  | Input: 15,040 | Output: 219
Step 5: 16.48s | Input: 21,500 | Output: 561
Total: ~53s    | Total Input: 21,500 | Total Output: 561
```

### qwen3:30b Architecture Analysis
```
Step 1: 189.98s | Input: 2,624 | Output: 1,817
Step 2: 186.70s | Input: 5,306 | Output: 2,239
Step 3: 259.91s | Input: 8,149 | Output: 2,634
Step 4: 119.37s | Input: 11,147 | Output: 4,099
Step 5: 84.91s  | Input: 14,364 | Output: 5,042
Step 6: 139.34s | Input: 17,916 | Output: 6,487
...continued to step 9...
Total: ~1100s   | Total Input: 31,066 | Total Output: 9,517
```

## Conclusion

qwen3-coder:30b is significantly more effective for codebase exploration when it uses the provided tools correctly. The main failure mode is attempting native Python imports instead of agent tools. qwen3:30b has fundamental issues with directory navigation that make it unsuitable for exploring nested codebases.

For local-brain's recommended models list, qwen3-coder variants should be prioritized for code analysis tasks, with documentation noting the import limitation workaround.
