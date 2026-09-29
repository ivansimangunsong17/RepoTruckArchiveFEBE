export const DRIVER_COMMISSION_CSV_HEADERS = [
  'No',
  'Periode Awal',
  'Periode Akhir',
  'Nama Sopir',
  'Metode Pembayaran',
  'Bank / E-Wallet',
  'No. Rekening',
  'Nama Pemilik Rekening',
  'Tanggal Selesai',
  'Nomor SO',
  'Nomor Container',
  'Ukuran',
  'Customer',
  'Tujuan',
  'Plat Truck',
  'Komisi Ritasi (Sebelum Potongan)',
  'Total Komisi Sopir Sebelum Potongan',
  'Total Potongan Sopir',
  'Total Harus Dibayar ke Sopir',
  'Status Ritasi',
  'Status Batch',
];

export function summarizeDriverCommissions(drivers = []) {
  return drivers.reduce((totals, driver) => {
    const grossAmount = Number(driver.grossAmount ?? driver.totalAmount ?? 0);
    const deductionAmount = Number(driver.deductionAmount || 0);
    const netAmount = Math.max(0, Number(driver.netAmount ?? (grossAmount - deductionAmount)));
    return {
      grossAmount: totals.grossAmount + grossAmount,
      deductionAmount: totals.deductionAmount + deductionAmount,
      netAmount: totals.netAmount + netAmount,
    };
  }, { grossAmount: 0, deductionAmount: 0, netAmount: 0 });
}

export function isFullyDeductedCommission(driver = {}) {
  const grossAmount = Number(driver.grossAmount ?? driver.totalAmount ?? 0);
  const deductionAmount = Number(driver.deductionAmount || 0);
  const netAmount = Math.max(0, Number(driver.netAmount ?? (grossAmount - deductionAmount)));
  return grossAmount > 0 && deductionAmount >= grossAmount && netAmount === 0;
}

export function hasDriverCommissionTransferProof(driver = {}) {
  return Boolean(driver.paymentProofAttachment || driver.paymentProofAttachmentId);
}

export function driverCommissionFinanceStatus(driver = {}) {
  const paid = driver.paymentStatus === 'paid' || driver.batchStatus === 'paid' || driver.status === 'paid';
  if (paid && isFullyDeductedCommission(driver) && !hasDriverCommissionTransferProof(driver)) return 'deducted_paid';
  if (paid) return 'paid';
  if (driver.batchStatus === 'approved') return 'approved';
  if (driver.batchStatus === 'submitted') return 'submitted';
  return driver.paymentStatus || driver.batchStatus || driver.status || 'unsubmitted';
}

export function driverCommissionStatusLabel(driver = {}) {
  const status = typeof driver === 'string' ? driver : driverCommissionFinanceStatus(driver);
  const labels = {
    empty: 'Kosong',
    draft: 'Draft',
    unsubmitted: 'Belum Diajukan',
    submitted: 'Menunggu Finance',
    approved: 'Siap Dibayar',
    rejected: 'Ditolak',
    paid: 'Sudah Dibayar',
    pending: 'Belum Dibayar',
    deducted_paid: 'Lunas via Potongan',
  };
  return labels[status] || status || '-';
}

export function driverCommissionProofStatus(driver = {}) {
  if (hasDriverCommissionTransferProof(driver)) return 'Ada';
  if (isFullyDeductedCommission(driver) && driverCommissionFinanceStatus(driver) === 'deducted_paid') {
    return 'Tidak Ada Transfer';
  }
  return 'Belum';
}

function paymentMethodLabel(driver = {}) {
  if (driver.paymentMethod === 'emoney') return 'E-Wallet';
  if (driver.paymentMethod === 'bank') return 'Transfer Bank';
  return driver.paymentMethod || '-';
}

export function buildDriverCommissionCsvRows(drivers = [], options = {}) {
  const { periodStart = '', periodEnd = '', batchStatus = '' } = options;
  let rowNumber = 0;

  return drivers.flatMap((driver) => {
    const grossAmount = Number(driver.grossAmount ?? driver.totalAmount ?? 0);
    const deductionAmount = Number(driver.deductionAmount || 0);
    const netAmount = Math.max(0, Number(driver.netAmount ?? (grossAmount - deductionAmount)));
    const statusLabel = driverCommissionStatusLabel(driver);
    const accountNumber = driver.paymentMethod === 'emoney'
      ? driver.emoneyNumber || ''
      : driver.bankAccountNumber || '';
    const provider = driver.paymentMethod === 'emoney'
      ? driver.emoneyProvider || driver.bankName || ''
      : driver.bankName || '';

    return (driver.items || []).map((item) => {
      rowNumber += 1;
      return [
        rowNumber,
        periodStart,
        periodEnd,
        driver.driverName || '-',
        paymentMethodLabel(driver),
        provider || '-',
        accountNumber || '-',
        driver.bankAccountHolder || driver.driverName || '-',
        item.completedDate || '',
        item.accurateSoNumber || item.soNumber || '-',
        item.containerNumber || '-',
        item.containerSize || '-',
        item.customerName || '-',
        item.destination || '-',
        item.truckPlateNumber || '-',
        Number(item.amount || 0),
        grossAmount,
        deductionAmount,
        netAmount,
        statusLabel,
        driver.batchStatus || batchStatus || '-',
      ];
    });
  });
}
