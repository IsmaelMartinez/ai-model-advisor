# Claude Skills for AI Model Advisor

This directory contains specialized skills to help AI assistants work effectively with the AI Model Advisor project.

## Available Skills

### 🧪 test-runner
**Purpose:** Run the Vitest suite and interpret results
**Use when:** User asks to run tests, before commits, or validating changes

**Commands:**
- `npm test` — full suite (10 files, 136 tests, ~2s)

### 📦 model-updater
**Purpose:** Update model database from HuggingFace Hub
**Use when:** User wants to refresh model data or add models from HuggingFace

**Workflow:**
1. Dry run first (`npm run update-models:dry-run`)
2. Review changes
3. Run actual update
4. Validate with tests
5. Review git diff
6. Commit

### ➕ add-model
**Purpose:** Interactive guide for manually adding new models
**Use when:** User wants to add a specific model not in HuggingFace updates

**Steps:**
1. Gather model information
2. Determine category and tier
3. Calculate environmental score
4. Create model entry in models.json
5. Validate JSON
6. Test in UI
7. Commit

### 🚀 deployment-check
**Purpose:** Pre-deployment validation checklist
**Use when:** User wants to deploy or asks "is this ready to deploy?"

**Validates:**
- Tests pass
- Build succeeds
- Preview works
- Accessibility
- Configuration
- Data integrity
- Git status
- GitHub Actions ready

## How to Use Skills

Skills are automatically available when working with this repository. AI assistants can invoke them when the context matches the skill's purpose.

**Example usage:**
- "Run tests" → Invokes `test-runner` skill
- "Update models" → Invokes `model-updater` skill
- "Add a new model" → Invokes `add-model` skill
- "Ready to deploy?" → Invokes `deployment-check` skill

## Skill Structure

Each skill contains:
- **Description:** What the skill does
- **Tags:** Categories for the skill
- **Decision trees:** When to use different approaches
- **Commands:** Exact commands to run
- **Validation:** How to verify success
- **Troubleshooting:** Common issues and solutions

## Creating New Skills

To add a new skill:

1. Create a new `.md` file in this directory
2. Add frontmatter with description and tags:
   ```markdown
   ---
   description: What this skill does
   tags: [tag1, tag2]
   ---
   ```
3. Document the workflow, commands, and validation steps
4. Test the skill with common scenarios
5. Update this README

## Best Practices

1. **Invoke skills proactively** - Don't wait for user to ask
2. **Follow the workflow** - Skills include tested procedures
3. **Validate at each step** - Don't skip validation commands
4. **Explain what you're doing** - Tell user which skill you're using
5. **Adapt when needed** - Skills are guides, not rigid scripts

## Resources

- Main documentation: `/CLAUDE.md`
- Project status: `/project-status.md`
- Project vision: `/project-vision.md`
- Architecture decisions: `/docs/adrs/`
- Model curation: `/docs/model-curation-process.md`
