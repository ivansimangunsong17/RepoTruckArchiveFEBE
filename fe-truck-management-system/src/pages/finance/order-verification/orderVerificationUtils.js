const ORDER_TABLE_PAGE_SIZE = 20;

function formatDisplayDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function isCancelledFinanceOrder(row = {}) {
  const verificationStatus = String(row.verificationStatus || '').toLowerCase();
  const operationalStatus = String(row.operationalStatus || '').toLowerCase();
  const displayStatus = String(row.status || '').toLowerCase();
  return verificationStatus === 'cancelled' || operationalStatus === 'cancelled' || displayStatus === 'cancelled' || displayStatus.includes('batal');
}

function isVerifiedFinanceOrder(row = {}) {
  return row.verificationStatus === 'verified' || Boolean(row.accurateSoNumber || row.soNumber);
}

function isGeneratedInternalSoNumber(value) {
  return /^SO-ARM-\d{6}-\d{4}$/i.test(String(value || '').trim());
}

function getDisplayOrderNumber(row = {}) {
  const rawNumber = String(row.internalSoNumber || row.systemSoNumber || '').trim();
  if (rawNumber && !isGeneratedInternalSoNumber(rawNumber)) return rawNumber;
  const id = String(row.id || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  return id ? `ORD-${id.slice(0, 8)}` : '';
}

function orderVerificationStatusParam(tabId) {
  if (tabId === 'running') return 'verified';
  if (tabId === 'cancelled') return 'cancelled';
  return 'pending_so';
}

function toNullableCount(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatContainerSizes(qty20, qty40) {
  const parts = [];
  if (qty20) parts.push(`${qty20} x 20FT`);
  if (qty40) parts.push(`${qty40} x 40FT`);
  return parts.join(', ');
}

// Qty order (line item Jasa Angkut D20/D40 dari Sales) vs container job aktif (bukan cancelled)
// dibandingkan per ukuran. Hanya ditandai selisih kalau kedua sisi datanya tersedia; SO lama tanpa
// line item D20/D40 atau data tanpa hitungan job tidak dibandingkan agar tidak muncul selisih palsu.
function buildContainerQuantityComparison(order = {}) {
  const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
  const sizedItems = lineItems.filter((item) => item.serviceName === 'Jasa Angkut D20' || item.serviceName === 'Jasa Angkut D40');
  const ordered20 = sizedItems.filter((item) => item.serviceName === 'Jasa Angkut D20').reduce((total, item) => total + Number(item.qty || 0), 0);
  const ordered40 = sizedItems.filter((item) => item.serviceName === 'Jasa Angkut D40').reduce((total, item) => total + Number(item.qty || 0), 0);
  const active20 = toNullableCount(order.activeContainer20Qty);
  const active40 = toNullableCount(order.activeContainer40Qty);
  const hasOrder = sizedItems.length > 0;
  const hasActive = active20 !== null && active40 !== null;

  return {
    orderLabel: hasOrder ? formatContainerSizes(ordered20, ordered40) || '0' : '',
    activeLabel: hasActive ? formatContainerSizes(active20, active40) || 'Tidak ada container aktif' : '',
    isMismatch: hasOrder && hasActive && !isCancelledFinanceOrder(order) && (ordered20 !== active20 || ordered40 !== active40),
  };
}

// Party order untuk tabel & input SO: qty dari line item Sales, fallback ke ringkasan container backend.
function getOrderPartyLabel(order = {}) {
  const { orderLabel } = buildContainerQuantityComparison(order);
  if (orderLabel && orderLabel !== '0') return orderLabel;
  return order.container && order.container !== '-' ? order.container : '-';
}

function normalizeFinanceOrderRow(row = {}) {
  const isCancelled = isCancelledFinanceOrder(row);
  const accurateSoNumber = row.accurateSoNumber || row.soNumber || '';
  const orderNumber = getDisplayOrderNumber(row);
  const lineItems = Array.isArray(row.lineItems)
    ? row.lineItems.map((item) => ({
      serviceName: item.serviceName || item.service_name || item.name || '-',
      containerType: item.containerType || item.container_type || '',
      qty: Number(item.qty || item.quantity || 0),
      price: Number(item.price || 0),
      total: Number(item.total || Number(item.qty || item.quantity || 0) * Number(item.price || 0)),
    }))
    : [];
  return {
    id: row.id,
    orderDate: formatDisplayDate(row.orderDate),
    salesName: row.salesName || 'Tanpa Sales',
    customer: row.customer || '-',
    customerPic: row.customerPic || '-',
    customerPhone: row.customerPhone || '-',
    customerAddress: row.customerAddress || '-',
    destination: row.destination || '-',
    orderType: row.orderType || row.shipment || '-',
    paymentTerms: row.paymentTerms || '-',
    price: Number(row.price || 0),
    totalAmount: Number(row.totalAmount || row.total_amount || 0),
    lineItems,
    runningDate: formatDisplayDate(row.runningDate),
    container: row.container || '-',
    activeContainer20Qty: toNullableCount(row.activeContainer20Qty),
    activeContainer40Qty: toNullableCount(row.activeContainer40Qty),
    vesselName: row.vesselName || '-',
    terminal: row.terminal || '-',
    depo: row.depo || row.origin || '-',
    document: row.document || '-',
    notes: row.notes || '-',
    status: isCancelled ? 'SO Batal' : row.status || (accurateSoNumber ? 'No. SO Terisi' : 'Menunggu No. SO Finance'),
    soNumber: accurateSoNumber,
    internalSoNumber: orderNumber,
    accurateSoNumber,
    soNumberDraft: accurateSoNumber,
    verificationStatus: isCancelled ? 'cancelled' : row.verificationStatus || (accurateSoNumber ? 'verified' : 'pending_so'),
    operationalStatus: row.operationalStatus || '',
    cancelReason: row.cancelReason || row.cancelReviewNote || row.cancelRequestNote || '',
    cancelledAt: formatDisplayDate(row.cancelledAt),
    cancelledByName: row.cancelledByName || row.cancelReviewedByName || row.cancelRequestedByName || '',
  };
}

export {
  ORDER_TABLE_PAGE_SIZE,
  buildContainerQuantityComparison,
  getOrderPartyLabel,
  isCancelledFinanceOrder,
  isVerifiedFinanceOrder,
  normalizeFinanceOrderRow,
  orderVerificationStatusParam,
};
