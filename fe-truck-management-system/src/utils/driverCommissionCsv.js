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
  'Komisi Ritasi',
  'Total Potongan Sopir',
  'Net Komisi Sopir',
  'Status Ritasi',
  'Status Batch',
];

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
    const netAmount = Number(driver.netAmount ?? (grossAmount - deductionAmount));
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
        deductionAmount,
        netAmount,
        item.paymentStatus || driver.paymentStatus || '-',
        driver.batchStatus || batchStatus || '-',
      ];
    });
  });
}
