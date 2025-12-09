/**
 * DTO для PaymentReceivable
 * Форматирует данные для отправки на фронтенд
 */
class PaymentReceivableDTO {
  /**
   * Форматирует один документ PaymentReceivable
   * @param {Object} doc - документ PaymentReceivable
   * @returns {Object} - отформатированный объект
   */
  static format(doc) {
    if (!doc) return null;

    const formatted = {
      id: doc._id?.toString() || doc.id,
      loadId: doc.loadId?._id?.toString() || doc.loadId?.toString() || null,
      customer: doc.customer ? this.formatCustomer(doc.customer) : null,
      invoicedDate: doc.invoicedDate || null,
      daysToPay: doc.daysToPay || 30,
      invoiceStatus: doc.invoiceStatus || 'pending',
      createdAt: doc.createdAt || null,
      updatedAt: doc.updatedAt || null
    };

    // Добавляем данные load если есть populate
    if (doc.loadId && typeof doc.loadId === 'object') {
      formatted.load = this.formatLoad(doc.loadId);
    }

    return formatted;
  }

  /**
   * Форматирует данные customer
   */
  static formatCustomer(customer) {
    if (!customer) return null;
    
    if (typeof customer === 'string' || customer._bsontype === 'ObjectID') {
      return { id: customer.toString() };
    }

    return {
      id: customer._id?.toString() || customer.id,
      companyName: customer.companyName || null,
      emails: customer.emails || [],
      phoneNumber: customer.phoneNumber || null,
      paymentMethod: customer.paymentMethod || null
    };
  }

  /**
   * Форматирует данные load (минимальная информация)
   */
  static formatLoad(load) {
    if (!load) return null;
    
    return {
      id: load._id?.toString() || load.id,
      orderId: load.orderId || null,
      status: load.status || null
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

module.exports = PaymentReceivableDTO;
