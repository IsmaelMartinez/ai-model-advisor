import tasksData from '../../src/lib/data/tasks.json';

// Deterministic stand-in for models.json: one model per tier for every task in
// tasks.json, so tests of ranking and selection do not change when the weekly
// updater refreshes the real data.
const TIER_SIZES_MB = { lightweight: 50, standard: 1000, advanced: 10000, xlarge: 40000 };

export const fixtureModels = {
  schemaVersion: 2,
  lastUpdated: '2026-01-01',
  models: Object.entries(tasksData.taskTaxonomy).flatMap(([category, { subcategories }]) =>
    Object.keys(subcategories).flatMap(subcategory =>
      Object.entries(TIER_SIZES_MB).map(([tier, sizeMB]) => ({
        id: `fixture_${subcategory}_${tier}`,
        name: `Fixture ${subcategory.replace(/_/g, ' ')} ${tier}`,
        huggingFaceId: `fixture/${subcategory}-${tier}`,
        description: `${tier} fixture model for ${subcategory}`,
        sizeMB,
        accuracy: null,
        tasks: [{ category, subcategory }],
        deploymentOptions: sizeMB <= 500 ? ['browser', 'edge', 'cloud'] : ['cloud', 'server'],
        frameworks: ['PyTorch'],
        lastUpdated: '2026-01-01'
      }))
    )
  )
};
