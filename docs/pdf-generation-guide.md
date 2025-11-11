# PDF Generation System Documentation

## 📋 Overview

The PDF generation system allows you to create professional documents (BOL and Rate Confirmation) from Load data using your existing PDF templates. The system uses `pdf-lib` to fill templates with dynamic data.

## 🚀 Quick Start

### Generate BOL (Bill of Lading)
```bash
GET /loads/{loadId}/bol
```

### Generate Rate Confirmation
```bash
GET /loads/{loadId}/rate-confirmation
```

### Generate All Documents
```bash
GET /loads/{loadId}/documents
```

### Download Generated PDF
```bash
GET /loads/download/{filename}
```

## 🎨 Customizing PDF Styles and Layout

### Font Configuration

The system supports multiple fonts and sizes. Here's how to customize:

#### Available Fonts:
```javascript
// In pdfService.js - fillBOLFields() or fillRateConfirmationFields()
const font = await pdfDoc.embedFont(StandardFonts.Helvetica);           // Regular
const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);   // Bold
const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique); // Italic
```

#### Font Sizes:
```javascript
const fontSize = 10;        // Regular text
const boldFontSize = 12;    // Headers and important text
const smallFontSize = 8;    // Fine print
const largeFontSize = 16;   // Main titles
```

### Text Positioning System

The PDF coordinate system works as follows:
- **Origin (0,0)**: Bottom-left corner of the page
- **X-axis**: Horizontal (left to right)
- **Y-axis**: Vertical (bottom to top)

#### Page Dimensions:
```javascript
const { width, height } = firstPage.getSize();
// Typical page: width = 595, height = 842 (A4 size)
```

### Customizing Text Styles

#### 1. **Font Weight and Style**
```javascript
// Regular text
page.drawText('Regular Text', {
  x: 50,
  y: 750,
  size: 10,
  font: font,                    // Regular font
  color: rgb(0, 0, 0)           // Black color
});

// Bold text
page.drawText('Bold Text', {
  x: 50,
  y: 730,
  size: 12,
  font: boldFont,                // Bold font
  color: rgb(0, 0, 0)
});

// Colored text
page.drawText('Important Text', {
  x: 50,
  y: 710,
  size: 10,
  font: font,
  color: rgb(1, 0, 0)           // Red color
});
```

#### 2. **Text Alignment**
```javascript
// Left-aligned (default)
page.drawText('Left Text', { x: 50, y: 700, ... });

// Center-aligned
const textWidth = font.widthOfTextAtSize('Centered Text', 10);
page.drawText('Centered Text', {
  x: (width - textWidth) / 2,    // Center horizontally
  y: 700,
  ...
});

// Right-aligned
const textWidth = font.widthOfTextAtSize('Right Text', 10);
page.drawText('Right Text', {
  x: width - textWidth - 50,     // Right margin
  y: 700,
  ...
});
```

#### 3. **Multi-line Text**
```javascript
const lines = [
  'Line 1: Customer Information',
  'Line 2: Company Name',
  'Line 3: Contact Details'
];

let yPosition = 700;
lines.forEach(line => {
  page.drawText(line, {
    x: 50,
    y: yPosition,
    size: 10,
    font: font,
    color: rgb(0, 0, 0)
  });
  yPosition -= 20; // Move down 20 points
});
```

## 📐 Layout Positioning Guide

### Section Layout Example:
```javascript
async fillBOLFields(page, data, font, boldFont, width, height) {
  const fontSize = 10;
  const boldFontSize = 12;
  const sectionSpacing = 40;
  const lineSpacing = 20;
  
  let yPosition = height - 50; // Start from top
  
  // Title Section
  page.drawText('BILL OF LADING', {
    x: width / 2 - 60,           // Center the title
    y: yPosition,
    size: boldFontSize,
    font: boldFont,
    color: rgb(0, 0, 0)
  });
  yPosition -= 50; // Move down for next section
  
  // Load Information Section
  page.drawText('LOAD INFORMATION', {
    x: 50,
    y: yPosition,
    size: boldFontSize,
    font: boldFont,
    color: rgb(0, 0, 0)
  });
  yPosition -= lineSpacing;
  
  // Load details
  page.drawText(`Load Number: ${data.loadNumber}`, {
    x: 50,
    y: yPosition,
    size: fontSize,
    font: font,
    color: rgb(0, 0, 0)
  });
  yPosition -= lineSpacing;
  
  page.drawText(`VIN: ${data.vin}`, {
    x: 50,
    y: yPosition,
    size: fontSize,
    font: font,
    color: rgb(0, 0, 0)
  });
  yPosition -= sectionSpacing; // Extra space before next section
}
```

### Advanced Positioning Techniques:

#### 1. **Two-Column Layout**
```javascript
// Left column
page.drawText('Left Column Data', {
  x: 50,
  y: yPosition,
  size: fontSize,
  font: font,
  color: rgb(0, 0, 0)
});

// Right column
page.drawText('Right Column Data', {
  x: width / 2 + 50,  // Start at middle + margin
  y: yPosition,
  size: fontSize,
  font: font,
  color: rgb(0, 0, 0)
});
```

#### 2. **Table-like Layout**
```javascript
// Table headers
const headers = ['Field', 'Value'];
const headerX = [50, 300];
headerX.forEach((x, index) => {
  page.drawText(headers[index], {
    x: x,
    y: yPosition,
    size: boldFontSize,
    font: boldFont,
    color: rgb(0, 0, 0)
  });
});
yPosition -= lineSpacing;

// Table data
const data = [
  ['Load Number', data.loadNumber],
  ['VIN', data.vin],
  ['Status', data.status]
];

data.forEach(row => {
  page.drawText(row[0], {
    x: 50,
    y: yPosition,
    size: fontSize,
    font: font,
    color: rgb(0, 0, 0)
  });
  
  page.drawText(row[1], {
    x: 300,
    y: yPosition,
    size: fontSize,
    font: font,
    color: rgb(0, 0, 0)
  });
  yPosition -= lineSpacing;
});
```

## 🎨 Color Customization

### Available Colors:
```javascript
// Basic colors
color: rgb(0, 0, 0)        // Black
color: rgb(1, 1, 1)        // White
color: rgb(1, 0, 0)        // Red
color: rgb(0, 1, 0)        // Green
color: rgb(0, 0, 1)        // Blue

// Custom colors (RGB values 0-1)
color: rgb(0.2, 0.4, 0.8)  // Custom blue
color: rgb(0.8, 0.2, 0.2)  // Custom red
color: rgb(0.3, 0.3, 0.3)  // Dark gray
```

### Color Scheme Example:
```javascript
// Header with company colors
page.drawText('COMPANY HEADER', {
  x: 50,
  y: yPosition,
  size: 16,
  font: boldFont,
  color: rgb(0.2, 0.4, 0.8)  // Company blue
});

// Important information in red
page.drawText('URGENT: Special Handling Required', {
  x: 50,
  y: yPosition,
  size: 10,
  font: boldFont,
  color: rgb(0.8, 0.2, 0.2)  // Alert red
});
```

## 📏 Spacing and Layout Constants

### Recommended Spacing:
```javascript
const LAYOUT = {
  // Page margins
  MARGIN_LEFT: 50,
  MARGIN_RIGHT: 50,
  MARGIN_TOP: 50,
  MARGIN_BOTTOM: 50,
  
  // Text spacing
  LINE_SPACING: 20,        // Space between lines
  SECTION_SPACING: 40,     // Space between sections
  PARAGRAPH_SPACING: 30,   // Space between paragraphs
  
  // Font sizes
  TITLE_SIZE: 16,
  HEADER_SIZE: 12,
  BODY_SIZE: 10,
  SMALL_SIZE: 8,
  
  // Column widths
  COLUMN_WIDTH: 250,
  COLUMN_GAP: 50
};
```

## 🔧 Customizing the PDF Service

### Adding New Fonts:
```javascript
// In pdfService.js constructor or method
async loadCustomFonts(pdfDoc) {
  // Load custom fonts (you need font files)
  const customFont = await pdfDoc.embedFont(await fs.readFile('./fonts/CustomFont.ttf'));
  const customBoldFont = await pdfDoc.embedFont(await fs.readFile('./fonts/CustomFont-Bold.ttf'));
  
  return { customFont, customBoldFont };
}
```

### Dynamic Font Sizing:
```javascript
// Adjust font size based on content length
function getOptimalFontSize(text, maxWidth, font) {
  let fontSize = 12;
  while (font.widthOfTextAtSize(text, fontSize) > maxWidth && fontSize > 6) {
    fontSize -= 0.5;
  }
  return fontSize;
}

// Usage
const text = "Very long text that might not fit";
const maxWidth = 200;
const optimalSize = getOptimalFontSize(text, maxWidth, font);

page.drawText(text, {
  x: 50,
  y: yPosition,
  size: optimalSize,
  font: font,
  color: rgb(0, 0, 0)
});
```

## 📝 Template Customization

### Modifying Template Fields:

1. **Update Data Mapping** in `mapLoadToBOLData()` or `mapLoadToRateData()`
2. **Adjust Field Positioning** in `fillBOLFields()` or `fillRateConfirmationFields()`
3. **Change Font Styles** by modifying the font parameters

### Example: Adding New Fields
```javascript
// In mapLoadToBOLData()
mapLoadToBOLData(load) {
  return {
    // ... existing fields ...
    
    // Add new custom fields
    customField1: load.customData?.field1 || 'N/A',
    customField2: load.customData?.field2 || 'N/A',
    generatedDate: new Date().toLocaleDateString(),
    generatedBy: load.createdBy?.firstName + ' ' + load.createdBy?.lastName
  };
}

// In fillBOLFields()
page.drawText(`Custom Field: ${data.customField1}`, {
  x: 50,
  y: yPosition,
  size: fontSize,
  font: font,
  color: rgb(0, 0, 0)
});
yPosition -= lineSpacing;
```

## 🚀 Performance Optimization

### Batch Processing:
```javascript
// Generate multiple PDFs efficiently
async generateMultiplePDFs(loadIds) {
  const results = await Promise.all(
    loadIds.map(async (id) => {
      const load = await this.model.findById(id);
      return await this.generateBOL(this.dto.format(load));
    })
  );
  return results;
}
```

### Memory Management:
```javascript
// Clean up after generation
async generateBOL(loadData) {
  try {
    // ... PDF generation logic ...
    
    // Force garbage collection (if needed)
    if (global.gc) {
      global.gc();
    }
    
    return result;
  } catch (error) {
    // Cleanup on error
    console.error('PDF generation failed:', error);
    throw error;
  }
}
```

## 🔍 Debugging and Troubleshooting

### Common Issues:

1. **Text Not Appearing**: Check Y coordinates (remember: origin is bottom-left)
2. **Text Overlapping**: Increase line spacing or adjust Y positions
3. **Font Not Loading**: Ensure font files exist and are accessible
4. **Memory Issues**: Use `global.gc()` for large PDFs

### Debug Helper:
```javascript
// Add this to your PDF generation methods
function debugLayout(page, width, height) {
  // Draw grid lines for debugging
  for (let i = 0; i < width; i += 50) {
    page.drawLine({
      start: { x: i, y: 0 },
      end: { x: i, y: height },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8)
    });
  }
  
  for (let i = 0; i < height; i += 50) {
    page.drawLine({
      start: { x: 0, y: i },
      end: { x: width, y: i },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8)
    });
  }
}
```

## 📚 API Reference

### PDF Service Methods:
- `generateBOL(loadData)` - Generate BOL PDF
- `generateRateConfirmation(loadData)` - Generate Rate Confirmation PDF
- `generateAllDocuments(loadData)` - Generate both PDFs
- `cleanupOldPDFs(maxAgeHours)` - Clean up old files

### Response Format:
```json
{
  "success": true,
  "filename": "BOL_1HGBH41JXMN109186_1759214534689.pdf",
  "path": "/path/to/file.pdf",
  "url": "/generated-pdfs/filename.pdf"
}
```

This documentation provides everything you need to customize the PDF generation system! 🎉
















