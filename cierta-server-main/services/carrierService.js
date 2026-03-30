const Carrier = require('../models/Carrier');
const mongoose = require('mongoose');
const { normalizeCarrierEquipment } = require('../utils/carrierEquipment');

class CarrierService {
  async findOrCreate(carrierData) {
    if (!carrierData) return null;

    if (carrierData.id && mongoose.Types.ObjectId.isValid(carrierData.id)) {
      const existing = await Carrier.findById(carrierData.id);
      if (existing) {
        await this.updateCarrier(existing, carrierData);
        return existing._id;
      }
    }

    const hasName = carrierData.name && carrierData.name.trim() !== '';
    const hasCompanyName = carrierData.companyName && carrierData.companyName.trim() !== '';

    if (!hasName && !hasCompanyName) {
      return null;
    }

    let carrier = await this.findExisting(carrierData);

    if (!carrier) {
      carrier = await this.createNew(carrierData);
    } else {
      await this.updateCarrier(carrier, carrierData);
    }

    return carrier._id;
  }

  async findExisting(carrierData) {
    if (carrierData.email?.trim()) {
      const found = await Carrier.findOne({ email: carrierData.email.trim().toLowerCase() });
      if (found) return found;
    }

    if (carrierData.mcNumber?.trim()) {
      const found = await Carrier.findOne({ mcNumber: carrierData.mcNumber.trim() });
      if (found) return found;
    }

    if (carrierData.dotNumber?.trim()) {
      const found = await Carrier.findOne({ dotNumber: carrierData.dotNumber.trim() });
      if (found) return found;
    }

    if (carrierData.name && carrierData.companyName) {
      const found = await Carrier.findOne({
        name: { $regex: new RegExp(`^${carrierData.name}$`, 'i') },
        companyName: { $regex: new RegExp(`^${carrierData.companyName}$`, 'i') }
      });
      if (found) return found;
    }

    if (carrierData.name) {
      const found = await Carrier.findOne({
        name: { $regex: new RegExp(`^${carrierData.name}$`, 'i') }
      });
      if (found) return found;
    }

    return null;
  }

  async createNew(carrierData) {
    const hasName = carrierData.name && carrierData.name.trim() !== '';
    const hasCompanyName = carrierData.companyName && carrierData.companyName.trim() !== '';

    let email = null;
    if (carrierData.email && typeof carrierData.email === 'string') {
      const trimmedEmail = carrierData.email.trim().toLowerCase();
      if (trimmedEmail && trimmedEmail !== 'undefined' && trimmedEmail !== 'null') {
        email = trimmedEmail;
      }
    }
    
    const mcNumber = carrierData.mcNumber?.trim() || null;
    const dotNumber = carrierData.dotNumber?.trim() || null;

    await this.checkDuplicates(email, mcNumber, dotNumber);

    // Normalize people array
    let people = [];
    if (Array.isArray(carrierData.people) && carrierData.people.length > 0) {
      people = carrierData.people
        .filter(person => person && person.fullName && person.fullName.trim() !== '')
        .map(person => ({
          type: person.type || 'driver',
          fullName: person.fullName.trim(),
          email: person.email?.trim() || undefined,
          phoneNumber: person.phoneNumber?.trim() || undefined
        }));
    }

    const normalizedEquipment = normalizeCarrierEquipment(carrierData);
    const carrier = new Carrier({
      name: hasName ? carrierData.name.trim() : (hasCompanyName ? carrierData.companyName.trim() : ''),
      phoneNumber: carrierData.phoneNumber?.trim() || undefined,
      email,
      companyName: hasCompanyName ? carrierData.companyName.trim() : undefined,
      dba: carrierData.dba?.trim() || undefined,
      mcNumber,
      dotNumber,
      address: carrierData.address || {},
      people: people.length > 0 ? people : undefined,
      photos: carrierData.photos || [],
      equipment: normalizedEquipment.equipment.length > 0 ? normalizedEquipment.equipment : undefined,
      equipmentType: normalizedEquipment.equipmentType.length > 0 ? normalizedEquipment.equipmentType : undefined,
      size: normalizedEquipment.size.length > 0 ? normalizedEquipment.size : undefined,
      capabilities: Array.isArray(carrierData.capabilities)
        ? carrierData.capabilities.filter(c => c && c.trim() !== '')
        : [],
      certifications: Array.isArray(carrierData.certifications)
        ? carrierData.certifications.filter(c => c && c.trim() !== '')
        : []
    });

    try {
      await carrier.save();
    } catch (error) {
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        let fieldValue = carrierData[field];
        
        if (field === 'email') {
          fieldValue = email;
        } else if (field === 'mcNumber') {
          fieldValue = mcNumber;
        } else if (field === 'dotNumber') {
          fieldValue = dotNumber;
        }
        
        if (fieldValue === null || fieldValue === undefined || fieldValue === 'undefined' || fieldValue === 'null') {
          fieldValue = 'undefined';
        }
        
        throw new Error(`Carrier with ${field} "${fieldValue}" already exists`);
      }
      throw error;
    }

    return carrier;
  }

  async checkDuplicates(email, mcNumber, dotNumber) {
    const checks = [];
    if (email && email !== 'undefined' && email !== 'null') {
      checks.push(Carrier.findOne({ email }).select('_id name email'));
    }
    if (mcNumber && mcNumber !== 'undefined' && mcNumber !== 'null') {
      checks.push(Carrier.findOne({ mcNumber }).select('_id name mcNumber'));
    }
    if (dotNumber && dotNumber !== 'undefined' && dotNumber !== 'null') {
      checks.push(Carrier.findOne({ dotNumber }).select('_id name dotNumber'));
    }

    if (checks.length === 0) return;

    const duplicates = await Promise.all(checks);
    const duplicate = duplicates.find(d => d !== null);

    if (duplicate) {
      let field = 'email';
      let value = email;
      if (duplicate.mcNumber === mcNumber) {
        field = 'MC Number';
        value = mcNumber;
      } else if (duplicate.dotNumber === dotNumber) {
        field = 'DOT Number';
        value = dotNumber;
      }
      throw new Error(`Carrier with ${field} "${value}" already exists (Carrier: ${duplicate.name || 'Unknown'})`);
    }
  }

  async updateCarrier(carrier, data) {
    let updated = false;

    // Удаляем undefined/null значения из data перед обработкой
    const { removeUndefinedNullValues } = require('../utils/dataHelpers');
    const cleanedData = removeUndefinedNullValues(data);

    if (cleanedData.name && cleanedData.name !== carrier.name) {
      carrier.name = cleanedData.name;
      updated = true;
    }
    if (cleanedData.phoneNumber !== undefined && cleanedData.phoneNumber !== null && cleanedData.phoneNumber !== '') {
      carrier.phoneNumber = cleanedData.phoneNumber;
      updated = true;
    } else if (cleanedData.phoneNumber === null || cleanedData.phoneNumber === '') {
      // Удаляем phoneNumber, если передано null или пустая строка
      carrier.phoneNumber = undefined;
      updated = true;
    }
    if (cleanedData.email !== undefined) {
      if (cleanedData.email && typeof cleanedData.email === 'string') {
        const trimmedEmail = cleanedData.email.trim().toLowerCase();
        if (trimmedEmail && trimmedEmail !== 'undefined' && trimmedEmail !== 'null') {
          if (trimmedEmail !== carrier.email) {
            const existing = await Carrier.findOne({
              email: trimmedEmail,
              _id: { $ne: carrier._id }
            });
            if (existing) {
              throw new Error(`Carrier with email "${trimmedEmail}" already exists (Carrier: ${existing.name || 'Unknown'})`);
            }
            carrier.email = trimmedEmail;
            updated = true;
          }
        } else {
          // Удаляем email, если передана пустая строка или 'undefined'/'null'
          carrier.email = undefined;
          updated = true;
        }
      } else if (cleanedData.email === null || cleanedData.email === '') {
        // Удаляем email, если передано null или пустая строка
        carrier.email = undefined;
        updated = true;
      }
    }
    if (cleanedData.companyName !== undefined && cleanedData.companyName !== null && cleanedData.companyName !== '') {
      carrier.companyName = cleanedData.companyName;
      updated = true;
    } else if (cleanedData.companyName === null || cleanedData.companyName === '') {
      // Удаляем companyName, если передано null или пустая строка
      carrier.companyName = undefined;
      updated = true;
    }
    if (cleanedData.dba !== undefined) {
      const newDba = cleanedData.dba && typeof cleanedData.dba === 'string' ? cleanedData.dba.trim() : '';
      carrier.dba = newDba || undefined;
      updated = true;
    }
    if (data.mcNumber?.trim()) {
      const newMc = data.mcNumber.trim();
      if (newMc !== carrier.mcNumber) {
        const existing = await Carrier.findOne({
          mcNumber: newMc,
          _id: { $ne: carrier._id }
        });
        if (existing) {
          throw new Error(`Carrier with MC Number "${newMc}" already exists (Carrier: ${existing.name || 'Unknown'})`);
        }
        carrier.mcNumber = newMc;
        updated = true;
      }
    }
    if (data.dotNumber?.trim()) {
      const newDot = data.dotNumber.trim();
      if (newDot !== carrier.dotNumber) {
        const existing = await Carrier.findOne({
          dotNumber: newDot,
          _id: { $ne: carrier._id }
        });
        if (existing) {
          throw new Error(`Carrier with DOT Number "${newDot}" already exists (Carrier: ${existing.name || 'Unknown'})`);
        }
        carrier.dotNumber = newDot;
        updated = true;
      }
    }
    if (cleanedData.address && Object.keys(cleanedData.address).length > 0) {
      carrier.address = cleanedData.address;
      updated = true;
    }
    // Handle people array - replace existing people with new ones if provided
    if (cleanedData.people !== undefined) {
      if (Array.isArray(cleanedData.people) && cleanedData.people.length > 0) {
        const normalizedPeople = cleanedData.people
          .filter(person => person && person.fullName && person.fullName.trim() !== '')
          .map(person => {
            const normalizedPerson = {
              type: person.type || 'driver',
              fullName: person.fullName.trim()
            };
            // Добавляем email и phoneNumber только если они не undefined/null
            if (person.email && person.email.trim() !== '') {
              normalizedPerson.email = person.email.trim();
            }
            if (person.phoneNumber && person.phoneNumber.trim() !== '') {
              normalizedPerson.phoneNumber = person.phoneNumber.trim();
            }
            return normalizedPerson;
          });
        carrier.people = normalizedPeople;
        updated = true;
      } else if (Array.isArray(cleanedData.people) && cleanedData.people.length === 0) {
        // Allow clearing people by sending empty array
        carrier.people = [];
        updated = true;
      }
    }
    if (cleanedData.photos !== undefined) {
      if (Array.isArray(cleanedData.photos) && cleanedData.photos.length > 0) {
        const uniquePhotos = [...new Set([...carrier.photos, ...cleanedData.photos])]
          .filter(photo => photo !== undefined && photo !== null && photo !== '');
        carrier.photos = uniquePhotos;
        updated = true;
      } else if (Array.isArray(cleanedData.photos) && cleanedData.photos.length === 0) {
        // Allow clearing photos by sending empty array
        carrier.photos = [];
        updated = true;
      }
    }
    const normalizedEquipment = normalizeCarrierEquipment(cleanedData);
    if (cleanedData.equipment !== undefined || cleanedData.equipmentType !== undefined || cleanedData.size !== undefined) {
      carrier.equipment = normalizedEquipment.equipment;
      carrier.equipmentType = normalizedEquipment.equipmentType;
      carrier.size = normalizedEquipment.size;
        updated = true;
    }
    if (Array.isArray(cleanedData.capabilities)) {
      const filtered = cleanedData.capabilities.filter(c => c && c.trim() !== '');
      if (filtered.length > 0) {
        carrier.capabilities = [...new Set([...(carrier.capabilities || []), ...filtered])]
          .filter(c => c !== undefined && c !== null && c !== '');
        updated = true;
      } else if (filtered.length === 0 && cleanedData.capabilities.length === 0) {
        // Allow clearing capabilities by sending empty array
        carrier.capabilities = [];
        updated = true;
      }
    }
    if (Array.isArray(cleanedData.certifications)) {
      const filtered = cleanedData.certifications.filter(c => c && c.trim() !== '');
      if (filtered.length > 0) {
        carrier.certifications = [...new Set([...(carrier.certifications || []), ...filtered])]
          .filter(c => c !== undefined && c !== null && c !== '');
        updated = true;
      } else if (filtered.length === 0 && cleanedData.certifications.length === 0) {
        // Allow clearing certifications by sending empty array
        carrier.certifications = [];
        updated = true;
      }
    }
    if (cleanedData.status && ['active', 'suspended', 'inactive'].includes(cleanedData.status.toLowerCase())) {
      const newStatus = cleanedData.status.toLowerCase();
      if (newStatus !== carrier.status?.toLowerCase()) {
        carrier.status = newStatus;
        updated = true;
      }
    }

    if (updated) {
      try {
        await carrier.save();
      } catch (error) {
        if (error.code === 11000) {
          const field = Object.keys(error.keyPattern)[0];
          throw new Error(`Carrier with ${field} "${data[field]}" already exists`);
        }
        throw error;
      }
    }
  }

}

module.exports = new CarrierService();







