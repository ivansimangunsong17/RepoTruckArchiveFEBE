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
  return !isCancelledFinanceOrder(row) && (row.verificationStatus === 'verified' || Boolean(row.accurateSoNumber || row.soNumber));
}

function orderVerificationStatusParam(tabId) {
  if (tabId === 'running') return 'verified';
  if (tabId === 'cancelled') return 'cancelled';
  return 'pending_so';
}

function normalizeFinanceOrderRow(row = {}) {
  const isCancelled = isCancelledFinanceOrder(row);
  const soNumber = row.soNumber || '';
  const accurateSoNumber = row.accurateSoNumber || soNumber;
  const internalSoNumber = row.internalSoNumber || row.systemSoNumber || '';
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
    vesselName: row.vesselName || '-',
    terminal: row.terminal || '-',
    depo: row.depo || row.origin || '-',
    document: row.document || '-',
    notes: row.notes || '-',
    status: isCancelled ? 'SO Batal' : row.status || (accurateSoNumber ? 'No. SO Terisi' : 'Menunggu No. SO Accurate'),
    soNumber,
    internalSoNumber,
    accurateSoNumber,
    soNumberDraft: soNumber,
    verificationStatus: isCancelled ? 'cancelled' : row.verificationStatus || (accurateSoNumber ? 'verified' : 'pending_so'),
    operationalStatus: row.operationalStatus || '',
    cancelReason: row.cancelReason || row.cancelReviewNote || row.cancelRequestNote || '',
    cancelledAt: formatDisplayDate(row.cancelledAt),
    cancelledByName: row.cancelledByName || row.cancelReviewedByName || row.cancelRequestedByName || '',
  };
}

export {
  ORDER_TABLE_PAGE_SIZE,
  isCancelledFinanceOrder,
  isVerifiedFinanceOrder,
  normalizeFinanceOrderRow,
  orderVerificationStatusParam,
};
