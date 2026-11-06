import tasksData from '../../src/lib/data/tasks.json';

// Deterministic stand-in for models.json: one model per tier for every task in
// tasks.json, so tests of ranking and selection do not change when the weekly
// updater refreshes the real data.
// Listed largest first, with two models in the lightweight tier, so a ranking that
// merely returns its input in order fails the tests.
const SIZES_MB = [
  ['xlarge', 40000],
  ['advanced', 10000],
  ['standard', 1000],
  ['lightweight', 80],
  ['lightweight', 20]
];

export const fixtureModels = {
  schemaVersion: 2,
  lastUpdated: '2026-01-01',
  models: Object.entries(tasksData.taskTaxonomy).flatMap(([category, { subcategories }]) =>
    Object.keys(subcategories).flatMap(subcategory =>
      SIZES_MB.map(([tier, sizeMB]) => ({
        id: `fixture_${subcategory}_${sizeMB}`,
        name: `Fixture ${subcategory.replace(/_/g, ' ')} ${sizeMB}`,
        huggingFaceId: `fixture/${subcategory}-${sizeMB}`,
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
