const path = require('path');
const pdfService = require('./services/pdfService');

async function main() {
  try {
    const result = await pdfService.generateRateConfirmationTest();
    console.log('Test Rate Confirmation generated:');
    console.log('  File:', result.filename);
    console.log('  Path:', result.path);
    console.log('  URL:', result.url);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

main();
