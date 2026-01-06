# ADR-0005: Automated Model Dataset Updates

## Status
Accepted

## Date
2025-11-11

## Context

The AI Model Advisor requires fresh model data to remain valuable. Without automation, the dataset would become stale within 3-6 months as new models are released and old models become deprecated.

### Requirements

1. **Continuous Freshness**: Keep model data current without manual intervention
2. **Zero Cost**: Use only free-tier services
3. **Human Oversight**: Maintain quality control via reviewed pull requests
4. **Minimal Maintenance**: Automated with simple monitoring

### Problem: "Snapshot Decay"

| Issue | Impact |
|-------|--------|
| Missing new models | Users miss better options |
| Outdated metrics | Wrong recommendations |
| Deprecated models | Broken links |

## Decision

**We will implement automated daily model updates using GitHub Actions and Hugging Face API.**

### Architecture

```
GitHub Actions (2 AM UTC) → ModelAggregator.js → Hugging Face API → PR → Human Review → Deploy
```

### Implementation

1. **Scheduled Trigger**: GitHub Actions workflow runs daily at 2 AM UTC
2. **Data Source**: Hugging Face API (free tier, ~160 calls/day)
3. **Processing**: Categorize by task, tier by size, calculate environmental scores
4. **PR Workflow**: Automated PR creation with auto-merge when tests pass
5. **Quality Checks**: Validation before merge, tests pass requirement

### Key Files

| File | Purpose |
|------|---------|
| `.github/workflows/update-models.yml` | Daily automation workflow |
| `src/lib/aggregation/ModelAggregator.js` | Fetches and processes HF data |
| `src/lib/aggregation/cli.js` | CLI interface for manual runs |
| `src/lib/data/models.json` | Target file for updates |

## Consequences

### Positive

1. **Always Fresh**: Dataset stays current automatically
2. **Zero Cost**: GitHub Actions + HF API free tiers sufficient
3. **Quality Maintained**: Human review catches bad data
4. **Transparent**: All changes via reviewed PRs
5. **Maintainable**: Simple monitoring, easy troubleshooting

### Negative

1. **API Dependency**: Relies on Hugging Face API availability
2. **Review Burden**: Daily PRs require maintainer attention
3. **Accuracy Limits**: Phase 1 uses estimated metrics (Phase 2 will extract real data)

### Mitigation

1. **API Issues**: Graceful failure with notification; manual trigger available
2. **Review Load**: PRs only created when changes detected; most days have few/no changes
3. **Accuracy**: Planned Phase 2 will add Gemini-based validation and real metric extraction

### Update (2026-01-06): Auto-merge Implementation

**Rationale**: Historical data shows manual review adds latency without catching issues that automated tests would miss. Quality is now enforced through:
- Test suite validation (data structure, build success)
- CI/CD pipeline gates
- Automatic rollback capability via Git

**Override**: This supersedes the original "human review" requirement in favor of test-based quality gates.

## Phases

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1** | ✅ Active | Basic HF API automation |
| **Phase 2** | 📋 Planned | Gemini validation & smart extraction |
| **Phase 3** | 💡 Future | Community features & feedback |

## Alternatives Considered

### Alternative 1: Manual Monthly Updates
**Why Rejected**: Too labor-intensive, high risk of staleness

### Alternative 2: Real-time API Integration
**Why Rejected**: Violates offline-first requirement, adds latency

### Alternative 3: Weekly Updates
**Why Rejected**: Daily provides better freshness with acceptable PR volume

## Usage

```bash
# Manual update (local)
npm run update-models

# Dry run (preview changes)
npm run update-models:dry-run
```

## Related Documents

- [Auto Update Strategy](../auto-update-strategy.md) - Detailed operational documentation
- [Model Curation Process](../model-curation-process.md) - Data collection details
- [Quick Start Guide](../quick-start-auto-updates.md) - Setup instructions

---

**Decision made**: 2025-11-11
**Status**: Accepted - Phase 1 Active

