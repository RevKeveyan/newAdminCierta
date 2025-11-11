/**
 * PDF Customization Examples
 * 
 * This file contains practical examples of how to customize
 * the PDF generation system for different styles and layouts.
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

// ============================================================================
// EXAMPLE 1: Custom Font Sizes and Colors
// ============================================================================

async function customFontExample(page, data, font, boldFont, width, height) {
  // Define custom font sizes
  const TITLE_SIZE = 18;
  const HEADER_SIZE = 14;
  const BODY_SIZE = 11;
  const SMALL_SIZE = 9;
  
  // Define custom colors
  const PRIMARY_COLOR = rgb(0.2, 0.4, 0.8);    // Company blue
  const SECONDARY_COLOR = rgb(0.3, 0.3, 0.3);  // Dark gray
  const ALERT_COLOR = rgb(0.8, 0.2, 0.2);      // Red for alerts
  const SUCCESS_COLOR = rgb(0.2, 0.6, 0.2);    // Green for success
  
  let yPosition = height - 50;
  
  // Main title with custom styling
  page.drawText('CUSTOM BILL OF LADING', {
    x: width / 2 - 100,
    y: yPosition,
    size: TITLE_SIZE,
    font: boldFont,
    color: PRIMARY_COLOR
  });
  yPosition -= 60;
  
  // Section header with custom color
  page.drawText('LOAD INFORMATION', {
    x: 50,
    y: yPosition,
    size: HEADER_SIZE,
    font: boldFont,
    color: SECONDARY_COLOR
  });
  yPosition -= 30;
  
  // Important information with alert color
  if (data.specialRequirements && data.specialRequirements !== 'None') {
    page.drawText('⚠️ SPECIAL REQUIREMENTS:', {
      x: 50,
      y: yPosition,
      size: BODY_SIZE,
      font: boldFont,
      color: ALERT_COLOR
    });
    yPosition -= 20;
    
    page.drawText(data.specialRequirements, {
      x: 70,
      y: yPosition,
      size: BODY_SIZE,
      font: font,
      color: ALERT_COLOR
    });
    yPosition -= 30;
  }
  
  // Regular data with custom styling
  const loadInfo = [
    { label: 'Load Number:', value: data.loadNumber },
    { label: 'VIN:', value: data.vin },
    { label: 'Status:', value: data.status }
  ];
  
  loadInfo.forEach(info => {
    // Label in bold
    page.drawText(info.label, {
      x: 50,
      y: yPosition,
      size: BODY_SIZE,
      font: boldFont,
      color: SECONDARY_COLOR
    });
    
    // Value in regular font
    page.drawText(info.value, {
      x: 200,
      y: yPosition,
      size: BODY_SIZE,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 25;
  });
}

// ============================================================================
// EXAMPLE 2: Two-Column Layout
// ============================================================================

async function twoColumnLayoutExample(page, data, font, boldFont, width, height) {
  const COLUMN_WIDTH = 250;
  const COLUMN_GAP = 50;
  const LEFT_COLUMN_X = 50;
  const RIGHT_COLUMN_X = LEFT_COLUMN_X + COLUMN_WIDTH + COLUMN_GAP;
  
  let yPosition = height - 100;
  
  // Left column header
  page.drawText('CUSTOMER INFORMATION', {
    x: LEFT_COLUMN_X,
    y: yPosition,
    size: 12,
    font: boldFont,
    color: rgb(0, 0, 0)
  });
  
  // Right column header
  page.drawText('CARRIER INFORMATION', {
    x: RIGHT_COLUMN_X,
    y: yPosition,
    size: 12,
    font: boldFont,
    color: rgb(0, 0, 0)
  });
  yPosition -= 30;
  
  // Left column data
  const leftData = [
    { label: 'Company:', value: data.customerCompany },
    { label: 'Email:', value: data.customerEmails },
    { label: 'Phone:', value: data.customerPhone || 'N/A' }
  ];
  
  // Right column data
  const rightData = [
    { label: 'Name:', value: data.carrierName },
    { label: 'MC Number:', value: data.carrierMC },
    { label: 'Contact:', value: data.carrierContact }
  ];
  
  // Draw both columns
  for (let i = 0; i < Math.max(leftData.length, rightData.length); i++) {
    // Left column
    if (leftData[i]) {
      page.drawText(`${leftData[i].label} ${leftData[i].value}`, {
        x: LEFT_COLUMN_X,
        y: yPosition,
        size: 10,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    
    // Right column
    if (rightData[i]) {
      page.drawText(`${rightData[i].label} ${rightData[i].value}`, {
        x: RIGHT_COLUMN_X,
        y: yPosition,
        size: 10,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    
    yPosition -= 20;
  }
}

// ============================================================================
// EXAMPLE 3: Table Layout
// ============================================================================

async function tableLayoutExample(page, data, font, boldFont, width, height) {
  const TABLE_START_X = 50;
  const TABLE_WIDTH = width - 100;
  const COLUMN_WIDTH = TABLE_WIDTH / 3;
  
  let yPosition = height - 200;
  
  // Table headers
  const headers = ['Field', 'Value', 'Status'];
  const headerX = [TABLE_START_X, TABLE_START_X + COLUMN_WIDTH, TABLE_START_X + COLUMN_WIDTH * 2];
  
  // Draw header background
  page.drawRectangle({
    x: TABLE_START_X,
    y: yPosition - 10,
    width: TABLE_WIDTH,
    height: 30,
    color: rgb(0.9, 0.9, 0.9)
  });
  
  // Draw header text
  headers.forEach((header, index) => {
    page.drawText(header, {
      x: headerX[index] + 10,
      y: yPosition,
      size: 11,
      font: boldFont,
      color: rgb(0, 0, 0)
    });
  });
  yPosition -= 40;
  
  // Table data
  const tableData = [
    { field: 'Load Number', value: data.loadNumber, status: 'Active' },
    { field: 'VIN', value: data.vin, status: 'Verified' },
    { field: 'Vehicle Type', value: data.vehicleType, status: 'Confirmed' },
    { field: 'Status', value: data.status, status: 'In Progress' }
  ];
  
  tableData.forEach((row, index) => {
    // Alternate row colors
    if (index % 2 === 0) {
      page.drawRectangle({
        x: TABLE_START_X,
        y: yPosition - 5,
        width: TABLE_WIDTH,
        height: 25,
        color: rgb(0.95, 0.95, 0.95)
      });
    }
    
    // Draw row data
    page.drawText(row.field, {
      x: headerX[0] + 10,
      y: yPosition,
      size: 10,
      font: font,
      color: rgb(0, 0, 0)
    });
    
    page.drawText(row.value, {
      x: headerX[1] + 10,
      y: yPosition,
      size: 10,
      font: font,
      color: rgb(0, 0, 0)
    });
    
    // Status with color coding
    const statusColor = row.status === 'Active' ? rgb(0.2, 0.6, 0.2) : 
                       row.status === 'Verified' ? rgb(0.2, 0.4, 0.8) : 
                       rgb(0.8, 0.4, 0.2);
    
    page.drawText(row.status, {
      x: headerX[2] + 10,
      y: yPosition,
      size: 10,
      font: font,
      color: statusColor
    });
    
    yPosition -= 30;
  });
}

// ============================================================================
// EXAMPLE 4: Dynamic Text Sizing
// ============================================================================

function getOptimalFontSize(text, maxWidth, font, maxSize = 12, minSize = 6) {
  let fontSize = maxSize;
  
  while (font.widthOfTextAtSize(text, fontSize) > maxWidth && fontSize > minSize) {
    fontSize -= 0.5;
  }
  
  return fontSize;
}

async function dynamicSizingExample(page, data, font, boldFont, width, height) {
  const MAX_TEXT_WIDTH = 300;
  let yPosition = height - 100;
  
  // Long text that needs to be resized
  const longText = `This is a very long text that might not fit in the available space and needs to be dynamically resized to fit properly within the PDF document.`;
  
  const optimalSize = getOptimalFontSize(longText, MAX_TEXT_WIDTH, font);
  
  page.drawText('Dynamic Text Sizing:', {
    x: 50,
    y: yPosition,
    size: 12,
    font: boldFont,
    color: rgb(0, 0, 0)
  });
  yPosition -= 30;
  
  page.drawText(longText, {
    x: 50,
    y: yPosition,
    size: optimalSize,
    font: font,
    color: rgb(0, 0, 0)
  });
  yPosition -= 50;
  
  // Multi-line text with automatic wrapping
  const wrappedText = wrapText(longText, MAX_TEXT_WIDTH, font, 10);
  
  page.drawText('Wrapped Text:', {
    x: 50,
    y: yPosition,
    size: 12,
    font: boldFont,
    color: rgb(0, 0, 0)
  });
  yPosition -= 30;
  
  wrappedText.forEach(line => {
    page.drawText(line, {
      x: 50,
      y: yPosition,
      size: 10,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 15;
  });
}

function wrapText(text, maxWidth, font, fontSize) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  words.forEach(word => {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    
    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        lines.push(word);
      }
    }
  });
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

// ============================================================================
// EXAMPLE 5: Custom Layout with Boxes and Borders
// ============================================================================

async function boxedLayoutExample(page, data, font, boldFont, width, height) {
  let yPosition = height - 100;
  
  // Main title box
  page.drawRectangle({
    x: 50,
    y: yPosition - 20,
    width: width - 100,
    height: 40,
    color: rgb(0.2, 0.4, 0.8)
  });
  
  page.drawText('BILL OF LADING', {
    x: width / 2 - 60,
    y: yPosition,
    size: 16,
    font: boldFont,
    color: rgb(1, 1, 1) // White text
  });
  yPosition -= 60;
  
  // Information boxes
  const infoBoxes = [
    {
      title: 'Load Information',
      data: [
        { label: 'Load Number:', value: data.loadNumber },
        { label: 'VIN:', value: data.vin },
        { label: 'Status:', value: data.status }
      ]
    },
    {
      title: 'Customer Information',
      data: [
        { label: 'Company:', value: data.customerCompany },
        { label: 'Email:', value: data.customerEmails }
      ]
    }
  ];
  
  infoBoxes.forEach(box => {
    // Box background
    page.drawRectangle({
      x: 50,
      y: yPosition - 20,
      width: width - 100,
      height: box.data.length * 25 + 40,
      color: rgb(0.95, 0.95, 0.95),
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 1
    });
    
    // Box title
    page.drawText(box.title, {
      x: 60,
      y: yPosition,
      size: 12,
      font: boldFont,
      color: rgb(0, 0, 0)
    });
    yPosition -= 30;
    
    // Box data
    box.data.forEach(item => {
      page.drawText(`${item.label} ${item.value}`, {
        x: 60,
        y: yPosition,
        size: 10,
        font: font,
        color: rgb(0, 0, 0)
      });
      yPosition -= 25;
    });
    
    yPosition -= 20; // Space between boxes
  });
}

// ============================================================================
// EXAMPLE 6: Responsive Layout Based on Content
// ============================================================================

async function responsiveLayoutExample(page, data, font, boldFont, width, height) {
  let yPosition = height - 50;
  
  // Calculate available space
  const availableHeight = height - 100; // Leave margin
  const lineHeight = 20;
  const maxLines = Math.floor(availableHeight / lineHeight);
  
  // Prioritize content based on importance
  const priorityContent = [
    { text: `Load Number: ${data.loadNumber}`, priority: 1 },
    { text: `VIN: ${data.vin}`, priority: 1 },
    { text: `Status: ${data.status}`, priority: 1 },
    { text: `Customer: ${data.customerCompany}`, priority: 2 },
    { text: `Carrier: ${data.carrierName}`, priority: 2 },
    { text: `Pickup: ${data.pickupLocation}`, priority: 3 },
    { text: `Delivery: ${data.deliveryLocation}`, priority: 3 },
    { text: `Special Requirements: ${data.specialRequirements}`, priority: 4 }
  ];
  
  // Sort by priority and limit by available space
  const contentToShow = priorityContent
    .sort((a, b) => a.priority - b.priority)
    .slice(0, maxLines);
  
  // Title
  page.drawText('RESPONSIVE LAYOUT', {
    x: width / 2 - 80,
    y: yPosition,
    size: 14,
    font: boldFont,
    color: rgb(0, 0, 0)
  });
  yPosition -= 40;
  
  // Show prioritized content
  contentToShow.forEach(item => {
    const fontSize = item.priority === 1 ? 12 : 10;
    const textColor = item.priority === 1 ? rgb(0, 0, 0) : rgb(0.3, 0.3, 0.3);
    
    page.drawText(item.text, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: item.priority === 1 ? boldFont : font,
      color: textColor
    });
    yPosition -= lineHeight;
  });
  
  // Show if content was truncated
  if (contentToShow.length < priorityContent.length) {
    const truncatedCount = priorityContent.length - contentToShow.length;
    page.drawText(`... and ${truncatedCount} more items`, {
      x: 50,
      y: yPosition,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5)
    });
  }
}

// Export examples for use in pdfService.js
module.exports = {
  customFontExample,
  twoColumnLayoutExample,
  tableLayoutExample,
  dynamicSizingExample,
  boxedLayoutExample,
  responsiveLayoutExample,
  getOptimalFontSize,
  wrapText
};
