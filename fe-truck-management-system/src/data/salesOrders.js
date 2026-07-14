import { fallbackTruckUnits } from './truckData';

function toDateKey(value) {
  const date = value ? new Date(value) : new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function offsetDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function dateTime(dateKey, time) {
  return `${dateKey}T${time}:00`;
}

function findTruck(plateNumber) {
  return fallbackTruckUnits.find((truck) => truck.plateNumber === plateNumber);
}

function inferOrderCategory(spec, index = 0) {
  if (spec.orderCategory) return spec.orderCategory;
  const text = `${spec.customer || ''} ${spec.origin || ''} ${spec.destination || ''}`.toLowerCase();
  if (text.includes('semarang') || text.includes('surabaya') || text.includes('bandung')) return 'panjang';
  return index % 4 === 0 ? 'panjang' : 'pendek';
}

const todayKey = offsetDate(0);

const todayOrderSpecs = [
  { soNumber: 'SO-2607-001', doNumber: 'DO-SLG-001', customer: 'PT Sumber Logistik', customerPic: 'Nadia Putri', customerPhone: '021-5211-8800', customerAddress: 'Cikupa, Banten', shipment: 'import', size: '20FT', containerNumber: 'TCLU1234567', origin: 'Tanjung Priok', destination: 'Cikupa', salesName: 'Sinta Maharani', plateNumber: 'B 1234 XYZ', price: 2500000 },
  { soNumber: 'SO-2607-001', doNumber: 'DO-SLG-001', customer: 'PT Sumber Logistik', customerPic: 'Nadia Putri', customerPhone: '021-5211-8800', customerAddress: 'Cikupa, Banten', shipment: 'import', size: '40FT', containerNumber: 'MSCU7742108', origin: 'Tanjung Priok', destination: 'Cikupa', salesName: 'Sinta Maharani', plateNumber: 'B 2190 UYK', price: 3350000 },
  { soNumber: 'SO-2607-002', doNumber: 'DO-LTN-002', customer: 'PT Lautan Niaga', customerPic: 'Dian Prasetyo', customerPhone: '021-8980-1234', customerAddress: 'Cikarang, Jawa Barat', shipment: 'export', size: '40FT', containerNumber: 'OOLU8814202', origin: 'Cikarang', destination: 'Tanjung Priok', salesName: 'Rangga Saputra', plateNumber: 'B 9142 UYK', price: 3350000 },
  { soNumber: 'SO-2607-003', doNumber: 'DO-MYR-003', customer: 'PT Mayora Indah', customerPic: 'Maya Kusuma', customerPhone: '021-8877-2200', customerAddress: 'Bekasi, Jawa Barat', shipment: 'domestik inward', size: '20FT', containerNumber: 'TEMU3329014', origin: 'Marunda', destination: 'Bekasi', salesName: 'Dewi Lestari', plateNumber: 'B 8871 TZX', price: 2400000 },
  { soNumber: 'SO-2607-003', doNumber: 'DO-MYR-003', customer: 'PT Mayora Indah', customerPic: 'Maya Kusuma', customerPhone: '021-8877-2200', customerAddress: 'Bekasi, Jawa Barat', shipment: 'domestik inward', size: '20FT', containerNumber: 'CMAU5512097', origin: 'Marunda', destination: 'Bekasi', salesName: 'Dewi Lestari', plateNumber: 'B 6681 KKA', price: 2400000 },
  { soNumber: 'SO-2607-004', doNumber: 'DO-UNI-004', customer: 'PT Unilever Indonesia', customerPic: 'Bima Saputra', customerPhone: '021-5211-7711', customerAddress: 'Cikarang, Jawa Barat', shipment: 'domestik outward', size: '40FT', containerNumber: 'EISU4901132', origin: 'Karawang', destination: 'Surabaya', salesName: 'Sinta Maharani', plateNumber: 'B 3401 TLA', price: 6800000 },
  { soNumber: 'SO-2607-005', doNumber: 'DO-CTR-005', customer: 'PT Cipta Retail', customerPic: 'Rini Amanda', customerPhone: '021-7788-5544', customerAddress: 'Cibitung, Jawa Barat', shipment: 'import', size: '20FT', containerNumber: 'WHLU8827310', origin: 'Tanjung Priok', destination: 'Cibitung', salesName: 'Rangga Saputra', plateNumber: 'B 7710 KRN', price: 2600000 },
  { soNumber: 'SO-2607-005', doNumber: 'DO-CTR-005', customer: 'PT Cipta Retail', customerPic: 'Rini Amanda', customerPhone: '021-7788-5544', customerAddress: 'Cibitung, Jawa Barat', shipment: 'import', size: '40FT', containerNumber: 'SEGU7812204', origin: 'Tanjung Priok', destination: 'Cibitung', salesName: 'Rangga Saputra', plateNumber: 'B 4812 CKA', price: 3350000 },
  { soNumber: 'SO-2607-006', doNumber: 'DO-MKM-006', customer: 'PT Mitra Kimia', customerPic: 'Yoga Pranata', customerPhone: '021-5588-3322', customerAddress: 'Tangerang, Banten', shipment: 'export', size: '40FT', containerNumber: 'NYKU6609821', origin: 'Tangerang', destination: 'Tanjung Priok', salesName: 'Dewi Lestari', plateNumber: 'B 8890 JKT', price: 3400000 },
  { soNumber: 'SO-2607-007', doNumber: 'DO-SPN-007', customer: 'PT Surya Pangan', customerPic: 'Ari Wibowo', customerPhone: '021-8899-2200', customerAddress: 'Karawang, Jawa Barat', shipment: 'import', size: '20FT', containerNumber: 'HLBU3301187', origin: 'Tanjung Priok', destination: 'Karawang', salesName: 'Sinta Maharani', plateNumber: 'B 6234 MRA', price: 3000000 },
  { soNumber: 'SO-2607-008', doNumber: 'DO-GLM-008', customer: 'PT Global Makmur', customerPic: 'Putri Lestari', customerPhone: '022-6655-1100', customerAddress: 'Bandung, Jawa Barat', shipment: 'domestik inward', size: '40FT', containerNumber: 'YMLU7715409', origin: 'Bandung', destination: 'Jakarta', salesName: 'Rangga Saputra', plateNumber: 'B 4507 BKS', price: 4200000 },
  { soNumber: 'SO-2607-009', doNumber: 'DO-PRD-009', customer: 'PT Prima Distribusi', customerPic: 'Hana Fitri', customerPhone: '021-6677-8899', customerAddress: 'Bekasi, Jawa Barat', shipment: 'domestik outward', size: '20FT', containerNumber: 'TRHU5087115', origin: 'Bekasi', destination: 'Semarang', salesName: 'Dewi Lestari', plateNumber: 'B 2744 KRG', price: 5200000 },
];

const futureOrderSpecs = [
  { soNumber: 'SO-2607-013', doNumber: 'DO-SLG-013', customer: 'PT Sumber Logistik', shipment: 'import', size: '20FT', containerNumber: 'PROS200013', origin: 'Tanjung Priok', destination: 'Cikarang', salesName: 'Sinta Maharani', tripDate: offsetDate(1), price: 2550000 },
  { soNumber: 'SO-2607-013', doNumber: 'DO-SLG-013', customer: 'PT Sumber Logistik', shipment: 'import', size: '40FT', containerNumber: 'PROS400013', origin: 'Tanjung Priok', destination: 'Cikarang', salesName: 'Sinta Maharani', tripDate: offsetDate(1), price: 3350000 },
  { soNumber: 'SO-2607-014', doNumber: 'DO-CTR-014', customer: 'PT Cipta Retail', shipment: 'import', size: '20FT', containerNumber: 'PROS200014', origin: 'Tanjung Priok', destination: 'Cibitung', salesName: 'Rangga Saputra', tripDate: offsetDate(1), price: 2600000 },
  { soNumber: 'SO-2607-015', doNumber: 'DO-MKM-015', customer: 'PT Mitra Kimia', shipment: 'export', size: '40FT', containerNumber: 'PROS400015', origin: 'Tangerang', destination: 'Tanjung Priok', salesName: 'Dewi Lestari', tripDate: offsetDate(1), price: 3400000 },
  { soNumber: 'SO-2607-016', doNumber: 'DO-LTN-016', customer: 'PT Lautan Niaga', shipment: 'export', size: '20FT', containerNumber: 'PROS200016', origin: 'Bekasi', destination: 'Tanjung Priok', salesName: 'Rangga Saputra', tripDate: offsetDate(2), price: 2850000 },
  { soNumber: 'SO-2607-016', doNumber: 'DO-LTN-016', customer: 'PT Lautan Niaga', shipment: 'export', size: '40FT', containerNumber: 'PROS400016', origin: 'Bekasi', destination: 'Tanjung Priok', salesName: 'Rangga Saputra', tripDate: offsetDate(2), price: 3350000 },
  { soNumber: 'SO-2607-017', doNumber: 'DO-SPN-017', customer: 'PT Surya Pangan', shipment: 'import', size: '20FT', containerNumber: 'PROS200017', origin: 'Tanjung Priok', destination: 'Karawang', salesName: 'Sinta Maharani', tripDate: offsetDate(2), price: 3000000 },
  { soNumber: 'SO-2607-018', doNumber: 'DO-GLM-018', customer: 'PT Global Makmur', shipment: 'domestik inward', size: '40FT', containerNumber: 'PROS400018', origin: 'Bandung', destination: 'Jakarta', salesName: 'Rangga Saputra', tripDate: offsetDate(3), price: 4200000 },
  { soNumber: 'SO-2607-019', doNumber: 'DO-PRD-019', customer: 'PT Prima Distribusi', shipment: 'domestik outward', size: '20FT', containerNumber: 'PROS200019', origin: 'Bekasi', destination: 'Semarang', salesName: 'Dewi Lestari', tripDate: offsetDate(4), price: 5200000 },
  { soNumber: 'SO-2607-019', doNumber: 'DO-PRD-019', customer: 'PT Prima Distribusi', shipment: 'domestik outward', size: '20FT', containerNumber: 'PROS200020', origin: 'Bekasi', destination: 'Semarang', salesName: 'Dewi Lestari', tripDate: offsetDate(4), price: 5200000 },
  { soNumber: 'SO-2607-020', doNumber: 'DO-UNI-020', customer: 'PT Unilever Indonesia', shipment: 'domestik outward', size: '40FT', containerNumber: 'PROS400020', origin: 'Karawang', destination: 'Surabaya', salesName: 'Sinta Maharani', tripDate: offsetDate(5), price: 6800000 },
  { soNumber: 'SO-2607-021', doNumber: 'DO-MYR-021', customer: 'PT Mayora Indah', shipment: 'domestik inward', size: '20FT', containerNumber: 'PROS200021', origin: 'Marunda', destination: 'Bekasi', salesName: 'Dewi Lestari', tripDate: offsetDate(6), price: 2400000 },
  { soNumber: 'SO-2607-021', doNumber: 'DO-MYR-021', customer: 'PT Mayora Indah', shipment: 'domestik inward', size: '40FT', containerNumber: 'PROS400021', origin: 'Marunda', destination: 'Bekasi', salesName: 'Dewi Lestari', tripDate: offsetDate(6), price: 3350000 },
  { soNumber: 'SO-2607-022', doNumber: 'DO-SLG-022', customer: 'PT Sumber Logistik', shipment: 'import', size: '20FT', containerNumber: 'PROS200022', origin: 'Tanjung Priok', destination: 'Cikarang', salesName: 'Sinta Maharani', tripDate: offsetDate(6), price: 2550000 },
];

function groupOrderSpecs(specs) {
  return Object.values(specs.reduce((groups, spec) => {
    groups[spec.soNumber] = [...(groups[spec.soNumber] || []), spec];
    return groups;
  }, {}));
}

function createTodayOrder(specs, index) {
  const items = Array.isArray(specs) ? specs : [specs];
  const spec = items[0];
  const receivedAt = dateTime(todayKey, '07:00');
  const runningAt = dateTime(todayKey, '08:00');
  const sequence = String(index + 1).padStart(3, '0');
  const totalAmount = items.reduce((total, item) => total + Number(item.price || 0), 0);

  return {
    id: `so-today-${sequence}`,
    soNumber: spec.soNumber,
    doNumber: spec.doNumber,
    soDate: todayKey,
    tripDate: todayKey,
    customer: spec.customer,
    customerPic: spec.customerPic,
    customerPhone: spec.customerPhone,
    customerAddress: spec.customerAddress,
    shipment: spec.shipment,
    orderCategory: inferOrderCategory(spec, index),
    jobType: 'Trucking Container',
    jobDescription: 'Pengiriman container sesuai jadwal operasional hari ini.',
    price: spec.price,
    quantity: items.length,
    unit: 'Container',
    totalAmount,
    origin: spec.origin,
    destination: spec.destination,
    receivedAt,
    runningAt,
    completedAt: null,
    status: 'running',
    salesName: spec.salesName,
    createdBy: spec.salesName,
    createdAt: receivedAt,
    updatedBy: 'Budi Operational',
    updatedAt: runningAt,
    notes: '',
    referenceDocuments: [
      { documentType: 'Delivery Order', referenceNumber: spec.doNumber, documentDate: todayKey, file: { name: `${spec.doNumber}.pdf`, size: 240000 }, notes: '' },
    ],
    containers: items.map((containerSpec, itemIndex) => {
      const truck = findTruck(containerSpec.plateNumber);
      const containerSequence = `${sequence}-${String(itemIndex + 1).padStart(2, '0')}`;
      return {
        id: `ctr-today-${containerSequence}`,
        containerNumber: containerSpec.containerNumber,
        size: containerSpec.size,
        type: 'Dry',
        notes: '',
        rpujStatus: 'approved',
        spkNumber: `SPK-2607-${containerSequence}`,
        spkDocument: { name: `SPK-2607-${containerSequence}.pdf`, size: 210000 },
        rpujNotes: 'Biaya lainnya disetujui.',
        loadingVoucher: `BM-2607-${containerSequence}`,
        loadingVoucherDocument: { name: `BM-2607-${containerSequence}.jpg`, size: 310000 },
        unloadingVoucher: null,
        unloadingVoucherDocument: null,
        driver: truck?.defaultDriver || '-',
        plateNumber: containerSpec.plateNumber,
        chassis: `${truck?.unitCode || '-'} - ${truck?.brand || '-'} ${truck?.type || ''}`.trim(),
        travelDocument: `SJ-2607-${containerSequence}`,
        travelDocumentFile: { name: `SJ-2607-${containerSequence}.pdf`, size: 265000 },
        weighingDocument: null,
        weighingDocumentFile: null,
        otherDocuments: [],
        invoiceNumber: null,
        status: 'running',
        receivedAt,
        runningAt,
        completedAt: null,
        updatedBy: 'Budi Operational',
        updatedAt: runningAt,
      };
    }),
  };
}

function createFutureOrder(specs, index) {
  const items = Array.isArray(specs) ? specs : [specs];
  const spec = items[0];
  const receivedAt = dateTime(todayKey, '09:15');
  const sequence = String(index + 13).padStart(3, '0');
  const totalAmount = items.reduce((total, item) => total + Number(item.price || 0), 0);

  return {
    id: `so-future-${sequence}`,
    soNumber: spec.soNumber,
    doNumber: spec.doNumber,
    soDate: todayKey,
    tripDate: spec.tripDate,
    customer: spec.customer,
    customerPic: '-',
    customerPhone: '-',
    customerAddress: '-',
    shipment: spec.shipment,
    orderCategory: inferOrderCategory(spec, index),
    jobType: 'Trucking Container',
    jobDescription: 'Order terjadwal untuk hari berikutnya.',
    price: spec.price,
    quantity: items.length,
    unit: 'Container',
    totalAmount,
    origin: spec.origin,
    destination: spec.destination,
    receivedAt,
    runningAt: null,
    completedAt: null,
    status: 'waiting_operational',
    salesName: spec.salesName,
    createdBy: spec.salesName,
    createdAt: receivedAt,
    updatedBy: spec.salesName,
    updatedAt: receivedAt,
    notes: '',
    referenceDocuments: [],
    containers: items.map((containerSpec, itemIndex) => ({
        id: `ctr-future-${sequence}-${String(itemIndex + 1).padStart(2, '0')}`,
        containerNumber: containerSpec.containerNumber,
        size: containerSpec.size,
        type: 'Dry',
        notes: '',
        rpujStatus: 'submitted',
        rpujNotes: 'Menunggu proses operational.',
        spkNumber: null,
        driver: null,
        plateNumber: null,
        chassis: null,
        otherDocuments: [],
        status: 'received',
        receivedAt,
        runningAt: null,
        completedAt: null,
        updatedBy: null,
        updatedAt: null,
      })),
  };
}

function createCompletedOrder() {
  const tripDate = offsetDate(-1);
  const truck = findTruck('B 5527 ARM');

  return {
    id: 'so-completed-001',
    soNumber: 'SO-2607-000',
    doNumber: 'DO-HIS-000',
    soDate: tripDate,
    tripDate,
    customer: 'PT Global Makmur',
    customerPic: 'Putri Lestari',
    customerPhone: '022-6655-1100',
    customerAddress: 'Bandung, Jawa Barat',
    shipment: 'domestik inward',
    jobType: 'Trucking Container',
    jobDescription: 'Contoh order yang sudah masuk arsip perjalanan.',
    price: 3900000,
    quantity: 1,
    unit: 'Container',
    totalAmount: 3900000,
    origin: 'Bandung',
    destination: 'Jakarta',
    receivedAt: dateTime(tripDate, '07:00'),
    runningAt: dateTime(tripDate, '08:00'),
    completedAt: dateTime(tripDate, '17:00'),
    status: 'completed',
    salesName: 'Rangga Saputra',
    createdBy: 'Rangga Saputra',
    createdAt: dateTime(tripDate, '07:00'),
    updatedBy: 'Budi Operational',
    updatedAt: dateTime(tripDate, '17:00'),
    notes: '',
    referenceDocuments: [],
    containers: [
      {
        id: 'ctr-completed-001',
        containerNumber: 'DONE400001',
        size: '40FT',
        type: 'Dry',
        notes: '',
        rpujStatus: 'approved',
        spkNumber: 'SPK-2607-000',
        spkDocument: { name: 'SPK-2607-000.pdf', size: 205000 },
        loadingVoucher: 'BM-2607-000',
        loadingVoucherDocument: { name: 'BM-2607-000.jpg', size: 300000 },
        unloadingVoucher: 'BB-2607-000',
        unloadingVoucherDocument: { name: 'BB-2607-000.jpg', size: 300000 },
        driver: truck?.defaultDriver || 'Eko Saputra',
        plateNumber: truck?.plateNumber || 'B 5527 ARM',
        chassis: `${truck?.unitCode || 'TRK-008'} - ${truck?.brand || 'Mitsubishi Fuso'} ${truck?.type || 'Fighter FM 65'}`,
        travelDocument: 'SJ-2607-000',
        travelDocumentFile: { name: 'SJ-2607-000.pdf', size: 260000 },
        weighingDocument: 'TB-2607-000',
        weighingDocumentFile: { name: 'TB-2607-000.pdf', size: 185000 },
        invoiceNumber: null,
        otherDocuments: [],
        status: 'completed',
        receivedAt: dateTime(tripDate, '07:00'),
        runningAt: dateTime(tripDate, '08:00'),
        completedAt: dateTime(tripDate, '17:00'),
        updatedBy: 'Budi Operational',
        updatedAt: dateTime(tripDate, '17:00'),
      },
    ],
  };
}

export const initialSalesOrders = [
  ...groupOrderSpecs(todayOrderSpecs).map(createTodayOrder),
  ...groupOrderSpecs(futureOrderSpecs).map(createFutureOrder),
  createCompletedOrder(),
];
