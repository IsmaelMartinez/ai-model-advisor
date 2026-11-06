import { describe, test, expect, beforeAll, afterEach, vi } from 'vitest';
import { ModelAggregator } from '../src/lib/aggregation/ModelAggregator.js';
import { tierForSize, environmentalScoreForSize } from '../src/lib/data/constants.js';

describe('ModelAggregator', () => {
  let aggregator;

  beforeAll(() => {
    aggregator = new ModelAggregator();
  });

  describe('estimateModelSize', () => {
    describe('Primary Path: Siblings File Sizes', () => {
      test('calculates size from siblings file sizes', () => {
        const rawModel = { id: 'test/model' };
        const detailedInfo = {
          siblings: [
            { rfilename: 'model-00001.safetensors', size: 5000000000 }, // 5GB
            { rfilename: 'model-00002.safetensors', size: 5000000000 }, // 5GB
            { rfilename: 'config.json', size: 1000 } // Should be ignored
          ]
        };
        
        const sizeMB = aggregator.estimateModelSize(rawModel, detailedInfo);
        // 10GB = 10 * 1024 MB = 10240 MB, but we use 1000000000 bytes
        // 10000000000 / (1024 * 1024) = 9536.74 MB
        expect(sizeMB).toBe(9537); // Rounded
      });

      test('sums multiple .safetensors shards', () => {
        const rawModel = { id: 'test/sharded-model' };
        const detailedInfo = {
          siblings: [
            { rfilename: 'model-00001-of-00004.safetensors', size: 4000000000 },
            { rfilename: 'model-00002-of-00004.safetensors', size: 4000000000 },
            { rfilename: 'model-00003-of-00004.safetensors', size: 4000000000 },
            { rfilename: 'model-00004-of-00004.safetensors', size: 4000000000 }
          ]
        };
        
        const sizeMB = aggregator.estimateModelSize(rawModel, detailedInfo);
        // 16GB = 16000000000 bytes / (1024 * 1024) = 15258.79 MB
        expect(sizeMB).toBe(15259);
      });

      test('includes .bin files in size calculation', () => {
        const rawModel = { id: 'test/pytorch-model' };
        const detailedInfo = {
          siblings: [
            { rfilename: 'pytorch_model.bin', size: 2000000000 }
          ]
        };
        
        const sizeMB = aggregator.estimateModelSize(rawModel, detailedInfo);
        expect(sizeMB).toBe(1907); // 2GB in MB
      });

      test('includes .onnx files in size calculation', () => {
        const rawModel = { id: 'test/onnx-model' };
        const detailedInfo = {
          siblings: [
            { rfilename: 'model.onnx', size: 500000000 }
          ]
        };
        
        const sizeMB = aggregator.estimateModelSize(rawModel, detailedInfo);
        expect(sizeMB).toBe(477); // 500MB in MB
      });
    });

    describe('Fallback: safetensors.total (param count)', () => {
      test('calculates size from safetensors.total param count', () => {
        const rawModel = { id: 'test/model' };
        const detailedInfo = {
          safetensors: { total: 7000000000 } // 7B params
        };
        
        const sizeMB = aggregator.estimateModelSize(rawModel, detailedInfo);
        // 7B params * 2 bytes / (1024 * 1024) = 13351.44 MB
        expect(sizeMB).toBe(13351);
      });

      test('calculates size for 1B param model', () => {
        const rawModel = { id: 'test/small-model' };
        const detailedInfo = {
          safetensors: { total: 1000000000 } // 1B params
        };
        
        const sizeMB = aggregator.estimateModelSize(rawModel, detailedInfo);
        // 1B params * 2 bytes / (1024 * 1024) = 1907.35 MB
        expect(sizeMB).toBe(1907);
      });
    });

    describe('Fallback: safetensors.parameters per dtype', () => {
      test('uses dtype byte widths, not safetensors.total (Ornith-1.0-35B case)', () => {
        const detailedInfo = {
          safetensors: { total: 664944, parameters: { BF16: 35107181936 } }
        };

        // 35,107,181,936 params * 2 bytes = 66,962 MiB
        expect(aggregator.estimateModelSize({ id: 'test/model' }, detailedInfo)).toBe(66962);
      });

      test('sums mixed dtypes', () => {
        const detailedInfo = {
          safetensors: { parameters: { F32: 1048576, I8: 1048576 } }
        };

        // 4 MiB + 1 MiB
        expect(aggregator.estimateModelSize({ id: 'test/model' }, detailedInfo)).toBe(5);
      });
    });

    describe('ONNX variants', () => {
      const MB = 1024 * 1024;

      test('sums the encoder and decoder of one precision, not every precision', () => {
        const detailedInfo = {
          siblings: [
            { rfilename: 'onnx/encoder_model.onnx', size: 100 * MB },
            { rfilename: 'onnx/decoder_model.onnx', size: 200 * MB },
            { rfilename: 'onnx/encoder_model_q4.onnx', size: 30 * MB },
            { rfilename: 'onnx/decoder_model_q4.onnx', size: 60 * MB }
          ]
        };
        expect(aggregator.estimateModelSize({ id: 'test/whisper' }, detailedInfo)).toBe(300);
      });

      test('adds external data files to their variant and never reports 0 MB', () => {
        const detailedInfo = {
          siblings: [
            { rfilename: 'onnx/model.onnx', size: 1 * MB },
            { rfilename: 'onnx/model.onnx_data', size: 1000 * MB },
            { rfilename: 'onnx/model.onnx_data_1', size: 500 * MB },
            { rfilename: 'onnx/model_q4.onnx', size: 1 * MB },
            { rfilename: 'onnx/model_q4.onnx_data', size: 600 * MB }
          ]
        };
        expect(aggregator.estimateModelSize({ id: 'test/model' }, detailedInfo)).toBe(1501);
        expect(aggregator.estimateModelSize({ id: 'test/tiny' }, { siblings: [{ rfilename: 'model.onnx', size: 200 * 1024 }] })).toBe(1);
      });

      test('sums GGUF shards of one quantization', () => {
        const detailedInfo = {
          siblings: [
            { rfilename: 'model.Q8_0-00001-of-00002.gguf', size: 400 * MB },
            { rfilename: 'model.Q8_0-00002-of-00002.gguf', size: 400 * MB },
            { rfilename: 'model.Q4_K_M.gguf', size: 500 * MB }
          ]
        };
        expect(aggregator.estimateModelSize({ id: 'test/model' }, detailedInfo)).toBe(800);
      });

      test('counts the largest GGUF quantization, not all of them', () => {
        const detailedInfo = {
          siblings: [
            { rfilename: 'model.Q4_K_M.gguf', size: 400 * MB },
            { rfilename: 'model.Q8_0.gguf', size: 700 * MB }
          ]
        };
        expect(aggregator.estimateModelSize({ id: 'test/model' }, detailedInfo)).toBe(700);
      });
    });

    describe('Weight formats are alternatives, not additive', () => {
      test('counts safetensors only when .bin copies exist', () => {
        const detailedInfo = {
          siblings: [
            { rfilename: 'model.safetensors', size: 100 * 1024 * 1024 },
            { rfilename: 'pytorch_model.bin', size: 100 * 1024 * 1024 }
          ]
        };
        expect(aggregator.estimateModelSize({ id: 'test/model' }, detailedInfo)).toBe(100);
      });

      test('counts the largest single .onnx variant', () => {
        const detailedInfo = {
          siblings: [
            { rfilename: 'onnx/model.onnx', size: 90 * 1024 * 1024 },
            { rfilename: 'onnx/model_fp16.onnx', size: 45 * 1024 * 1024 },
            { rfilename: 'onnx/model_quantized.onnx', size: 22 * 1024 * 1024 }
          ]
        };
        expect(aggregator.estimateModelSize({ id: 'test/model' }, detailedInfo)).toBe(90);
      });
    });

    describe('Fallback: Name pattern matching', () => {
      test('extracts size from 7b pattern', () => {
        const sizeMB = aggregator.estimateModelSize({ id: 'org/llama-7b-instruct' }, null);
        expect(sizeMB).toBe(14000); // 7B * 2000 MB
      });

      test('extracts size from 70b pattern', () => {
        const sizeMB = aggregator.estimateModelSize({ id: 'org/qwen-70b' }, null);
        expect(sizeMB).toBe(140000); // 70B * 2000 MB
      });

      test('extracts size from 1.3b pattern', () => {
        const sizeMB = aggregator.estimateModelSize({ id: 'org/model-1.3b' }, null);
        expect(sizeMB).toBe(2600); // 1.3B * 2000 MB
      });

      test('extracts size with underscore separator', () => {
        const sizeMB = aggregator.estimateModelSize({ id: 'org/model_7b_v2' }, null);
        expect(sizeMB).toBe(14000);
      });

      test('extracts size at end of name', () => {
        const sizeMB = aggregator.estimateModelSize({ id: 'org/model-3b' }, null);
        expect(sizeMB).toBe(6000);
      });
    });

    describe('Fallback: Heuristics', () => {
      test('returns 50 for tiny/nano models', () => {
        expect(aggregator.estimateModelSize({ id: 'org/bert-tiny' }, null)).toBe(50);
        expect(aggregator.estimateModelSize({ id: 'org/model-nano' }, null)).toBe(50);
      });

      test('returns 150 for small/mobile models', () => {
        expect(aggregator.estimateModelSize({ id: 'org/vit-small' }, null)).toBe(150);
        expect(aggregator.estimateModelSize({ id: 'org/mobilenet-v2' }, null)).toBe(150);
      });

      test('returns 400 for base models (not large)', () => {
        expect(aggregator.estimateModelSize({ id: 'org/bert-base' }, null)).toBe(400);
      });

      test('returns 800 for medium models', () => {
        expect(aggregator.estimateModelSize({ id: 'org/gpt2-medium' }, null)).toBe(800);
      });

      test('returns 1500 for large/xl models', () => {
        expect(aggregator.estimateModelSize({ id: 'org/gpt-large' }, null)).toBe(1500);
        expect(aggregator.estimateModelSize({ id: 'org/model-xl' }, null)).toBe(1500);
      });

      test('returns 5000 for huge models', () => {
        // Note: 'xxl' contains 'xl' so it matches 'xl' check first (returns 1500)
        // Only 'huge' reaches the 5000 heuristic
        expect(aggregator.estimateModelSize({ id: 'org/model-huge' }, null)).toBe(5000);
      });

      test('xxl matches xl pattern (returns 1500)', () => {
        // This is expected behavior - 'xxl' contains 'xl'
        expect(aggregator.estimateModelSize({ id: 'org/model-xxl' }, null)).toBe(1500);
      });

      test('returns 200 for unknown models (default)', () => {
        expect(aggregator.estimateModelSize({ id: 'org/unknown-model' }, null)).toBe(200);
        expect(aggregator.estimateModelSize({ id: 'org/custom-v1' }, null)).toBe(200);
      });
    });

    describe('Edge Cases', () => {
      test('handles empty siblings array', () => {
        const rawModel = { id: 'org/unknown-model' };
        const detailedInfo = { siblings: [] };
        
        // Should fall through to default (200)
        const sizeMB = aggregator.estimateModelSize(rawModel, detailedInfo);
        expect(sizeMB).toBe(200);
      });

      test('handles siblings with zero sizes', () => {
        const rawModel = { id: 'org/unknown-model' };
        const detailedInfo = { 
          siblings: [{ rfilename: 'model.safetensors', size: 0 }]
        };
        
        // Should fall through to default (200)
        const sizeMB = aggregator.estimateModelSize(rawModel, detailedInfo);
        expect(sizeMB).toBe(200);
      });

      test('ignores non-model files in siblings', () => {
        const rawModel = { id: 'org/unknown-model' };
        const detailedInfo = {
          siblings: [
            { rfilename: 'README.md', size: 1000000000 },
            { rfilename: 'config.json', size: 1000000000 },
            { rfilename: 'tokenizer.json', size: 1000000000 }
          ]
        };
        
        // Should fall through to default (200) since no model files
        const sizeMB = aggregator.estimateModelSize(rawModel, detailedInfo);
        expect(sizeMB).toBe(200);
      });

      test('handles null detailedInfo', () => {
        const rawModel = { id: 'org/llama-7b' };
        const sizeMB = aggregator.estimateModelSize(rawModel, null);
        expect(sizeMB).toBe(14000); // Falls back to name pattern
      });

      test('handles undefined detailedInfo', () => {
        const rawModel = { id: 'org/model-small' };
        const sizeMB = aggregator.estimateModelSize(rawModel, undefined);
        expect(sizeMB).toBe(150); // Falls back to heuristics
      });

      test('prefers siblings over safetensors.total', () => {
        const rawModel = { id: 'test/model' };
        const detailedInfo = {
          siblings: [
            { rfilename: 'model.safetensors', size: 1000000000 } // 1GB
          ],
          safetensors: { total: 70000000000 } // Would give wrong size if used
        };
        
        const sizeMB = aggregator.estimateModelSize(rawModel, detailedInfo);
        // Should use siblings: 1GB = 954 MB
        expect(sizeMB).toBe(954);
      });

      test('handles siblings with missing rfilename', () => {
        const rawModel = { id: 'org/unknown-model' };
        const detailedInfo = {
          siblings: [
            { size: 1000000000 }, // No rfilename
            { rfilename: 'model.safetensors', size: 500000000 }
          ]
        };
        
        // Should only count the valid file
        const sizeMB = aggregator.estimateModelSize(rawModel, detailedInfo);
        expect(sizeMB).toBe(477);
      });

      test('handles siblings with missing size', () => {
        const rawModel = { id: 'org/unknown-model' };
        const detailedInfo = {
          siblings: [
            { rfilename: 'model.safetensors' }, // No size
            { rfilename: 'model2.safetensors', size: 500000000 }
          ]
        };
        
        // Should handle undefined size as 0
        const sizeMB = aggregator.estimateModelSize(rawModel, detailedInfo);
        expect(sizeMB).toBe(477);
      });
    });
  });

  describe('tierForSize / environmentalScoreForSize', () => {
    test.each([
      [100, 'lightweight', 1],
      [500, 'lightweight', 1],
      [501, 'standard', 2],
      [4000, 'standard', 2],
      [4001, 'advanced', 3],
      [20000, 'advanced', 3],
      [20001, 'xlarge', 3],
      [140000, 'xlarge', 3]
    ])('%i MB is %s with score %i', (sizeMB, tier, score) => {
      expect(tierForSize(sizeMB)).toBe(tier);
      expect(environmentalScoreForSize(sizeMB)).toBe(score);
    });
  });

  describe('extractFrameworks', () => {
    test('detects PyTorch/TensorFlow from library_name "transformers"', () => {
      const frameworks = aggregator.extractFrameworks(
        { id: 'org/model' },
        { library_name: 'transformers' }
      );
      expect(frameworks).toContain('PyTorch');
      expect(frameworks).toContain('TensorFlow');
    });

    test('detects Transformers.js from library_name', () => {
      const frameworks = aggregator.extractFrameworks(
        { id: 'org/model' },
        { library_name: 'transformers.js' }
      );
      expect(frameworks).toContain('Transformers.js');
    });

    test('detects ONNX and Transformers.js from .onnx files in siblings', () => {
      const frameworks = aggregator.extractFrameworks(
        { id: 'org/model' },
        { siblings: [{ rfilename: 'model.onnx' }, { rfilename: 'config.json' }] }
      );
      expect(frameworks).toContain('ONNX');
      expect(frameworks).toContain('Transformers.js');
    });

    test('detects Transformers.js from model tags', () => {
      const frameworks = aggregator.extractFrameworks(
        { id: 'org/model', tags: ['transformers.js'] },
        {}
      );
      expect(frameworks).toContain('Transformers.js');
    });

    test('detects ONNX from model tags', () => {
      const frameworks = aggregator.extractFrameworks(
        { id: 'org/model' },
        { tags: ['onnx'] }
      );
      expect(frameworks).toContain('ONNX');
    });

    test('detects browser-ready frameworks for Xenova org', () => {
      const frameworks = aggregator.extractFrameworks(
        { id: 'Xenova/whisper-tiny' },
        {}
      );
      expect(frameworks).toContain('ONNX');
      expect(frameworks).toContain('Transformers.js');
    });

    test('detects browser-ready frameworks for onnx-community org', () => {
      const frameworks = aggregator.extractFrameworks(
        { id: 'onnx-community/whisper-base' },
        {}
      );
      expect(frameworks).toContain('ONNX');
      expect(frameworks).toContain('Transformers.js');
    });

    test('defaults to PyTorch when no indicators found', () => {
      const frameworks = aggregator.extractFrameworks(
        { id: 'org/unknown-model' },
        {}
      );
      expect(frameworks).toEqual(['PyTorch']);
    });

    test('defaults to PyTorch with null detailedInfo', () => {
      const frameworks = aggregator.extractFrameworks(
        { id: 'org/model' },
        null
      );
      expect(frameworks).toEqual(['PyTorch']);
    });

    test('combines library_name and siblings detection without duplicates', () => {
      const frameworks = aggregator.extractFrameworks(
        { id: 'Xenova/model' },
        {
          library_name: 'transformers.js',
          siblings: [{ rfilename: 'model.onnx' }]
        }
      );
      expect(frameworks).toContain('Transformers.js');
      expect(frameworks).toContain('ONNX');
      // No duplicates
      const tjsCount = frameworks.filter(f => f === 'Transformers.js').length;
      expect(tjsCount).toBe(1);
    });
  });

  describe('determineDeploymentOptions', () => {
    test('includes browser for small model WITH browser-compatible framework', () => {
      const options = aggregator.determineDeploymentOptions(50, { id: 'test' }, ['ONNX', 'Transformers.js']);
      expect(options).toContain('browser');
      expect(options).toContain('mobile');
    });

    test('excludes browser for small model WITHOUT browser-compatible framework', () => {
      const options = aggregator.determineDeploymentOptions(50, { id: 'test' }, ['PyTorch']);
      expect(options).not.toContain('browser');
      expect(options).not.toContain('mobile');
    });

    test('includes browser but not mobile for 200MB model with ONNX', () => {
      const options = aggregator.determineDeploymentOptions(200, { id: 'test' }, ['ONNX']);
      expect(options).toContain('browser');
      expect(options).not.toContain('mobile');
    });

    test('excludes browser for 600MB model even with ONNX', () => {
      const options = aggregator.determineDeploymentOptions(600, { id: 'test' }, ['ONNX']);
      expect(options).not.toContain('browser');
    });

    test('always includes edge for models ≤500MB', () => {
      const options = aggregator.determineDeploymentOptions(400, { id: 'test' }, ['PyTorch']);
      expect(options).toContain('edge');
    });

    test('includes cloud+server for models ≤4GB', () => {
      const options = aggregator.determineDeploymentOptions(2000, { id: 'test' }, ['PyTorch']);
      expect(options).toContain('cloud');
      expect(options).toContain('server');
    });

    test('only server for models >4GB', () => {
      const options = aggregator.determineDeploymentOptions(5000, { id: 'test' }, ['PyTorch']);
      expect(options).not.toContain('cloud');
      expect(options).toContain('server');
    });

    test('handles missing frameworks parameter gracefully', () => {
      const options = aggregator.determineDeploymentOptions(50, { id: 'test' });
      expect(options).not.toContain('browser');
      expect(options).toContain('edge');
    });

    test('recognizes TensorFlow.js as browser-compatible', () => {
      const options = aggregator.determineDeploymentOptions(80, { id: 'test' }, ['TensorFlow.js']);
      expect(options).toContain('browser');
      expect(options).toContain('mobile');
    });
  });

  describe('extractAccuracy', () => {
    test('does not invent accuracy from the model name', () => {
      expect(aggregator.extractAccuracy({ id: 'org/bert-large' }, null)).toBeNull();
      expect(aggregator.extractAccuracy({ id: 'org/some-model' }, null)).toBeNull();
    });
  });

  describe('processModels', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    test('skips models whose details could not be fetched instead of guessing', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false, status: 429, statusText: '429', headers: { get: () => null }, json: async () => ({})
      }));
      const agg = new ModelAggregator({ retryBaseDelayMs: 0 });

      const processed = await agg.processModels([{ id: 'a/b', downloads: 5 }], {});

      expect(processed).toEqual([]);
      expect(agg.stats.failedRequests).toBe(1);
    });
  });

  describe('Hugging Face requests', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const response = (status, body = {}, headers = {}) => ({
      ok: status >= 200 && status < 300,
      status,
      statusText: String(status),
      headers: { get: name => headers[name.toLowerCase()] ?? null },
      json: async () => body
    });

    test('requests blob sizes for model details', async () => {
      const fetchMock = vi.fn().mockResolvedValue(response(200, { id: 'a/b' }));
      vi.stubGlobal('fetch', fetchMock);
      const agg = new ModelAggregator({ retryBaseDelayMs: 0 });

      await agg.getDetailedModelInfo('a/b');

      expect(String(fetchMock.mock.calls[0][0])).toBe('https://huggingface.co/api/models/a/b?blobs=true');
    });

    test('retries a 429 and then succeeds', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(response(429))
        .mockResolvedValueOnce(response(429))
        .mockResolvedValueOnce(response(200, { id: 'a/b' }));
      vi.stubGlobal('fetch', fetchMock);
      const agg = new ModelAggregator({ retryBaseDelayMs: 0 });

      const info = await agg.getDetailedModelInfo('a/b');

      expect(info).toEqual({ id: 'a/b' });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(agg.stats.failedRequests).toBe(0);
    });

    test('counts a request that stays rate limited as failed', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(429)));
      const agg = new ModelAggregator({ retryBaseDelayMs: 0 });

      expect(await agg.getDetailedModelInfo('a/b')).toBeNull();
      expect(agg.stats.failedRequests).toBe(1);
    });

    test('does not count a 404 as a failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(404)));
      const agg = new ModelAggregator({ retryBaseDelayMs: 0 });

      await agg.getDetailedModelInfo('gone/model');

      expect(agg.stats.failedRequests).toBe(0);
    });

    test('fails the run when too many requests failed', () => {
      const agg = new ModelAggregator();
      agg.stats.requests = 100;
      agg.stats.failedRequests = 11;
      expect(() => agg.assertFailureRateAcceptable()).toThrow(/11 of 100/);

      agg.stats.failedRequests = 10;
      expect(() => agg.assertFailureRateAcceptable()).not.toThrow();
    });
  });

  describe('extractModelMetadata', () => {
    test('collapses to a flat model with tasks, null accuracy and browser runtime metadata', async () => {
      const raw = {
        id: 'Xenova/tiny-model',
        downloads: 10,
        pipeline_tag: 'text-classification',
        lastModified: '2026-03-04T05:06:07.000Z',
        tasks: [{ category: 'natural_language_processing', subcategory: 'text_classification' }]
      };
      const detailed = { siblings: [{ rfilename: 'onnx/model.onnx', size: 5 * 1024 * 1024 }] };

      const model = await aggregator.extractModelMetadata(raw, detailed);

      expect(model).toMatchObject({
        huggingFaceId: 'Xenova/tiny-model',
        sizeMB: 5,
        accuracy: null,
        tasks: raw.tasks,
        lastUpdated: '2026-03-04',
        description: 'Tiny Model model for text classification',
        runtime: { browser: { framework: 'transformers.js', backend: ['wasm'], tested: false } }
      });
      expect(model).not.toHaveProperty('tier');
      expect(model).not.toHaveProperty('environmentalScore');
    });
  });

  describe('merging with existing data', () => {
    const task = (subcategory, category = 'computer_vision') => ({ category, subcategory });
    const model = (huggingFaceId, sizeMB, tasks, extra = {}) => ({
      id: huggingFaceId.replace('/', '_'),
      name: huggingFaceId,
      huggingFaceId,
      description: '',
      sizeMB,
      accuracy: null,
      tasks,
      deploymentOptions: ['cloud'],
      frameworks: ['PyTorch'],
      lastUpdated: '2026-01-01',
      ...extra
    });
    const aggregatorWith = models => {
      const agg = new ModelAggregator({ dataPath: '/nonexistent' });
      agg.currentModels = { schemaVersion: 2, lastUpdated: '2026-01-01', models };
      return agg;
    };

    test('fresh data replaces the stale copy but keeps curated fields and tasks', () => {
      const agg = aggregatorWith([
        model('a/b', 1, [task('image_classification')], { specialization: 'coding', browserModelId: 'Xenova/b' })
      ]);

      const merged = agg.mergeWithExistingData([model('a/b', 500, [task('object_detection')], { downloads: 9 })]);

      expect(merged.models).toHaveLength(1);
      expect(merged.models[0]).toMatchObject({ sizeMB: 500, specialization: 'coding', browserModelId: 'Xenova/b' });
      expect(merged.models[0].tasks).toEqual([task('image_classification'), task('object_detection')]);
      expect(merged.models[0]).not.toHaveProperty('downloads');
      expect(agg.stats.hasSubstantiveChanges).toBe(true);
    });

    test('keeps only the best 5 per task and tier when fresh models arrive, preserving other tasks', () => {
      const existing = [1, 2, 3, 4, 5].map(i =>
        model(`old/m${i}`, 100 + i, [task('image_classification')]));
      // Same models also serve another task whose group gets no fresh model
      existing[0].tasks.push(task('object_detection'));
      const agg = aggregatorWith(existing);

      const merged = agg.mergeWithExistingData([
        model('new/small', 10, [task('image_classification')], { downloads: 1 })
      ]);

      const ids = merged.models.map(m => m.huggingFaceId);
      expect(ids).toContain('new/small');
      expect(ids).not.toContain('old/m5'); // largest of the six, dropped
      expect(merged.models.find(m => m.huggingFaceId === 'old/m1').tasks).toEqual([
        task('image_classification'),
        task('object_detection')
      ]);
      expect(merged.models.filter(m => m.tasks.some(t => t.subcategory === 'image_classification'))).toHaveLength(5);
    });

    test('curated runtime metadata and sourced accuracy beat the generated defaults', () => {
      const curated = { browser: { framework: 'transformers.js', backend: ['wasm', 'webgpu'], tested: true } };
      const sourced = { metric: 'mAP', value: 0.5, source: 'paper' };
      const agg = aggregatorWith([
        model('a/b', 10, [task('image_classification')], { runtime: curated, accuracy: sourced })
      ]);
      const generated = { browser: { framework: 'transformers.js', backend: ['wasm'], tested: false } };

      const merged = agg.mergeWithExistingData([model('a/b', 10, [task('image_classification')], { runtime: generated })]);

      expect(merged.models[0].runtime).toEqual(curated);
      expect(merged.models[0].accuracy).toEqual(sourced);
    });

    test('drops legacy estimated accuracy numbers on refresh', () => {
      const agg = aggregatorWith([model('a/b', 10, [task('image_classification')], { accuracy: 0.75 })]);

      const merged = agg.mergeWithExistingData([model('a/b', 10, [task('image_classification')])]);

      expect(merged.models[0].accuracy).toBeNull();
    });

    test('a mirror-backed model keeps its browser tag on refresh', () => {
      const runtime = { browser: { framework: 'transformers.js', backend: ['wasm'], tested: false } };
      const agg = aggregatorWith([
        model('a/b', 10, [task('image_classification')], { runtime, browserModelId: 'Xenova/b', deploymentOptions: ['browser', 'edge', 'cloud'] })
      ]);

      // The native repo has no ONNX framework, so the generated options lack "browser"
      const merged = agg.mergeWithExistingData([model('a/b', 12, [task('image_classification')], { deploymentOptions: ['edge', 'cloud'] })]);

      expect(merged.models[0].deploymentOptions).toContain('browser');
      expect(merged.models[0].frameworks).toContain('ONNX');
      expect(merged.models[0].runtime).toEqual(runtime);
      expect(merged.models[0].browserModelId).toBe('Xenova/b');
    });

    test('does not bump lastUpdated when nothing changed', () => {
      const existing = model('a/b', 10, [task('image_classification')]);
      const agg = aggregatorWith([existing]);

      const merged = agg.mergeWithExistingData([{ ...existing, lastUpdated: '2026-02-02', downloads: 5 }]);

      expect(agg.stats.hasSubstantiveChanges).toBe(false);
      expect(merged.lastUpdated).toBe('2026-01-01');
    });

    test('ignores field order when deciding whether a model changed', () => {
      const agg = new ModelAggregator();
      const old = { models: [{ huggingFaceId: 'a/b', sizeMB: 1, name: 'n', runtime: { x: 1, y: 2 } }] };
      const next = { models: [{ name: 'n', runtime: { y: 2, x: 1 }, sizeMB: 1, huggingFaceId: 'a/b' }] };

      expect(agg.summarizeChanges(old, next).updated).toEqual([]);
    });

    test('summarizes added, removed, updated and resized models', () => {
      const agg = new ModelAggregator();
      const dataset = models => ({ models });
      const old = dataset([
        { huggingFaceId: 'keep/same', sizeMB: 10, lastUpdated: '2026-01-01' },
        { huggingFaceId: 'keep/resized', sizeMB: 1 },
        { huggingFaceId: 'drop/me', sizeMB: 5 }
      ]);
      const next = dataset([
        { huggingFaceId: 'keep/same', sizeMB: 10, lastUpdated: '2026-02-02' },
        { huggingFaceId: 'keep/resized', sizeMB: 500 },
        { huggingFaceId: 'new/one', sizeMB: 7 }
      ]);

      const summary = agg.summarizeChanges(old, next);

      expect(summary).toEqual({
        added: [{ id: 'new/one', sizeMB: 7 }],
        removed: ['drop/me'],
        updated: ['keep/resized'],
        sizeChanged: [{ id: 'keep/resized', from: 1, to: 500 }]
      });
      expect(agg.formatChangeSummary(summary)).toContain('`keep/resized`: 1 MB to 500 MB');
    });
  });
});
