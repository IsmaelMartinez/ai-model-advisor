#!/usr/bin/env node

/**
 * CLI for Model Metadata Aggregation
 * Usage: node src/lib/aggregation/cli.js [options]
 */

import ModelAggregator from './ModelAggregator.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    maxModelsPerCategory: 10,
    includeUpdated: true,
    validateAccuracy: true,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--max-models':
        options.maxModelsPerCategory = parseInt(args[++i]) || 10;
        break;
      case '--no-validation':
        options.validateAccuracy = false;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (arg.startsWith('--')) {
          console.warn(`Unknown option: ${arg}`);
        }
    }
  }

  return options;
}

// Show help message
function showHelp() {
  console.log(`
Model Metadata Aggregation CLI

Usage: node src/lib/aggregation/cli.js [options]

Options:
  --dry-run              Run without saving changes
  --max-models N         Maximum models per category (default: 10)
  --no-validation        Skip accuracy validation
  --help, -h             Show this help message

Environment Variables:
  HF_TOKEN              Hugging Face API token (optional, for higher rate limits)

Examples:
  # Dry run to preview changes
  node src/lib/aggregation/cli.js --dry-run

  # Update with API token
  HF_TOKEN=your_token node src/lib/aggregation/cli.js

  # Limit to 5 models per category
  node src/lib/aggregation/cli.js --max-models 5
`);
}

// Main CLI function
async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    return;
  }

  console.log('🤖 AI Model Advisor - Metadata Aggregation CLI');
  console.log('='.repeat(50));

  // Check for API token
  if (!process.env.HF_TOKEN) {
    console.log('⚠️  No Hugging Face token found.');
    console.log('   Set HF_TOKEN environment variable or use --token option');
    console.log('   Some features may be limited without authentication.\n');
  }

  try {
    // Initialize aggregator
    const aggregator = new ModelAggregator({
      huggingFaceToken: process.env.HF_TOKEN,
      dataPath: join(__dirname, '../data')
    });

    // Run aggregation
    const result = await aggregator.aggregateModels(options);

    if (result.success) {
      console.log('✅ Aggregation completed successfully!');
      
      if (options.dryRun) {
        console.log('\n💡 This was a dry run. To apply changes, run without --dry-run');
      } else {
        console.log('\n💡 Model dataset has been updated.');
        console.log('   Review changes and commit to version control.');
      }
    } else {
      console.error('❌ Aggregation failed:', result.error);
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Unexpected error:', error.message);
    process.exit(1);
  }
}

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('💥 CLI error:', error.message);
    process.exit(1);
  });
}