# PDF Customization Quick Reference

## 🎨 Font & Text Styling

### Font Sizes
```javascript
const TITLE_SIZE = 16;      // Main titles
const HEADER_SIZE = 12;    // Section headers  
const BODY_SIZE = 10;      // Regular text
const SMALL_SIZE = 8;      // Fine print
```

### Colors
```javascript
// Basic colors
rgb(0, 0, 0)        // Black
rgb(1, 1, 1)        // White
rgb(1, 0, 0)        // Red
rgb(0, 1, 0)        // Green
rgb(0, 0, 1)        // Blue

// Custom colors
rgb(0.2, 0.4, 0.8)  // Company blue
rgb(0.3, 0.3, 0.3)  // Dark gray
rgb(0.8, 0.2, 0.2)  // Alert red
```

### Text Positioning
```javascript
// Remember: Origin (0,0) is bottom-left corner
page.drawText('Text', {
  x: 50,           // Left margin
  y: 750,          // From bottom (top of page)
  size: 10,        // Font size
  font: font,      // Font object
  color: rgb(0, 0, 0)
});
```

## 📐 Layout Patterns

### Two-Column Layout
```javascript
const LEFT_X = 50;
const RIGHT_X = 300;
const COLUMN_WIDTH = 200;

// Left column
page.drawText('Left Content', { x: LEFT_X, y: yPos, ... });

// Right column  
page.drawText('Right Content', { x: RIGHT_X, y: yPos, ... });
```

### Centered Text
```javascript
const text = 'Centered Text';
const textWidth = font.widthOfTextAtSize(text, fontSize);
const centerX = (width - textWidth) / 2;

page.drawText(text, { x: centerX, y: yPos, ... });
```

### Right-Aligned Text
```javascript
const text = 'Right Text';
const textWidth = font.widthOfTextAtSize(text, fontSize);
const rightX = width - textWidth - 50; // 50px margin

page.drawText(text, { x: rightX, y: yPos, ... });
```

## 📊 Table Layout
```javascript
// Table headers
const headers = ['Field', 'Value', 'Status'];
const headerX = [50, 200, 350];

headers.forEach((header, i) => {
  page.drawText(header, {
    x: headerX[i],
    y: yPos,
    size: 12,
    font: boldFont,
    color: rgb(0, 0, 0)
  });
});
yPos -= 30;

// Table rows
data.forEach(row => {
  page.drawText(row.field, { x: 50, y: yPos, ... });
  page.drawText(row.value, { x: 200, y: yPos, ... });
  page.drawText(row.status, { x: 350, y: yPos, ... });
  yPos -= 25;
});
```

## 🎯 Common Positioning Values

### Page Dimensions (A4)
```javascript
const width = 595;   // Page width
const height = 842;  // Page height
```

### Recommended Margins
```javascript
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 50;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 50;
```

### Spacing Constants
```javascript
const LINE_SPACING = 20;        // Between lines
const SECTION_SPACING = 40;     // Between sections
const PARAGRAPH_SPACING = 30;   // Between paragraphs
```

## 🔧 Quick Customizations

### Change Font Size
```javascript
// In fillBOLFields() or fillRateConfirmationFields()
const fontSize = 12;  // Change this value
```

### Change Colors
```javascript
// Header color
color: rgb(0.2, 0.4, 0.8)  // Company blue

// Alert color  
color: rgb(0.8, 0.2, 0.2)  // Red for alerts
```

### Adjust Positioning
```javascript
// Move text up/down
yPosition -= 20;  // Move down 20 points
yPosition += 20;   // Move up 20 points

// Move text left/right
x: 50,   // Left margin
x: 300,  // Center-right
x: 500,  // Right side
```

### Add Boxes/Borders
```javascript
// Background box
page.drawRectangle({
  x: 50,
  y: yPos - 10,
  width: 200,
  height: 30,
  color: rgb(0.95, 0.95, 0.95)  // Light gray
});

// Border box
page.drawRectangle({
  x: 50,
  y: yPos - 10,
  width: 200,
  height: 30,
  borderColor: rgb(0.7, 0.7, 0.7),
  borderWidth: 1
});
```

## 🚀 Performance Tips

### Dynamic Font Sizing
```javascript
function getOptimalSize(text, maxWidth, font) {
  let size = 12;
  while (font.widthOfTextAtSize(text, size) > maxWidth && size > 6) {
    size -= 0.5;
  }
  return size;
}
```

### Text Wrapping
```javascript
function wrapText(text, maxWidth, font, fontSize) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  words.forEach(word => {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    if (font.widthOfTextAtSize(testLine, fontSize) <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  });
  if (currentLine) lines.push(currentLine);
  return lines;
}
```

## 🐛 Debugging

### Draw Grid Lines
```javascript
// Add to your PDF generation method for debugging
for (let i = 0; i < width; i += 50) {
  page.drawLine({
    start: { x: i, y: 0 },
    end: { x: i, y: height },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8)
  });
}
```

### Check Text Width
```javascript
const textWidth = font.widthOfTextAtSize('Your text', fontSize);
console.log(`Text width: ${textWidth} points`);
```

## 📝 Common Modifications

### Add New Field
```javascript
// 1. Add to data mapping
mapLoadToBOLData(load) {
  return {
    // ... existing fields ...
    newField: load.customData?.newField || 'Default Value'
  };
}

// 2. Add to PDF layout
page.drawText(`New Field: ${data.newField}`, {
  x: 50,
  y: yPosition,
  size: fontSize,
  font: font,
  color: rgb(0, 0, 0)
});
yPosition -= 20;
```

### Change Section Order
```javascript
// Reorder sections by changing the sequence in fillBOLFields()
// 1. Title
// 2. Load Information  
// 3. Customer Information
// 4. Carrier Information
// 5. etc.
```

### Add Conditional Content
```javascript
// Show only if condition is met
if (data.specialRequirements && data.specialRequirements !== 'None') {
  page.drawText('Special Requirements:', {
    x: 50,
    y: yPosition,
    size: boldFontSize,
    font: boldFont,
    color: rgb(0.8, 0.2, 0.2)  // Red for alerts
  });
  yPosition -= 20;
  
  page.drawText(data.specialRequirements, {
    x: 50,
    y: yPosition,
    size: fontSize,
    font: font,
    color: rgb(0, 0, 0)
  });
  yPosition -= 30;
}
```

This quick reference should help you customize your PDFs efficiently! 🎉
















