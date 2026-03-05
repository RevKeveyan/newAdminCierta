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

      // Generate filename using loadId or orderId
      const identifier = loadId || loadData.orderId || loadData.vin || Date.now();
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

      const fillShipmentTable = (items, totalWeight) => {
        if (!data.isFreight || !items || items.length === 0) {
          return;
        }
        
        items.forEach((item, index) => {
          const fieldIndex = index + 1;
          const quantityFieldName = `quantity ${fieldIndex}`;
          const descriptionFieldName = `description ${fieldIndex}`;
          const weightFieldName = `weight ${fieldIndex}`;
          
          try {
            const qtyField = form.getTextField(quantityFieldName);
            if (qtyField) {
              qtyField.setText('1');
              console.log(`✓ Set ${quantityFieldName} to 1`);
            }
          } catch (e) {
            console.warn(`Field "${quantityFieldName}" not found or not a text field`);
          }
          
          try {
            const descField = form.getTextField(descriptionFieldName);
            if (descField && item.description && item.description.length > 0) {
              const descriptionText = item.description.join('\n');
              descField.setText(descriptionText);
              console.log(`✓ Filled ${descriptionFieldName} with description`);
            }
          } catch (e) {
            console.warn(`Field "${descriptionFieldName}" not found or not a text field`);
          }
          
          try {
            const weightField = form.getTextField(weightFieldName);
            if (weightField) {
              weightField.setText(String(item.weight));
              console.log(`✓ Filled ${weightFieldName} with ${item.weight}`);
            }
          } catch (e) {
            console.warn(`Field "${weightFieldName}" not found or not a text field`);
          }
        });
        
        try {
          const totalWeightField = form.getTextField('total weight');
          if (totalWeightField) {
            totalWeightField.setText(String(totalWeight));
            console.log(`✓ Filled total weight with ${totalWeight}`);
          }
        } catch (e) {
          console.warn(`Field "total weight" not found`);
        }
      };
      
      try {
        const texte2Field = form.getTextField('Texte2');
        if (texte2Field) {
          texte2Field.setText('');
          console.log(`✓ Filled Texte2 with empty string`);
        }
      } catch (e) {
        setFieldByMatch(['texte2'], '');
      }
      
      try {
        const texte3Field = form.getTextField('Texte3');
        if (texte3Field) {
          texte3Field.setText(data.purchaseOrderNoWithPrefix || '');
          console.log(`✓ Filled Texte3 (PO#) with: ${data.purchaseOrderNoWithPrefix}`);
        }
      } catch (e) {
        setFieldByMatch(['texte3'], data.purchaseOrderNoWithPrefix);
      }
      
      try {
        const texte4Field = form.getTextField('Texte4');
        if (texte4Field) {
          texte4Field.setText(data.billOfLadingNo || '');
          console.log(`✓ Filled Texte4 (Bill of Lading No) with: ${data.billOfLadingNo}`);
        }
      } catch (e) {
        setFieldByMatch(['texte4', 'billofladingno', 'bill of lading', 'bolnumber', 'bol number', 'bol'], data.billOfLadingNo);
      }
      
      try {
        const texte6Field = form.getTextField('Texte6');
        if (texte6Field) {
          texte6Field.setText(data.carriersRefNo || '');
          console.log(`✓ Filled Texte6 (Pickup# / Reference#) with: ${data.carriersRefNo}`);
        }
      } catch (e) {
        setFieldByMatch(['texte6', 'carriersrefno', 'carrier ref', 'carriers ref', 'ref no'], data.carriersRefNo);
      }
      
      try {
        const dateField = form.getTextField('Date');
        if (dateField) {
          dateField.setText(data.date || '');
        }
      } catch (e) {
        setFieldByMatch(['date'], data.date);
      }
      
      if (data.isFreight && data.shipmentItems && data.shipmentItems.length > 0) {
        fillShipmentTable(data.shipmentItems, data.totalWeight);
      }
      
      try {
        const shipperNameField = form.getTextField("Shipper's name");
        if (shipperNameField) {
          const shipperText = `Name: ${data.shipperName || ''}\nAddress: ${data.shipperAddress || ''}\nCity/State/Zip: ${data.shipperCityStateZip || ''}\nSID#: ${data.shipperSID || ''}`;
          shipperNameField.setText(shipperText);
          console.log(`✓ Filled Shipper's name with multiline text`);
        }
      } catch (e) {
        setFieldByMatch(['shippername', 'shipper', 'shipper name'], data.shipperName);
        setFieldByMatch(['shipperaddress', 'shipper address'], data.shipperAddress);
        setFieldByMatch(['shippercity', 'shipper city', 'shippercitystatezip'], data.shipperCityStateZip);
        setFieldByMatch(['shippersid', 'shipper sid'], data.shipperSID);
      }
      
      try {
        const consigneeField = form.getTextField('Consignee');
        if (consigneeField) {
          const consigneeText = `Name: ${data.consigneeName || ''}\nAddress: ${data.consigneeAddress || ''}\nCity/State/Zip: ${data.consigneeCityStateZip || ''}\nSID#: ${data.consigneeSID || ''}`;
          consigneeField.setText(consigneeText);
          console.log(`✓ Filled Consignee with multiline text`);
        }
      } catch (e) {
        setFieldByMatch(['consigneename', 'consignee', 'consignee name'], data.consigneeName);
        setFieldByMatch(['consigneeaddress', 'consignee address'], data.consigneeAddress);
        setFieldByMatch(['consigneecity', 'consignee city', 'consigneecitystatezip'], data.consigneeCityStateZip);
        setFieldByMatch(['consigneesid', 'consignee sid'], data.consigneeSID);
      }
      
      try {
        const carrierField = form.getTextField('Carrier');
        if (carrierField) {
          carrierField.setText(data.carrierName || '');
          console.log(`✓ Filled Carrier with: ${data.carrierName}`);
        }
      } catch (e) {
        setFieldByMatch(['drivername', 'carriername', 'carrier', 'driver', 'carrier name'], data.carrierName);
      }
      
      try {
        const attentionField = form.getTextField('Attention');
        if (attentionField) {
          attentionField.setText(data.attention || '');
          if (data.attention) console.log(`✓ Filled Attention with contact line`);
        }
      } catch (e) {
        setFieldByMatch(['attention'], data.attention);
      }
      
      try {
        const telField = form.getTextField('Tel');
        if (telField) {
          telField.setText(data.tel || '');
          if (data.tel) console.log(`✓ Filled Tel with: ${data.tel}`);
        }
      } catch (e) {
        setFieldByMatch(['tel'], data.tel);
      }
      
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

  async generateRateConfirmation(loadData) {
    try {
      const templatePath = path.join(this.templatesPath, 'Rate Confirmation.pdf');
      const templateBytes = await fs.readFile(templatePath);
      const pdfDoc = await PDFDocument.load(templateBytes);
      const form = pdfDoc.getForm();
      const hasFormFields = form.getFields().length > 0;
      if (hasFormFields) {
        const values = this.getRateConfirmationFormValues(loadData);
        this.fillRateConfirmationFormFields(form, values);
      } else {
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const { width, height } = firstPage.getSize();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const rateData = this.mapLoadToRateData(loadData);
        await this.fillRateConfirmationFields(firstPage, rateData, font, boldFont, width, height);
      }
      const identifier = loadData.orderId ?? loadData.id ?? loadData.vin ?? Date.now();
      const filename = `RateConfirmation_${identifier}.pdf`;
      const outputPath = path.join(this.outputPath, filename);
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
      console.error('Error generating Rate Confirmation:', error);
      throw new Error(`Failed to generate Rate Confirmation: ${error.message}`);
    }
  }

  async generateRateConfirmationTest() {
    try {
      const templatePath = path.join(this.templatesPath, 'Rate Confirmation - Sheet1 (1).pdf');
      const templateBytes = await fs.readFile(templatePath);
      const pdfDoc = await PDFDocument.load(templateBytes);
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      const { width, height } = firstPage.getSize();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const rateData = this.getTestRateData();
      await this.fillRateConfirmationFields(firstPage, rateData, font, boldFont, width, height);
      const filename = 'RateConfirmation_TEST.pdf';
      const outputPath = path.join(this.outputPath, filename);
      const pdfBytes = await pdfDoc.save();
      await fs.writeFile(outputPath, pdfBytes);
      return {
        success: true,
        filename,
        path: outputPath,
        url: `/generated-pdfs/${filename}`
      };
    } catch (error) {
      console.error('Error generating Rate Confirmation test:', error);
      throw new Error(`Failed to generate Rate Confirmation test: ${error.message}`);
    }
  }

  getRateConfirmationFieldLabels() {
    return [
      'Order ID',
      'Load created date',
      'Carrier equipment type',
      'Carrier company name',
      'Carrier MC#',
      'Carrier DOT#',
      'Dispatcher Name / Phone',
      'Driver Name / Phone',
      'Pickup address',
      'Pickup City, State, Zip',
      'Created by email',
      'Created by phone',
      'Pickup date or range',
      'Shipment dimensions (L, W, H)',
      'Shipment commodity',
      'Shipment weight + lbs',
      'Total weight + lbs',
      'Payment method',
      'Carrier rate + $',
      'Pickup locationName',
      'Delivery locationName',
      'Delivery address',
      'Delivery City, State, Zip',
      'Created by email',
      'Created by phone',
      'Delivery date or range',
      'Carrier DBA',
      'Shipment units (N/A or empty)',
      'Shipment units sum or Truckload',
      'Special requirements of shipment'
    ];
  }

  getRateConfirmationFormValues(load) {
    const people = Array.isArray(load.loadCarrierPeople) ? load.loadCarrierPeople : [];
    const roleMatches = (p, role) => (p.role || p.type || '').toString().toLowerCase() === role.toLowerCase();
    const dispatcher = people.filter(p => roleMatches(p, 'Dispatcher'))[0];
    const driver = people.filter(p => roleMatches(p, 'Driver'))[0];
    const dispatcherStr = dispatcher ? [dispatcher.fullName, dispatcher.phoneNumber].filter(Boolean).join(' / ') : '';
    const driverStr = driver ? [driver.fullName, driver.phoneNumber].filter(Boolean).join(' / ') : '';
    const pickupAddr = load.pickup?.address || {};
    const deliveryAddr = load.delivery?.address || {};
    const pickupCityStateZip = [pickupAddr.city, pickupAddr.state, pickupAddr.zipCode].filter(Boolean).join(', ');
    const deliveryCityStateZip = [deliveryAddr.city, deliveryAddr.state, deliveryAddr.zipCode].filter(Boolean).join(', ');
    const shipment = load.type?.freight && load.freight?.shipment ? load.freight.shipment : [];
    const carrier = load.carrier && typeof load.carrier === 'object' ? load.carrier : {};
    const equipmentStr = Array.isArray(carrier.equipmentType) ? carrier.equipmentType.join(', ') : (carrier.equipmentType || '');

    const formatPickupDate = () => {
      const exact = load.dates?.pickupDate || load.pickup?.date || load.dates?.pickupAt;
      if (exact) return this.formatDate(exact);
      const start = load.dates?.pickupDateStart;
      const end = load.dates?.pickupDateEnd;
      if (start && end) return `${this.formatDate(start)} - ${this.formatDate(end)}`;
      if (start) return this.formatDate(start);
      return '';
    };
    const formatDeliveryDate = () => {
      const exact = load.dates?.deliveryDate || load.delivery?.date || load.dates?.deliveryAt;
      if (exact) return this.formatDate(exact);
      const start = load.dates?.deliveryDateStart;
      const end = load.dates?.deliveryDateEnd;
      if (start && end) return `${this.formatDate(start)} - ${this.formatDate(end)}`;
      if (start) return this.formatDate(start);
      return '';
    };

    const dimensionsLines = shipment.map(s => {
      const parts = [s.dimensionsLength, s.dimensionsWidth, s.dimensionsHeight].filter(Boolean);
      return parts.length ? parts.join(' x ') : '';
    }).filter(Boolean);
    const commodityLines = shipment.map(s => s.commodity || '').filter(s => s !== '');
    const weightLines = shipment.map(s => (s.weight != null && s.weight !== '') ? `${String(s.weight)} lbs` : '').filter(Boolean);
    const totalWeight = shipment.reduce((sum, s) => sum + (parseFloat(s.weight) || 0), 0);
    const totalWeightStr = totalWeight ? `${totalWeight} lbs` : '';

    const units = shipment.map(s => (s.shipmentUnits != null && s.shipmentUnits !== '') ? String(s.shipmentUnits).trim() : null).filter(Boolean);
    const hasFTL = units.some(u => u.toUpperCase() === 'FTL');
    const hasNA = units.some(u => u.toUpperCase() === 'N/A');
    const numericUnits = units.filter(u => {
      const n = parseInt(u, 10);
      return !Number.isNaN(n) && n >= 1 && n <= 200;
    });
    let field28 = '';
    let field29 = '';
    if (hasFTL) {
      field28 = '';
      field29 = 'Truckload';
    } else if (hasNA && numericUnits.length === 0) {
      field28 = 'N/A';
      field29 = '';
    } else if (numericUnits.length > 0) {
      field28 = '';
      field29 = String(numericUnits.reduce((sum, u) => sum + parseInt(u, 10), 0));
    }

    const creator = load.createdBy && typeof load.createdBy === 'object' ? load.createdBy : null;
    const creatorEmail = creator?.email || '';
    const creatorPhone = creator?.phoneNumber || '';

    return [
      load.orderId?.toString() || '',
      load.createdAt ? this.formatDate(load.createdAt) : '',
      equipmentStr,
      carrier.name || '',
      carrier.mcNumber || '',
      carrier.dotNumber || '',
      dispatcherStr,
      driverStr,
      pickupAddr.address || '',
      pickupCityStateZip,
      creatorEmail,
      creatorPhone,
      formatPickupDate(),
      dimensionsLines.join('\n'),
      commodityLines.join('\n'),
      weightLines.join('\n'),
      totalWeightStr,
      load.paymentMethod || '',
      load.carrierRate != null && load.carrierRate !== '' ? `$${String(load.carrierRate)}` : '',
      load.pickup?.locationName || '',
      load.delivery?.locationName || '',
      deliveryAddr.address || '',
      deliveryCityStateZip,
      creatorEmail,
      creatorPhone,
      formatDeliveryDate(),
      carrier.dba || '',
      field28,
      field29,
      (load.vehicle?.specialRequirements || load.pickup?.notes || load.delivery?.notes || load.notes || '').trim()
    ];
  }

  async generateRateConfirmationFieldMap() {
    const templatePath = path.join(this.templatesPath, 'Rate Confirmation.pdf');
    const templateBytes = await fs.readFile(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    const labels = this.getRateConfirmationFieldLabels();
    const mapping = fields.map((f, i) => {
      const source = this.getRateConfirmationSourceForIndex(i);
      return {
        index: i + 1,
        fieldName: f.getName(),
        label: labels[i] || `Field ${i + 1}`,
        variable: source
      };
    });
    fields.forEach((field, index) => {
      const type = field.constructor.name;
      const name = field.getName();
      const source = this.getRateConfirmationSourceForIndex(index);
      const value = `[#${index + 1}] PDF: ${name} => Variable: ${source}`;
      try {
        if (type === 'PDFTextField') field.setText(value);
      } catch (e) {
        console.warn(`Could not set field "${name}":`, e.message);
      }
    });
    const filename = 'RateConfirmation_FIELD_MAP.pdf';
    const outputPath = path.join(this.outputPath, filename);
    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    await fs.writeFile(outputPath, pdfBytes);
    return {
      success: true,
      filename,
      path: outputPath,
      totalFields: fields.length,
      mapping
    };
  }

  getRateConfirmationSourceForIndex(index) {
    const sources = [
      'load.orderId',
      'load.createdAt',
      'load.carrier.equipmentType',
      'load.carrier.name',
      'load.carrier.mcNumber',
      'load.carrier.dotNumber',
      'loadCarrierPeople dispatcher: fullName / phoneNumber',
      'loadCarrierPeople driver: fullName / phoneNumber',
      'load.pickup.address.address',
      'load.pickup.address city, state, zipCode',
      'createdBy.email',
      'createdBy.phoneNumber',
      'load.dates.pickupDate or pickupDateStart-pickupDateEnd',
      'load.freight.shipment[] dimensions (L, W, H) newline-separated',
      'load.freight.shipment[].commodity newline-separated',
      'load.freight.shipment[].weight + lbs newline-separated',
      'sum(load.freight.shipment[].weight) + lbs',
      'load.paymentMethod',
      'load.carrierRate with $ prefix',
      'load.pickup.locationName',
      'load.delivery.locationName',
      'load.delivery.address.address',
      'load.delivery.address city, state, zipCode',
      'createdBy.email',
      'createdBy.phoneNumber',
      'load.dates.deliveryDate or deliveryDateStart-deliveryDateEnd',
      'load.carrier.dba',
      'shipmentUnits: N/A or empty',
      'shipmentUnits: sum or Truckload or empty',
      'load.vehicle.specialRequirements or pickup/delivery/load notes'
    ];
    return sources[index] != null ? sources[index] : `value at index ${index}`;
  }

  fillRateConfirmationFormFields(form, values) {
    const fields = form.getFields();
    (values || []).forEach((val, index) => {
      if (index >= fields.length) return;
      const field = fields[index];
      try {
        if (field.constructor.name === 'PDFTextField') {
          field.setText(String(val != null ? val : ''));
        }
      } catch (e) {
        console.warn(`Could not set field ${index + 1}:`, e.message);
      }
    });
  }

  /**
   * Map Load data to BOL format - only required fields
   * Uses current Load structure: load.pickup, load.delivery, load.freight.shipment[]
   */
  mapLoadToBOLData(load) {
    const isFreight = load.type?.freight === true;
    
    const poNumbers = isFreight && load.freight?.shipment
      ? load.freight.shipment
          .map(item => item.poNumber)
          .filter(Boolean)
      : [];
    
    const purchaseOrderNo = poNumbers.length > 0
      ? poNumbers.join(', ')
      : '';
    
    const purchaseOrderNoWithPrefix = poNumbers.length > 0
      ? poNumbers.map(po => `PO#: ${po}`).join(', ')
      : '';
    
    const billOfLadingNo = load.orderId?.toString() || '';
    
    const pickupNumbers = isFreight && load.freight?.shipment
      ? load.freight.shipment
          .map(item => item.pickupNumber)
          .filter(Boolean)
      : [];
    
    const deliveryReferences = isFreight && load.freight?.shipment
      ? load.freight.shipment
          .map(item => item.deliveryReference)
          .filter(Boolean)
      : [];
    
    const pickupNumbersWithPrefix = pickupNumbers.length > 0
      ? pickupNumbers.map(pn => `Pickup#: ${pn}`).join(', ')
      : '';
    
    const deliveryReferencesWithPrefix = deliveryReferences.length > 0
      ? deliveryReferences.map(dr => `Reference#: ${dr}`).join(', ')
      : '';
    
    const carriersRefNo = [
      pickupNumbersWithPrefix,
      deliveryReferencesWithPrefix
    ].filter(Boolean).join(' / ') || '';
    
    const shipmentItems = isFreight && load.freight?.shipment
      ? load.freight.shipment.map((item, index) => ({
          index: index,
          quantity: load.freight.shipment.length,
          description: [
            item.commodity || '',
            `${item.dimensionsLength || ''} x ${item.dimensionsWidth || ''} x ${item.dimensionsHeight || ''}`
          ].filter(Boolean),
          weight: item.weight || '',
        }))
      : [];
    
    const totalWeight = shipmentItems.reduce((sum, item) => {
      const weight = parseFloat(item.weight) || 0;
      return sum + weight;
    }, 0);
    
    const shipperName = load.delivery?.locationName || '';
    const shipperAddress = load.delivery?.address?.address || '';
    const shipperCity = load.delivery?.address?.city || '';
    const shipperState = load.delivery?.address?.state || '';
    const shipperZip = load.delivery?.address?.zipCode || '';
    const shipperCityStateZip = [
      shipperCity,
      shipperState,
      shipperZip
    ].filter(Boolean).join(', ') || '';
    
    const consigneeName = load.pickup?.locationName || '';
    const consigneeAddress = load.pickup?.address?.address || '';
    const consigneeCity = load.pickup?.address?.city || '';
    const consigneeState = load.pickup?.address?.state || '';
    const consigneeZip = load.pickup?.address?.zipCode || '';
    const consigneeCityStateZip = [
      consigneeCity,
      consigneeState,
      consigneeZip
    ].filter(Boolean).join(', ') || '';
    
    const carrierName = load.carrier?.name || '';
    
    const user = load.createdBy && typeof load.createdBy === 'object' ? load.createdBy : null;
    const attention = user?.email ? `For any questions Contact: ${user.email}` : '';
    const tel = user?.phoneNumber || '';
    
    return {
      purchaseOrderNo,
      purchaseOrderNoWithPrefix,
      billOfLadingNo,
      date: '',
      carriersRefNo,
      
      shipmentItems,
      totalWeight,
      isFreight,
      
      shipperName,
      shipperAddress,
      shipperCityStateZip,
      shipperSID: '',
      
      consigneeName,
      consigneeAddress,
      consigneeCityStateZip,
      consigneeSID: '',
      
      carrierName,
      attention,
      tel
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

  getTestRateData() {
    return {
      orderId: '[Order ID]',
      dispatchDate: '[Dispatch Date]',
      equipmentType: '[Equipment type]',
      paymentMethod: '[Payment method]',
      paymentTerms: '[Payment terms]',
      totalPaymentToCarrier: '[Total Payment to Carrier]',
      billingEmail: '[Billing Email]',
      carrierCompanyName: '[Company name]',
      carrierDBA: '[DBA]',
      carrierMC: '[MC#]',
      carrierDOT: '[DOT#]',
      dispatcherNamePhone: '[Dispatcher Name / Phone]',
      driverNamePhone: '[Driver Name / Phone]',
      pickupName: '[Pickup - Name]',
      pickupAddress: '[Pickup - Address]',
      pickupCityStateZip: '[Pickup - City, State, Zip]',
      pickupContact: '[Pickup - Contact]',
      pickupPhone: '[Pickup - Phone#]',
      pickupDate: '[Pickup - Date]',
      deliveryName: '[Delivery - Name]',
      deliveryAddress: '[Delivery - Address]',
      deliveryCityStateZip: '[Delivery - City, State, Zip]',
      deliveryContact: '[Delivery - Contact]',
      deliveryPhone: '[Delivery - Phone#]',
      deliveryDate: '[Delivery - Date]',
      shipmentItems: [
        { units: '[Units]', dimensions: '[Dimensions]', description: '[Description]', weight: '[Weight]' }
      ],
      totalItemsToShip: '[Total Items]',
      totalWeight: '[Total Weight]',
      additionalDetails: '[Additional Details / Dispatch Instructions]'
    };
  }

  mapLoadToRateData(load) {
    const pickup = load.pickup || load.pickUpLocation;
    const delivery = load.delivery || load.deliveryLocation;
    const pickupAddr = pickup?.address || pickup;
    const deliveryAddr = delivery?.address || delivery;
    const pickupCityStateZip = [pickupAddr?.city, pickupAddr?.state, pickupAddr?.zipCode].filter(Boolean).join(', ');
    const deliveryCityStateZip = [deliveryAddr?.city, deliveryAddr?.state, deliveryAddr?.zipCode].filter(Boolean).join(', ');
    const isFreight = load.type?.freight === true;
    const shipment = isFreight && load.freight?.shipment ? load.freight.shipment : [];
    const shipmentItems = shipment.map(item => ({
      units: item.quantity ?? '1',
      dimensions: [item.dimensionsLength, item.dimensionsWidth, item.dimensionsHeight].filter(Boolean).join(' x ') || '',
      description: item.commodity || '',
      weight: item.weight != null ? String(item.weight) : ''
    }));
    const totalWeight = shipmentItems.reduce((sum, item) => sum + (parseFloat(item.weight) || 0), 0);
    return {
      orderId: load.orderId?.toString() || load.id?.toString() || '',
      dispatchDate: load.pickUpDate ? this.formatDate(load.pickUpDate) : (load.assignedDate ? this.formatDate(load.assignedDate) : ''),
      equipmentType: (typeof load.type === 'string' ? load.type : load.type?.vehicleType) || '',
      paymentMethod: 'Automated Clearing House (ACH)',
      paymentTerms: load.paymentTerms || '',
      totalPaymentToCarrier: load.value != null ? `$${Number(load.value).toLocaleString()}` : '',
      billingEmail: load.billingEmail || 'accounting@ciertacorp.com',
      carrierCompanyName: load.carrier?.name || '',
      carrierDBA: load.carrier?.dba || '',
      carrierMC: load.carrier?.mcNumber || '',
      carrierDOT: load.carrier?.dotNumber || '',
      dispatcherNamePhone: load.dispatcherName || load.dispatcherPhone ? [load.dispatcherName, load.dispatcherPhone].filter(Boolean).join(' / ') : '',
      driverNamePhone: load.driverName || load.driverPhone ? [load.driverName, load.driverPhone].filter(Boolean).join(' / ') : (load.carrier?.contact || ''),
      pickupName: pickup?.locationName || pickup?.name || '',
      pickupAddress: pickupAddr?.address || pickup?.address || '',
      pickupCityStateZip: pickupCityStateZip || '',
      pickupContact: pickup?.contactName || pickup?.contact || '',
      pickupPhone: pickup?.contactPhone || pickup?.phone || '',
      pickupDate: load.pickUpDate ? this.formatDate(load.pickUpDate) : '',
      deliveryName: delivery?.locationName || delivery?.name || '',
      deliveryAddress: deliveryAddr?.address || delivery?.address || '',
      deliveryCityStateZip: deliveryCityStateZip || '',
      deliveryContact: delivery?.contactName || delivery?.contact || '',
      deliveryPhone: delivery?.contactPhone || delivery?.phone || '',
      deliveryDate: load.deliveryDate ? this.formatDate(load.deliveryDate) : '',
      shipmentItems: shipmentItems.length ? shipmentItems : [{ units: '', dimensions: '', description: '', weight: '' }],
      totalItemsToShip: shipmentItems.length ? String(shipmentItems.length) : '',
      totalWeight: totalWeight ? String(totalWeight) : '',
      additionalDetails: load.notes || load.dispatchInstructions || ''
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

  async fillRateConfirmationFields(page, data, font, boldFont, width, height) {
    const fontSize = 9;
    const lineH = 14;
    const leftColX = 50;
    const rightColX = width / 2 + 20;
    const draw = (text, x, y) => {
      if (!text) return;
      const str = String(text).slice(0, 80);
      page.drawText(str, { x, y, size: fontSize, font, color: rgb(0, 0, 0) });
    };
    let y = height - 72;
    draw(data.orderId, width - 120, y);
    y -= lineH;
    draw(data.dispatchDate, 220, y);
    y -= lineH;
    draw(data.equipmentType, 220, y);
    y -= lineH * 2;
    draw(data.paymentMethod, leftColX, y);
    y -= lineH;
    draw(data.paymentTerms, leftColX, y);
    y -= lineH;
    draw(data.totalPaymentToCarrier, leftColX, y);
    y -= lineH;
    draw(data.billingEmail, leftColX, y);
    y = height - 72 - lineH * 3 - lineH * 2;
    draw(data.carrierCompanyName, rightColX, y);
    y -= lineH;
    draw(data.carrierDBA, rightColX, y);
    y -= lineH;
    draw(data.carrierMC, rightColX, y);
    y -= lineH;
    draw(data.carrierDOT, rightColX, y);
    y -= lineH;
    draw(data.dispatcherNamePhone, rightColX, y);
    y -= lineH;
    draw(data.driverNamePhone, rightColX, y);
    y = height - 72 - lineH * 3 - lineH * 6 - lineH * 3;
    const pickupY = y;
    draw(data.pickupName, leftColX, y);
    y -= lineH;
    draw(data.pickupAddress, leftColX, y);
    y -= lineH;
    draw(data.pickupCityStateZip, leftColX, y);
    y -= lineH;
    draw(data.pickupContact, leftColX, y);
    y -= lineH;
    draw(data.pickupPhone, leftColX, y);
    y -= lineH;
    draw(data.pickupDate, leftColX, y);
    y = pickupY;
    draw(data.deliveryName, rightColX, y);
    y -= lineH;
    draw(data.deliveryAddress, rightColX, y);
    y -= lineH;
    draw(data.deliveryCityStateZip, rightColX, y);
    y -= lineH;
    draw(data.deliveryContact, rightColX, y);
    y -= lineH;
    draw(data.deliveryPhone, rightColX, y);
    y -= lineH;
    draw(data.deliveryDate, rightColX, y);
    y = height - 72 - lineH * 3 - lineH * 6 - lineH * 6 - lineH * 2;
    const tableY = y;
    const colW = (width - 100) / 4;
    (data.shipmentItems || []).slice(0, 5).forEach((row, i) => {
      const rowY = tableY - i * lineH;
      draw(row.units, leftColX, rowY);
      draw(row.dimensions, leftColX + colW, rowY);
      draw(row.description, leftColX + colW * 2, rowY);
      draw(row.weight, leftColX + colW * 3, rowY);
    });
    y = tableY - lineH * 6;
    draw(data.totalItemsToShip, leftColX + colW * 0.5, y);
    draw(data.totalWeight, leftColX + colW * 2.5, y);
    y -= lineH * 2;
    const lines = (data.additionalDetails || '').split('\n').slice(0, 4);
    lines.forEach((line) => {
      draw(line.trim(), leftColX, y);
      y -= lineH;
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
   * Generate BOL PDF with every field filled with its field name for visual identification
   * Output: BOL_FIELD_MAP.pdf in generated-pdfs folder
   */
  async generateBOLFieldMap() {
    try {
      const templatePath = path.join(this.templatesPath, 'BOL CIERTA (6).pdf');
      const templateBytes = await fs.readFile(templatePath);
      const pdfDoc = await PDFDocument.load(templateBytes, {
        ignoreEncryption: false,
        updateMetadata: false
      });
      const form = pdfDoc.getForm();
      const fields = form.getFields();

      const fieldCategories = {
        'top': ['Bill to', 'Texte3', 'Texte4', 'Texte5', 'Texte6'],
        'shipper': ['Shipper\'s name'],
        'consignee': ['Consignee', 'Consignor'],
        'carrier': ['Carrier'],
        'dates': ['Date', 'Date 2', 'Date 3'],
        'shipment': ['quantity', 'description', 'weight', 'total'],
        'other': []
      };

      fields.forEach((field, index) => {
        const name = field.getName();
        const type = field.constructor.name;
        const fieldNumber = index + 1;
        
        let value = '';
        let category = 'other';
        
        if (name.toLowerCase().includes('shipper')) category = 'shipper';
        else if (name.toLowerCase().includes('consign')) category = 'consignee';
        else if (name.toLowerCase().includes('carrier')) category = 'carrier';
        else if (name.toLowerCase().includes('date')) category = 'dates';
        else if (name.toLowerCase().includes('quantity') || name.toLowerCase().includes('description') || name.toLowerCase().includes('weight') || name.toLowerCase().includes('total')) category = 'shipment';
        else if (fieldCategories.top.some(t => name.includes(t))) category = 'top';
        
        const categoryPrefix = {
          'top': 'TOP',
          'shipper': 'SHIPPER',
          'consignee': 'CONSIGNEE',
          'carrier': 'CARRIER',
          'dates': 'DATE',
          'shipment': 'SHIPMENT',
          'other': 'FIELD'
        }[category] || 'FIELD';

        try {
          if (type === 'PDFTextField') {
            if (name === 'Shipper\'s name' || name === 'Consignee') {
              value = `[#${fieldNumber}] ${categoryPrefix} - ${name}\nName: [HERE]\nAddress: [HERE]\nCity/State/Zip: [HERE]\nSID#: [HERE]`;
            } else {
              value = `[#${fieldNumber}] ${categoryPrefix} - ${name}`;
            }
            field.setText(value);
          } else if (type === 'PDFCheckBox') {
            field.check();
            value = `[#${fieldNumber}] CHECKBOX - ${name} (CHECKED)`;
          } else if (type === 'PDFDropdown') {
            const options = field.getOptions();
            if (options.length > 0) {
              field.select(options[0]);
              value = `[#${fieldNumber}] DROPDOWN - ${name} = ${options[0]}`;
            }
          } else if (type === 'PDFRadioGroup') {
            const options = field.getOptions();
            if (options.length > 0) {
              field.select(options[0]);
              value = `[#${fieldNumber}] RADIO - ${name} = ${options[0]}`;
            }
          }
        } catch (e) {
          console.warn(`Could not set field "${name}":`, e.message);
        }
      });

      const filename = 'BOL_FIELD_MAP.pdf';
      const outputPath = path.join(this.outputPath, filename);
      const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
      await fs.writeFile(outputPath, pdfBytes);

      return {
        success: true,
        filename,
        path: outputPath,
        totalFields: fields.length
      };
    } catch (error) {
      console.error('Error generating BOL field map:', error);
      throw new Error(`Failed to generate BOL field map: ${error.message}`);
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

  /**
   * Upload BOL PDF to AWS S3 and save reference in Load
   * FUTURE FUNCTION: Ready for AWS integration
   * Currently not called - PDFs are saved locally only
   * 
   * @param {String} localPdfPath - Local path to generated PDF
   * @param {String} loadId - Load ID
   * @param {String} orderId - Order ID for filename
   * @returns {Promise<Object>} - { success, s3Key, s3Url }
   */
  async uploadBOLToS3(localPdfPath, loadId, orderId) {
    try {
      const { uploadToS3 } = require('./s3Service');
      
      const pdfBuffer = await fs.readFile(localPdfPath);
      const filename = `BOL_${orderId || loadId}.pdf`;
      
      const s3Key = await uploadToS3(
        pdfBuffer,
        filename,
        'load',
        loadId.toString(),
        'pdfs',
        'bol'
      );
      
      const s3Url = `/api/files/${s3Key}`;
      
      return {
        success: true,
        s3Key,
        s3Url,
        filename
      };
    } catch (error) {
      console.error('[PDFService] Failed to upload BOL to S3:', error);
      throw new Error(`Failed to upload BOL to S3: ${error.message}`);
    }
  }

  /**
   * Generate BOL and optionally upload to S3
   * FUTURE FUNCTION: When ready, set uploadToS3 = true
   * 
   * @param {Object} loadData - Load data object
   * @param {String} loadId - Load ID
   * @param {Boolean} uploadToS3 - Whether to upload to S3 (default: false)
   * @returns {Promise<Object>} - Result with local path and optionally S3 key
   */
  async generateBOLWithS3(loadData, loadId = null, uploadToS3 = false) {
    try {
      const bolResult = await this.generateBOL(loadData, loadId);
      
      if (uploadToS3 && loadId) {
        const s3Result = await this.uploadBOLToS3(
          bolResult.path,
          loadId,
          loadData.orderId
        );
        
        return {
          ...bolResult,
          s3Key: s3Result.s3Key,
          s3Url: s3Result.s3Url,
          uploadedToS3: true
        };
      }
      
      return {
        ...bolResult,
        uploadedToS3: false
      };
    } catch (error) {
      console.error('[PDFService] Failed to generate BOL with S3:', error);
      throw error;
    }
  }
}

module.exports = new PDFService();
