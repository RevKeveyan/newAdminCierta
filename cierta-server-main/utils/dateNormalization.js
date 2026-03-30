const { toUTC5ForStorage } = require('./dateUtils');

/**
 * Безопасный парсер даты: парсит строку в Date объект
 * Правила:
 * - пусто/пробелы → null
 * - если дата не парсится → null
 * - возвращает Date в UTC (MongoDB хранит в UTC)
 * @param {string} dateString - Строка даты для парсинга
 * @returns {Date|null} Date объект или null если не удалось распарсить
 */
function parseDateSafe(dateString) {
  if (!dateString) {
    return null;
  }

  if (typeof dateString !== 'string') {
    if (dateString instanceof Date) {
      return isNaN(dateString.getTime()) ? null : dateString;
    }
    return null;
  }

  const trimmed = dateString.trim();
  if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined' || trimmed === 'Invalid Date') {
    return null;
  }

  const date = new Date(trimmed);
  
  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * Нормализует дату: парсит строку и конвертирует в UTC-5 для хранения
 * @param {string|Date} dateValue - Дата в виде строки или Date
 * @returns {Date|null} Date объект для MongoDB или null
 */
function normalizeDate(dateValue) {
  if (!dateValue) {
    return null;
  }

  if (dateValue instanceof Date) {
    if (isNaN(dateValue.getTime())) {
      return null;
    }
    return toUTC5ForStorage(dateValue);
  }

  if (typeof dateValue === 'string') {
    const parsed = parseDateSafe(dateValue);
    if (!parsed) {
      return null;
    }
    return toUTC5ForStorage(parsed);
  }

  return null;
}

/**
 * Нормализует dates объект Load: парсит строковые даты в Date поля
 * Сохраняет старые String поля для обратной совместимости
 * Правила:
 * - dates.deadline (string) → dates.deadlineAt (Date)
 * - dates.assignedDate (string) → dates.assignedAt (Date)
 * - Если pickupDateType=Exact → pickupAt из pickupDate
 * - Если pickupDateType=Estimate → pickupStartAt/pickupEndAt из pickupDateStart/End
 * - Аналогично для delivery
 * @param {Object} datesData - Объект dates из Load
 * @returns {Object} Нормализованный dates объект с Date полями
 */
function normalizeLoadDates(datesData) {
  if (!datesData || typeof datesData !== 'object') {
    return {};
  }

  const normalized = { ...datesData };

  if (normalized.assignedDate) {
    normalized.assignedAt = normalizeDate(normalized.assignedDate);
  }

  if (normalized.deadline) {
    normalized.deadlineAt = normalizeDate(normalized.deadline);
  }

  const pickupDateType = normalized.pickupDateType || 'Exact';
  
  if (pickupDateType === 'Exact') {
    if (normalized.pickupDate) {
      normalized.pickupAt = normalizeDate(normalized.pickupDate);
    }
  } else if (pickupDateType === 'Estimate') {
    if (normalized.pickupDateStart) {
      normalized.pickupStartAt = normalizeDate(normalized.pickupDateStart);
    }
    if (normalized.pickupDateEnd) {
      normalized.pickupEndAt = normalizeDate(normalized.pickupDateEnd);
    }
  }

  const deliveryDateType = normalized.deliveryDateType || 'Exact';
  
  if (deliveryDateType === 'Exact') {
    if (normalized.deliveryDate) {
      normalized.deliveryAt = normalizeDate(normalized.deliveryDate);
    }
  } else if (deliveryDateType === 'Estimate') {
    if (normalized.deliveryDateStart) {
      normalized.deliveryStartAt = normalizeDate(normalized.deliveryDateStart);
    }
    if (normalized.deliveryDateEnd) {
      normalized.deliveryEndAt = normalizeDate(normalized.deliveryDateEnd);
    }
  }

  return normalized;
}

/**
 * Нормализует сумму: конвертирует строку в Number
 * @param {string|number} amountValue - Сумма в виде строки или числа
 * @returns {number} Number или 0 если не удалось распарсить
 */
function normalizeAmount(amountValue) {
  if (amountValue === null || amountValue === undefined) {
    return 0;
  }

  if (typeof amountValue === 'number') {
    return isNaN(amountValue) ? 0 : amountValue;
  }

  if (typeof amountValue === 'string') {
    const trimmed = amountValue.trim();
    if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') {
      return 0;
    }

    const parsed = parseFloat(trimmed);
    return isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

/**
 * Вычисляет confirmedAmount для PaymentReceivable на основе статуса
 * @param {Object} payment - PaymentReceivable объект
 * @returns {number} confirmedAmount
 */
function calculateReceivableConfirmedAmount(payment) {
  const confirmedStatuses = ['received', 'partially received'];
  
  if (!confirmedStatuses.includes(payment.status)) {
    return 0;
  }

  return normalizeAmount(payment.totalAmount);
}

/**
 * Вычисляет confirmedAmount для PaymentPayable на основе статуса
 * @param {Object} payment - PaymentPayable объект
 * @returns {number} confirmedAmount
 */
function calculatePayableConfirmedAmount(payment) {
  const confirmedStatuses = ['paid', 'partially paid'];
  
  if (!confirmedStatuses.includes(payment.status)) {
    return 0;
  }

  return normalizeAmount(payment.totalAmount);
}

module.exports = {
  parseDateSafe,
  parseDateString: parseDateSafe,
  normalizeDate,
  normalizeLoadDates,
  normalizeAmount,
  calculateReceivableConfirmedAmount,
  calculatePayableConfirmedAmount
};
