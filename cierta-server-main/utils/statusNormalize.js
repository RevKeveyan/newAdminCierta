const LOAD_STATUS_TO_NORMALIZED = {
  Listed: 'listed',
  Dispatched: 'dispatched',
  'Picked Up': 'pickedUp',
  Delivered: 'delivered',
  'On Hold': 'onHold',
  Cancelled: 'cancelled'
};

const NORMALIZED_STATUSES = new Set(Object.values(LOAD_STATUS_TO_NORMALIZED));

function normalizeLoadStatus(displayStatus) {
  if (displayStatus == null || displayStatus === '') return null;
  const s = String(displayStatus).trim();
  if (LOAD_STATUS_TO_NORMALIZED[s] !== undefined) return LOAD_STATUS_TO_NORMALIZED[s];
  const lower = s.toLowerCase().replace(/\s+/g, '');
  if (lower === 'pickedup') return 'pickedUp';
  if (lower === 'onhold') return 'onHold';
  if (lower === 'cancelled' || lower === 'canceled') return 'cancelled';
  if (NORMALIZED_STATUSES.has(lower)) return lower;
  return null;
}

function getAllNormalizedStatuses() {
  return Array.from(NORMALIZED_STATUSES);
}

function isEmptyBreakdownsLoadsByStatus(breakdowns) {
  const b = breakdowns && breakdowns.loadsByStatus;
  if (!b || typeof b !== 'object') return true;
  return Object.values(b).every((v) => v === 0 || v == null);
}

module.exports = {
  normalizeLoadStatus,
  getAllNormalizedStatuses,
  LOAD_STATUS_TO_NORMALIZED,
  NORMALIZED_STATUSES,
  isEmptyBreakdownsLoadsByStatus
};
