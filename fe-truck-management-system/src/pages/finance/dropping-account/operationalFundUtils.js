const defaultOperationalFundBatch = {
  id: '',
  batchDate: '',
  status: 'open',
  totalCredit: 0,
  totalDebit: 0,
  totalAdjustment: 0,
  balance: 0,
  transactionCount: 0,
  creditCount: 0,
  debitCount: 0,
  uncheckedCount: 0,
  needClarificationCount: 0,
  checkedCount: 0,
  closedByName: '',
  closedAt: null,
  closeNote: '',
};

const defaultOperationalFundSummary = {
  submitted: 0,
  approved: 0,
  transferred: 0,
  rejected: 0,
  approvedAmount: 0,
  transferredAmount: 0,
};

const defaultExpenseReconciliationSummary = {
  belumDicek: 0,
  sudahDicek: 0,
  perluKlarifikasi: 0,
  dikoreksi: 0,
  totalAmount: 0,
  pendingAmount: 0,
};

const defaultOperationalFundTransactionSummary = {
  totalCredit: 0,
  openingBalance: 0,
  topUpAmount: 0,
  totalDebit: 0,
  totalAdjustment: 0,
  balance: 0,
  creditCount: 0,
  debitCount: 0,
  voidCount: 0,
};

const expenseCategoryLabels = {
  uj_awal: 'UJ Awal',
  top_up_uj: 'Top Up UJ',
  tol: 'Tol',
  parkir: 'Parkir',
  bongkar: 'Bongkar',
  muat: 'Muat',
  lolo: 'LoLo',
  inap: 'Inap',
  terminal_depo: 'Terminal / Depo',
  tunggu: 'Tunggu',
  uang_admin_tf: 'Uang Admin TF',
  reimbursement: 'Reimbursement',
  lainnya: 'Lainnya',
};

const expensePaymentStatusLabels = {
  belum_dibayar: 'Belum Dibayar',
  pending_pembayaran: 'Pending Pembayaran',
  sudah_dibayar: 'Sudah Dibayar',
  batal: 'Batal',
  ditahan_sopir: 'Ditahan Sopir',
  dipakai_job_berikutnya: 'Dipakai Job Berikutnya',
};

const expenseFinanceStatusLabels = {
  belum_dicek: 'Menunggu Validasi Finance',
  sudah_dicek: 'Sudah Divalidasi',
  perlu_klarifikasi: 'Perlu Klarifikasi',
  dikoreksi: 'Dikoreksi',
};

const operationalFundTransactionTypeLabels = {
  credit: 'Dana Masuk',
  debit: 'Dana Keluar',
  adjustment: 'Adjustment',
};

const operationalFundTransactionCategoryLabels = {
  saldo_awal: 'Saldo Awal',
  deposit_saldo: 'Deposit Saldo',
  uj_order: 'UJ Order',
  biaya_lainnya: 'Biaya Lainnya',
  top_up_uj: 'Top Up UJ',
  kasbon: 'Kasbon',
  potongan: 'Potongan',
  koreksi: 'Koreksi',
  void: 'Void',
  dropping_in: 'Dropping Masuk',
  container_job_expense: 'Biaya Container Job',
  driver_uj_balance: 'Saldo UJ Sopir',
  admin_transfer: 'Admin Transfer',
  correction: 'Koreksi',
  lainnya: 'Lainnya',
};

function operationalFundTransactionCategoryLabel(row = {}) {
  if (row.source === 'container_job_expense_admin_fee') return 'Admin Transfer';
  return operationalFundTransactionCategoryLabels[row.category] || row.category || '';
}

function readableLabel(labels, value) {
  return labels[value] || String(value || '-').replaceAll('_', ' ');
}

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

function nextDateValue(value) {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function operationalFundBatchStatusLabel(status) {
  const labels = {
    open: 'Open',
    under_review: 'Review',
    closed: 'Closed',
  };
  return labels[status] || status || 'Open';
}

function normalizeOperationalFundBatchRow(row = {}) {
  return {
    id: row.id || '',
    batchDate: row.batchDate || row.batch_date || '',
    status: row.status || 'open',
    totalCredit: Number(row.totalCredit || row.total_credit || 0),
    openingBalance: Number(row.openingBalance || row.opening_balance || 0),
    topUpAmount: Number(row.topUpAmount || row.top_up_amount || 0),
    totalDebit: Number(row.totalDebit || row.total_debit || 0),
    totalAdjustment: Number(row.totalAdjustment || row.total_adjustment || 0),
    balance: Number(row.balance || 0),
    transactionCount: Number(row.transactionCount || row.transaction_count || 0),
    creditCount: Number(row.creditCount || row.credit_count || 0),
    debitCount: Number(row.debitCount || row.debit_count || 0),
    uncheckedCount: Number(row.uncheckedCount || row.unchecked_count || 0),
    needClarificationCount: Number(row.needClarificationCount || row.need_clarification_count || 0),
    checkedCount: Number(row.checkedCount || row.checked_count || 0),
    closedByName: row.closedByName || row.closed_by_name || '',
    closedAt: row.closedAt || row.closed_at || null,
    closeNote: row.closeNote || row.close_note || '',
    createdByName: row.createdByName || row.created_by_name || '',
    updatedByName: row.updatedByName || row.updated_by_name || '',
    createdAt: row.createdAt || row.created_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
  };
}

function operationalFundStatusLabel(status) {
  const labels = {
    submitted: 'Menunggu Review',
    approved: 'Disetujui Finance',
    transferred: 'Dana Ditransfer',
    rejected: 'Ditolak',
    cancelled: 'Dibatalkan',
  };
  return labels[status] || status || '-';
}

function normalizeOperationalFundRequestRow(row = {}) {
  return {
    id: row.id,
    requestDate: formatDisplayDate(row.requestDate || row.request_date),
    rawRequestDate: row.requestDate || row.request_date || '',
    amount: Number(row.amount || 0),
    purpose: row.purpose || '-',
    status: row.status || 'submitted',
    statusLabel: operationalFundStatusLabel(row.status || 'submitted'),
    requestedBy: row.requestedBy || row.requested_by_name || '',
    requestedAt: row.requestedAt || row.requested_at || '',
    reviewedBy: row.reviewedBy || row.reviewed_by_name || '',
    reviewedAt: row.reviewedAt || row.reviewed_at || '',
    rejectionNote: row.rejectionNote || row.rejection_note || '',
    transferUploadedBy: row.transferUploadedBy || row.transfer_uploaded_by_name || '',
    transferUploadedAt: row.transferUploadedAt || row.transfer_uploaded_at || '',
    transferProof: row.transferProof || row.transferProofFile?.name || '',
    transferProofFile: row.transferProofFile || null,
  };
}

function normalizeExpenseReconciliationRow(row = {}) {
  return {
    id: row.id,
    salesOrderId: row.salesOrderId || row.sales_order_id || '',
    containerJobId: row.containerJobId || row.container_job_id || '',
    soNumber: row.soNumber || row.so_number || '-',
    customer: row.customer || row.customer_name || '-',
    destination: row.destination || '-',
    tripDate: formatDisplayDate(row.tripDate || row.trip_date),
    containerNumber: row.containerNumber || row.container_number || '-',
    containerSize: row.containerSize || row.container_size || '',
    driverName: row.driverName || row.driver_name || row.driver || '-',
    truck: row.truck || '-',
    category: row.category || 'lainnya',
    amount: Number(row.amount || 0),
    description: row.description || '-',
    recipientName: row.recipientName || row.recipient_name || '-',
    paymentStatus: row.paymentStatus || row.payment_status || 'belum_dibayar',
    paidAt: formatDisplayDate(row.paidAt || row.paid_at),
    paidByName: row.paidByName || row.paid_by_name || '',
    proofAttachment: row.proofAttachment || row.proofAttachmentFile || null,
    financeCheckStatus: row.financeCheckStatus || row.finance_check_status || 'belum_dicek',
    financeCheckedByName: row.financeCheckedByName || row.finance_checked_by_name || '',
    financeCheckedAt: formatDisplayDate(row.financeCheckedAt || row.finance_checked_at),
    financeNote: row.financeNote || row.finance_note || '',
    adminFeeAmount: Number(row.adminFeeAmount || row.admin_fee_amount || 0),
    adjustmentNote: row.adjustmentNote || row.adjustment_note || '',
    normalTransferAmount: Number(row.normalTransferAmount || row.normal_transfer_amount || 0),
    totalActualTransfer: Number(row.totalActualTransfer || row.total_actual_transfer || 0),
    adjustmentAmount: Number(row.adjustmentAmount || row.adjustment_amount || 0),
    transferProofCount: Number(row.transferProofCount || row.transfer_proof_count || 0),
    batchStatus: row.batchStatus || row.batch_status || 'open',
    createdByName: row.createdByName || row.created_by_name || '',
    createdAt: formatDisplayDate(row.createdAt || row.created_at),
  };
}

function normalizeOperationalFundTransactionRow(row = {}) {
  const transactionType = row.transactionType || row.transaction_type || 'debit';
  const amount = Number(row.amount || 0);
  return {
    id: row.id,
    batchId: row.batchId || row.batch_id || '',
    batchDate: row.batchDate || row.batch_date || row.transactionDate || row.transaction_date || '',
    batchStatus: row.batchStatus || row.batch_status || 'open',
    transactionDate: formatDisplayDate(row.transactionDate || row.transaction_date),
    transactionType,
    category: row.category || '',
    amount,
    description: row.description || '-',
    topName: row.topName || row.top_name || '',
    driverName: row.driverName || row.driver_name || '',
    doNumber: row.doNumber || row.do_number || '',
    customerName: row.customerName || row.customer_name || row.customer || '',
    moneyIn: Number(row.moneyIn || row.money_in || (transactionType === 'credit' ? amount : 0)),
    moneyOut: Number(row.moneyOut || row.money_out || (transactionType === 'debit' ? amount : 0)),
    runningBalance: row.runningBalance == null && row.running_balance == null ? null : Number(row.runningBalance ?? row.running_balance),
    status: row.status || 'posted',
    proofAttachment: row.proofAttachment || row.proofAttachmentFile || null,
    soNumber: row.soNumber || row.so_number || '',
    customer: row.customer || row.customer_name || '',
    destination: row.destination || '',
    containerNumber: row.containerNumber || row.container_number || '',
    expenseCategory: row.expenseCategory || row.expense_category || '',
    createdByName: row.createdByName || row.created_by_name || '',
  };
}

function operationalFundTransactionCsvRows(rows = []) {
  const chronologicalRows = [...rows].reverse();
  if (!chronologicalRows.length) return [];

  const signedAmount = (row) => Number(row.moneyIn || 0) - Number(row.moneyOut || 0);
  const firstRow = chronologicalRows[0];
  const lastRow = chronologicalRows[chronologicalRows.length - 1];
  const firstRunningBalance = Number(firstRow.runningBalance);
  const lastRunningBalance = Number(lastRow.runningBalance);
  const openingBalance = Number.isFinite(firstRunningBalance) ? firstRunningBalance - signedAmount(firstRow) : 0;
  const closingBalance = Number.isFinite(lastRunningBalance)
    ? lastRunningBalance
    : openingBalance + chronologicalRows.reduce((total, row) => total + signedAmount(row), 0);
  const totalMoneyIn = chronologicalRows.reduce((total, row) => total + Number(row.moneyIn || 0), 0);
  const totalMoneyOut = chronologicalRows.reduce((total, row) => total + Number(row.moneyOut || 0), 0);
  const reportDate = firstRow.transactionDate || '';

  return [
    ['', reportDate, 'SISA SALDO', '', '', '', openingBalance, ''],
    ['', reportDate, 'UANG MASUK', '', totalMoneyIn, '', '', ''],
    ...chronologicalRows.map((row, index) => [
      index + 1,
      row.transactionDate || '',
      row.description || '',
      operationalFundTransactionCategoryLabel(row),
      row.moneyIn || 0,
      row.moneyOut || 0,
      row.runningBalance == null ? '' : row.runningBalance,
      row.proofAttachment ? 'Ada' : '',
    ]),
    ['', '', 'TOTAL PENGELUARAN', '', '', totalMoneyOut, '', ''],
    ['', '', 'SISA SALDO', '', '', '', closingBalance, ''],
  ];
}

export {
  defaultExpenseReconciliationSummary,
  defaultOperationalFundBatch,
  defaultOperationalFundSummary,
  defaultOperationalFundTransactionSummary,
  expenseCategoryLabels,
  expenseFinanceStatusLabels,
  expensePaymentStatusLabels,
  formatDisplayDate,
  nextDateValue,
  normalizeExpenseReconciliationRow,
  normalizeOperationalFundBatchRow,
  normalizeOperationalFundRequestRow,
  normalizeOperationalFundTransactionRow,
  operationalFundBatchStatusLabel,
  operationalFundStatusLabel,
  operationalFundTransactionCategoryLabel,
  operationalFundTransactionCategoryLabels,
  operationalFundTransactionCsvRows,
  operationalFundTransactionTypeLabels,
  readableLabel,
};
