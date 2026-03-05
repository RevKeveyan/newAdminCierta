const Customer = require('../models/Customer');
const mongoose = require('mongoose');

class CustomerService {
  async findOrCreate(customerData) {
    if (!customerData) return null;

    console.log('[CustomerService] findOrCreate - customerData.representativePeoples:', typeof customerData.representativePeoples, customerData.representativePeoples);

    if (customerData.id && mongoose.Types.ObjectId.isValid(customerData.id)) {
      const existing = await Customer.findById(customerData.id);
      if (existing) {
        this.updateCustomer(existing, customerData);
        return existing._id;
      }
    }

    if (!customerData.companyName || customerData.companyName.trim() === '') {
      return null;
    }

    const companyName = customerData.companyName.trim();
    // При поиске учитываем type, если он указан
    const searchQuery = {
      companyName: { $regex: new RegExp(`^${companyName}$`, 'i') }
    };
    if (customerData.type) {
      searchQuery.type = customerData.type;
    }
    let customer = await Customer.findOne(searchQuery);

    if (!customer) {
      // Normalize representativePeoples
      let representativePeoples = [];
      if (customerData.representativePeoples) {
        if (Array.isArray(customerData.representativePeoples)) {
          representativePeoples = customerData.representativePeoples
            .filter(person => person && person.fullName && person.fullName.trim() !== '')
            .map(person => ({
              fullName: person.fullName.trim(),
              email: person.email ? person.email.trim().toLowerCase() : '',
              phoneNumber: person.phoneNumber ? person.phoneNumber.trim() : ''
            }));
        }
      }

      const customerType = customerData.type || 'customer';
      
      let email = null;
      if (customerData.email && typeof customerData.email === 'string') {
        const trimmedEmail = customerData.email.trim().toLowerCase();
        if (trimmedEmail && trimmedEmail !== 'undefined' && trimmedEmail !== 'null') {
          email = trimmedEmail;
        }
      }

      const customerDataToSave = {
        companyName,
        type: customerType,
        customerAddress: customerData.customerAddress || {},
        phoneNumber: customerData.phoneNumber,
        paymentMethod: customerData.paymentMethod || 'Net 30',
        paymentTerms: customerData.paymentTerms || '',
        creditLimit: customerData.creditLimit ? parseFloat(customerData.creditLimit) : 0,
        representativePeoples: representativePeoples
      };
      
      if (email) {
        customerDataToSave.email = email;
      }
      
      customer = new Customer(customerDataToSave);
      
      if (customer.emails !== undefined) {
        customer.set('emails', undefined);
        delete customer.emails;
      }
      
      await customer.save();
    } else {
      this.updateCustomer(customer, customerData);
    }

    return customer._id;
  }

  updateCustomer(customer, data) {
    let updated = false;

    console.log('[CustomerService] updateCustomer - data.representativePeoples:', typeof data.representativePeoples, data.representativePeoples);

    if (data.companyName && data.companyName !== customer.companyName) {
      customer.companyName = data.companyName;
      updated = true;
    }
    if (data.customerAddress && Object.keys(data.customerAddress).length > 0) {
      customer.customerAddress = data.customerAddress;
      updated = true;
    } else if (data.customerAddress === null || data.customerAddress === undefined) {
      // Не обновляем, если явно не передано
    }
    if (data.email !== undefined) {
      // Нормализуем email
      if (data.email && typeof data.email === 'string' && data.email.trim() !== '') {
        customer.email = data.email.trim().toLowerCase();
      } else if (data.email === null || data.email === '') {
        // Для платформ или если явно передано null/пустая строка, очищаем email
        customer.email = undefined;
      }
      updated = true;
    }
    if (data.phoneNumber !== undefined && data.phoneNumber !== null && data.phoneNumber !== '') {
      customer.phoneNumber = data.phoneNumber;
      updated = true;
    } else if (data.phoneNumber === null || data.phoneNumber === '') {
      // Удаляем phoneNumber, если передано null или пустая строка
      customer.phoneNumber = undefined;
      updated = true;
    }
    if (data.status && ['active', 'suspended', 'inactive'].includes(data.status.toLowerCase())) {
      const newStatus = data.status.toLowerCase();
      if (newStatus !== customer.status?.toLowerCase()) {
        customer.status = newStatus;
        updated = true;
      }
    }
    // Handle payment fields
    if (data.paymentMethod !== undefined && data.paymentMethod !== customer.paymentMethod) {
      const validMethods = ['ACH', 'ZELLE', 'Net 30'];
      if (validMethods.includes(data.paymentMethod)) {
        customer.paymentMethod = data.paymentMethod;
        updated = true;
      }
    }
    if (data.paymentTerms !== undefined && data.paymentTerms !== customer.paymentTerms) {
      customer.paymentTerms = data.paymentTerms || '';
      updated = true;
    }
    if (data.creditLimit !== undefined && data.creditLimit !== customer.creditLimit) {
      const creditLimit = parseFloat(data.creditLimit);
      if (!isNaN(creditLimit)) {
        customer.creditLimit = creditLimit;
        updated = true;
      }
    }
    // Handle representativePeoples
    if (data.representativePeoples !== undefined) {
      let normalizedPeoples = [];
      if (Array.isArray(data.representativePeoples)) {
        normalizedPeoples = data.representativePeoples
          .filter(person => person && person.fullName && person.fullName.trim() !== '')
          .map(person => ({
            fullName: person.fullName.trim(),
            email: person.email ? person.email.trim().toLowerCase() : '',
            phoneNumber: person.phoneNumber ? person.phoneNumber.trim() : ''
          }));
      }
      // Always update representativePeoples if provided (even if empty array)
      customer.representativePeoples = normalizedPeoples;
      updated = true;
    }

    if (updated) {
      return customer.save();
    }
    return Promise.resolve();
  }

  async syncEmail(customerId, email) {
    if (!email || !customerId) return;

    try {
      const customer = await Customer.findById(customerId);
      if (!customer) return;

      // Нормализуем email
      const normalizedEmail = email.trim().toLowerCase();
      if (normalizedEmail === '') return;

      // Для платформ не добавляем email
      if (customer.type === 'platform') {
        return;
      }

      // Обновляем email только если он изменился
      if (customer.email !== normalizedEmail) {
        customer.email = normalizedEmail;
        await customer.save();
      }
    } catch (error) {
      console.error('[CustomerService] Failed to sync email:', error);
    }
  }
}

module.exports = new CustomerService();







