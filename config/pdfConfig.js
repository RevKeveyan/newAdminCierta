/**
 * PDF Configuration
 * 
 * Centralized configuration for PDF generation styles and layouts.
 * Modify these values to customize the appearance of generated PDFs.
 */

const { rgb } = require('pdf-lib');

// ============================================================================
// FONT CONFIGURATION
// ============================================================================

const FONTS = {
  // Font sizes
  TITLE_SIZE: 18,
  HEADER_SIZE: 14,
  BODY_SIZE: 11,
  SMALL_SIZE: 9,
  TINY_SIZE: 8,
  
  // Font weights (use different StandardFonts)
  REGULAR: 'Helvetica',
  BOLD: 'HelveticaBold',
  ITALIC: 'HelveticaOblique'
};

// ============================================================================
// COLOR SCHEME
// ============================================================================

const COLORS = {
  // Primary colors
  PRIMARY: rgb(0.2, 0.4, 0.8),      // Company blue
  SECONDARY: rgb(0.3, 0.3, 0.3),     // Dark gray
  SUCCESS: rgb(0.2, 0.6, 0.2),       // Green
  WARNING: rgb(0.8, 0.6, 0.2),       // Orange
  ERROR: rgb(0.8, 0.2, 0.2),         // Red
  
  // Text colors
  TEXT_PRIMARY: rgb(0, 0, 0),        // Black
  TEXT_SECONDARY: rgb(0.3, 0.3, 0.3), // Dark gray
  TEXT_MUTED: rgb(0.5, 0.5, 0.5),     // Gray
  TEXT_LIGHT: rgb(0.7, 0.7, 0.7),     // Light gray
  
  // Background colors
  BG_LIGHT: rgb(0.95, 0.95, 0.95),   // Light gray
  BG_WHITE: rgb(1, 1, 1),            // White
  BG_PRIMARY: rgb(0.9, 0.95, 1),     // Light blue
  
  // Border colors
  BORDER_LIGHT: rgb(0.8, 0.8, 0.8),  // Light gray
  BORDER_MEDIUM: rgb(0.6, 0.6, 0.6), // Medium gray
  BORDER_DARK: rgb(0.4, 0.4, 0.4)    // Dark gray
};

// ============================================================================
// LAYOUT CONFIGURATION
// ============================================================================

const LAYOUT = {
  // Page margins
  MARGIN_LEFT: 50,
  MARGIN_RIGHT: 50,
  MARGIN_TOP: 50,
  MARGIN_BOTTOM: 50,
  
  // Spacing
  LINE_SPACING: 20,
  SECTION_SPACING: 40,
  PARAGRAPH_SPACING: 30,
  ITEM_SPACING: 15,
  
  // Column layout
  COLUMN_WIDTH: 250,
  COLUMN_GAP: 50,
  
  // Table layout
  TABLE_CELL_PADDING: 10,
  TABLE_ROW_HEIGHT: 25,
  TABLE_HEADER_HEIGHT: 35,
  
  // Box dimensions
  BOX_PADDING: 15,
  BOX_BORDER_WIDTH: 1,
  BOX_CORNER_RADIUS: 5
};

// ============================================================================
// CONTENT CONFIGURATION
// ============================================================================

const CONTENT = {
  // Company information
  COMPANY_NAME: 'CIERTA LOGISTICS',
  COMPANY_LOGO: null, // Add logo path if available
  
  // Document titles
  BOL_TITLE: 'BILL OF LADING',
  RATE_TITLE: 'RATE CONFIRMATION',
  
  // Section headers
  SECTIONS: {
    LOAD_INFO: 'LOAD INFORMATION',
    CUSTOMER_INFO: 'CUSTOMER INFORMATION',
    CARRIER_INFO: 'CARRIER INFORMATION',
    PICKUP_INFO: 'PICKUP INFORMATION',
    DELIVERY_INFO: 'DELIVERY INFORMATION',
    VEHICLE_DETAILS: 'VEHICLE DETAILS',
    FINANCIAL_INFO: 'FINANCIAL INFORMATION',
    SPECIAL_REQUIREMENTS: 'SPECIAL REQUIREMENTS'
  },
  
  // Field labels
  FIELDS: {
    LOAD_NUMBER: 'Load Number:',
    VIN: 'VIN:',
    STATUS: 'Status:',
    VEHICLE_TYPE: 'Vehicle Type:',
    COMPANY: 'Company:',
    EMAIL: 'Email:',
    PHONE: 'Phone:',
    CONTACT: 'Contact:',
    MC_NUMBER: 'MC Number:',
    PICKUP_DATE: 'Pickup Date:',
    DELIVERY_DATE: 'Delivery Date:',
    VALUE: 'Value:',
    INSURANCE: 'Insurance:'
  }
};

// ============================================================================
// STYLE PRESETS
// ============================================================================

const STYLES = {
  // Title style
  TITLE: {
    size: FONTS.TITLE_SIZE,
    color: COLORS.PRIMARY,
    weight: 'BOLD'
  },
  
  // Header style
  HEADER: {
    size: FONTS.HEADER_SIZE,
    color: COLORS.SECONDARY,
    weight: 'BOLD'
  },
  
  // Body text style
  BODY: {
    size: FONTS.BODY_SIZE,
    color: COLORS.TEXT_PRIMARY,
    weight: 'REGULAR'
  },
  
  // Label style
  LABEL: {
    size: FONTS.BODY_SIZE,
    color: COLORS.TEXT_SECONDARY,
    weight: 'BOLD'
  },
  
  // Value style
  VALUE: {
    size: FONTS.BODY_SIZE,
    color: COLORS.TEXT_PRIMARY,
    weight: 'REGULAR'
  },
  
  // Alert style
  ALERT: {
    size: FONTS.BODY_SIZE,
    color: COLORS.ERROR,
    weight: 'BOLD'
  },
  
  // Success style
  SUCCESS: {
    size: FONTS.BODY_SIZE,
    color: COLORS.SUCCESS,
    weight: 'BOLD'
  }
};

// ============================================================================
// LAYOUT PRESETS
// ============================================================================

const LAYOUTS = {
  // Single column layout
  SINGLE_COLUMN: {
    contentWidth: 500,
    leftMargin: 50,
    rightMargin: 50
  },
  
  // Two column layout
  TWO_COLUMN: {
    leftColumn: {
      x: 50,
      width: 250
    },
    rightColumn: {
      x: 350,
      width: 250
    }
  },
  
  // Table layout
  TABLE: {
    startX: 50,
    width: 500,
    columnWidths: [150, 200, 150], // Field, Value, Status
    headerHeight: 35,
    rowHeight: 25
  },
  
  // Boxed layout
  BOXED: {
    padding: 15,
    borderWidth: 1,
    borderColor: COLORS.BORDER_LIGHT,
    backgroundColor: COLORS.BG_LIGHT
  }
};

// ============================================================================
// CONDITIONAL STYLING
// ============================================================================

const CONDITIONAL_STYLES = {
  // Status-based colors
  STATUS_COLORS: {
    'Listed': COLORS.TEXT_MUTED,
    'Dispatched': COLORS.PRIMARY,
    'Picked up': COLORS.SUCCESS,
    'Delivered': COLORS.SUCCESS,
    'On Hold': COLORS.WARNING,
    'Cancelled': COLORS.ERROR
  },
  
  // Payment status colors
  PAYMENT_COLORS: {
    'Paid': COLORS.SUCCESS,
    'Invoiced': COLORS.PRIMARY,
    'On Hold': COLORS.WARNING,
    'Withheld': COLORS.ERROR,
    'Charges applied': COLORS.ERROR
  },
  
  // Priority-based styling
  PRIORITY_STYLES: {
    HIGH: {
      size: FONTS.BODY_SIZE,
      color: COLORS.ERROR,
      weight: 'BOLD'
    },
    MEDIUM: {
      size: FONTS.BODY_SIZE,
      color: COLORS.WARNING,
      weight: 'BOLD'
    },
    LOW: {
      size: FONTS.BODY_SIZE,
      color: COLORS.TEXT_PRIMARY,
      weight: 'REGULAR'
    }
  }
};

// ============================================================================
// EXPORT CONFIGURATION
// ============================================================================

module.exports = {
  FONTS,
  COLORS,
  LAYOUT,
  CONTENT,
  STYLES,
  LAYOUTS,
  CONDITIONAL_STYLES,
  
  // Helper functions
  getStatusColor: (status) => CONDITIONAL_STYLES.STATUS_COLORS[status] || COLORS.TEXT_PRIMARY,
  getPaymentColor: (status) => CONDITIONAL_STYLES.PAYMENT_COLORS[status] || COLORS.TEXT_PRIMARY,
  getPriorityStyle: (priority) => CONDITIONAL_STYLES.PRIORITY_STYLES[priority] || STYLES.BODY,
  
  // Layout helpers
  getColumnX: (column) => LAYOUTS.TWO_COLUMN[column].x,
  getColumnWidth: (column) => LAYOUTS.TWO_COLUMN[column].width,
  getTableColumnX: (index) => {
    let x = LAYOUTS.TABLE.startX;
    for (let i = 0; i < index; i++) {
      x += LAYOUTS.TABLE.columnWidths[i];
    }
    return x;
  }
};
















