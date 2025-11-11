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
   */
  async generateBOL(loadData) {
    try {
      const templatePath = path.join(this.templatesPath, 'BOL CIERTA (6).pdf');
      const templateBytes = await fs.readFile(templatePath);
      const pdfDoc = await PDFDocument.load(templateBytes);
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      const { width, height } = firstPage.getSize();

      // Load fonts
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // BOL Data mapping
      const bolData = this.mapLoadToBOLData(loadData);

      // Fill BOL fields
      await this.fillBOLFields(firstPage, bolData, font, boldFont, width, height);

      // Generate filename
      const filename = `BOL_${loadData.vin}_${Date.now()}.pdf`;
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
      console.error('Error generating BOL:', error);
      throw new Error(`Failed to generate BOL: ${error.message}`);
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
   * Map Load data to BOL format
   */
  mapLoadToBOLData(load) {
    return {
      // Load Information
      loadNumber: load.id?.toString().slice(-8) || 'N/A',
      vin: load.vin || 'N/A',
      vehicleType: load.type || 'N/A',
      category: load.category || 'N/A',
      
      // Customer Information
      customerCompany: load.customerCompanyName || 'N/A',
      customerEmails: Array.isArray(load.customerEmails) ? load.customerEmails.join(', ') : 'N/A',
      
      // Carrier Information
      carrierName: load.carrier?.name || 'N/A',
      carrierMC: load.carrier?.mcNumber || 'N/A',
      carrierContact: load.carrier?.contact || 'N/A',
      carrierEmail: load.carrier?.email || 'N/A',
      
      // Pickup Information
      pickupDate: load.pickUpDate ? new Date(load.pickUpDate).toLocaleDateString() : 'N/A',
      pickupLocation: this.formatAddress(load.pickUpLocation),
      
      // Delivery Information
      deliveryDate: load.deliveryDate ? new Date(load.deliveryDate).toLocaleDateString() : 'N/A',
      deliveryLocation: this.formatAddress(load.deliveryLocation),
      
      // Vehicle Details
      vehicleMake: load.vehicleDetails?.make || 'N/A',
      vehicleModel: load.vehicleDetails?.model || 'N/A',
      vehicleYear: load.vehicleDetails?.year || 'N/A',
      vehicleColor: load.vehicleDetails?.color || 'N/A',
      vehicleMileage: load.vehicleDetails?.mileage || 'N/A',
      
      // Status and Value
      status: load.status || 'N/A',
      value: load.value ? `$${load.value.toLocaleString()}` : 'N/A',
      insurance: load.insurance ? 'Yes' : 'No',
      
      // Special Requirements
      specialRequirements: load.specialRequirements || 'None',
      
      // Dates
      assignedDate: load.assignedDate ? new Date(load.assignedDate).toLocaleDateString() : 'N/A',
      createdAt: load.createdAt ? new Date(load.createdAt).toLocaleDateString() : 'N/A'
    };
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
      
      // Customer Information
      customerCompany: load.customerCompanyName || 'N/A',
      customerEmails: Array.isArray(load.customerEmails) ? load.customerEmails.join(', ') : 'N/A',
      
      // Carrier Information
      carrierName: load.carrier?.name || 'N/A',
      carrierMC: load.carrier?.mcNumber || 'N/A',
      carrierContact: load.carrier?.contact || 'N/A',
      
      // Route Information
      pickupLocation: this.formatAddress(load.pickUpLocation),
      deliveryLocation: this.formatAddress(load.deliveryLocation),
      pickupDate: load.pickUpDate ? new Date(load.pickUpDate).toLocaleDateString() : 'N/A',
      deliveryDate: load.deliveryDate ? new Date(load.deliveryDate).toLocaleDateString() : 'N/A',
      
      // Vehicle Details
      vehicleMake: load.vehicleDetails?.make || 'N/A',
      vehicleModel: load.vehicleDetails?.model || 'N/A',
      vehicleYear: load.vehicleDetails?.year || 'N/A',
      
      // Financial Information
      value: load.value ? `$${load.value.toLocaleString()}` : 'N/A',
      
      // Payment Status
      carrierPaymentStatus: load.carrierPaymentStatus?.status || 'Pending',
      customerPaymentStatus: load.customerPaymentStatus?.status || 'Pending',
      
      // Dates
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
   * Fill BOL fields on PDF
   */
  async fillBOLFields(page, data, font, boldFont, width, height) {
    const fontSize = 10;
    const boldFontSize = 12;
    
    // Title
    page.drawText('BILL OF LADING', {
      x: width / 2 - 60,
      y: height - 50,
      size: boldFontSize,
      font: boldFont,
      color: rgb(0, 0, 0)
    });

    // Load Information Section
    let yPosition = height - 100;
    
    // Load Number
    page.drawText(`Load Number: ${data.loadNumber}`, {
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

    // Pickup Information
    page.drawText('PICKUP INFORMATION', {
      x: 50,
      y: yPosition,
      size: boldFontSize,
      font: boldFont,
      color: rgb(0, 0, 0)
    });
    yPosition -= 25;

    page.drawText(`Date: ${data.pickupDate}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 20;

    page.drawText(`Location: ${data.pickupLocation}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 40;

    // Delivery Information
    page.drawText('DELIVERY INFORMATION', {
      x: 50,
      y: yPosition,
      size: boldFontSize,
      font: boldFont,
      color: rgb(0, 0, 0)
    });
    yPosition -= 25;

    page.drawText(`Date: ${data.deliveryDate}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 20;

    page.drawText(`Location: ${data.deliveryLocation}`, {
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
    yPosition -= 20;

    page.drawText(`Color: ${data.vehicleColor}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 20;

    page.drawText(`Mileage: ${data.vehicleMileage}`, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 40;

    // Special Requirements
    if (data.specialRequirements && data.specialRequirements !== 'None') {
      page.drawText('SPECIAL REQUIREMENTS', {
        x: 50,
        y: yPosition,
        size: boldFontSize,
        font: boldFont,
        color: rgb(0, 0, 0)
      });
      yPosition -= 25;

      page.drawText(data.specialRequirements, {
        x: 50,
        y: yPosition,
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
