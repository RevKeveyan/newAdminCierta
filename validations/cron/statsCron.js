const cron = require('node-cron');
const { updateAllStats } = require('../services/statsService');

// Every day at 6 AM
cron.schedule('0 6 * * *', async () => {
  console.log('Running daily stats update at 6 AM');
  await updateAllStats();
});
