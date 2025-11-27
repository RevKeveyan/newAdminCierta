const fs = require('fs').promises;
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { FONTS, COLORS, LAYOUT, STYLES, LAYOUTS } = require('../config/pdfConfig');

class PDFService {
  constructor() {
    this.templatesPath = path.join(__dirname, '../PDF-files');
    this.outputPath = path.join(__dirname, '../generated-pdfs');
    this.ensureOutputDirectory();
  }

  async ensureOutputDirectory() {
    try {
      await fs.access(this.outputPath);
    } catch {
      await fs.mkdir(this.outputPath, { recursive: true });
    }
  }

  /**
   * Generate BOL (Bill of Lading) PDF from Load data
   * Uses form fields if available, otherwise falls back to text positioning
   */
  async generateBOL(loadData, loadId = null) {
    try {
      const templatePath = path.join(this.templatesPath, 'BOL CIERTA (6).pdf');
      const templateBytes = await fs.readFile(templatePath);
      
      // Load PDF with form fields preserved
      const pdfDoc = await PDFDocument.load(templateBytes, {
        ignoreEncryption: false,
        updateMetadata: false
      });
      
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      const { width, height } = firstPage.getSize();

      // BOL Data mapping - only required fields
      const bolData = this.mapLoadToBOLData(loadData);

      // Try to fill form fields first (if PDF has AcroForm fields)
      const form = pdfDoc.getForm();
      const hasFormFields = form.getFields().length > 0;
      
      if (hasFormFields) {
        // Fill form fields - PDF will remain editable
        await this.fillBOLFormFields(form, bolData);
      } else {
        // Fallback to text positioning if no form fields
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        await this.fillBOLFields(firstPage, bolData, font, boldFont, width, height);
      }

      // Generate filename using billOfLadingNumber or loadId
      const identifier = loadData.billOfLadingNumber || loadId || loadData.vin || Date.now();
      const filename = `BOL_${identifier}.pdf`;
      const outputPath = path.join(this.outputPath, filename);

      // Save PDF with form fields preserved (editable)
      const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
      await fs.writeFile(outputPath, pdfBytes);

      return {
        success: true,
        filename,
        path: outputPath,
        url: `/generated-pdfs/${filename}`,
        hasFormFields
      };
    } catch (error) {
      console.error('Error generating BOL:', error);
      throw new Error(`Failed to generate BOL: ${error.message}`);
    }
  }

  /**
   * Fill BOL form fields (AcroForm) - keeps PDF editable
   */
  async fillBOLFormFields(form, data) {
    try {
      const fields = form.getFields();
      
      // Get all field names for intelligent matching
      const fieldNames = fields.map(field => field.getName().toLowerCase());
      
      // Helper function to find and set field value by partial name match
      const setFieldByMatch = (searchTerms, value) => {
        if (!value) return false;
        
        // Create a map of original field names for lookup
        const fieldMap = new Map();
        fields.forEach(field => {
          const name = field.getName();
          fieldMap.set(name.toLowerCase(), name);
        });
        
        for (const term of searchTerms) {
          const lowerTerm = term.toLowerCase();
          
          // Try exact match first (case-insensitive)
          for (const [lowerName, originalName] of fieldMap.entries()) {
            if (lowerName === lowerTerm) {
              try {
                const field = form.getTextField(originalName);
                if (field) {
                  field.setText(String(value));
                  console.log(`✓ Filled field "${originalName}" with "${value}"`);
                  return true;
                }
              } catch (e) {
                // Try other field types
                try {
                  const field = form.getCheckBox(originalName);
                  if (field && value) {
                    field.check();
                    return true;
                  }
                } catch (e2) {
                  // Skip this field type
                }
              }
            }
          }
          
          // Try partial match
          for (const [lowerName, originalName] of fieldMap.entries()) {
            if (lowerName.includes(lowerTerm) || lowerTerm.includes(lowerName)) {
              try {
                const field = form.getTextField(originalName);
                if (field) {
                  field.setText(String(value));
                  console.log(`✓ Matched field "${originalName}" (searched: "${term}") with "${value}"`);
                  return true;
                }
              } catch (e) {
                // Try other field types
                try {
                  const field = form.getCheckBox(originalName);
                  if (field && value) {
                    field.check();
                    return true;
                  }
                } catch (e2) {
                  // Skip this field
                }
              }
            }
          }
        }
        return false;
      };

      // Map data to form fields with intelligent matching
      // Driver/Carrier Name
      setFieldByMatch(['drivername', 'carriername', 'carrier', 'driver'], data.driverName);
      
      // Shipper (Pickup Location) - Name
      setFieldByMatch(['shippername', 'shipper', 'pickupname', 'pickup name'], data.shipperName);
      
      // Shipper Address
      setFieldByMatch(['shipperaddress', 'shipper address', 'pickupaddress', 'pickup address'], data.shipperAddress);
      
      // Shipper City/State/Zip
      setFieldByMatch(['shippercity', 'shipper city', 'shippercitystatezip', 'pickupcity', 'pickup city'], data.shipperCityStateZip);
      
      // Shipper SID
      setFieldByMatch(['shippersid', 'shipper sid', 'shippersidnumber', 'pickupsid'], data.shipperSID);
      
      // Consignee (Customer + Delivery Location) - Name
      setFieldByMatch(['consigneename', 'consignee', 'deliveryname', 'delivery name', 'customername'], data.consigneeName);
      
      // Consignee Address
      setFieldByMatch(['consigneeaddress', 'consignee address', 'deliveryaddress', 'delivery address'], data.consigneeAddress);
      
      // Consignee City/State/Zip
      setFieldByMatch(['consigneecity', 'consignee city', 'consigneecitystatezip', 'deliverycity', 'delivery city'], data.consigneeCityStateZip);
      
      // Consignee SID
      setFieldByMatch(['consigneesid', 'consignee sid', 'consigneesidnumber', 'deliverysid'], data.consigneeSID);
      
      // Contact Information - Attention
      setFieldByMatch(['attention', 'attn', 'contact'], data.attention);
      
      // Contact Information - Tel/Phone
      setFieldByMatch(['tel', 'phone', 'telephone', 'phonenumber'], data.tel);
      
      // Bill To
      setFieldByMatch(['billto', 'bill to', 'billtoaddress'], data.billTo);
      
      // Purchase Order Number
      setFieldByMatch(['purchaseorderno', 'purchase order', 'ponumber', 'po number', 'po'], data.purchaseOrderNo);
      
      // Bill of Lading Number
      setFieldByMatch(['billofladingno', 'bill of lading', 'bolnumber', 'bol number', 'bol'], data.billOfLadingNo);
      
      // Dates - Pickup Date
      setFieldByMatch(['pickupdate', 'pickup date', 'pick up date', 'shipperdate'], data.pickupDate);
      
      // Dates - Delivery Date
      setFieldByMatch(['deliverydate', 'delivery date', 'carrierdate', 'consignedate'], data.deliveryDate);
      
      // Log available fields for debugging (first time only)
      if (fields.length > 0 && process.env.NODE_ENV === 'development') {
        console.log(`\n=== PDF Form Fields Found: ${fields.length} ===`);
        fields.forEach(field => {
          const fieldName = field.getName();
          const fieldType = field.constructor.name;
          console.log(`  - ${fieldName} (${fieldType})`);
        });
        console.log('==========================================\n');
      }
      
    } catch (error) {
      console.error('Error filling BOL form fields:', error);
      throw error;
    }
  }

  /**
   * Generate Rate Confirmation PDF from Load data
   */
  async generateRateConfirmation(loadData) {
    try {
      const templatePath = path.join(this.templatesPath, 'Rate Confirmation - Sheet1 (1).pdf');
      const templateBytes = await fs.readFile(templatePath);
      const pdfDoc = await PDFDocument.load(templateBytes);
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      const { width, height } = firstPage.getSize();

      // Load fonts
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Rate Confirmation Data mapping
      const rateData = this.mapLoadToRateData(loadData);

      // Fill Rate Confirmation fields
      await this.fillRateConfirmationFields(firstPage, rateData, font, boldFont, width, height);

      // Generate filename
      const filename = `RateConfirmation_${loadData.vin}_${Date.now()}.pdf`;
      const outputPath = path.join(this.outputPath, filename);

      // Save PDF
      const pdfBytes = await pdfDoc.save();
      await fs.writeFile(outputPath, pdfBytes);

      return {
        success: true,
        filename,
        path: outputPath,
        url: `/generated-pdfs/${filename}`
      };
    } catch (error) {
      console.error('Error generating Rate Confirmation:', error);
      throw new Error(`Failed to generate Rate Confirmation: ${error.message}`);
    }
  }

  /**
   * Map Load data to BOL format - only required fields
   */
  mapLoadToBOLData(load) {
    // Format pickup location (Shipper)
    const pickupLocation = load.pickUpLocation || {};
    const shipperName = pickupLocation.name || '';
    const shipperAddress = pickupLocation.address || '';
    const shipperCityStateZip = this.formatCityStateZip(pickupLocation);
    const shipperSID = pickupLocation.loc || ''; // SID# from loc field
    
    // Format delivery location (Consignee)
    const deliveryLocation = load.deliveryLocation || {};
    const consigneeName = load.customerCompanyName || '';
    const consigneeAddress = deliveryLocation.address || '';
    const consigneeCityStateZip = this.formatCityStateZip(deliveryLocation);
    const consigneeSID = deliveryLocation.loc || ''; // SID# from loc field
    
    // Phone number (from pickup or delivery location)
    const phoneNumber = pickupLocation.contactPhone || deliveryLocation.contactPhone || '';
    
    // Format dates
    const pickupDate = load.pickUpDate ? this.formatDate(load.pickUpDate) : '';
    const deliveryDate = load.deliveryDate ? this.formatDate(load.deliveryDate) : '';
    
    return {
      // Driver/Carrier
      driverName: load.carrier?.name || '',
      
      shipperAddress,
      shipperCityStateZip,
      shipperSID,
      
      consigneeName,
      consigneeAddress,
      consigneeCityStateZip,
      consigneeSID,
      
      attention: 'For any questions Contact: offers@ciertacorp.com',
      tel: phoneNumber,
      
      billTo: 'CIERTA CORPORATION\n710 E MAIN ST\nLEXINGTON, KY 40502\nAccounting@ciertacorp.com',
      
      purchaseOrderNo: load.orderId?.toString() || '',
      billOfLadingNo: load.billOfLadingNumber || '',
      
      pickupDate,
      deliveryDate
    };
  }
  
  /**
   * Format city, state, zip
   */
  formatCityStateZip(location) {
    if (!location) return '';
    const parts = [];
    if (location.city) parts.push(location.city);
    if (location.state) parts.push(location.state);
    if (location.zip) parts.push(location.zip.toString());
    return parts.join(', ');
  }
  
  /**
   * Format date for PDF
   */
  formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    });
  }

  /**
   * Map Load data to Rate Confirmation format
   */
  mapLoadToRateData(load) {
    return {
      // Rate Information
      rateNumber: load.id?.toString().slice(-8) || 'N/A',
      vin: load.vin || 'N/A',
      vehicleType: load.type || 'N/A',
      
      customerCompany: load.customerCompanyName || 'N/A',
      customerEmails: Array.isArray(load.customerEmails) ? load.customerEmails.join(', ') : 'N/A',
      
      carrierName: load.carrier?.name || 'N/A',
      carrierMC: load.carrier?.mcNumber || 'N/A',
      carrierContact: load.carrier?.contact || 'N/A',
      
      pickupLocation: this.formatAddress(load.pickUpLocation),
      deliveryLocation: this.formatAddress(load.deliveryLocation),
      pickupDate: load.pickUpDate ? new Date(load.pickUpDate).toLocaleDateString() : 'N/A',
      deliveryDate: load.deliveryDate ? new Date(load.deliveryDate).toLocaleDateString() : 'N/A',
      
      vehicleMake: load.vehicleDetails?.make || 'N/A',
      vehicleModel: load.vehicleDetails?.model || 'N/A',
      vehicleYear: load.vehicleDetails?.year || 'N/A',
      
      value: load.value ? `$${load.value.toLocaleString()}` : 'N/A',
      
      carrierPaymentStatus: load.carrierPaymentStatus?.status || 'Pending',
      customerPaymentStatus: load.customerPaymentStatus?.status || 'Pending',
      
      assignedDate: load.assignedDate ? new Date(load.assignedDate).toLocaleDateString() : 'N/A',
      createdAt: load.createdAt ? new Date(load.createdAt).toLocaleDateString() : 'N/A'
    };
  }

  /**
   * Format address object to string
   */
  formatAddress(address) {
    if (!address) return 'N/A';
    
    const parts = [];
    if (address.name) parts.push(address.name);
    if (address.address) parts.push(address.address);
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    if (address.zip) parts.push(address.zip.toString());
    if (address.contactPhone) parts.push(`Phone: ${address.contactPhone}`);
    
    return parts.length > 0 ? parts.join(', ') : 'N/A';
  }

  /**
   * Fill BOL fields on PDF template
   * This method fills the specific fields required for BOL
   */
  async fillBOLFields(page, data, font, boldFont, width, height) {
    const fontSize = 9;
    const smallFontSize = 8;
    
    // Try to fill form fields first (if PDF has form fields)
    // If form fields don't exist, we'll use text positioning
    
    // Note: Exact coordinates need to be adjusted based on the actual PDF template
    // These are approximate positions for a standard BOL form
    
    // Driver Name (Carrier Name) - typically top right or in carrier section
    if (data.driverName) {
      page.drawText(data.driverName, {
        x: width - 200,
        y: height - 80,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    
    // Shipper Section (Pickup Location)
    let shipperY = height - 150;
    if (data.shipperName) {
      page.drawText(`Name: ${data.shipperName}`, {
        x: 50,
        y: shipperY,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    shipperY -= 15;
    
    if (data.shipperAddress) {
      page.drawText(`Address: ${data.shipperAddress}`, {
        x: 50,
        y: shipperY,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    shipperY -= 15;
    
    if (data.shipperCityStateZip) {
      page.drawText(`City/State/Zip: ${data.shipperCityStateZip}`, {
        x: 50,
        y: shipperY,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    shipperY -= 15;
    
    if (data.shipperSID) {
      page.drawText(`SID#: ${data.shipperSID}`, {
        x: 50,
        y: shipperY,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    
    // Consignee Section (Customer + Delivery Location)
    let consigneeY = height - 250;
    if (data.consigneeName) {
      page.drawText(`Name: ${data.consigneeName}`, {
        x: 50,
        y: consigneeY,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    consigneeY -= 15;
    
    if (data.consigneeAddress) {
      page.drawText(`Address: ${data.consigneeAddress}`, {
        x: 50,
        y: consigneeY,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    consigneeY -= 15;
    
    if (data.consigneeCityStateZip) {
      page.drawText(`City/State/Zip: ${data.consigneeCityStateZip}`, {
        x: 50,
        y: consigneeY,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    consigneeY -= 15;
    
    if (data.consigneeSID) {
      page.drawText(`SID#: ${data.consigneeSID}`, {
        x: 50,
        y: consigneeY,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    
    // Attention field
    if (data.attention) {
      page.drawText(data.attention, {
        x: 50,
        y: height - 350,
        size: smallFontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    
    // Tel. field
    if (data.tel) {
      page.drawText(`Tel.: ${data.tel}`, {
        x: 50,
        y: height - 370,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    
    // Bill To field (default message)
    if (data.billTo) {
      const billToLines = data.billTo.split('\n');
      let billToY = height - 420;
      billToLines.forEach(line => {
        if (line.trim()) {
          page.drawText(line, {
            x: 50,
            y: billToY,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
          });
          billToY -= 15;
        }
      });
    }
    
    // Purchase Order No
    if (data.purchaseOrderNo) {
      page.drawText(`Purchase order no: ${data.purchaseOrderNo}`, {
        x: width - 250,
        y: height - 200,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    
    // Bill of Lading No
    if (data.billOfLadingNo) {
      page.drawText(`Bill of Lading no.: ${data.billOfLadingNo}`, {
        x: width - 250,
        y: height - 220,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    
    // Dates at bottom - Shipper date (pickup date)
    if (data.pickupDate) {
      page.drawText(data.pickupDate, {
        x: 100,
        y: 100,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    
    // Dates at bottom - Carrier date (delivery date)
    if (data.deliveryDate) {
      page.drawText(data.deliveryDate, {
        x: width - 200,
        y: 100,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
  }

  /**
   * Fill Rate Confirmation fields on PDF
   */
  async fillRateConfirmationFields(page, data, font, boldFont, width, height) {
    const fontSize = 10;
    const boldFontSize = 12;
    
    // Title
    page.drawText('RATE CONFIRMATION', {
      x: width / 2 - 80,
      y: height - 50,
      size: boldFontSize,
      font: boldFont,
      color: rgb(0, 0, 0)
    });

    let yPosition = height - 100;
    
    // Rate Number
    page.drawText(`Rate Number: ${data.rateNumber}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 20;

    // VIN
    page.drawText(`VIN: ${data.vin}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 20;

    // Vehicle Type
    page.drawText(`Vehicle Type: ${data.vehicleType}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 40;

    // Customer Information
    page.drawText('CUSTOMER INFORMATION', {
      x: 50,
      y: yPosition,
      size: boldFontSize,
      font: boldFont,
      color: rgb(0, 0, 0)
    });
    yPosition -= 25;

    page.drawText(`Company: ${data.customerCompany}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 20;

    page.drawText(`Email: ${data.customerEmails}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 40;

    // Carrier Information
    page.drawText('CARRIER INFORMATION', {
      x: 50,
      y: yPosition,
      size: boldFontSize,
      font: boldFont,
      color: rgb(0, 0, 0)
    });
    yPosition -= 25;

    page.drawText(`Name: ${data.carrierName}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 20;

    page.drawText(`MC Number: ${data.carrierMC}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 20;

    page.drawText(`Contact: ${data.carrierContact}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 40;

    // Route Information
    page.drawText('ROUTE INFORMATION', {
      x: 50,
      y: yPosition,
      size: boldFontSize,
      font: boldFont,
      color: rgb(0, 0, 0)
    });
    yPosition -= 25;

    page.drawText(`From: ${data.pickupLocation}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 20;

    page.drawText(`To: ${data.deliveryLocation}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 20;

    page.drawText(`Pickup Date: ${data.pickupDate}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 20;

    page.drawText(`Delivery Date: ${data.deliveryDate}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 40;

    // Vehicle Details
    page.drawText('VEHICLE DETAILS', {
      x: 50,
      y: yPosition,
      size: boldFontSize,
      font: boldFont,
      color: rgb(0, 0, 0)
    });
    yPosition -= 25;

    page.drawText(`${data.vehicleYear} ${data.vehicleMake} ${data.vehicleModel}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 40;

    // Financial Information
    page.drawText('FINANCIAL INFORMATION', {
      x: 50,
      y: yPosition,
      size: boldFontSize,
      font: boldFont,
      color: rgb(0, 0, 0)
    });
    yPosition -= 25;

    page.drawText(`Value: ${data.value}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 20;

    page.drawText(`Carrier Payment Status: ${data.carrierPaymentStatus}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 20;

    page.drawText(`Customer Payment Status: ${data.customerPaymentStatus}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
  }

  /**
   * Generate both BOL and Rate Confirmation for a load
   */
  async generateAllDocuments(loadData) {
    try {
      const [bolResult, rateResult] = await Promise.all([
        this.generateBOL(loadData),
        this.generateRateConfirmation(loadData)
      ]);

      return {
        success: true,
        documents: {
          bol: bolResult,
          rateConfirmation: rateResult
        }
      };
    } catch (error) {
      console.error('Error generating documents:', error);
      throw new Error(`Failed to generate documents: ${error.message}`);
    }
  }

  /**
   * Inspect PDF form fields - useful for debugging
   * Returns list of all form fields in the PDF template
   */
  async inspectPDFFields(pdfType = 'BOL') {
    try {
      const templatePath = pdfType === 'BOL' 
        ? path.join(this.templatesPath, 'BOL CIERTA (6).pdf')
        : path.join(this.templatesPath, 'Rate Confirmation - Sheet1 (1).pdf');
      
      const templateBytes = await fs.readFile(templatePath);
      const pdfDoc = await PDFDocument.load(templateBytes);
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      
      const fieldInfo = fields.map(field => {
        const name = field.getName();
        const type = field.constructor.name;
        let value = '';
        let isReadOnly = false;
        
        try {
          if (type === 'PDFTextField') {
            value = field.getText();
            isReadOnly = field.isReadOnly();
          } else if (type === 'PDFCheckBox') {
            value = field.isChecked() ? 'Checked' : 'Unchecked';
          } else if (type === 'PDFDropdown') {
            value = field.getSelected().join(', ');
          } else if (type === 'PDFRadioGroup') {
            value = field.getSelected();
          }
        } catch (e) {
          value = 'N/A';
        }
        
        return {
          name,
          type,
          value,
          isReadOnly
        };
      });
      
      return {
        success: true,
        pdfType,
        totalFields: fields.length,
        fields: fieldInfo
      };
    } catch (error) {
      console.error('Error inspecting PDF fields:', error);
      throw new Error(`Failed to inspect PDF fields: ${error.message}`);
    }
  }

  /**
   * Delete a PDF file by path or filename
   */
  async deletePDF(pdfPathOrFilename) {
    try {
      let filePath;
      if (path.isAbsolute(pdfPathOrFilename)) {
        filePath = pdfPathOrFilename;
      } else {
        filePath = path.join(this.outputPath, pdfPathOrFilename);
      }
      
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      // File might not exist, which is okay
      if (error.code !== 'ENOENT') {
        console.error('Error deleting PDF:', error);
      }
      return false;
    }
  }

  /**
   * Clean up old generated PDFs (optional)
   */
  async cleanupOldPDFs(maxAgeHours = 24) {
    try {
      const files = await fs.readdir(this.outputPath);
      const now = Date.now();
      const maxAge = maxAgeHours * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.outputPath, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          console.log(`Cleaned up old PDF: ${file}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up PDFs:', error);
    }
  }
}

module.exports = new PDFService();
