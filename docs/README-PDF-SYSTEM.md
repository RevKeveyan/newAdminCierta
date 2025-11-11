# PDF Generation System

## 📋 Overview

This system generates professional PDF documents (BOL and Rate Confirmation) from Load data using your existing PDF templates. The system is highly customizable and supports various layouts, fonts, colors, and positioning options.

## 🚀 Quick Start

### Generate PDFs via API

```bash
# Generate BOL
GET /loads/{loadId}/bol

# Generate Rate Confirmation  
GET /loads/{loadId}/rate-confirmation

# Generate both documents
GET /loads/{loadId}/documents

# Download generated PDF
GET /loads/download/{filename}
```

### Example Response
```json
{
  "success": true,
  "data": {
    "filename": "BOL_1HGBH41JXMN109186_1759214534689.pdf",
    "url": "/generated-pdfs/BOL_1HGBH41JXMN109186_1759214534689.pdf"
  }
}
```

## 🎨 Customization Guide

### 1. **Font & Colors** - `config/pdfConfig.js`
```javascript
// Change font sizes
FONTS: {
  TITLE_SIZE: 18,    // Main titles
  HEADER_SIZE: 14,   // Section headers
  BODY_SIZE: 11,     // Regular text
  SMALL_SIZE: 9      // Fine print
}

// Change colors
COLORS: {
  PRIMARY: rgb(0.2, 0.4, 0.8),    // Company blue
  SUCCESS: rgb(0.2, 0.6, 0.2),   // Green
  ERROR: rgb(0.8, 0.2, 0.2)      // Red
}
```

### 2. **Layout & Spacing** - `config/pdfConfig.js`
```javascript
// Adjust spacing
LAYOUT: {
  LINE_SPACING: 20,        // Between lines
  SECTION_SPACING: 40,     // Between sections
  MARGIN_LEFT: 50,         // Left margin
  MARGIN_TOP: 50           // Top margin
}
```

### 3. **Text Positioning** - `services/pdfService.js`
```javascript
// Basic positioning
page.drawText('Text', {
  x: 50,           // Horizontal position
  y: 750,          // Vertical position (from bottom)
  size: 10,        // Font size
  font: font,      // Font object
  color: rgb(0, 0, 0)  // Color
});
```

## 📁 File Structure

```
docs/
├── pdf-generation-guide.md      # Complete documentation
├── pdf-customization-examples.js # Practical examples
├── pdf-quick-reference.md        # Quick reference
└── README-PDF-SYSTEM.md         # This file

config/
└── pdfConfig.js                 # Centralized configuration

services/
└── pdfService.js               # PDF generation logic

generated-pdfs/                 # Output directory
├── BOL_*.pdf
└── RateConfirmation_*.pdf
```

## 🔧 Common Customizations

### Change Font Size
1. Edit `config/pdfConfig.js`
2. Modify `FONTS.BODY_SIZE = 12` (or any size)
3. Restart server

### Change Colors
1. Edit `config/pdfConfig.js`
2. Modify `COLORS.PRIMARY = rgb(0.2, 0.4, 0.8)`
3. Restart server

### Adjust Text Position
1. Edit `services/pdfService.js`
2. Find `fillBOLFields()` or `fillRateConfirmationFields()`
3. Change `x` and `y` coordinates

### Add New Fields
1. Edit `mapLoadToBOLData()` in `pdfService.js`
2. Add new field to data mapping
3. Add field to PDF layout in `fillBOLFields()`

## 📐 Layout Examples

### Two-Column Layout
```javascript
// Left column
page.drawText('Left Content', { x: 50, y: yPos, ... });

// Right column
page.drawText('Right Content', { x: 300, y: yPos, ... });
```

### Centered Text
```javascript
const textWidth = font.widthOfTextAtSize('Text', fontSize);
const centerX = (width - textWidth) / 2;
page.drawText('Text', { x: centerX, y: yPos, ... });
```

### Table Layout
```javascript
// Headers
const headers = ['Field', 'Value', 'Status'];
const headerX = [50, 200, 350];

headers.forEach((header, i) => {
  page.drawText(header, { x: headerX[i], y: yPos, ... });
});
```

## 🎯 Best Practices

### 1. **Use Configuration File**
- Always modify `config/pdfConfig.js` for global changes
- Don't hardcode values in the service

### 2. **Test Positioning**
- Use the debug grid (see examples)
- Start with simple layouts
- Test with different content lengths

### 3. **Responsive Design**
- Use dynamic font sizing for long text
- Implement text wrapping
- Consider content priority

### 4. **Performance**
- Cache font objects
- Use efficient layouts
- Clean up generated files

## 🐛 Troubleshooting

### Text Not Appearing
- Check Y coordinates (origin is bottom-left)
- Ensure Y position is positive
- Verify font is loaded

### Text Overlapping
- Increase line spacing
- Adjust Y positions
- Check font sizes

### Memory Issues
- Use `global.gc()` for large PDFs
- Implement cleanup
- Monitor memory usage

## 📚 Documentation Files

- **`pdf-generation-guide.md`** - Complete documentation
- **`pdf-customization-examples.js`** - Practical examples
- **`pdf-quick-reference.md`** - Quick reference card

## 🚀 Advanced Features

### Dynamic Content
- Conditional sections
- Priority-based layout
- Responsive text sizing

### Custom Layouts
- Boxed sections
- Table layouts
- Multi-column designs

### Performance Optimization
- Batch processing
- Memory management
- Caching strategies

## 📞 Support

For questions or issues:
1. Check the documentation files
2. Review the examples
3. Test with simple layouts first
4. Use the debug helpers

---

**Happy PDF Generation!** 🎉
















