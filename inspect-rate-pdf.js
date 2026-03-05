const fs = require('fs').promises;
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const templatePath = path.join(__dirname, 'PDF-files', 'Rate Confirmation.pdf');

async function main() {
  try {
    const templateBytes = await fs.readFile(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    console.log('=== Rate Confirmation.pdf - Form fields ===');
    console.log('Total fields:', fields.length);
    console.log('');
    const list = fields.map((field, i) => {
      const name = field.getName();
      const type = field.constructor.name;
      let value = '';
      try {
        if (type === 'PDFTextField') value = field.getText() || '(empty)';
        else if (type === 'PDFCheckBox') value = field.isChecked() ? 'Checked' : 'Unchecked';
        else if (type === 'PDFDropdown') value = field.getSelected().join(', ') || '(none)';
        else if (type === 'PDFRadioGroup') value = field.getSelected() || '(none)';
      } catch (e) {
        value = '(error)';
      }
      return { i: i + 1, name, type, value };
    });
    list.forEach(({ i, name, type, value }) => {
      console.log(`#${i}  ${type.replace('PDF', '')}  "${name}"  →  ${value}`);
    });
    console.log('');
    console.log('--- As JSON (for mapping) ---');
    console.log(JSON.stringify(list.map(({ name, type }) => ({ name, type })), null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

main();
