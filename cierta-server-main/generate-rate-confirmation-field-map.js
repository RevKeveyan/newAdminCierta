const pdfService = require('./services/pdfService');

async function main() {
  try {
    const result = await pdfService.generateRateConfirmationFieldMap();
    console.log('Rate Confirmation FIELD MAP generated:');
    console.log('  File:', result.filename);
    console.log('  Path:', result.path);
    console.log('  Total fields:', result.totalFields);
    console.log('');
    console.log('PDF field index → data source (what goes there):');
    result.mapping.forEach(({ index, fieldName, variable }) => {
      console.log(`  #${index}  ${fieldName}  →  ${variable}`);
    });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

main();
