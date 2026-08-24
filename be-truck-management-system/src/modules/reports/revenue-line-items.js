export const FINANCIAL_LINE_ITEM_CATEGORY = Object.freeze({
  TRANSPORT: 'transport',
  REIMBURSEMENT: 'reimbursement',
  UNKNOWN: 'unknown',
});

export const REVENUE_SERVICE_NAMES = Object.freeze({
  TRANSPORT_20FT: 'Jasa Angkut D20',
  TRANSPORT_40FT: 'Jasa Angkut D40',
  TRANSPORT_LEGACY: 'Jasa Angkut',
  LOADING_UNLOADING: 'Bon Muat/Bongkar',
  TILA_GATEPASS: 'Tila/Gatepass',
  HANDLING: 'Handling',
  HANDLING_LEGACY: 'Jasa Handling',
  HANDLING_LEGACY_2: 'Stevedoring and Port Service',
  OTHER: 'Jasa Lainnya',
});

const SERVICE_DEFINITIONS = Object.freeze([
  {
    serviceName: REVENUE_SERVICE_NAMES.TRANSPORT_20FT,
    category: FINANCIAL_LINE_ITEM_CATEGORY.TRANSPORT,
    containerSize: '20FT',
  },
  {
    serviceName: REVENUE_SERVICE_NAMES.TRANSPORT_40FT,
    category: FINANCIAL_LINE_ITEM_CATEGORY.TRANSPORT,
    containerSize: '40FT',
  },
  {
    serviceName: REVENUE_SERVICE_NAMES.TRANSPORT_LEGACY,
    category: FINANCIAL_LINE_ITEM_CATEGORY.TRANSPORT,
    containerSize: '',
  },
  {
    serviceName: REVENUE_SERVICE_NAMES.LOADING_UNLOADING,
    category: FINANCIAL_LINE_ITEM_CATEGORY.REIMBURSEMENT,
    containerSize: '',
  },
  {
    serviceName: REVENUE_SERVICE_NAMES.TILA_GATEPASS,
    category: FINANCIAL_LINE_ITEM_CATEGORY.REIMBURSEMENT,
    containerSize: '',
  },
  {
    serviceName: REVENUE_SERVICE_NAMES.HANDLING,
    category: FINANCIAL_LINE_ITEM_CATEGORY.REIMBURSEMENT,
    containerSize: '',
  },
  {
    serviceName: REVENUE_SERVICE_NAMES.HANDLING_LEGACY,
    category: FINANCIAL_LINE_ITEM_CATEGORY.REIMBURSEMENT,
    containerSize: '',
  },
  {
    serviceName: REVENUE_SERVICE_NAMES.HANDLING_LEGACY_2,
    category: FINANCIAL_LINE_ITEM_CATEGORY.REIMBURSEMENT,
    containerSize: '',
  },
  {
    serviceName: REVENUE_SERVICE_NAMES.OTHER,
    category: FINANCIAL_LINE_ITEM_CATEGORY.REIMBURSEMENT,
    containerSize: '',
  },
]);

const SERVICE_DEFINITION_BY_KEY = new Map(
  SERVICE_DEFINITIONS.map((definition) => [
    normalizeServiceName(definition.serviceName),
    definition,
  ]),
);

function readNumber(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeServiceName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeContainerSize(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (['D20', '20', '20FT'].includes(normalized)) return '20FT';
  if (['D40', '40', '40FT'].includes(normalized)) return '40FT';
  return '';
}

export function parseRevenueLineItems(value) {
  if (Array.isArray(value)) return value.map(normalizeRevenueLineItem);
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(normalizeRevenueLineItem) : [];
  } catch {
    return [];
  }
}

export function normalizeRevenueLineItem(item = {}) {
  const serviceName = String(item.serviceName || item.service_name || '').trim();
  const qty = Math.max(0, readNumber(item.qty ?? item.quantity, 0));
  const price = Math.max(0, readNumber(item.price ?? item.unit_price, 0));
  const total = Math.max(0, readNumber(item.total ?? item.total_amount, qty * price));

  return {
    id: item.id || '',
    serviceName,
    serviceKey: normalizeServiceName(serviceName),
    containerType: item.containerType || item.container_type || item.cargoType || item.cargo_type || '',
    containerSize: normalizeContainerSize(item.containerSize || item.container_size || ''),
    qty,
    price,
    total,
    notes: item.notes || '',
  };
}

export function classifyRevenueLineItem(item = {}) {
  const normalizedItem = normalizeRevenueLineItem(item);
  const definition = SERVICE_DEFINITION_BY_KEY.get(normalizedItem.serviceKey);
  const category = definition?.category || FINANCIAL_LINE_ITEM_CATEGORY.UNKNOWN;
  const containerSize = normalizedItem.containerSize || definition?.containerSize || '';

  return {
    ...normalizedItem,
    financialCategory: category,
    containerSize,
    isTransportRevenue: category === FINANCIAL_LINE_ITEM_CATEGORY.TRANSPORT,
    isReimbursement: category === FINANCIAL_LINE_ITEM_CATEGORY.REIMBURSEMENT,
  };
}

export function splitFinancialLineItems(value) {
  const items = parseRevenueLineItems(value).map(classifyRevenueLineItem);
  return {
    items,
    transportItems: items.filter((item) => item.financialCategory === FINANCIAL_LINE_ITEM_CATEGORY.TRANSPORT),
    reimbursementItems: items.filter((item) => item.financialCategory === FINANCIAL_LINE_ITEM_CATEGORY.REIMBURSEMENT),
    unknownItems: items.filter((item) => item.financialCategory === FINANCIAL_LINE_ITEM_CATEGORY.UNKNOWN),
  };
}

export function getTransportLineItemForSize(value, containerSize) {
  const size = normalizeContainerSize(containerSize);
  const { transportItems } = splitFinancialLineItems(value);
  return transportItems.find((item) => !size || !item.containerSize || item.containerSize === size) || null;
}

export function sumLineItems(items = []) {
  return items.reduce((total, item) => total + normalizeRevenueLineItem(item).total, 0);
}
