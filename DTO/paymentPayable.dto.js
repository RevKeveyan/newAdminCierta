/**
 * DTO для PaymentPayable
 * Форматирует данные для отправки на фронтенд
 */
class PaymentPayableDTO {
  /**
   * Форматирует один документ PaymentPayable
   * @param {Object} doc - документ PaymentPayable
   * @returns {Object} - отформатированный объект
   */
  static format(doc) {
    if (!doc) return null;

    const formatted = {
      id: doc._id?.toString() || doc.id,
      loadId: doc.loadId?._id?.toString() || doc.loadId?.toString() || null,
      carrier: doc.carrier ? this.formatCarrier(doc.carrier) : null,
      bank: doc.bank || null,
      routing: doc.routing || null,
      accountNumber: doc.accountNumber || null,
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
   * Форматирует данные carrier
   */
  static formatCarrier(carrier) {
    if (!carrier) return null;
    
    if (typeof carrier === 'string' || carrier._bsontype === 'ObjectID') {
      return { id: carrier.toString() };
    }

    return {
      id: carrier._id?.toString() || carrier.id,
      name: carrier.name || null,
      companyName: carrier.companyName || null,
      email: carrier.email || null,
      phoneNumber: carrier.phoneNumber || null,
      mcNumber: carrier.mcNumber || null,
      dotNumber: carrier.dotNumber || null
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

module.exports = PaymentPayableDTO;
