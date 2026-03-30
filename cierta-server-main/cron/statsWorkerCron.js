const cron = require('node-cron');
const { startWorker } = require('../services/statsWorker');

let stopWorker = null;

/**
 * Statistics Worker Cron
 * Запускает воркер для пересчёта статистики из очереди StatsDirty
 */

async function startStatsWorker() {
  if (stopWorker) {
    console.log('[StatsWorkerCron] Worker already running');
    return;
  }

  try {
    const workerId = `stats-worker-${Date.now()}`;
    stopWorker = await startWorker(workerId, {
      interval: 5000,
      batchSize: 10
    });
    console.log(`[StatsWorkerCron] Stats worker started: ${workerId}`);
  } catch (error) {
    console.error('[StatsWorkerCron] Failed to start stats worker:', error);
  }
}

function stopStatsWorker() {
  if (stopWorker) {
    stopWorker();
    stopWorker = null;
    console.log('[StatsWorkerCron] Stats worker stopped');
  }
}

if (process.env.NODE_ENV !== 'test') {
  startStatsWorker();

  process.on('SIGTERM', () => {
    stopStatsWorker();
  });

  process.on('SIGINT', () => {
    stopStatsWorker();
  });
}

module.exports = {
  startStatsWorker,
  stopStatsWorker
};
