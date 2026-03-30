/**
 * DTO для PaymentPayable
 */
class PaymentPayableDTO {
  /**
   * Форматирует один документ
   */
  static format(doc) {
    if (!doc) return null;

    const formatted = {
      id: doc._id?.toString() || doc.id,
      loadId: doc.loadId ? (typeof doc.loadId === 'object' ? doc.loadId._id?.toString() || doc.loadId.id : doc.loadId.toString()) : null,
      load: doc.loadId && typeof doc.loadId === 'object' ? this.formatLoad(doc.loadId) : null,
      orderId: doc.orderId || null,
      carrier: doc.carrier ? this.formatCarrier(doc.carrier) : null,
      status: doc.status || 'pending',
      paymentMethod: doc.paymentMethod || null,
      bank: doc.bank || null,
      routing: doc.routing || null,
      accountNumber: doc.accountNumber || null,
      notes: doc.notes || null,
      // Amount fields
      carrierRate: doc.carrierRate || null,
      totalAmount: doc.totalAmount || null,
      fees: Array.isArray(doc.fees) ? doc.fees : [],
      tonu: doc.tonu || { enabled: false, carrierRate: 0 },
      // Deadline and notification fields
      deadlineDays: doc.deadlineDays || null,
      invoiceAt: doc.invoiceAt || null,
      dueAt: doc.dueAt || null,
      statusSince: doc.statusSince || null,
      holdStartedAt: doc.holdStartedAt || null,
      paidAt: doc.paidAt || null,
      nextNotifyAt: doc.nextNotifyAt || null,
      notified: doc.notified || {
        dueSoonAt: null,
        dueTodayAt: null,
        payTodayAt: null,
        overdueAt: null
      },
      // Legacy fields for backward compatibility
      statusChangedAt: doc.statusChangedAt || doc.statusSince || null,
      payedDate: doc.payedDate || doc.paidAt || null,
      daysOnHold: this.calculateDaysOnHold(doc),
      images: doc.images || [],
      pdfs: doc.pdfs || [],
      createdAt: doc.createdAt || null,
      updatedAt: doc.updatedAt || null
    };

    // Load data is accessed through Load's paymentPayable field, not through payment's loadId

    return formatted;
  }

  /**
   * Рассчитывает количество дней на холде
   */
  static calculateDaysOnHold(doc) {
    // Use holdStartedAt if available, otherwise fallback to statusChangedAt
    const startDate = doc.holdStartedAt || doc.statusChangedAt || doc.statusSince;
    if (!startDate) return null;
    
    const endDate = doc.paidAt || doc.payedDate || new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  }

  /**
   * Форматирует данные carrier
   */
  static formatCarrier(carrier) {
    if (!carrier) return null;
    
    if (typeof carrier === 'string' || carrier._bsontype === 'ObjectID') {
      return { id: carrier.toString() };
    }

    return {
      id: carrier._id?.toString() || carrier.id,
      companyName: carrier.companyName || carrier.name || null,
      email: carrier.email || null,
      phoneNumber: carrier.phoneNumber || null,
      mcNumber: carrier.mcNumber || null
    };
  }

  /**
   * Форматирует данные load
   */
  static formatLoad(load) {
    if (!load) return null;
    const customer = load.customer;
    const carrier = load.carrier;

    const formatRef = (entity) => {
      if (!entity) return null;
      if (typeof entity === 'string' || entity._bsontype === 'ObjectID') {
        return { id: entity.toString() };
      }
      return {
        id: entity._id?.toString() || entity.id,
        _id: entity._id?.toString() || entity.id,
        companyName: entity.companyName || entity.name || null,
        email: entity.email || null
      };
    };

    return {
      id: load._id?.toString() || load.id,
      _id: load._id?.toString() || load.id,
      orderId: load.orderId || null,
      status: load.status || null,
      carrierRate: load.carrierRate || null,
      customerRate: load.customerRate || null,
      paymentMethod: load.paymentMethod || null,
      paymentTerms: load.paymentTerms || null,
      customer: formatRef(customer),
      carrier: formatRef(carrier)
    };
  }

  /**
   * Форматирует массив документов
   */
  static formatMany(docs) {
    if (!Array.isArray(docs)) return [];
    return docs.map(doc => this.format(doc));
  }
}

module.exports = PaymentPayableDTO;
