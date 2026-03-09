import { describe, test, expect } from 'vitest';
import tasksData from '../src/lib/data/tasks.json';

describe('Edge Maturity Labels', () => {
  const validMaturityLevels = ['excellent', 'good', 'limited', 'emerging'];

  test('every subcategory should have an edgeMaturity field', () => {
    for (const [category, categoryData] of Object.entries(tasksData.taskTaxonomy)) {
      for (const [subcategory, subcategoryData] of Object.entries(categoryData.subcategories)) {
        expect(
          subcategoryData.edgeMaturity,
          `${category}/${subcategory} missing edgeMaturity`
        ).toBeDefined();
        expect(
          validMaturityLevels,
          `${category}/${subcategory} has invalid edgeMaturity: ${subcategoryData.edgeMaturity}`
        ).toContain(subcategoryData.edgeMaturity);
      }
    }
  });

  test('every subcategory should have edgeNotes', () => {
    for (const [category, categoryData] of Object.entries(tasksData.taskTaxonomy)) {
      for (const [subcategory, subcategoryData] of Object.entries(categoryData.subcategories)) {
        expect(
          subcategoryData.edgeNotes,
          `${category}/${subcategory} missing edgeNotes`
        ).toBeDefined();
        expect(subcategoryData.edgeNotes.length).toBeGreaterThan(10);
      }
    }
  });
});
