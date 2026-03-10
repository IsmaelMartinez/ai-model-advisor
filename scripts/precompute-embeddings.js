/**
 * Pre-compute reference embeddings at build time.
 * Generates a JSON file with embeddings for all task examples in tasks.json.
 *
 * Usage: node scripts/precompute-embeddings.js
 */
import { pipeline, env } from '@huggingface/transformers';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

env.allowLocalModels = true;
env.useBrowserCache = false;

async function main() {
  const tasksPath = resolve(__dirname, '../src/lib/data/tasks.json');
  const outputPath = resolve(__dirname, '../src/lib/data/reference-embeddings.json');
  const modelName = 'Xenova/all-MiniLM-L6-v2';

  console.log('Loading tasks data...');
  const tasksData = JSON.parse(readFileSync(tasksPath, 'utf-8'));

  const examples = [];
  for (const [category, categoryData] of Object.entries(tasksData.taskTaxonomy)) {
    for (const [subcategory, subcategoryData] of Object.entries(categoryData.subcategories || {})) {
      for (const text of (subcategoryData.examples || [])) {
        examples.push({ text, category, subcategory, label: categoryData.label });
      }
    }
  }

  console.log(`Found ${examples.length} examples to embed.`);
  console.log(`Loading model: ${modelName}...`);

  const embedder = await pipeline('feature-extraction', modelName, { quantized: true });

  console.log('Computing embeddings...');
  const embeddings = [];
  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    const output = await embedder(example.text, { pooling: 'mean', normalize: true });
    embeddings.push({
      text: example.text,
      category: example.category,
      subcategory: example.subcategory,
      label: example.label,
      embedding: Array.from(output.data)
    });

    if ((i + 1) % 50 === 0) {
      console.log(`  ${i + 1}/${examples.length} done`);
    }
  }

  const result = {
    modelName,
    generatedAt: new Date().toISOString(),
    embeddingDimension: 384,
    count: embeddings.length,
    embeddings
  };

  writeFileSync(outputPath, JSON.stringify(result));
  const sizeMB = (JSON.stringify(result).length / 1024 / 1024).toFixed(1);
  console.log(`Wrote ${embeddings.length} embeddings to ${outputPath} (${sizeMB}MB)`);
}

main().catch(console.error);
