const pdfService = require('../services/pdfService');

async function main() {
  const result = await pdfService.generateBOLFieldMap();
  console.log('BOL Field Map PDF generated successfully!');
  console.log('File:', result.path);
  console.log('Total fields filled:', result.totalFields);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
