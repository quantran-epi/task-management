import process from 'node:process';

// Check Node runtime (minimum v20.19 or target v24)
const nodeVersion = process.version;
const major = parseInt(nodeVersion.slice(1).split('.')[0] || '0', 10);
const minor = parseInt(nodeVersion.slice(1).split('.')[1] || '0', 10);

if (major < 20 || (major === 20 && minor < 19)) {
  console.error(`Spike requires Node >= 20.19 (current: ${nodeVersion})`);
  process.exit(1);
}

const MODEL = 'Xenova/multilingual-e5-small';
const REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';
const DIMENSIONS = 384;

async function runSpike() {
  const startLoad = performance.now();
  let transformersModule;
  let extractor;
  try {
    transformersModule = await import('@xenova/transformers');
    const { env, pipeline } = transformersModule;
    env.cacheDir = process.env.EMBEDDING_CACHE_DIR ?? './.cache/transformers';

    extractor = await pipeline('feature-extraction', MODEL, {
      revision: REVISION,
      quantized: true,
    });
  } catch (err) {
    const failureReport = {
      success: false,
      error: err.message,
      errorName: err.name,
      failureType: err.message.includes('sharp') ? 'SHARP_NATIVE_BINARY_UNAVAILABLE' : 'MODEL_LOAD_FAILURE',
      nodeVersion,
      platform: process.platform,
      arch: process.arch,
      model: MODEL,
      revision: REVISION,
      explanation:
        'Local Transformers.js model load requires sharp native binary which is not installed due to --ignore-scripts or enterprise proxy restrictions. Per D-11 and PLAN.md truth 38, local adapter fails closed and produces typed UNCONFIGURED/PROVIDER_ERROR status for degraded fusion.',
    };
    console.log(JSON.stringify(failureReport, null, 2));
    // Graceful exit for probe reporting
    process.exit(0);
  }

  const loadDurationMs = Math.round(performance.now() - startLoad);

  const testQueries = [
    'Truy vấn kiểm tra hệ thống quản lý tác vụ TaskMate',
    'TaskMate workload capacity and task allocation query',
    'MAIN1.FCL_CYCLE_COUNTER dependency analysis',
    'Lập kế hoạch công việc theo năng lực hàng ngày',
    'Benchmark latency and finite vector check',
  ];

  const warmDurations = [];
  let sampleVector = null;

  for (const q of testQueries) {
    const t0 = performance.now();
    const tensor = await extractor(`query: ${q}`, {
      pooling: 'mean',
      normalize: true,
    });
    const duration = Math.round((performance.now() - t0) * 100) / 100;
    warmDurations.push(duration);

    const vec = Array.from(tensor.data);
    if (vec.length !== DIMENSIONS) {
      throw new Error(`Dimension mismatch: expected ${DIMENSIONS}, got ${vec.length}`);
    }
    for (const v of vec) {
      if (!Number.isFinite(v)) {
        throw new Error('Non-finite value in vector');
      }
    }
    sampleVector = vec;
  }

  const mem = process.memoryUsage();

  const report = {
    success: true,
    nodeVersion,
    platform: process.platform,
    arch: process.arch,
    model: MODEL,
    revision: REVISION,
    dimensions: DIMENSIONS,
    loadDurationMs,
    warmDurationsMs: warmDurations,
    warmP50Ms: warmDurations.slice().sort((a, b) => a - b)[Math.floor(warmDurations.length / 2)],
    peakRssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
    heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
    sampleVectorFirst5: sampleVector.slice(0, 5),
  };

  console.log(JSON.stringify(report, null, 2));
}

runSpike().catch((err) => {
  console.error('SPIKE_ERROR:', err);
  process.exit(1);
});
