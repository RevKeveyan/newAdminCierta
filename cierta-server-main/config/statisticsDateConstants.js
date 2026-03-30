/**
 * Statistics Date Constants
 * 
 * Определяет "истинные даты" для статистики и отчётов.
 * Эти константы используются во всех запросах статистики для обеспечения консистентности.
 * 
 * IMPORTANT: После миграции дат с String на Date, эти константы будут использоваться
 * для определения, какие поля использовать в запросах.
 */

const STATISTICS_DATE_SOURCES = {
  /**
   * Loads Statistics
   * Period filter = activity in period: delivered by deliveryAt, pickedUp by pickupAt, listed by createdAt
   */
  LOADS: {
    PRIMARY_DATE: 'createdAt',
    DELIVERED_DATE: 'dates.deliveryAt',
    PICKED_UP_DATE: 'dates.pickupAt',
    DESCRIPTION: 'Load: delivered=deliveryAt, pickedUp=pickupAt, listed=createdAt (activity in period)'
  },

  /**
   * Expired Loads
   * Грузы с истёкшим дедлайном и не финальным статусом
   * 
   * NOTE: После миграции dates.deadline (String) -> dates.deadlineAt (Date)
   */
  EXPIRED: {
    DEADLINE_FIELD: 'dates.deadline',
    STATUS_FIELD: 'status',
    FINAL_STATUSES: ['Delivered', 'Cancelled'],
    DESCRIPTION: 'Load.dates.deadline (после миграции: dates.deadlineAt как Date) + статус не финальный (не Delivered/Cancelled)'
  },

  /**
   * Payments Statistics
   * Period filter = when payment was updated (updatedAt) — when changes were made; status/breakdown shows what changed
   */
  PAYMENTS: {
    RECEIVABLE_DATE: 'updatedAt',
    PAYABLE_DATE: 'updatedAt',
    FALLBACK_INVOICE_DATE: 'invoiceAt',
    FALLBACK_DATE: 'createdAt',
    DESCRIPTION: 'Filter by updatedAt: show payments updated in period; status breakdown shows what changed'
  },

  /**
   * Profit Statistics
   * Подтверждённые суммы для расчёта прибыли
   */
  PROFIT: {
    /**
     * Receivable Confirmed Amount
     * Подтверждённая сумма для receivable при статусах Received / Partially Received
     */
    RECEIVABLE: {
      CONFIRMED_STATUSES: ['received', 'partially received'],
      AMOUNT_FIELD: 'confirmedAmount',
      STATUS_FIELD: 'status',
      DESCRIPTION: 'receivable confirmed = confirmedAmount при статусе Received / Partially Received'
    },

    /**
     * Payable Confirmed Amount
     * Подтверждённая сумма для payable при статусах Paid / Partially Paid
     */
    PAYABLE: {
      CONFIRMED_STATUSES: ['paid', 'partially paid'],
      AMOUNT_FIELD: 'confirmedAmount',
      STATUS_FIELD: 'status',
      DESCRIPTION: 'payable confirmed = confirmedAmount при статусе Paid / Partially Paid'
    }
  }
};

/**
 * Helper functions для получения правильных дат/сумм
 */
const StatisticsDateHelpers = {
  /**
   * Получить дату для статистики Load
   */
  getLoadDate(load) {
    return load.createdAt;
  },

  /**
   * Проверить, является ли Load истёкшим
   * 
   * NOTE: После миграции будет использовать dates.deadlineAt (Date)
   * Сейчас работает с dates.deadline (String)
   */
  isLoadExpired(load) {
    const deadlineValue = load.dates?.deadlineAt || load.dates?.deadline;
    if (!deadlineValue) return false;
    if (STATISTICS_DATE_SOURCES.EXPIRED.FINAL_STATUSES.includes(load.status)) return false;
    
    const deadline = deadlineValue instanceof Date ? deadlineValue : new Date(deadlineValue);
    if (isNaN(deadline.getTime())) return false;
    
    const now = new Date();
    return deadline < now;
  },

  /**
   * Получить дату для статистики Payment
   */
  getPaymentDate(payment) {
    return payment.invoiceAt || payment.createdAt;
  },

  /**
   * Получить подтверждённую сумму для Receivable
   */
  getReceivableConfirmedAmount(receivable) {
    if (!STATISTICS_DATE_SOURCES.PROFIT.RECEIVABLE.CONFIRMED_STATUSES.includes(receivable.status)) {
      return 0;
    }
    return receivable.confirmedAmount || receivable.totalAmount || 0;
  },

  /**
   * Получить подтверждённую сумму для Payable
   */
  getPayableConfirmedAmount(payable) {
    if (!STATISTICS_DATE_SOURCES.PROFIT.PAYABLE.CONFIRMED_STATUSES.includes(payable.status)) {
      return 0;
    }
    return payable.confirmedAmount || payable.totalAmount || 0;
  }
};

module.exports = {
  STATISTICS_DATE_SOURCES,
  StatisticsDateHelpers
};
