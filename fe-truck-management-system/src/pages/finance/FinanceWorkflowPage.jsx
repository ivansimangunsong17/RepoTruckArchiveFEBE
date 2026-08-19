import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Eye,
  Info,
  FileText,
  ReceiptText,
  RotateCcw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import DocumentLink from '../../components/common/DocumentLink';
import {
  approveFinanceRpuj,
  fetchFinanceInvoiceCorrections,
  fetchFinanceInvoiceDetail,
  fetchFinanceInvoices,
  fetchFinanceOrderCorrections,
  fetchFinanceOrderVerifications,
  fetchFinanceRpujRequests,
  rejectFinanceRpuj,
  requestFinanceInvoiceCorrection,
  requestFinanceOrderSoCorrection,
  updateFinanceInvoiceNumber,
  updateFinanceOrderSoNumber,
  uploadFinanceInvoiceDocument,
  uploadFinanceRpujTransferProof,
} from '../../services/finance/financeService';
import { validateArchiveFile } from '../../utils/fileValidation';

const ORDER_TABLE_PAGE_SIZE = 20;
const RPUJ_TABLE_PAGE_SIZE = 20;
const INVOICE_TABLE_PAGE_SIZE = 20;
const MONTH_FILTER_MIN_YEAR = 2000;
const MONTH_FILTER_MAX_YEAR = 2100;
const DEFAULT_MONTH_FILTER_YEAR = String(new Date().getFullYear());
const MONTH_FILTER_OPTIONS = [
  ['01', 'Januari'],
  ['02', 'Februari'],
  ['03', 'Maret'],
  ['04', 'April'],
  ['05', 'Mei'],
  ['06', 'Juni'],
  ['07', 'Juli'],
  ['08', 'Agustus'],
  ['09', 'September'],
  ['10', 'Oktober'],
  ['11', 'November'],
  ['12', 'Desember'],
];

const financeTabs = [
  {
    id: 'order-verification',
    label: 'Verifikasi Order',
    icon: CheckCircle2,
    badge: 'Sales Order',
    description: 'Lihat request order yang akan dijalankan, lalu input Nomor SO resmi dari Accurate agar bisa dicari dan diproses.',
    statusFlow: ['Request Order Masuk', 'Input Nomor SO Accurate', 'Siap Diproses Operational'],
  },
  {
    id: 'rpuj-approval',
    label: 'Approval RPUJ / SPK',
    icon: ReceiptText,
    badge: 'Operational',
    description: 'Review total UJ, approve/reject, upload bukti transfer, dan pantau UJ yang sudah dikirim.',
    statusFlow: ['Butuh Approval', 'Siap Transfer', 'UJ Dikirim'],
  },
  {
    id: 'invoice-number',
    label: 'Input Nomor Invoice',
    icon: FileText,
    badge: 'Billing',
    description: 'Menampilkan SO selesai yang butuh nomor invoice, sudah ada invoice namun menunggu update dari Sales, dan yang sudah lunas.',
    statusFlow: ['Butuh Nomor Invoice', 'Menunggu Sales', 'Lunas'],
  },
];

const initialOrderRows = [
  {
    id: 'ord-001',
    orderDate: '16 Jul 2026',
    salesName: 'Sinta Sales',
    customer: 'DPW (PT PAHALA BAHARI NUSANTARA)',
    customerPic: 'Budi Santoso',
    customerPhone: '021-7788-1200',
    destination: 'Karawang',
    orderType: 'Import',
    paymentTerms: 'Credit 14 Hari',
    runningDate: '17 Jul 2026',
    container: '2 x 20FT',
    vesselName: 'MV Meratus Jayakarta',
    terminal: 'UTC-2',
    depo: 'MTCON',
    document: 'DO-DPW-1607.pdf',
    notes: 'Prioritas jalan besok pagi. Customer minta update setelah keluar terminal.',
    status: 'Menunggu No. SO Accurate',
    soNumber: '',
  },
  {
    id: 'ord-002',
    orderDate: '16 Jul 2026',
    salesName: 'Sinta Sales',
    customer: 'PT Sumber Logistik',
    customerPic: 'Nadia Putri',
    customerPhone: '021-5211-8800',
    destination: 'Cikarang',
    orderType: 'Export',
    paymentTerms: 'Cash Basis',
    runningDate: '16 Jul 2026',
    container: '1 x 40FT',
    vesselName: 'MV Tanto Bersinar',
    terminal: 'NPCT1',
    depo: 'Depo Sumber Jaya',
    document: 'DO-SLG-018.pdf',
    notes: 'Stuffing sore, gate in maksimal malam.',
    status: 'No. SO Terisi',
    soNumber: 'SO-202607-018',
  },
  {
    id: 'ord-003',
    orderDate: '15 Jul 2026',
    salesName: 'Admin Demo',
    customer: 'PT Global Makmur',
    customerPic: 'Putri Lestari',
    customerPhone: '022-6655-1100',
    destination: 'Bandung',
    orderType: 'Import',
    paymentTerms: 'Credit 30 Hari',
    runningDate: '18 Jul 2026',
    container: '1 x 20FT, 1 x 40FT',
    vesselName: 'MV Tanto Sejahtera',
    terminal: 'JICT',
    depo: 'MTCON',
    document: '-',
    notes: 'Menunggu konfirmasi final DO dari customer.',
    status: 'Menunggu No. SO Accurate',
    soNumber: '',
  },
];

const initialRpujRows = [
  {
    id: 'rpuj-001',
    soNumber: 'SO-202607-018',
    jobNumber: 'JOB-018-01',
    customer: 'PT Sumber Logistik',
    destination: 'Cikarang',
    driver: 'Gilang Permana',
    driverBankAccount: 'BCA 1234567890',
    truck: 'B 3232 KJZ',
    orderType: 'Import',
    container: '20FT / CONT-SLG-001',
    departureDate: '17 Jul 2026',
    terminal: 'UTC-2',
    depo: 'MTCON',
    spkNumber: 'SPK-202607-NTR1A',
    ujRecommendation: '1 x 20FT @ Rp 600.000',
    notes: 'Biaya tambahan untuk toll terminal.',
    totalUj: 600000,
    additionalCost: 50000,
    status: 'Menunggu Approval Finance',
    transferProof: '',
  },
  {
    id: 'rpuj-004',
    soNumber: 'SO-202607-018',
    jobNumber: 'JOB-018-02',
    customer: 'PT Sumber Logistik',
    destination: 'Cikarang',
    driver: 'Joko Prasetyo',
    driverBankAccount: 'Mandiri 141002778899',
    truck: 'B 4421 TZX',
    orderType: 'Import',
    container: '20FT / CONT-SLG-002',
    departureDate: '17 Jul 2026',
    terminal: 'UTC-2',
    depo: 'MTCON',
    spkNumber: 'SPK-202607-NTR1B',
    ujRecommendation: '1 x 20FT @ Rp 600.000',
    notes: 'Tidak ada biaya tambahan.',
    totalUj: 600000,
    additionalCost: 0,
    status: 'Disetujui Finance',
    transferProof: '',
  },
  {
    id: 'rpuj-005',
    soNumber: 'SO-202607-018',
    jobNumber: 'JOB-018-03',
    customer: 'PT Sumber Logistik',
    destination: 'Cikarang',
    driver: 'Rudi Hartono',
    driverBankAccount: 'BRI 002201445566',
    truck: 'B 9142 UYK',
    orderType: 'Import',
    container: '40FT / CONT-SLG-003',
    departureDate: '18 Jul 2026',
    terminal: 'UTC-2',
    depo: 'MTCON',
    spkNumber: 'SPK-202607-NTR1C',
    ujRecommendation: '1 x 40FT @ Rp 700.000',
    notes: 'Tambahan parkir terminal.',
    totalUj: 700000,
    additionalCost: 100000,
    status: 'Bukti Transfer Diupload',
    transferProof: 'transfer-uj-so-202607-018-03.pdf',
  },
  {
    id: 'rpuj-002',
    soNumber: 'SO-202607-017',
    jobNumber: 'JOB-017-01',
    customer: 'PT Lautan Niaga',
    destination: 'Ancol',
    driver: 'Joko Prasetyo',
    driverBankAccount: 'Mandiri 141002778899',
    truck: 'B 4421 TZX',
    orderType: 'Export',
    container: '1 x 40FT',
    departureDate: '16 Jul 2026',
    terminal: 'NPCT1',
    depo: 'Depo Sumber Jaya',
    spkNumber: 'SPK-202607-NTR2',
    ujRecommendation: '1 x 40FT @ Rp 700.000',
    notes: 'Menunggu bukti transfer sebelum SPK terbit.',
    totalUj: 700000,
    additionalCost: 0,
    status: 'Disetujui Finance',
    transferProof: '',
  },
  {
    id: 'rpuj-003',
    soNumber: 'SO-202607-016',
    jobNumber: 'JOB-016-01',
    customer: 'PT Prima Distribusi',
    destination: 'Bekasi',
    driver: 'Rudi Hartono',
    driverBankAccount: 'BRI 002201445566',
    truck: 'B 9142 UYK',
    orderType: 'Import',
    container: '1 x 20FT',
    departureDate: '15 Jul 2026',
    terminal: 'JICT',
    depo: 'MTCON',
    spkNumber: 'SPK-202607-NTR3',
    ujRecommendation: '1 x 20FT @ Rp 600.000',
    notes: 'Bukti transfer sudah diupload oleh Finance.',
    totalUj: 600000,
    additionalCost: 75000,
    status: 'Bukti Transfer Diupload',
    transferProof: 'transfer-uj-so-202607-016.pdf',
  },
];

const initialInvoiceRows = [
  {
    id: 'inv-001',
    soNumber: 'SO-202607-014',
    customer: 'PT Mitra Kimia',
    destination: 'Tangerang',
    completedAt: '15 Jul 2026',
    documentStatus: 'Siap Ditagihkan',
    billingAmount: 1500000,
    paymentTerms: 'Credit 14 Hari',
    invoiceDate: '-',
    dueDate: '-',
    billingItems: ['Jasa Angkut D20 - 1 ritase'],
    documentChecklist: [
      { label: 'Nomor SO', ready: true },
      { label: 'Job selesai', ready: true },
      { label: 'Surat Jalan', ready: true },
      { label: 'Bon Muat/Bongkar', ready: true },
      { label: 'TILA/Gatepass', ready: true },
    ],
    activityLogs: [
      '15 Jul 2026 16:20 - Operational menyelesaikan job',
      '15 Jul 2026 17:05 - Dokumen ditandai siap tagih',
    ],
    invoiceNumber: '',
    invoiceStatus: 'Butuh Nomor Invoice',
    paymentStatus: '-',
  },
  {
    id: 'inv-002',
    soNumber: 'SO-202607-013',
    customer: 'PT Cipta Retail',
    destination: 'Cibitung',
    completedAt: '14 Jul 2026',
    documentStatus: 'Siap Ditagihkan',
    billingAmount: 2200000,
    paymentTerms: 'Credit 30 Hari',
    invoiceDate: '15 Jul 2026',
    dueDate: '14 Agu 2026',
    billingItems: ['Jasa Angkut D40 - 1 ritase', 'Stevedoring and Port Service'],
    documentChecklist: [
      { label: 'Nomor SO', ready: true },
      { label: 'Job selesai', ready: true },
      { label: 'Surat Jalan', ready: true },
      { label: 'Bon Muat/Bongkar', ready: true },
      { label: 'TILA/Gatepass', ready: true },
    ],
    activityLogs: [
      '14 Jul 2026 14:40 - Job selesai',
      '15 Jul 2026 09:15 - Finance input nomor invoice',
      '15 Jul 2026 10:05 - Menunggu update pengiriman invoice dari Sales',
    ],
    invoiceNumber: 'INV-202607-009',
    invoiceStatus: 'Menunggu Update Status',
    paymentStatus: 'Menunggu Sales',
  },
  {
    id: 'inv-003',
    soNumber: 'SO-202607-012',
    customer: 'PT Mayora Indah',
    destination: 'Bekasi',
    completedAt: '14 Jul 2026',
    documentStatus: 'Siap Ditagihkan',
    billingAmount: 1750000,
    paymentTerms: 'Cash Basis',
    invoiceDate: '14 Jul 2026',
    dueDate: '14 Jul 2026',
    billingItems: ['Jasa Angkut D20 - 1 ritase', 'Jasa Lainnya - Waiting time'],
    documentChecklist: [
      { label: 'Nomor SO', ready: true },
      { label: 'Job selesai', ready: true },
      { label: 'Surat Jalan', ready: true },
      { label: 'Bon Muat/Bongkar', ready: true },
      { label: 'TILA/Gatepass', ready: true },
    ],
    activityLogs: [
      '14 Jul 2026 11:00 - Finance input nomor invoice',
      '14 Jul 2026 16:30 - Pembayaran diterima dan ditandai lunas',
    ],
    invoiceNumber: 'INV-202607-008',
    invoiceStatus: 'Lunas',
    paymentStatus: 'Lunas',
  },
  {
    id: 'inv-004',
    soNumber: 'SO-202607-011',
    customer: 'PT Global Makmur',
    destination: 'Bandung',
    completedAt: '13 Jul 2026',
    documentStatus: 'Siap Ditagihkan',
    billingAmount: 2850000,
    paymentTerms: 'Credit 30 Hari',
    invoiceDate: '-',
    dueDate: '-',
    billingItems: ['Jasa Angkut D20 - 1 ritase', 'Jasa Angkut D40 - 1 ritase'],
    documentChecklist: [
      { label: 'Nomor SO', ready: true },
      { label: 'Job selesai', ready: true },
      { label: 'Surat Jalan', ready: true },
      { label: 'Bon Muat/Bongkar', ready: true },
      { label: 'TILA/Gatepass', ready: true },
    ],
    activityLogs: [
      '13 Jul 2026 18:10 - Semua container selesai',
      '13 Jul 2026 19:00 - Dokumen siap invoice',
    ],
    invoiceNumber: '',
    invoiceStatus: 'Butuh Nomor Invoice',
    paymentStatus: '-',
  },
];

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

function getMonthDateRange(value) {
  const normalizedValue = normalizeMonthFilterValue(value);
  const match = normalizedValue.match(/^(\d{4})-(\d{2})$/);
  if (!match) return { dateFrom: '', dateTo: '' };

  const [, yearText, monthText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const lastDay = new Date(year, month, 0).getDate();

  return {
    dateFrom: `${yearText}-${monthText}-01`,
    dateTo: `${yearText}-${monthText}-${String(lastDay).padStart(2, '0')}`,
  };
}

function normalizeMonthFilterValue(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return '';

  const [, yearText, monthText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  if (year < MONTH_FILTER_MIN_YEAR || year > MONTH_FILTER_MAX_YEAR || month < 1 || month > 12) return '';
  return `${yearText}-${monthText}`;
}

function normalizeMonthFilterYear(value) {
  const yearText = String(value || '').trim();
  if (!/^\d{4}$/.test(yearText)) return '';

  const year = Number(yearText);
  if (year < MONTH_FILTER_MIN_YEAR || year > MONTH_FILTER_MAX_YEAR) return '';
  return yearText;
}

function getMonthFilterParts(value) {
  const normalizedValue = normalizeMonthFilterValue(value);
  if (!normalizedValue) return { month: '', year: '' };

  const [year, month] = normalizedValue.split('-');
  return { month, year };
}

function MonthFilterControl({
  className = '',
  label,
  monthAriaLabel,
  onChange,
  value,
  yearAriaLabel,
}) {
  const { month, year } = getMonthFilterParts(value);
  const [draftYear, setDraftYear] = useState(year || DEFAULT_MONTH_FILTER_YEAR);
  const visibleYear = year || draftYear || DEFAULT_MONTH_FILTER_YEAR;

  useEffect(() => {
    if (year) setDraftYear(year);
  }, [year]);

  const handleMonthChange = (event) => {
    const nextMonth = event.target.value;
    if (!nextMonth) {
      onChange('');
      return;
    }

    const normalizedYear = normalizeMonthFilterYear(visibleYear) || DEFAULT_MONTH_FILTER_YEAR;
    onChange(`${normalizedYear}-${nextMonth}`);
  };

  const handleYearChange = (event) => {
    const nextYear = event.target.value;
    const normalizedYear = normalizeMonthFilterYear(nextYear);
    setDraftYear(normalizedYear || DEFAULT_MONTH_FILTER_YEAR);

    if (!month) return;
    if (!normalizedYear) {
      onChange('');
      return;
    }

    onChange(`${normalizedYear}-${month}`);
  };

  return (
    <label className={`grid min-w-[230px] max-w-full flex-1 gap-1 text-[10px] font-black uppercase text-slate-500 ${className}`}>
      {label}
      <div className="grid grid-cols-[minmax(128px,1fr)_82px] gap-1">
        <select
          aria-label={monthAriaLabel}
          className="h-9 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold normal-case text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
          onChange={handleMonthChange}
          value={month}
        >
          <option value="">Semua bulan</option>
          {MONTH_FILTER_OPTIONS.map(([optionValue, optionLabel]) => (
            <option key={optionValue} value={optionValue}>{optionLabel}</option>
          ))}
        </select>
        <input
          aria-label={yearAriaLabel}
          className="h-9 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold normal-case text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
          max={MONTH_FILTER_MAX_YEAR}
          min={MONTH_FILTER_MIN_YEAR}
          onChange={handleYearChange}
          type="number"
          value={visibleYear}
        />
      </div>
    </label>
  );
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

function normalizeRpujStatus(row = {}) {
  if (row.rpujStatus) return row.rpujStatus;
  if (row.status === 'Menunggu Approval Finance') return 'submitted';
  if (row.status === 'Disetujui Finance') return 'approved';
  if (['Bukti Transfer Diupload', 'SPK Terbit'].includes(row.status)) return 'paid';
  if (row.status === 'Ditolak Finance') return 'rejected';
  return 'pending';
}

function normalizeFinanceRpujRow(row = {}) {
  const rpujStatus = normalizeRpujStatus(row);
  const containerParts = String(row.container || '').split('/').map((value) => value.trim()).filter(Boolean);
  const totalUj = Number(row.totalUj || 0);
  const additionalCost = Number(row.additionalCost || 0);
  const driverCommissionAmount = Number(row.driverCommissionAmount || 0);
  return {
    id: row.id,
    soNumber: row.soNumber || '-',
    jobNumber: row.jobNumber || '-',
    containerNumber: row.containerNumber || (containerParts.length > 1 ? containerParts.at(-1) : ''),
    containerSize: row.containerSize || containerParts[0] || '',
    customer: row.customer || '-',
    destination: row.destination || '-',
    driver: row.driver || '-',
    driverBankAccount: row.driverBankAccount || '-',
    truck: row.truck || '-',
    orderType: row.orderType || '-',
    container: row.container || '-',
    departureDate: formatDisplayDate(row.departureDate),
    terminal: row.terminal || '-',
    depo: row.depo || '-',
    spkNumber: row.spkNumber || '',
    ujRecommendation: row.ujRecommendation || '-',
    notes: row.notes || '-',
    totalUj,
    additionalCost,
    hasDriverCommission: Boolean(row.hasDriverCommission || driverCommissionAmount > 0),
    driverCommissionAmount,
    driverCommissionSourceDestinationId: row.driverCommissionSourceDestinationId || '',
    driverCommissionNote: row.driverCommissionNote || '',
    totalRequest: Number(row.totalRequest ?? (totalUj + additionalCost)),
    status: row.status || 'Belum Diajukan',
    rpujStatus,
    requestedBy: row.requestedBy || '',
    requestedAt: row.requestedAt || '',
    reviewedBy: row.reviewedBy || '',
    reviewedAt: row.reviewedAt || '',
    rejectionNote: row.rejectionNote || '',
    transferProof: row.transferProof || row.transferProofFile?.name || '',
    transferProofFile: row.transferProofFile || null,
    jobStatus: row.jobStatus || '',
    repoLocation: row.repoLocation || '',
    repoStoredAt: row.repoStoredAt || '',
    repoReason: row.repoReason || '',
    repoNotes: row.repoNotes || '',
    repoContainerCondition: row.repoContainerCondition || '',
    repoCreatedByName: row.repoCreatedByName || '',
    repoPickedUpAt: row.repoPickedUpAt || '',
    repoPickedUpByName: row.repoPickedUpByName || '',
  };
}

function normalizeFinanceInvoiceRow(row = {}) {
  return {
    id: row.id,
    soNumber: row.soNumber || '-',
    customer: row.customer || '-',
    destination: row.destination || '-',
    completedAt: formatDisplayDate(row.completedAt),
    documentStatus: row.documentStatus || '-',
    billingAmount: Number(row.billingAmount || 0),
    plannedJobsCount: Number(row.plannedJobsCount || 0),
    billedJobsCount: Number(row.billedJobsCount || 0),
    cancelledJobsCount: Number(row.cancelledJobsCount || 0),
    repoStoredJobsCount: Number(row.repoStoredJobsCount || 0),
    cancellationNote: row.cancellationNote || '',
    repoStoredNote: row.repoStoredNote || '',
    paymentTerms: row.paymentTerms || '-',
    invoiceDate: formatDisplayDate(row.invoiceDate),
    dueDate: formatDisplayDate(row.dueDate),
    billingItems: Array.isArray(row.billingItems) && row.billingItems.length ? row.billingItems : ['Rincian tagihan belum tersedia'],
    documentChecklist: Array.isArray(row.documentChecklist) ? row.documentChecklist : [],
    documents: Array.isArray(row.documents) ? row.documents : [],
    invoiceDocumentStatus: row.invoiceDocumentStatus || 'belum_upload',
    invoiceDocumentStatusLabel: row.invoiceDocumentStatusLabel || 'Belum Upload',
    invoiceDocumentUploadedAt: row.invoiceDocumentUploadedAt || '',
    invoiceDocumentUploadedBy: row.invoiceDocumentUploadedBy || '',
    taxInvoiceDocumentUploadedAt: row.taxInvoiceDocumentUploadedAt || '',
    taxInvoiceDocumentUploadedBy: row.taxInvoiceDocumentUploadedBy || '',
    invoiceDocumentSentAt: row.invoiceDocumentSentAt || '',
    invoiceDocumentSentBy: row.invoiceDocumentSentBy || '',
    invoiceDocumentDeliveryMethod: row.invoiceDocumentDeliveryMethod || '',
    invoiceDocumentDeliveryNotes: row.invoiceDocumentDeliveryNotes || '',
    invoiceAging: row.invoiceAging || {
      currentStage: '-',
      currentDays: null,
      completionToInvoiceDays: null,
      invoiceToDocumentsDays: null,
      documentsToSentDays: null,
      sentToPaidDays: null,
    },
    activityLogs: Array.isArray(row.activityLogs) ? row.activityLogs.map((log) => {
      const [timestamp, ...rest] = String(log).split(' - ');
      return `${formatDisplayDate(timestamp)} - ${rest.join(' - ') || timestamp}`;
    }) : [],
    invoiceNumber: row.invoiceNumber || '',
    invoiceStatus: row.invoiceStatus || (row.invoiceNumber ? 'Menunggu Update Status' : 'Butuh Nomor Invoice'),
    paymentStatus: row.paymentStatus || '-',
    billingStatus: row.billingStatus || 'belum_invoice',
  };
}

function normalizeFinanceCorrection(row = {}) {
  return {
    id: row.id,
    salesOrderId: row.salesOrderId || row.sales_order_id || '',
    correctionType: row.correctionType || row.correction_type || '',
    currentValue: row.currentValue || row.current_value || '-',
    requestedValue: row.requestedValue || row.requested_value || '-',
    reason: row.reason || '-',
    status: row.status || 'pending',
    requiresAdminApproval: Boolean(row.requiresAdminApproval ?? row.requires_admin_approval),
    requestedByName: row.requestedByName || row.requested_by_name || '-',
    requestedAt: formatDisplayDate(row.requestedAt || row.requested_at),
    reviewedByName: row.reviewedByName || row.reviewed_by_name || '',
    reviewedAt: formatDisplayDate(row.reviewedAt || row.reviewed_at),
    reviewNote: row.reviewNote || row.review_note || '',
  };
}

function correctionStatusLabel(status) {
  const labels = {
    pending: 'Menunggu Admin',
    applied: 'Sudah Diterapkan',
    approved: 'Disetujui',
    rejected: 'Ditolak',
  };
  return labels[status] || status || '-';
}

function formatAgingDays(days) {
  if (days === null || days === undefined || days === '') return '-';
  return `${Number(days || 0)} hari`;
}

function agingToneClass(days) {
  if (days === null || days === undefined || days === '') return 'border-slate-200 bg-slate-50 text-slate-500';
  const value = Number(days || 0);
  if (value >= 7) return 'border-red-200 bg-red-50 text-red-700';
  if (value >= 3) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

const defaultInvoiceSummary = {
  needNumber: 0,
  inProgress: 0,
  paid: 0,
  missingInvoiceDocuments: 0,
  missingInvoiceDocument: 0,
  missingTaxInvoiceDocument: 0,
  completeInvoiceDocuments: 0,
  sentInvoiceDocuments: 0,
};

const defaultRpujSummary = {
  submitted: 0,
  approved: 0,
  paid: 0,
  rejected: 0,
};

function rpujStatusParam(tabId) {
  if (tabId === 'ready-transfer') return 'approved';
  if (tabId === 'paid') return 'paid';
  return 'submitted';
}

function normalizeRpujSummary(summary = {}) {
  return {
    submitted: Number(summary.submitted || 0),
    approved: Number(summary.approved || 0),
    paid: Number(summary.paid || 0),
    rejected: Number(summary.rejected || 0),
  };
}

function summarizeRpujRows(rows = []) {
  return rows.reduce((summary, row) => {
    if (Object.prototype.hasOwnProperty.call(summary, row.rpujStatus)) {
      summary[row.rpujStatus] += 1;
    }
    return summary;
  }, { ...defaultRpujSummary });
}

function applyRpujSummaryTransition(summary, previousStatus, nextStatus) {
  const nextSummary = normalizeRpujSummary(summary);
  if (previousStatus && Object.prototype.hasOwnProperty.call(nextSummary, previousStatus)) {
    nextSummary[previousStatus] = Math.max(0, nextSummary[previousStatus] - 1);
  }
  if (nextStatus && Object.prototype.hasOwnProperty.call(nextSummary, nextStatus)) {
    nextSummary[nextStatus] += 1;
  }
  return nextSummary;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function calculateRpujTotal(row = {}) {
  const fallbackTotal = Number(row.totalUj || 0) + Number(row.additionalCost || 0);
  return Number(row.totalRequest ?? fallbackTotal);
}

function statusClass(value) {
  if (String(value).includes('Lunas')) return 'border-slate-200 bg-slate-100 text-slate-700';
  if (String(value).includes('Menunggu')) return 'border-slate-200 bg-slate-50 text-slate-600';
  if (String(value).includes('Batal')) return 'border-red-200 bg-red-50 text-red-700';
  if (String(value).includes('Ditolak') || String(value).includes('Revisi') || String(value).includes('Belum') || String(value).includes('Butuh')) return 'border-slate-200 bg-white text-slate-600';
  if (String(value).includes('Terbit') || String(value).includes('Disetujui') || String(value).includes('Diupload') || String(value).includes('Siap')) return 'border-slate-200 bg-white text-slate-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function StatusPill({ value, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${statusClass(value)} ${className}`}>
      <span className="h-1 w-1 rounded-full bg-current opacity-45" aria-hidden="true" />
      {value || '-'}
    </span>
  );
}

function compactRpujStatus(value) {
  if (String(value).includes('Menunggu')) return 'Menunggu';
  if (String(value).includes('Disetujui')) return 'Disetujui';
  if (String(value).includes('Diupload')) return 'Transfer Upload';
  if (String(value).includes('Ditolak')) return 'Ditolak';
  return value;
}

function StatusFlow({ items }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, index) => (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600" key={item}>
          <span className="grid h-4 w-4 place-items-center rounded bg-slate-100 text-[9px] text-slate-500">{index + 1}</span>
          {item}
        </span>
      ))}
    </div>
  );
}

function SearchBar({ query, onChange }) {
  return (
    <label className="flex h-8 items-center rounded-lg border border-slate-300 bg-white px-2.5 focus-within:border-slate-400">
      <Search className="mr-2 text-slate-400" size={14} />
      <input
        className="w-full border-0 bg-transparent text-xs font-medium text-slate-900 outline-none placeholder:text-slate-400"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Cari No. SO, sales, customer, tujuan..."
        value={query}
      />
    </label>
  );
}

function DetailField({ label, value, className = '' }) {
  return (
    <div className={`rounded-md border border-slate-200 bg-white px-2.5 py-2 ${className}`}>
      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <strong className="mt-0.5 block text-sm font-semibold text-slate-900">{value || '-'}</strong>
    </div>
  );
}

function AmountField({ label, value, highlight = false, className = '' }) {
  return (
    <div className={`rounded-md border px-2.5 py-2 ${highlight ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-slate-200 bg-white text-slate-950'} ${className}`}>
      <span className={`block text-[10px] font-bold uppercase tracking-wide ${highlight ? 'text-emerald-700' : 'text-slate-500'}`}>{label}</span>
      <strong className="mt-0.5 block text-sm font-black">{formatCurrency(value)}</strong>
    </div>
  );
}

function CompactList({ items }) {
  return (
    <div className="grid gap-1">
      {items.map((item) => (
        <div className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5" key={item.label || item}>
          <span className="text-xs font-semibold text-slate-700">{item.label || item}</span>
          {typeof item.ready === 'boolean' ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${item.ready ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {item.ready ? 'Ada' : 'Belum'}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ActivityLogList({ logs }) {
  return (
    <div className="grid gap-1">
      {logs.map((log) => (
        <div className="rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600" key={log}>{log}</div>
      ))}
    </div>
  );
}

function FinanceActionModal({ children, title, description, tone = 'neutral', busy, confirmDisabled = false, confirmLabel, onClose, onConfirm }) {
  const toneClasses = tone === 'approve'
    ? 'bg-emerald-600 hover:bg-emerald-700'
    : tone === 'reject'
      ? 'bg-rose-600 hover:bg-rose-700'
      : tone === 'upload'
        ? 'bg-amber-600 hover:bg-amber-700'
      : 'bg-slate-900 hover:bg-slate-800';

  return (
    <div className="finance-action-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={busy ? undefined : onClose}>
      <section className="finance-action-modal w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="finance-action-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <form onSubmit={onConfirm}>
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-base font-black text-slate-950" id="finance-action-modal-title">{title}</h2>
              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{description}</p>
            </div>
            <button aria-label="Tutup modal" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40" disabled={busy} onClick={onClose} type="button">
              <X size={16} />
            </button>
          </header>
          <div className="grid gap-4 px-5 py-4">{children}</div>
          <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
            <button className="h-9 rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={busy} onClick={onClose} type="button">Batal</button>
            <button className={`h-9 rounded-lg px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 ${toneClasses}`} disabled={busy || confirmDisabled} type="submit">
              {busy ? 'Memproses...' : confirmLabel}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function SoNumberInputModal({ order, value, error, busy, onChange, onClose, onConfirm }) {
  if (!order) return null;
  return (
    <FinanceActionModal
      busy={busy}
      confirmLabel="Simpan Nomor SO"
      description="Masukkan nomor Sales Order resmi yang sudah dibuat di Accurate."
      onClose={onClose}
      onConfirm={onConfirm}
      title="Input Nomor SO Accurate"
    >
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div><span className="block text-[10px] font-bold uppercase text-slate-400">Customer</span><strong className="mt-0.5 block text-xs text-slate-900">{order.customer || '-'}</strong></div>
        <div><span className="block text-[10px] font-bold uppercase text-slate-400">Tujuan</span><strong className="mt-0.5 block text-xs text-slate-900">{order.destination || '-'}</strong></div>
        <div><span className="block text-[10px] font-bold uppercase text-slate-400">Sales</span><strong className="mt-0.5 block text-xs text-slate-900">{order.salesName || '-'}</strong></div>
        <div><span className="block text-[10px] font-bold uppercase text-slate-400">Tanggal Jalan</span><strong className="mt-0.5 block text-xs text-slate-900">{order.runningDate || '-'}</strong></div>
      </div>
      <label className="grid gap-1.5 text-xs font-bold text-slate-700">
        Nomor SO Accurate
        <input
          autoFocus
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-bold uppercase text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
          maxLength={80}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Contoh: SO-202607-019"
          value={value}
        />
      </label>
      {error ? <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
    </FinanceActionModal>
  );
}

function RpujDecisionModal({ decision, row, note, error, busy, onNoteChange, onClose, onConfirm }) {
  if (!decision || !row) return null;
  const isReject = decision === 'reject';
  const totalRequest = calculateRpujTotal(row);

  return (
    <FinanceActionModal
      busy={busy}
      confirmLabel={isReject ? 'Ya, Reject RPUJ' : 'Ya, Approve RPUJ'}
      description={isReject ? 'RPUJ akan dikembalikan ke Operational untuk diperbaiki.' : 'Pastikan nominal, driver, dan rekening tujuan sudah sesuai.'}
      onClose={onClose}
      onConfirm={onConfirm}
      title={isReject ? 'Validasi Reject RPUJ' : 'Validasi Approval RPUJ'}
      tone={isReject ? 'reject' : 'approve'}
    >
      <div className={`flex gap-3 rounded-lg border p-3 ${isReject ? 'border-rose-100 bg-rose-50' : 'border-emerald-100 bg-emerald-50'}`}>
        {isReject ? <AlertTriangle className="mt-0.5 shrink-0 text-rose-600" size={18} /> : <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} />}
        <div className="min-w-0">
          <strong className="block text-sm text-slate-950">{row.soNumber} / {row.jobNumber}</strong>
          <span className="mt-0.5 block text-xs font-medium text-slate-600">{row.customer} - {row.destination}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DetailField label="Driver" value={row.driver} />
        <DetailField label="Rekening Tujuan" value={row.driverBankAccount} />
        <DetailField label="Truck" value={row.truck} />
        <AmountField highlight label="Total Pengajuan" value={totalRequest} />
      </div>
      {isReject ? (
        <label className="grid gap-1.5 text-xs font-bold text-slate-700">
          Catatan Reject <span className="font-semibold text-rose-600">Wajib diisi</span>
          <textarea
            autoFocus
            className="min-h-24 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
            maxLength={500}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Jelaskan bagian yang harus diperbaiki oleh Operational..."
            value={note}
          />
          <small className="justify-self-end font-medium text-slate-400">{note.length}/500</small>
        </label>
      ) : null}
      {error ? <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
    </FinanceActionModal>
  );
}

function RpujTransferUploadModal({ row, file, error, busy, onFileChange, onClose, onConfirm }) {
  if (!row) return null;
  const totalRequest = calculateRpujTotal(row);
  const fileSize = file ? `${(file.size / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 })} KB` : '';

  return (
    <FinanceActionModal
      busy={busy}
      confirmDisabled={!file}
      confirmLabel="Konfirmasi & Upload"
      description="Periksa kembali tujuan transfer dan file sebelum bukti dikirim."
      onClose={onClose}
      onConfirm={onConfirm}
      title="Validasi Bukti Transfer UJ"
      tone="upload"
    >
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <div className="flex gap-2.5">
          <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={18} />
          <div>
            <strong className="block text-xs text-amber-900">Pastikan file sesuai dengan transfer untuk job ini.</strong>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-amber-800">Setelah dikonfirmasi, status berubah menjadi UJ Dikirim dan data biaya serta assignment Operational akan terkunci.</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DetailField label="Nomor SO / Job" value={`${row.soNumber} / ${row.jobNumber}`} />
        <AmountField highlight label="Total Transfer" value={totalRequest} />
        <DetailField label="Driver" value={row.driver} />
        <DetailField label="Rekening Tujuan" value={row.driverBankAccount} />
        <DetailField label="Truck" value={row.truck} />
        <DetailField label="Container" value={row.container} />
      </div>
      <div className="grid gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <strong className="block text-xs text-slate-900">File Bukti Transfer</strong>
            <span className="mt-0.5 block text-[10px] font-medium text-slate-500">PDF maks. 5 MB, JPG/PNG maks. 10 MB.</span>
          </div>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[11px] font-bold text-slate-700 hover:bg-slate-100">
            <Upload size={13} /> {file ? 'Ganti File' : 'Pilih File'}
            <input
              accept=".pdf,.jpg,.jpeg,.png"
              aria-label="File bukti transfer UJ"
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                const selectedFile = event.target.files?.[0] || null;
                event.target.value = '';
                onFileChange(selectedFile);
              }}
              type="file"
            />
          </label>
        </div>
        {file ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2">
            <div className="min-w-0">
              <strong className="block truncate text-xs text-emerald-900">{file.name}</strong>
              <span className="mt-0.5 block text-[10px] font-semibold text-emerald-700">{fileSize} - Siap dikonfirmasi</span>
            </div>
            <CheckCircle2 className="shrink-0 text-emerald-600" size={17} />
          </div>
        ) : null}
      </div>
      {error ? <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
    </FinanceActionModal>
  );
}

function InvoiceNumberConfirmModal({ row, error, busy, onClose, onConfirm }) {
  if (!row) return null;
  const invoiceNumber = String(row.invoiceNumber || '').trim().toUpperCase();

  return (
    <FinanceActionModal
      busy={busy}
      confirmLabel="Ya, Kirim Nomor Invoice"
      description="Cek lagi nomor invoice sebelum dikirim. Setelah dikonfirmasi, status akan lanjut menunggu update dari Sales."
      onClose={onClose}
      onConfirm={onConfirm}
      title="Validasi Nomor Invoice"
      tone="upload"
    >
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <div className="flex gap-2.5">
          <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={18} />
          <div>
            <strong className="block text-xs text-amber-900">Pastikan nomor invoice sudah sama dengan dokumen invoice.</strong>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-amber-800">Jika nomor salah, Sales akan menerima informasi invoice yang keliru.</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DetailField label="Nomor SO" value={row.soNumber} />
        <DetailField label="Customer" value={row.customer} />
        <DetailField label="Tujuan" value={row.destination} />
        <DetailField label="Nomor Invoice" value={invoiceNumber} />
      </div>
      {error ? <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
    </FinanceActionModal>
  );
}

function CorrectionHistoryList({ corrections = [], loading = false, error = '' }) {
  if (loading) return <p className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">Memuat riwayat koreksi...</p>;
  if (error) return <p className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>;
  if (!corrections.length) return <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-400">Belum ada riwayat koreksi.</p>;

  return (
    <div className="grid gap-1.5">
      {corrections.map((item) => (
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2" key={item.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-xs text-slate-950">{item.currentValue || '-'} {'>'} {item.requestedValue || '-'}</strong>
            <StatusPill value={correctionStatusLabel(item.status)} />
          </div>
          <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-600">{item.reason}</p>
          <p className="mt-1 text-[10px] font-semibold text-slate-400">
            {item.requestedByName} - {item.requestedAt}
            {item.reviewedByName ? ` | ${item.reviewedByName} - ${item.reviewedAt}` : ''}
          </p>
          {item.reviewNote ? <p className="mt-1 text-[10px] font-semibold text-slate-500">Catatan Admin: {item.reviewNote}</p> : null}
        </div>
      ))}
    </div>
  );
}

function FinanceCorrectionModal({ context, value, reason, error, busy, onValueChange, onReasonChange, onClose, onConfirm }) {
  if (!context) return null;
  const isInvoice = context.type === 'invoice_number';
  const currentValue = isInvoice ? context.invoiceNumber : context.soNumber;
  const targetLabel = isInvoice ? 'Nomor Invoice Baru' : 'Nomor SO Baru';

  return (
    <FinanceActionModal
      busy={busy}
      confirmLabel="Ajukan Koreksi"
      description={isInvoice ? 'Nomor invoice resmi akan masuk approval Admin.' : 'Jika order sudah sensitif, koreksi nomor SO akan masuk approval Admin.'}
      onClose={onClose}
      onConfirm={onConfirm}
      title={isInvoice ? 'Koreksi Nomor Invoice' : 'Koreksi Nomor SO'}
      tone="upload"
    >
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <div className="flex gap-2.5">
          <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={18} />
          <div>
            <strong className="block text-xs text-amber-900">Koreksi harus punya alasan yang jelas.</strong>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-amber-800">Nomor lama, nomor baru, user, waktu, dan alasan akan masuk riwayat koreksi.</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DetailField label="Nomor SO" value={context.soNumber} />
        <DetailField label="Customer" value={context.customer} />
        <DetailField label={isInvoice ? 'Invoice Saat Ini' : 'SO Saat Ini'} value={currentValue || '-'} />
        <DetailField label="Tujuan" value={context.destination} />
      </div>
      <label className="grid gap-1.5 text-xs font-bold text-slate-700">
        {targetLabel}
        <input
          autoFocus
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-bold uppercase text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
          maxLength={80}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={isInvoice ? 'Contoh: INV-202607-001' : 'Contoh: SO-202607-019'}
          value={value}
        />
      </label>
      <label className="grid gap-1.5 text-xs font-bold text-slate-700">
        Alasan Koreksi <span className="font-semibold text-rose-600">Wajib diisi</span>
        <textarea
          className="min-h-24 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
          maxLength={500}
          onChange={(event) => onReasonChange(event.target.value)}
          placeholder="Jelaskan kenapa nomor perlu dikoreksi..."
          value={reason}
        />
        <small className="justify-self-end font-medium text-slate-400">{reason.length}/500</small>
      </label>
      {error ? <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
    </FinanceActionModal>
  );
}

function OrderDetailModal({ order, corrections = [], correctionsLoading = false, correctionsError = '', onClose, onOpenCorrection }) {
  if (!order) return null;

  const isCancelled = isCancelledFinanceOrder(order);
  const priceItems = Array.isArray(order.lineItems) ? order.lineItems.filter((item) => item.serviceName || item.price || item.total) : [];
  const priceTotal = Number(order.totalAmount || priceItems.reduce((sum, item) => sum + Number(item.total || 0), 0) || order.price || 0);

  return (
    <div className="finance-order-detail-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" role="presentation" onMouseDown={onClose}>
      <section className="finance-order-detail-modal max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Detail Request Order</p>
            <h3 className="mt-0.5 text-lg font-black text-slate-950">{order.customer}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{order.destination} - {order.salesName} - {order.orderDate}</p>
          </div>
          <button className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50" onClick={onClose} type="button">
            Tutup
          </button>
        </header>

        <div className="max-h-[calc(90vh-68px)] overflow-y-auto p-4">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <DetailField label="Nama Sales" value={order.salesName} />
            <DetailField label="Order Dibuat" value={order.orderDate} />
            <DetailField label="Tanggal Jalan" value={order.runningDate} />
            <DetailField label="Payment Terms" value={order.paymentTerms} />
            <DetailField label="PIC Customer" value={order.customerPic} />
            <DetailField label="Kontak" value={order.customerPhone} />
            <DetailField label="Tujuan" value={order.destination} />
            <DetailField label="Container" value={order.container} />
            <DetailField label="Nama Kapal" value={order.vesselName} />
            <DetailField label="Terminal" value={order.terminal} />
            <DetailField label="Depo" value={order.depo} />
            <DetailField label="Dokumen Awal" value={order.document} />
            <DetailField label="Status SO" value={order.status} />
          </div>

          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Detail Harga</p>
                <h4 className="mt-1 text-lg font-black text-slate-950">{formatCurrency(priceTotal)}</h4>
              </div>
              <div className="grid min-w-[180px] gap-1 text-right">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Harga Dasar</span>
                <strong className="text-sm font-black text-slate-900">{formatCurrency(order.price)}</strong>
              </div>
            </div>
            {priceItems.length ? (
              <div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-[10px] font-black uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Layanan</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Harga</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceItems.map((item, index) => (
                      <tr className="border-t border-slate-100" key={`${item.serviceName}-${index}`}>
                        <td className="px-3 py-2 font-semibold text-slate-900">
                          <span className="block break-words">{item.serviceName || '-'}</span>
                          {item.containerType ? <span className="mt-0.5 block text-[10px] font-semibold text-slate-500">{item.containerType}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-700">{item.qty || '-'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatCurrency(item.price)}</td>
                        <td className="px-3 py-2 text-right font-black text-slate-950">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-xs font-semibold text-slate-500">Rincian harga belum tersedia.</p>
            )}
          </div>

          <div className="mt-2 grid gap-2 xl:grid-cols-[1fr_240px]">
            <DetailField label="Catatan Order" value={order.notes} />
            <div className="grid gap-2">
              <DetailField label="Nomor SO Internal" value={order.internalSoNumber || '-'} />
              <DetailField label="Nomor SO Accurate" value={order.soNumber || '-'} />
            </div>
          </div>
          {!isCancelled && order.soNumber ? (
            <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-black text-slate-950">Koreksi Nomor SO</h4>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">Gunakan alur koreksi jika nomor SO sudah pernah diinput.</p>
                </div>
                <button className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800" onClick={() => onOpenCorrection(order, 'so_number')} type="button">
                  Ajukan Koreksi
                </button>
              </div>
              <div className="mt-2">
                <CorrectionHistoryList corrections={corrections} error={correctionsError} loading={correctionsLoading} />
              </div>
            </div>
          ) : null}
          {isCancelled ? (
            <div className="mt-2 grid gap-2 xl:grid-cols-[1fr_240px_240px]">
              <DetailField label="Alasan Batal" value={order.cancelReason || '-'} />
              <DetailField label="Dibatalkan Oleh" value={order.cancelledByName || '-'} />
              <DetailField label="Tanggal Batal" value={order.cancelledAt || '-'} />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function RpujDetailModal({ rpuj, onClose }) {
  if (!rpuj) return null;

  const totalRequest = calculateRpujTotal(rpuj);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" role="presentation" onMouseDown={onClose}>
      <section className="finance-rpuj-detail-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="finance-rpuj-detail-header">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Detail Pengajuan RPUJ / SPK</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-black text-slate-950">{rpuj.soNumber}</h3>
              <StatusPill value={compactRpujStatus(rpuj.status)} />
            </div>
            <p className="mt-1 text-sm font-bold text-slate-700">{rpuj.customer}</p>
          </div>
          <button className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50" onClick={onClose} type="button">
            Tutup
          </button>
        </header>

        <div className="finance-rpuj-detail-body">
          <section className="finance-rpuj-detail-card">
            <div className="finance-rpuj-card-title">
              <div>
                <span>Informasi Utama</span>
                <h4>Perjalanan & Container</h4>
              </div>
              <small>Informasi yang perlu diperiksa sebelum memproses RPUJ.</small>
            </div>
            <div className="finance-rpuj-focus-grid">
              <div className="finance-rpuj-focus-field is-destination">
                <span>Tujuan</span>
                <strong>{rpuj.destination || '-'}</strong>
                <small>Dari {rpuj.depo || '-'}</small>
              </div>
              <div className="finance-rpuj-focus-field is-container">
                <span>Nomor Container</span>
                <strong>{rpuj.containerNumber || 'Belum diisi'}</strong>
                <small>{rpuj.containerSize || 'Ukuran belum tersedia'}</small>
              </div>
              <div className="finance-rpuj-focus-field is-date">
                <span>Tanggal Jalan</span>
                <strong>{rpuj.departureDate || '-'}</strong>
                <small>{rpuj.orderType || 'Jenis order belum tersedia'}</small>
              </div>
            </div>

            <div className="finance-rpuj-subsection-head">
              <h4>Assignment & Pembayaran Driver</h4>
              <span>Pastikan driver dan rekening tujuan sudah benar.</span>
            </div>
            <div className="finance-rpuj-assignment-grid">
              <DetailField className="finance-rpuj-detail-field" label="Truck" value={rpuj.truck} />
              <DetailField className="finance-rpuj-detail-field" label="Driver" value={rpuj.driver} />
              <DetailField className="finance-rpuj-detail-field span-2 is-account" label="Rekening / E-Money Driver" value={rpuj.driverBankAccount} />
            </div>

            <div className="finance-rpuj-support-grid">
              <DetailField className="finance-rpuj-detail-field" label="Nomor SPK" value={rpuj.spkNumber} />
              <DetailField className="finance-rpuj-detail-field" label="Jenis Order" value={rpuj.orderType} />
              <DetailField className="finance-rpuj-detail-field" label="Terminal" value={rpuj.terminal} />
              <DetailField className="finance-rpuj-detail-field" label="Depo / Asal" value={rpuj.depo} />
            </div>
            {rpuj.jobStatus === 'repo_stored' || rpuj.repoLocation || rpuj.repoStoredAt ? (
              <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-blue-700">Container Titip</span>
                <strong className="mt-1 block text-xs font-semibold leading-relaxed text-blue-950">{rpuj.repoLocation || 'Lokasi repo belum diisi'}</strong>
                <small className="mt-1 block text-[11px] font-medium leading-relaxed text-blue-800">
                  {rpuj.repoReason || 'Alasan titip belum diisi'}{rpuj.repoContainerCondition ? ` - ${rpuj.repoContainerCondition === 'loaded' ? 'Isi' : 'Kosong'}` : ''}{rpuj.repoStoredAt ? ` - ${formatDisplayDate(rpuj.repoStoredAt)}` : ''}
                  {rpuj.repoPickedUpByName ? ` - Diambil oleh ${rpuj.repoPickedUpByName}` : ''}
                </small>
              </div>
            ) : null}
          </section>

          <section className="finance-rpuj-detail-card is-subtle">
            <div className="finance-rpuj-section-head">
              <h4 className="text-sm font-black text-slate-950">Rincian Pengajuan</h4>
              <div>
                {rpuj.transferProofFile ? (
                  <div className="flex items-center gap-1.5">
                    <DocumentLink
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50"
                      file={rpuj.transferProofFile}
                      label="View"
                    />
                    <DocumentLink
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100"
                      download
                      file={rpuj.transferProofFile}
                      label="Download"
                    />
                  </div>
                ) : (
                  <span>Bukti transfer belum ada</span>
                )}
              </div>
            </div>
            <div className="finance-rpuj-amount-grid">
              <AmountField className="finance-rpuj-amount-field" label="Total UJ" value={rpuj.totalUj} />
              <AmountField className="finance-rpuj-amount-field" label="Biaya Tambahan" value={rpuj.additionalCost} />
              <AmountField className="finance-rpuj-amount-field" label="Komisi Sopir" value={rpuj.driverCommissionAmount} />
              <AmountField className="finance-rpuj-amount-field" highlight label="Total Pengajuan" value={totalRequest} />
            </div>
            <div className="finance-rpuj-note-grid">
              <DetailField className="finance-rpuj-detail-field" label="Rekomendasi UJ" value={rpuj.ujRecommendation} />
              <DetailField className="finance-rpuj-detail-field" label="Catatan Komisi" value={rpuj.hasDriverCommission ? rpuj.driverCommissionNote || 'Komisi sopir aktif - dibayar mingguan' : 'Tidak ada komisi'} />
              <DetailField className="finance-rpuj-detail-field" label="Catatan Pengajuan" value={rpuj.notes} />
            </div>
            {rpuj.rejectionNote ? (
              <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-rose-600">Catatan Reject Finance</span>
                <strong className="mt-1 block text-xs font-semibold leading-relaxed text-rose-900">{rpuj.rejectionNote}</strong>
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </div>
  );
}

const financeInvoiceUploadSlots = [
  {
    type: 'invoice',
    category: 'invoicePdf',
    label: 'Invoice',
    uploadedAtKey: 'invoiceDocumentUploadedAt',
    uploadedByKey: 'invoiceDocumentUploadedBy',
  },
  {
    type: 'taxInvoice',
    category: 'taxInvoicePdf',
    label: 'Faktur Pajak',
    uploadedAtKey: 'taxInvoiceDocumentUploadedAt',
    uploadedByKey: 'taxInvoiceDocumentUploadedBy',
  },
];

function findInvoiceFinanceDocument(documents, category) {
  return documents.find((document) => (
    document.category === category
    && document.ready !== false
    && Boolean(document.file?.path)
  ));
}

function mapUploadedInvoiceDocument(uploadedDocument, documentType) {
  if (!uploadedDocument) return null;
  const category = uploadedDocument.category || (documentType === 'taxInvoice' ? 'taxInvoicePdf' : 'invoicePdf');
  const label = category === 'taxInvoicePdf' ? 'Faktur Pajak' : 'Invoice';
  return {
    id: uploadedDocument.id || uploadedDocument.path || `${category}-${Date.now()}`,
    category,
    label,
    source: 'Finance',
    ready: true,
    uploadedAt: uploadedDocument.uploadedAt || uploadedDocument.createdAt || '',
    uploadedBy: uploadedDocument.uploadedByName || uploadedDocument.uploadedBy || '',
    file: {
      name: uploadedDocument.fileName || uploadedDocument.fileNameOriginal || uploadedDocument.name || label,
      path: uploadedDocument.path || uploadedDocument.id || uploadedDocument.storagePath || '',
      type: uploadedDocument.mimeType || uploadedDocument.type || 'application/pdf',
      size: Number(uploadedDocument.fileSize ?? uploadedDocument.sizeBytes ?? uploadedDocument.size ?? 0),
    },
  };
}

function mergeInvoiceDocument(documents = [], nextDocument) {
  if (!nextDocument) return documents;
  const withoutSameCategory = documents.filter((document) => document.category !== nextDocument.category);
  return [nextDocument, ...withoutSameCategory];
}

function validateInvoicePdfFile(file, label) {
  return validateArchiveFile(file, {
    label,
    allowedTypes: ['application/pdf'],
    allowedExtensions: ['pdf'],
    allowedLabel: 'PDF',
  });
}

function InvoiceDetailModal({
  invoice,
  loading = false,
  error = '',
  invoiceDocumentBusyKey = '',
  invoiceDocumentUploadError = '',
  corrections = [],
  correctionsLoading = false,
  correctionsError = '',
  onClose,
  onOpenCorrection,
  onUploadInvoiceDocument,
}) {
  const [dragUploadKey, setDragUploadKey] = useState('');
  const [pendingInvoiceFiles, setPendingInvoiceFiles] = useState({});
  const [uploadResultModal, setUploadResultModal] = useState(null);

  useEffect(() => {
    setDragUploadKey('');
    setPendingInvoiceFiles({});
    setUploadResultModal(null);
  }, [invoice?.id]);

  if (!invoice) return null;
  const documents = Array.isArray(invoice.documents) ? invoice.documents : [];
  const supportDocuments = documents.filter((document) => document.source !== 'Finance');
  const availableDocumentCount = supportDocuments.filter((document) => document.ready !== false && document.file?.path).length;
  const pendingUploadSlots = financeInvoiceUploadSlots.filter((slot) => pendingInvoiceFiles[slot.type]);
  const hasPendingInvoiceFiles = pendingUploadSlots.length > 0;
  const isSavingInvoiceDocuments = uploadResultModal?.status === 'loading';
  const documentGroups = Array.from(supportDocuments.reduce((groups, document) => {
    const isSalesDocument = document.source === 'Sales';
    const groupId = isSalesDocument
      ? 'sales-order'
      : `container-${document.jobId || document.containerNumber || document.jobReference || 'unknown'}`;
    const currentGroup = groups.get(groupId) || {
      id: groupId,
      eyebrow: isSalesDocument ? 'Dokumen Sales / SO' : 'Nomor Container',
      title: isSalesDocument
        ? invoice.soNumber
        : document.containerNumber || document.jobReference || 'Nomor belum diisi',
      documents: [],
    };

    currentGroup.documents.push(document);
    groups.set(groupId, currentGroup);
    return groups;
  }, new Map()).values()).map((group) => ({
    ...group,
    readyCount: group.documents.filter((document) => document.ready !== false && document.file?.path).length,
  }));

  function setPendingInvoiceFile(slotType, file) {
    if (!file || isSavingInvoiceDocuments) return;
    setPendingInvoiceFiles((current) => ({ ...current, [slotType]: file }));
  }

  async function savePendingInvoiceDocuments() {
    if (!hasPendingInvoiceFiles || isSavingInvoiceDocuments) return;

    const validationErrors = pendingUploadSlots
      .map((slot) => {
        const message = validateInvoicePdfFile(pendingInvoiceFiles[slot.type], slot.label);
        return message ? `${slot.label}: ${message}` : '';
      })
      .filter(Boolean);

    if (validationErrors.length) {
      setUploadResultModal({
        status: 'error',
        title: 'Dokumen belum bisa disimpan',
        message: 'Periksa kembali file yang dipilih.',
        items: validationErrors,
      });
      return;
    }

    setUploadResultModal({
      status: 'loading',
      title: 'Mengirim dokumen',
      message: 'Invoice dan Faktur Pajak sedang disimpan ke sistem.',
      items: pendingUploadSlots.map((slot) => `${slot.label}: ${pendingInvoiceFiles[slot.type]?.name || 'File dipilih'}`),
    });

    const failedUploads = [];
    const successSlotTypes = [];
    for (const slot of pendingUploadSlots) {
      try {
        await onUploadInvoiceDocument?.(invoice.id, slot.type, pendingInvoiceFiles[slot.type]);
        successSlotTypes.push(slot.type);
      } catch (uploadError) {
        failedUploads.push(`${slot.label}: ${uploadError.message || 'Gagal dikirim.'}`);
      }
    }

    if (failedUploads.length) {
      setPendingInvoiceFiles((current) => {
        const next = { ...current };
        successSlotTypes.forEach((slotType) => {
          delete next[slotType];
        });
        return next;
      });
      setUploadResultModal({
        status: 'error',
        title: 'Sebagian dokumen gagal disimpan',
        message: 'Dokumen yang gagal masih siap dikirim ulang.',
        items: failedUploads,
      });
      return;
    }

    setPendingInvoiceFiles({});
    setUploadResultModal({
      status: 'success',
      title: 'Dokumen berhasil disimpan',
      message: `${pendingUploadSlots.length} dokumen Accurate berhasil tersimpan dan bisa dilihat oleh Sales.`,
      items: pendingUploadSlots.map((slot) => `${slot.label}: ${pendingInvoiceFiles[slot.type]?.name || 'File tersimpan'}`),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" role="presentation" onMouseDown={onClose}>
      <section className="finance-invoice-detail-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="finance-invoice-detail-header">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Detail Dasar Invoice</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-black text-slate-950">{invoice.soNumber}</h3>
              <StatusPill value={invoice.invoiceStatus} />
            </div>
            <p className="mt-0.5 text-xs text-slate-500">{invoice.destination} - {invoice.customer}</p>
          </div>
          <button className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50" onClick={onClose} type="button">
            Tutup
          </button>
        </header>

        <div className="finance-invoice-detail-body">
          {loading ? (
            <div className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700">
              Memuat dokumen Sales dan Operational...
            </div>
          ) : null}
          {error ? (
            <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {error}
            </div>
          ) : null}
          <div className="finance-invoice-detail-layout">
            <section className="finance-invoice-summary-strip">
              <div className="finance-invoice-summary-primary">
                <span>Nilai Tagih</span>
                <strong>{formatCurrency(invoice.billingAmount)}</strong>
              </div>
              {[
                ['Terms', invoice.paymentTerms],
                ['Jatuh Tempo', invoice.dueDate],
                ['Tgl Selesai', invoice.completedAt],
                ['Tgl Invoice', invoice.invoiceDate],
                ['No. Invoice', invoice.invoiceNumber || 'Belum ada'],
                ['Dokumen', invoice.documentStatus],
                ['Lama Pelunasan', `${formatAgingDays(invoice.invoiceAging?.currentDays)} - ${invoice.invoiceAging?.currentStage || '-'}`],
              ].map(([label, value]) => (
                <div className="finance-invoice-summary-item" key={label}>
                  <span>{label}</span>
                  <strong>{value || '-'}</strong>
                </div>
              ))}
            </section>

            <section className="finance-invoice-support-grid">
              <div className="finance-invoice-detail-card">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <h4 className="text-xs font-black text-slate-950">Dokumen Dasar Tagih</h4>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-700">Siap Invoice</span>
                </div>
                <CompactList items={invoice.documentChecklist} />
              </div>
              <div className="finance-invoice-support-stack">
                <div className="finance-invoice-detail-card">
                  <h4 className="mb-1.5 text-xs font-black text-slate-950">Rincian Tagihan</h4>
                  <CompactList items={invoice.billingItems} />
                  {invoice.cancellationNote ? (
                    <div className="mt-2 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-semibold leading-relaxed text-amber-800">
                      <Info className="mt-0.5 shrink-0" size={14} />
                      <span>{invoice.cancellationNote}</span>
                    </div>
                  ) : null}
                  {invoice.repoStoredNote ? (
                    <div className="mt-2 flex gap-2 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs font-semibold leading-relaxed text-blue-800">
                      <Info className="mt-0.5 shrink-0" size={14} />
                      <span>{invoice.repoStoredNote}</span>
                    </div>
                  ) : null}
                </div>
                <div className="finance-invoice-detail-card">
                  <h4 className="mb-1.5 text-xs font-black text-slate-950">Riwayat Finance</h4>
                  <ActivityLogList logs={invoice.activityLogs} />
                </div>
              </div>
            </section>

            <section className="finance-invoice-detail-card">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-black text-slate-950">Dokumen Accurate</h4>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">Upload PDF Invoice dan Faktur Pajak dari Accurate.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill value={invoice.invoiceDocumentStatusLabel} />
                  <button
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-red-600 px-3 text-[10px] font-black text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
                    disabled={!hasPendingInvoiceFiles || isSavingInvoiceDocuments}
                    onClick={savePendingInvoiceDocuments}
                    type="button"
                  >
                    <CheckCircle2 size={13} />
                    {isSavingInvoiceDocuments ? 'Menyimpan...' : 'Simpan Dokumen'}
                  </button>
                </div>
              </div>
              {invoiceDocumentUploadError ? (
                <div className="mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                  {invoiceDocumentUploadError}
                </div>
              ) : null}
              <div className="grid gap-2 md:grid-cols-2">
                {financeInvoiceUploadSlots.map((slot) => {
                  const document = findInvoiceFinanceDocument(documents, slot.category);
                  const busyKey = `${invoice.id}:${slot.type}`;
                  const isBusy = invoiceDocumentBusyKey === busyKey;
                  const pendingFile = pendingInvoiceFiles[slot.type];
                  const uploadedAtValue = invoice[slot.uploadedAtKey];
                  const uploadedAt = uploadedAtValue ? formatDisplayDate(uploadedAtValue) : '';
                  const uploadedBy = invoice[slot.uploadedByKey];
                  const isDragActive = dragUploadKey === busyKey;

                  return (
                    <div
                      className={`rounded-md border bg-white p-2.5 transition ${
                        isDragActive
                          ? 'border-sky-300 bg-sky-50 ring-2 ring-sky-100'
                          : 'border-slate-200'
                      }`}
                      key={slot.type}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        if (!isBusy) setDragUploadKey(busyKey);
                      }}
                      onDragLeave={(event) => {
                        event.preventDefault();
                        if (event.currentTarget.contains(event.relatedTarget)) return;
                        setDragUploadKey((current) => (current === busyKey ? '' : current));
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (event.dataTransfer) event.dataTransfer.dropEffect = isBusy ? 'none' : 'copy';
                      }}
                      onDrop={async (event) => {
                        event.preventDefault();
                        setDragUploadKey('');
                        if (isBusy) return;
                        const file = event.dataTransfer?.files?.[0];
                        if (file) setPendingInvoiceFile(slot.type, file);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <strong className="block text-xs font-black text-slate-950">{slot.label}</strong>
                          <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500">
                            {isDragActive ? 'Lepas PDF di sini' : pendingFile?.name || document?.file?.name || 'Belum ada file PDF'}
                          </span>
                        </div>
                        <label className={`inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[10px] font-bold ${isBusy ? 'border-slate-200 bg-slate-100 text-slate-400' : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'}`}>
                          <Upload size={13} />
                          {isBusy ? 'Upload...' : pendingFile || document ? 'Ganti' : 'Pilih'}
                          <input
                            accept="application/pdf,.pdf"
                            aria-label={`Upload ${slot.label} PDF`}
                            className="sr-only"
                            disabled={isBusy}
                            onChange={async (event) => {
                              const input = event.currentTarget;
                              const file = input.files?.[0];
                              try {
                                if (file) setPendingInvoiceFile(slot.type, file);
                              } finally {
                                input.value = '';
                              }
                            }}
                            type="file"
                          />
                        </label>
                      </div>
                      <div className={`mt-2 rounded-md border border-dashed px-2.5 py-2 text-[10px] font-semibold ${
                        isDragActive
                          ? 'border-sky-300 bg-white text-sky-700'
                          : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}>
                        <div className="flex items-center gap-2">
                          <Upload size={13} className={isDragActive ? 'text-sky-600' : 'text-slate-400'} />
                          <span>{isDragActive ? 'Lepaskan file PDF di sini.' : 'Drag & drop PDF ke area ini, lalu klik Simpan Dokumen.'}</span>
                        </div>
                      </div>
                      {pendingFile ? (
                        <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-semibold text-amber-800">
                          <span className="min-w-0 truncate">Siap disimpan: {pendingFile.name}</span>
                          <button
                            className="shrink-0 font-black text-amber-900 hover:text-red-700"
                            onClick={() => setPendingInvoiceFiles((current) => {
                              const next = { ...current };
                              delete next[slot.type];
                              return next;
                            })}
                            type="button"
                          >
                            Batal
                          </button>
                        </div>
                      ) : null}
                      {document ? (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <DocumentLink
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50"
                            file={document.file}
                            label="View"
                          />
                          <DocumentLink
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2.5 text-[10px] font-bold text-sky-700 hover:bg-sky-100"
                            download
                            file={document.file}
                            label="Download"
                          />
                        </div>
                      ) : null}
                      {(uploadedAt || uploadedBy) ? (
                        <p className="mt-2 text-[10px] font-semibold text-slate-500">
                          {uploadedAt ? `Upload ${uploadedAt}` : 'Sudah upload'}{uploadedBy ? ` oleh ${uploadedBy}` : ''}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="finance-invoice-detail-card">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-xs font-black text-slate-950">File Sales & Operational</h4>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600">{availableDocumentCount} file tersedia</span>
              </div>
              {documents.length ? (
                <div className="finance-invoice-container-grid">
                  {documentGroups.map((group) => (
                    <section className="finance-invoice-container-card" key={group.id}>
                      <header className="finance-invoice-container-header">
                        <div className="min-w-0">
                          <span>{group.eyebrow}</span>
                          <strong className="truncate" title={group.title}>{group.title}</strong>
                        </div>
                        <span className="finance-invoice-container-count">
                          {group.id === 'sales-order' ? `${group.readyCount} file` : `${group.readyCount}/${group.documents.length} lengkap`}
                        </span>
                      </header>
                      <div className="finance-invoice-container-files">
                        {group.documents.map((document) => {
                          const isReady = document.ready !== false && Boolean(document.file?.path);
                          return (
                            <div className={`finance-invoice-document-row ${isReady ? '' : 'is-missing'}`} key={document.id}>
                              <div className="min-w-0 flex-1">
                                <strong className="block truncate text-[11px] text-slate-900" title={document.label}>
                                  {document.label}
                                </strong>
                                <p className="mt-0.5 truncate text-[9px] font-medium text-slate-500">
                                  {isReady
                                    ? document.referenceNumber || 'File tersedia untuk view atau download.'
                                    : 'Belum dilengkapi oleh Operational.'}
                                </p>
                              </div>
                              {isReady ? (
                                <div className="grid shrink-0 grid-cols-2 gap-1">
                                  <DocumentLink
                                    className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[9px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                                    file={document.file}
                                    label="View"
                                  />
                                  <DocumentLink
                                    className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 text-[9px] font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-40"
                                    download
                                    file={document.file}
                                    label="Download"
                                  />
                                </div>
                              ) : (
                                <span className="finance-invoice-document-missing">Belum dilengkapi</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-center text-xs font-medium text-slate-500">
                  Belum ada file Sales atau Operational yang dapat didownload.
                </p>
              )}
            </section>

            <section className="finance-invoice-detail-card">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-black text-slate-950">Koreksi Nomor Invoice</h4>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">Koreksi nomor invoice masuk approval Admin.</p>
                </div>
                <button
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-40"
                  disabled={!invoice.invoiceNumber}
                  onClick={() => onOpenCorrection(invoice, 'invoice_number')}
                  type="button"
                >
                  Ajukan Koreksi
                </button>
              </div>
              <CorrectionHistoryList corrections={corrections} error={correctionsError} loading={correctionsLoading} />
            </section>
          </div>
        </div>
      </section>
      {uploadResultModal ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => event.stopPropagation()}>
          <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-2xl" role="alertdialog" aria-modal="true">
            <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                uploadResultModal.status === 'success'
                  ? 'bg-emerald-50 text-emerald-600'
                  : uploadResultModal.status === 'error'
                    ? 'bg-rose-50 text-rose-600'
                    : 'bg-sky-50 text-sky-600'
              }`}>
                {uploadResultModal.status === 'success' ? <CheckCircle2 size={20} /> : uploadResultModal.status === 'error' ? <AlertTriangle size={20} /> : <Upload size={20} />}
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-black text-slate-950">{uploadResultModal.title}</h4>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{uploadResultModal.message}</p>
                {uploadResultModal.items?.length ? (
                  <div className="mt-3 grid gap-1.5">
                    {uploadResultModal.items.map((item) => (
                      <div className="rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700" key={item}>
                        {item}
                      </div>
                    ))}
                  </div>
                ) : null}
                {uploadResultModal.status === 'loading' ? (
                  <p className="mt-3 text-[11px] font-bold text-sky-700">Mohon tunggu, jangan tutup halaman ini.</p>
                ) : (
                  <div className="mt-4 flex justify-end">
                    <button
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      onClick={() => setUploadResultModal(null)}
                      type="button"
                    >
                      Tutup
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function OrderVerificationTable({
  rows,
  query,
  summary,
  activeOrderTab,
  currentPage,
  total,
  totalPages,
  onQueryChange,
  onActiveOrderTabChange,
  onPageChange,
  onSelectOrder,
  onOpenSoModal,
  savingSoId,
  orderFilterMonth,
  orderDateFrom,
  orderDateTo,
  onOrderFilterMonthChange,
  onOrderDateFromChange,
  onOrderDateToChange,
  onResetOrderDateFilter,
}) {
  const orderTabs = [
    { id: 'need-so', label: 'Belum Ada Nomor SO', icon: Clock3, match: (row) => !isCancelledFinanceOrder(row) && !isVerifiedFinanceOrder(row) },
    { id: 'running', label: 'SO Terisi', icon: CheckCircle2, match: isVerifiedFinanceOrder },
    { id: 'cancelled', label: 'SO Batal', icon: AlertTriangle, match: isCancelledFinanceOrder },
  ];
  const currentTab = orderTabs.find((tab) => tab.id === activeOrderTab) || orderTabs[0];
  const normalizedQuery = query.trim().toLowerCase();
  const searchedRows = rows.filter((row) => `${row.soNumber} ${row.internalSoNumber} ${row.accurateSoNumber} ${row.salesName} ${row.customer} ${row.destination} ${row.paymentTerms} ${row.status} ${row.cancelReason}`.toLowerCase().includes(normalizedQuery));
  const filteredRows = searchedRows.filter((row) => currentTab.match(row));
  const hasBackendSummary = Boolean(summary);
  const safeTotal = Math.max(0, Number(total ?? filteredRows.length ?? 0));
  const safeCurrentPage = Math.max(1, Number(currentPage || 1));
  const safeTotalPages = Math.max(1, Number(totalPages || Math.ceil(safeTotal / ORDER_TABLE_PAGE_SIZE) || 1));
  const showingFrom = safeTotal ? (safeCurrentPage - 1) * ORDER_TABLE_PAGE_SIZE + 1 : 0;
  const showingTo = safeTotal ? Math.min(safeCurrentPage * ORDER_TABLE_PAGE_SIZE, safeTotal) : 0;
  const tabCounts = {
    'need-so': hasBackendSummary ? Number(summary?.pendingSo || 0) : searchedRows.filter((row) => orderTabs[0].match(row)).length,
    running: hasBackendSummary ? Number(summary?.verified || 0) : searchedRows.filter((row) => orderTabs[1].match(row)).length,
    cancelled: hasBackendSummary ? Number(summary?.cancelled || 0) : searchedRows.filter((row) => orderTabs[2].match(row)).length,
  };
  const groupedRows = filteredRows.reduce((groups, row) => {
    const salesName = row.salesName || 'Tanpa Sales';
    if (!groups[salesName]) groups[salesName] = [];
    groups[salesName].push(row);
    return groups;
  }, {});

  return (
    <div className="finance-order-verification space-y-0">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[180px] max-w-full flex-1">
          <SearchBar query={query} onChange={onQueryChange} />
          </div>
          <div className="flex max-w-full flex-wrap items-end gap-2">
            <MonthFilterControl
              label="Bulan dibuat"
              monthAriaLabel="Bulan order dibuat"
              onChange={onOrderFilterMonthChange}
              value={orderFilterMonth}
              yearAriaLabel="Tahun order dibuat"
            />
            <label className="grid min-w-[150px] max-w-full flex-1 gap-1 text-[10px] font-black uppercase text-slate-500">
              Dari tanggal
              <input
                aria-label="Tanggal awal order dibuat"
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold normal-case text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                onChange={(event) => onOrderDateFromChange(event.target.value)}
                type="date"
                value={orderDateFrom}
              />
            </label>
            <label className="grid min-w-[150px] max-w-full flex-1 gap-1 text-[10px] font-black uppercase text-slate-500">
              Sampai tanggal
              <input
                aria-label="Tanggal akhir order dibuat"
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold normal-case text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                onChange={(event) => onOrderDateToChange(event.target.value)}
                type="date"
                value={orderDateTo}
              />
            </label>
            <button
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!orderFilterMonth && !orderDateFrom && !orderDateTo}
              onClick={onResetOrderDateFilter}
              type="button"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 shadow-sm" role="tablist" aria-label="Filter verifikasi nomor SO">
          {orderTabs.map((tab) => {
            const count = tabCounts[tab.id] ?? searchedRows.filter((row) => tab.match(row)).length;
            const active = tab.id === activeOrderTab;
            const Icon = tab.icon;
            const tone = {
              'need-so': {
                active: 'border-red-200 bg-red-50 text-red-800 ring-red-100',
                icon: 'bg-white text-red-600 ring-1 ring-red-100',
                count: 'bg-red-100 text-red-700',
              },
              running: {
                active: 'border-sky-200 bg-sky-50 text-sky-800 ring-sky-100',
                icon: 'bg-white text-sky-600 ring-1 ring-sky-100',
                count: 'bg-sky-100 text-sky-700',
              },
              cancelled: {
                active: 'border-rose-200 bg-rose-50 text-rose-800 ring-rose-100',
                icon: 'bg-white text-rose-600 ring-1 ring-rose-100',
                count: 'bg-rose-100 text-rose-700',
              },
            }[tab.id];
            const inactiveTone = 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-800';
            const iconTone = active ? tone.icon : 'bg-white text-slate-400';
            const countTone = active ? tone.count : 'bg-white text-slate-500';

            return (
              <button
                aria-selected={active}
                className={`inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-bold transition ${active ? `${tone.active} shadow-sm ring-1` : inactiveTone}`}
                key={tab.id}
                onClick={() => onActiveOrderTabChange(tab.id)}
                role="tab"
                type="button"
              >
                <span className={`grid h-5 w-5 place-items-center rounded-full ${iconTone}`}>
                  <Icon size={12} />
                </span>
                <span className="whitespace-nowrap">{tab.label}</span>
                <span className={`grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] leading-none ${countTone}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table master-table finance-master-table finance-order-table min-w-[1320px]">
          <thead>
            <tr>
              {['Order Dibuat', 'Tujuan', 'Jenis Order', 'Payment Terms', 'Tanggal Jalan', 'Customer', 'Alasan Batal', 'Nomor SO Internal', 'Nomor SO Accurate', 'Aksi'].map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupedRows).map(([salesName, salesRows]) => (
              <Fragment key={salesName}>
                <tr className="finance-group-row">
                  <td colSpan={10}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Sales</span>
                        <strong className="ml-2 text-[11px] font-black text-slate-900">{salesName}</strong>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">{salesRows.length} order</span>
                    </div>
                  </td>
                </tr>
                <tr aria-hidden="true">
                  <td className="h-px bg-slate-200 p-0" colSpan={10} />
                </tr>
                {salesRows.map((row) => (
                  <Fragment key={row.id}>
                    {(() => {
                      const isCancelled = isCancelledFinanceOrder(row);
                      return (
                    <tr className="align-middle hover:bg-slate-50">
                      <td className="px-2 py-1 font-semibold text-slate-700" data-label="Order Dibuat">{row.orderDate}</td>
                      <td className="px-2 py-1 font-black text-slate-900" data-label="Tujuan">{row.destination}</td>
                      <td className="px-2 py-1 text-slate-700" data-label="Jenis Order">{row.orderType}</td>
                      <td className="px-2 py-1" data-label="Payment Terms">
                        <StatusPill value={row.paymentTerms} />
                      </td>
                      <td className="px-2 py-1 font-semibold text-slate-800" data-label="Tanggal Jalan">{row.runningDate}</td>
                      <td className="max-w-[220px] px-2 py-1 font-semibold text-slate-800" data-label="Customer">
                        <span className="block break-words leading-snug">{row.customer || '-'}</span>
                      </td>
                      <td className="max-w-[220px] px-2 py-1 text-[10px] font-semibold text-slate-600" data-label="Alasan Batal">
                        {isCancelled ? (
                          <span className="block max-h-8 overflow-hidden leading-4">{row.cancelReason || '-'}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-2 py-1" data-label="Nomor SO Internal">
                        <span className="block text-[11px] font-black text-slate-900">{row.internalSoNumber || '-'}</span>
                        <span className="mt-0.5 block text-[9px] font-semibold text-slate-500">Nomor kerja</span>
                      </td>
                      <td className="px-2 py-1" data-label="Nomor SO Accurate">
                        {activeOrderTab === 'need-so' && !isCancelled ? (
                          <button
                            className="inline-flex h-8 items-center rounded-md bg-slate-900 px-3 text-[10px] font-bold text-white hover:bg-slate-800 disabled:opacity-40"
                            disabled={savingSoId === row.id}
                            onClick={() => onOpenSoModal(row.id)}
                            type="button"
                          >
                            {savingSoId === row.id ? 'Menyimpan...' : 'Input Nomor SO'}
                          </button>
                        ) : isCancelled ? (
                          <div>
                            <span className="block text-[11px] font-black text-slate-900">{row.soNumber || '-'}</span>
                            <span className="mt-0.5 block text-[9px] font-semibold text-rose-600">SO sudah dibatalkan</span>
                          </div>
                        ) : (
                          <div>
                            <span className="block text-[11px] font-black text-slate-900">{row.soNumber}</span>
                            <span className="mt-0.5 block text-[9px] font-semibold text-slate-500">Nomor SO sudah terisi</span>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1" data-label="Aksi">
                        <button className="rounded-md bg-slate-900 px-1.5 py-1 text-[10px] font-semibold text-white hover:bg-slate-800" onClick={() => onSelectOrder(row.id)} type="button">Detail</button>
                      </td>
                    </tr>
                      );
                    })()}
                    <tr aria-hidden="true">
                      <td className="h-px bg-slate-200 p-0" colSpan={10} />
                    </tr>
                  </Fragment>
                ))}
              </Fragment>
            ))}
            {!filteredRows.length ? (
              <tr>
                <td className="px-3 py-2.5 text-center text-xs font-semibold text-slate-400" colSpan={10}>Tidak ada order pada klasifikasi ini.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="master-pagination border-t border-slate-200 bg-slate-50">
        <span>Menampilkan {showingFrom}-{showingTo} dari {safeTotal} data</span>
        <div className="master-pagination-controls">
          <button type="button" disabled={safeCurrentPage === 1} onClick={() => onPageChange(Math.max(1, safeCurrentPage - 1))} aria-label="Halaman sebelumnya">
            <ChevronLeft size={15} />
          </button>
          <strong>Halaman {safeCurrentPage} dari {safeTotalPages}</strong>
          <button type="button" disabled={safeCurrentPage === safeTotalPages} onClick={() => onPageChange(Math.min(safeTotalPages, safeCurrentPage + 1))} aria-label="Halaman berikutnya">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function RpujApprovalTable({
  rows,
  query,
  activeRpujTab,
  summary = defaultRpujSummary,
  total,
  totalPages,
  currentPage,
  onActiveRpujTabChange,
  onPageChange,
  rpujFilterMonth,
  rpujDateFrom,
  rpujDateTo,
  onRpujFilterMonthChange,
  onRpujDateFromChange,
  onRpujDateToChange,
  onResetRpujDateFilter,
  onApprove,
  onReject,
  onOpenUploadModal,
  onSelectRpuj,
  rpujBusyId,
}) {
  const searchableRows = rows.filter((row) =>
    `${row.soNumber} ${row.jobNumber} ${row.customer} ${row.destination} ${row.container} ${row.driver} ${row.truck} ${row.status}`.toLowerCase().includes(query.toLowerCase()));

  const needsApprovalRows = searchableRows.filter((row) => row.rpujStatus === 'submitted');
  const readyTransferRows = searchableRows.filter((row) => row.rpujStatus === 'approved');
  const paidRows = searchableRows.filter((row) => row.rpujStatus === 'paid');
  const tabSummary = normalizeRpujSummary(summary);
  const safeTotal = Math.max(0, Number(total ?? 0));
  const safeTotalPages = Math.max(1, Number(totalPages || Math.ceil(safeTotal / RPUJ_TABLE_PAGE_SIZE) || 1));
  const safeCurrentPage = Math.min(Math.max(1, Number(currentPage || 1)), safeTotalPages);
  const showingFrom = safeTotal ? (safeCurrentPage - 1) * RPUJ_TABLE_PAGE_SIZE + 1 : 0;

  const tabs = [
    { id: 'need-approval', label: 'Butuh Approval', icon: Clock3, count: tabSummary.submitted, tone: 'red' },
    { id: 'ready-transfer', label: 'Siap Transfer', icon: Upload, count: tabSummary.approved, tone: 'amber' },
    { id: 'paid', label: 'UJ Dikirim', icon: CheckCircle2, count: tabSummary.paid, tone: 'emerald' },
  ];

  const activeRows = activeRpujTab === 'ready-transfer'
    ? readyTransferRows
    : activeRpujTab === 'paid'
      ? paidRows
      : needsApprovalRows;
  const showingTo = safeTotal ? Math.min(showingFrom + activeRows.length - 1, safeTotal) : 0;
  const rowNumbers = activeRows.reduce((numbers, row, index) => {
    numbers.set(row.id, showingFrom + index);
    return numbers;
  }, new Map());
  const groupedRows = activeRows.reduce((groups, row) => {
    if (!groups[row.soNumber]) groups[row.soNumber] = [];
    groups[row.soNumber].push(row);
    return groups;
  }, {});

  return (
    <div className="finance-rpuj-workflow overflow-hidden rounded-b-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 shadow-sm" role="tablist" aria-label="Filter RPUJ Finance">
          {tabs.map((tab) => {
            const active = tab.id === activeRpujTab;
            const Icon = tab.icon;
            const toneClass = {
              red: {
                active: 'border-red-200 bg-red-50 text-red-800 ring-red-100',
                icon: 'bg-white text-red-600 ring-1 ring-red-100',
                count: 'bg-red-100 text-red-700',
              },
              emerald: {
                active: 'border-emerald-200 bg-emerald-50 text-emerald-800 ring-emerald-100',
                icon: 'bg-white text-emerald-600 ring-1 ring-emerald-100',
                count: 'bg-emerald-100 text-emerald-700',
              },
              amber: {
                active: 'border-amber-200 bg-amber-50 text-amber-800 ring-amber-100',
                icon: 'bg-white text-amber-600 ring-1 ring-amber-100',
                count: 'bg-amber-100 text-amber-700',
              },
              sky: {
                active: 'border-sky-200 bg-sky-50 text-sky-800 ring-sky-100',
                icon: 'bg-white text-sky-600 ring-1 ring-sky-100',
                count: 'bg-sky-100 text-sky-700',
              },
            }[tab.tone];

            return (
              <button
                aria-selected={active}
                key={tab.id}
                type="button"
                onClick={() => onActiveRpujTabChange(tab.id)}
                role="tab"
                className={`inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-bold transition ${
                  active
                    ? `${toneClass.active} shadow-sm ring-1`
                    : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-800'
                }`}
              >
                <span className={`grid h-5 w-5 place-items-center rounded-full ${active ? toneClass.icon : 'bg-white text-slate-400'}`}>
                  <Icon size={12} />
                </span>
                <span className="whitespace-nowrap">{tab.label}</span>
                <span className={`grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] leading-none ${active ? toneClass.count : 'bg-white text-slate-500'}`}>{tab.count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex max-w-full flex-wrap items-end gap-2">
          <MonthFilterControl
            className="[&>div>*]:h-8"
            label="Bulan RPUJ"
            monthAriaLabel="Bulan RPUJ"
            onChange={onRpujFilterMonthChange}
            value={rpujFilterMonth}
            yearAriaLabel="Tahun RPUJ"
          />
          <label className="grid min-w-[135px] max-w-full flex-1 gap-1 text-[10px] font-black uppercase text-slate-500">
            Dari
            <input
              aria-label="Tanggal awal RPUJ"
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold normal-case text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              onChange={(event) => onRpujDateFromChange(event.target.value)}
              type="date"
              value={rpujDateFrom}
            />
          </label>
          <label className="grid min-w-[135px] max-w-full flex-1 gap-1 text-[10px] font-black uppercase text-slate-500">
            Sampai
            <input
              aria-label="Tanggal akhir RPUJ"
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold normal-case text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              onChange={(event) => onRpujDateToChange(event.target.value)}
              type="date"
              value={rpujDateTo}
            />
          </label>
          <button
            className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!rpujFilterMonth && !rpujDateFrom && !rpujDateTo}
            onClick={onResetRpujDateFilter}
            type="button"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="table-wrap">
          <table className="data-table master-table finance-master-table finance-rpuj-table min-w-[1180px] table-fixed">
            <colgroup>
              <col className="w-[5%]" />
              <col className="w-[22%]" />
              <col className="w-[18%]" />
              <col className="w-[12%]" />
              <col className="w-[22%]" />
              <col className="w-[21%]" />
            </colgroup>
            <thead>
              <tr>
                {['No', 'Job / Container', 'Pengajuan', 'Status', 'Driver / Rekening', 'Aksi'].map((column) => (
                  <th className={column === 'Aksi' ? 'finance-rpuj-actions-header' : ''} key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupedRows).map(([soNumber, soRows]) => {
                const firstRow = soRows[0];
                const totalUj = soRows.reduce((sum, row) => sum + Number(row.totalUj || 0), 0);
                const totalAdditional = soRows.reduce((sum, row) => sum + Number(row.additionalCost || 0), 0);
                const totalRequest = totalUj + totalAdditional;
                const pendingCount = soRows.filter((row) => row.status === 'Menunggu Approval Finance').length;

                return (
                  <Fragment key={soNumber}>
                    <tr className="finance-group-row">
                      <td colSpan={6}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                            <strong className="min-w-0 break-words text-xs font-black text-slate-950">{soNumber}</strong>
                            <span className="min-w-0 truncate font-semibold text-slate-700">{firstRow.destination}</span>
                            <span className="text-slate-300">|</span>
                            <span className="min-w-0 truncate font-medium text-slate-500">{firstRow.customer}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">{soRows.length} container</span>
                            {pendingCount ? <span className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">{pendingCount} pending</span> : null}
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-700">Total {formatCurrency(totalRequest)}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                    <tr aria-hidden="true">
                      <td className="h-px bg-slate-200 p-0" colSpan={6} />
                    </tr>
                    {soRows.map((row) => {
                      const canUploadTransfer = row.rpujStatus === 'approved';
                      const busy = rpujBusyId === row.id;
                      const rowTotal = calculateRpujTotal(row);
                      const rowBreakdown = [
                        `UJ ${formatCurrency(row.totalUj)}`,
                        `Tambahan ${formatCurrency(row.additionalCost)}`,
                      ].filter(Boolean).join(' + ');

                      return (
                        <Fragment key={row.id}>
                          <tr className="align-middle hover:bg-slate-50">
                            <td className="px-2 py-2 text-center text-[11px] font-black text-slate-800" data-label="No">
                              {rowNumbers.get(row.id) || '-'}
                            </td>
                            <td className="finance-wrap-cell px-2 py-2" data-label="Job / Container">
                              <strong className="block break-words text-[11px] font-semibold leading-snug text-slate-900">{row.jobNumber}</strong>
                              <span className="mt-0.5 block break-words text-[9px] font-medium leading-snug text-slate-500">{row.container}</span>
                              <span className="mt-0.5 block text-[9px] font-medium text-slate-400">{row.departureDate}</span>
                            </td>
                            <td className="finance-wrap-cell px-2 py-2" data-label="Pengajuan">
                              <strong className="block text-[12px] font-black text-slate-900">{formatCurrency(rowTotal)}</strong>
                              <span className="mt-0.5 block text-[9px] font-medium leading-snug text-slate-500">{rowBreakdown}</span>
                              {Number(row.driverCommissionAmount || 0) > 0 ? (
                                <span className="mt-0.5 block text-[9px] font-semibold leading-snug text-amber-700">Komisi mingguan {formatCurrency(row.driverCommissionAmount)}</span>
                              ) : null}
                            </td>
                            <td className="finance-wrap-cell px-2 py-2" data-label="Status">
                              <StatusPill value={compactRpujStatus(row.status)} />
                            </td>
                            <td className="finance-wrap-cell px-2 py-2" data-label="Driver / Rekening">
                              <span className="block break-words text-[11px] font-semibold leading-snug text-slate-800">{row.driver}</span>
                              <span className="mt-0.5 block break-words text-[9px] font-medium leading-snug text-slate-600">{row.driverBankAccount}</span>
                              <span className="mt-0.5 block break-words text-[9px] font-medium leading-snug text-slate-400">{row.truck}</span>
                            </td>
                            <td className="finance-rpuj-actions-cell px-2 py-2" data-label="Aksi">
                              <div className="finance-rpuj-action-grid grid min-w-[230px] grid-cols-3 gap-1.5">
                                <button className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50" onClick={() => onSelectRpuj(row.id)} type="button">Detail</button>
                                {activeRpujTab === 'need-approval' ? (
                                  <>
                                    <button className="inline-flex h-8 items-center justify-center rounded-md bg-emerald-600 px-2 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40" disabled={busy} onClick={() => onApprove(row.id)} type="button">Approve</button>
                                    <button className="inline-flex h-8 items-center justify-center rounded-md border border-rose-200 bg-white px-2 text-[10px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40" disabled={busy} onClick={() => onReject(row.id)} type="button">Reject</button>
                                  </>
                                ) : null}
                                {activeRpujTab === 'ready-transfer' ? (
                                  <button
                                    className="col-span-2 inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                                    disabled={!canUploadTransfer || busy}
                                    onClick={() => onOpenUploadModal(row.id)}
                                    type="button"
                                  >
                                    <Upload size={11} /> {busy ? 'Proses' : 'Upload Bukti'}
                                  </button>
                                ) : null}
                                {activeRpujTab === 'paid' ? (
                                  row.transferProofFile ? (
                                    <div className="col-span-2 grid grid-cols-2 gap-1.5">
                                      <DocumentLink
                                        className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                                        file={row.transferProofFile}
                                        label="View"
                                      />
                                      <DocumentLink
                                        className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100"
                                        download
                                        file={row.transferProofFile}
                                        label="Download"
                                      />
                                    </div>
                                  ) : (
                                    <span className="col-span-2 min-w-0 truncate rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-center text-[10px] font-semibold text-amber-700">
                                      Bukti transfer tidak tersedia
                                    </span>
                                  )
                                ) : null}
                              </div>
                            </td>
                          </tr>
                          <tr aria-hidden="true">
                            <td className="h-px bg-slate-200 p-0" colSpan={6} />
                          </tr>
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
              {!Object.keys(groupedRows).length ? (
                <tr>
                  <td className="px-3 py-3 text-center text-xs font-semibold text-slate-400" colSpan={6}>Tidak ada RPUJ pada klasifikasi ini.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      <div className="master-pagination border-t border-slate-200 bg-slate-50">
        <span>Menampilkan {showingFrom}-{showingTo} dari {safeTotal} data</span>
        <div className="master-pagination-controls">
          <button type="button" disabled={safeCurrentPage === 1} onClick={() => onPageChange(Math.max(1, safeCurrentPage - 1))} aria-label="Halaman sebelumnya">
            <ChevronLeft size={15} />
          </button>
          <strong>Halaman {safeCurrentPage} dari {safeTotalPages}</strong>
          <button type="button" disabled={safeCurrentPage === safeTotalPages} onClick={() => onPageChange(Math.min(safeTotalPages, safeCurrentPage + 1))} aria-label="Halaman berikutnya">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function InvoiceTable({
  rows,
  summary,
  total,
  totalPages,
  currentPage,
  query,
  activeInvoiceTab,
  activeInvoiceDocumentFilter,
  onActiveInvoiceTabChange,
  onActiveInvoiceDocumentFilterChange,
  onInvoicePageChange,
  invoiceFilterMonth,
  invoiceDateFrom,
  invoiceDateTo,
  onInvoiceFilterMonthChange,
  onInvoiceDateFromChange,
  onInvoiceDateToChange,
  onResetInvoiceDateFilter,
  invoiceBusyId = '',
  onInvoiceChange,
  onSaveInvoice,
  onSelectInvoice,
}) {
  const invoiceTabs = [
    {
      id: 'need-number',
      label: 'Belum Nomor / Dokumen',
      icon: FileText,
      tone: 'red',
      match: (row) => row.invoiceStatus === 'Butuh Nomor Invoice',
    },
    {
      id: 'in-progress',
      label: 'Menunggu Sales',
      icon: Clock3,
      tone: 'sky',
      match: (row) => row.invoiceStatus === 'Menunggu Update Status',
    },
    {
      id: 'paid',
      label: 'Lunas',
      icon: CheckCircle2,
      tone: 'emerald',
      match: (row) => row.invoiceStatus === 'Lunas',
    },
  ];
  const invoiceDocumentFilters = [
    { id: 'all', label: 'Semua Dokumen', countKey: null },
    { id: 'missing-documents', label: 'Belum Upload Invoice & Faktur Pajak', countKey: 'missingInvoiceDocuments' },
    { id: 'complete', label: 'Lengkap', countKey: 'completeInvoiceDocuments' },
    { id: 'sent', label: 'Sudah Dikirim Sales', countKey: 'sentInvoiceDocuments' },
  ];
  const currentTab = invoiceTabs.find((tab) => tab.id === activeInvoiceTab) || invoiceTabs[0];
  const canFilterDocuments = activeInvoiceTab !== 'paid';
  const visibleInvoiceDocumentFilters = invoiceDocumentFilters.filter((filter) => {
    if (!canFilterDocuments) return false;
    if (activeInvoiceTab === 'need-number') return ['all', 'missing-documents'].includes(filter.id);
    return ['all', 'complete', 'sent'].includes(filter.id);
  });
  const searchedRows = rows.filter((row) => `${row.soNumber} ${row.customer} ${row.destination} ${row.invoiceNumber} ${row.invoiceStatus}`.toLowerCase().includes(query.toLowerCase()));
  const filteredRows = searchedRows.filter((row) => {
    if (!currentTab.match(row)) return false;
    if (!canFilterDocuments) return true;
    if (activeInvoiceDocumentFilter === 'missing-documents') {
      return row.invoiceNumber && (!row.invoiceDocumentUploadedAt || !row.taxInvoiceDocumentUploadedAt);
    }
    if (activeInvoiceDocumentFilter === 'complete') {
      return row.invoiceNumber && row.invoiceDocumentUploadedAt && row.taxInvoiceDocumentUploadedAt && row.invoiceDocumentStatus !== 'terkirim';
    }
    if (activeInvoiceDocumentFilter === 'sent') return row.invoiceDocumentStatus === 'terkirim';
    return true;
  });
  const safeTotal = Number.isFinite(Number(total)) ? Number(total) : 0;
  const safeTotalPages = Math.max(1, Number(totalPages || Math.ceil(safeTotal / INVOICE_TABLE_PAGE_SIZE) || 1));
  const safeCurrentPage = Math.min(Math.max(1, Number(currentPage || 1)), safeTotalPages);
  const paginatedRows = filteredRows;
  const showingFrom = safeTotal ? (safeCurrentPage - 1) * INVOICE_TABLE_PAGE_SIZE + 1 : 0;
  const showingTo = safeTotal ? Math.min(showingFrom + paginatedRows.length - 1, safeTotal) : 0;
  const tabCounts = {
    'need-number': Number(summary?.needNumber ?? searchedRows.filter((row) => invoiceTabs[0].match(row)).length),
    'in-progress': Number(summary?.inProgress ?? searchedRows.filter((row) => invoiceTabs[1].match(row)).length),
    paid: Number(summary?.paid ?? searchedRows.filter((row) => invoiceTabs[2].match(row)).length),
  };
  const allInvoiceTotal = tabCounts['need-number'] + tabCounts['in-progress'] + tabCounts.paid;

  return (
    <div className="overflow-hidden rounded-b-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              <Info size={12} />
              <span>Keterangan</span>
            </div>
            <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 shadow-sm" role="tablist" aria-label="Filter invoice Finance">
          {invoiceTabs.map((tab) => {
          const count = tabCounts[tab.id] || 0;
          const active = tab.id === activeInvoiceTab;
          const toneClass = {
            red: {
              active: 'border-red-200 bg-red-50 text-red-800 ring-red-100',
              icon: 'bg-white text-red-600 ring-1 ring-red-100',
              count: 'bg-red-100 text-red-700',
            },
            sky: {
              active: 'border-sky-200 bg-sky-50 text-sky-800 ring-sky-100',
              icon: 'bg-white text-sky-600 ring-1 ring-sky-100',
              count: 'bg-sky-100 text-sky-700',
            },
            emerald: {
              active: 'border-emerald-200 bg-emerald-50 text-emerald-800 ring-emerald-100',
              icon: 'bg-white text-emerald-600 ring-1 ring-emerald-100',
              count: 'bg-emerald-100 text-emerald-700',
            },
          }[tab.tone];

          return (
            <button
              aria-selected={active}
              className={`inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-bold transition ${
                active
                  ? `${toneClass.active} shadow-sm ring-1`
                  : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-800'
              }`}
              key={tab.id}
              onClick={() => onActiveInvoiceTabChange(tab.id)}
              role="tab"
              type="button"
            >
              <span className={`grid h-5 w-5 place-items-center rounded-full ${active ? toneClass.icon : 'bg-white text-slate-400'}`}>
                <tab.icon size={12} />
              </span>
              <span className="whitespace-nowrap">{tab.label}</span>
              <span className={`grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] leading-none ${active ? toneClass.count : 'bg-white text-slate-500'}`}>{count}</span>
            </button>
          );
            })}
            </div>
          </div>
          <div className="flex max-w-full flex-wrap items-end gap-2">
            <MonthFilterControl
              className="[&>div>*]:h-8"
              label="Bulan update"
              monthAriaLabel="Bulan update invoice"
              onChange={onInvoiceFilterMonthChange}
              value={invoiceFilterMonth}
              yearAriaLabel="Tahun update invoice"
            />
            <label className="grid min-w-[135px] max-w-full flex-1 gap-1 text-[10px] font-black uppercase text-slate-500">
              Dari
              <input
                aria-label="Tanggal awal update invoice"
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold normal-case text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                onChange={(event) => onInvoiceDateFromChange(event.target.value)}
                type="date"
                value={invoiceDateFrom}
              />
            </label>
            <label className="grid min-w-[135px] max-w-full flex-1 gap-1 text-[10px] font-black uppercase text-slate-500">
              Sampai
              <input
                aria-label="Tanggal akhir update invoice"
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold normal-case text-slate-800 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                onChange={(event) => onInvoiceDateToChange(event.target.value)}
                type="date"
                value={invoiceDateTo}
              />
            </label>
            <button
              className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!invoiceFilterMonth && !invoiceDateFrom && !invoiceDateTo}
              onClick={onResetInvoiceDateFilter}
              type="button"
            >
              Reset
            </button>
          </div>
        </div>
        {canFilterDocuments ? (
        <div className="mt-2 flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {visibleInvoiceDocumentFilters.map((filter) => {
            const active = activeInvoiceDocumentFilter === filter.id;
            const allCount = activeInvoiceTab === 'need-number'
              ? Number(summary?.needNumber || 0)
              : Number(summary?.inProgress || 0);
            const count = filter.countKey ? Number(summary?.[filter.countKey] || 0) : allCount;
            return (
              <button
                className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[10px] font-bold transition ${active ? 'border-sky-200 bg-white text-sky-700 shadow-sm' : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-800'}`}
                key={filter.id}
                onClick={() => onActiveInvoiceDocumentFilterChange(filter.id)}
                type="button"
              >
                <span>{filter.label}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${active ? 'bg-sky-50 text-sky-700' : 'bg-white text-slate-500'}`}>{count}</span>
              </button>
            );
          })}
        </div>
        ) : null}
      </div>

      <div className="finance-invoice-table-wrap">
        <table className="data-table master-table finance-master-table finance-invoice-table table-fixed">
          <colgroup>
            <col className="w-[4%]" />
            <col className="w-[8%]" />
            <col className="w-[13%]" />
            <col className="w-[11%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[10%]" />
            <col className="w-[13%]" />
            <col className="w-[9%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead>
            <tr>
              {['No', 'Nomor SO', 'Customer', 'Status', 'Selesai', 'Invoice', 'Jatuh Tempo', 'Total Penagihan', 'No. Invoice', 'Lama Pelunasan', 'Aksi'].map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, index) => {
              const needsInvoiceNumber = row.invoiceStatus === 'Butuh Nomor Invoice';
              const needsInvoiceDocuments = Boolean(row.invoiceNumber && (!row.invoiceDocumentUploadedAt || !row.taxInvoiceDocumentUploadedAt));
              const documentActionLabel = needsInvoiceDocuments ? 'Upload Dokumen' : 'Detail Dokumen';
              const isBusy = invoiceBusyId === row.id;

              return (
                <tr className="border-t border-slate-100 align-middle hover:bg-slate-50" key={row.id}>
                  <td className="font-black text-slate-800" data-label="No">{showingFrom + index}</td>
                  <td className="finance-invoice-so font-semibold text-slate-700" data-label="Nomor SO">{row.soNumber}</td>
                  <td className="finance-invoice-customer" data-label="Customer">
                    <span className="block truncate font-semibold text-slate-900">{row.customer}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">{row.destination}</span>
                  </td>
                  <td className="finance-invoice-status" data-label="Status">
                    <StatusPill className="max-w-full overflow-hidden text-ellipsis" value={row.invoiceStatus} />
                  </td>
                  <td className="finance-invoice-date text-slate-700" data-label="Selesai">{row.completedAt}</td>
                  <td className="finance-invoice-date text-slate-700" data-label="Invoice">{row.invoiceDate}</td>
                  <td className="finance-invoice-date text-slate-700" data-label="Jatuh Tempo">{row.dueDate}</td>
                  <td className="finance-invoice-total font-semibold text-slate-900" data-label="Total Penagihan">{formatCurrency(row.billingAmount)}</td>
                  <td className="finance-invoice-number" data-label="No. Invoice">
                    {needsInvoiceNumber ? (
                      <input
                        className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-slate-400"
                        onChange={(event) => onInvoiceChange(row.id, event.target.value)}
                        placeholder="INV-..."
                        value={row.invoiceNumber}
                      />
                    ) : (
                      <span className="block truncate font-semibold text-slate-900">{row.invoiceNumber}</span>
                    )}
                  </td>
                  <td className="finance-invoice-aging" data-label="Lama Pelunasan">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${agingToneClass(row.invoiceAging?.currentDays)}`}>
                      {formatAgingDays(row.invoiceAging?.currentDays)}
                    </span>
                    <small className="mt-1 block truncate text-[9px] font-semibold text-slate-500" title={row.invoiceAging?.currentStage || '-'}>
                      {row.invoiceAging?.currentStage || '-'}
                    </small>
                  </td>
                  <td className="finance-invoice-actions" data-label="Aksi">
                    <div className="finance-invoice-action-row">
                      <button
                        aria-label={`${documentActionLabel} ${row.soNumber}`}
                        className="finance-table-action-button"
                        onClick={() => onSelectInvoice(row.id)}
                        title={documentActionLabel}
                        type="button"
                      >
                        {needsInvoiceDocuments ? <Upload size={13} /> : <Eye size={13} />}
                        <span>{needsInvoiceDocuments ? 'Upload' : 'Detail'}</span>
                      </button>
                      {needsInvoiceNumber ? (
                        <button className="finance-table-action-button is-primary" disabled={!row.invoiceNumber || isBusy} onClick={() => onSaveInvoice(row.id)} type="button">
                          {isBusy ? 'Menyimpan' : 'Simpan'}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filteredRows.length ? (
              <tr>
                <td className="px-3 py-3 text-center text-xs font-semibold text-slate-400" colSpan={11}>Tidak ada data pada klasifikasi ini.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="master-pagination border-t border-slate-200 bg-slate-50">
        <span>
          Menampilkan {showingFrom}-{showingTo} dari {safeTotal} data filter ini
          {allInvoiceTotal && allInvoiceTotal !== safeTotal ? ` (${allInvoiceTotal} semua data)` : ''}
        </span>
        <div className="master-pagination-controls">
          <button type="button" disabled={safeCurrentPage === 1} onClick={() => onInvoicePageChange(Math.max(1, safeCurrentPage - 1))} aria-label="Halaman sebelumnya">
            <ChevronLeft size={15} />
          </button>
          <strong>Halaman {safeCurrentPage} dari {safeTotalPages}</strong>
          <button type="button" disabled={safeCurrentPage === safeTotalPages} onClick={() => onInvoicePageChange(Math.min(safeTotalPages, safeCurrentPage + 1))} aria-label="Halaman berikutnya">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function FinanceTable({
  activeTab,
  activeRpujTab,
  activeInvoiceTab,
  activeInvoiceDocumentFilter,
  onActiveRpujTabChange,
  onActiveOrderTabChange,
  onActiveInvoiceTabChange,
  onActiveInvoiceDocumentFilterChange,
  orderFilterMonth,
  orderDateFrom,
  orderDateTo,
  rpujFilterMonth,
  rpujDateFrom,
  rpujDateTo,
  invoiceFilterMonth,
  invoiceDateFrom,
  invoiceDateTo,
  onOrderFilterMonthChange,
  onOrderDateFromChange,
  onOrderDateToChange,
  onResetOrderDateFilter,
  onRpujFilterMonthChange,
  onRpujDateFromChange,
  onRpujDateToChange,
  onResetRpujDateFilter,
  onInvoiceFilterMonthChange,
  onInvoiceDateFromChange,
  onInvoiceDateToChange,
  onResetInvoiceDateFilter,
  query,
  onQueryChange,
  onReset,
  orderRows,
  rpujRows,
  invoiceRows,
  activeOrderTab,
  orderSummary,
  orderPage,
  orderTotal,
  orderTotalPages,
  rpujPage,
  rpujTotal,
  rpujTotalPages,
  rpujSummary,
  invoiceSummary,
  invoicePage,
  invoiceTotal,
  invoiceTotalPages,
  orderError,
  orderLoading,
  rpujError,
  rpujLoading,
  rpujBusyId,
  invoiceError,
  invoiceLoading,
  invoiceBusyId,
  onInvoicePageChange,
  onOrderPageChange,
  onRpujPageChange,
  savingSoId,
  handlers,
}) {
  const isOrderVerification = activeTab.id === 'order-verification';
  const isRpujApproval = activeTab.id === 'rpuj-approval';
  const isInvoiceNumber = activeTab.id === 'invoice-number';

  return (
    <section className="finance-workflow-panel overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="mb-1 inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-500">
              {activeTab.badge}
            </div>
            <h2 className="text-sm font-black text-slate-950">{activeTab.label}</h2>
            {!isRpujApproval && !isOrderVerification ? (
              <p className="mt-0.5 max-w-3xl text-[11px] font-medium text-slate-500">{activeTab.description}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500">
              <Clock3 size={13} /> {isOrderVerification || isRpujApproval || isInvoiceNumber ? 'Data Finance API' : 'Data simulasi meeting'}
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-50" onClick={onReset} type="button">
              <RotateCcw size={13} /> {isOrderVerification || isRpujApproval || isInvoiceNumber ? 'Refresh' : 'Reset'}
            </button>
          </div>
        </div>

        {activeTab.id !== 'invoice-number' && activeTab.id !== 'order-verification' && !isRpujApproval ? (
          <div className="mt-1.5">
            <StatusFlow items={activeTab.statusFlow} />
          </div>
        ) : null}
      </div>

      {isOrderVerification ? null : (
        <div className="border-b border-slate-200 px-2.5 py-1.5">
          <SearchBar query={query} onChange={onQueryChange} />
        </div>
      )}

      {isOrderVerification && orderError ? (
        <div className="border-b border-rose-100 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700">{orderError}</div>
      ) : null}

      {isOrderVerification && orderLoading ? (
        <div className="border-b border-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500">Memuat data verifikasi order...</div>
      ) : null}

      {isRpujApproval && rpujError ? (
        <div className="border-b border-rose-100 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700">{rpujError}</div>
      ) : null}

      {isRpujApproval && rpujLoading ? (
        <div className="border-b border-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500">Memuat pengajuan RPUJ...</div>
      ) : null}

      {activeTab.id === 'invoice-number' && invoiceError ? (
        <div className="border-b border-rose-100 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700">{invoiceError}</div>
      ) : null}

      {activeTab.id === 'invoice-number' && invoiceLoading ? (
        <div className="border-b border-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500">Memuat daftar invoice...</div>
      ) : null}

      {activeTab.id === 'order-verification' ? (
        <OrderVerificationTable
          onOrderDateFromChange={onOrderDateFromChange}
          onOrderDateToChange={onOrderDateToChange}
          onOrderFilterMonthChange={onOrderFilterMonthChange}
          onActiveOrderTabChange={onActiveOrderTabChange}
          onPageChange={onOrderPageChange}
          onQueryChange={onQueryChange}
          onResetOrderDateFilter={onResetOrderDateFilter}
          activeOrderTab={activeOrderTab}
          currentPage={orderPage}
          orderDateFrom={orderDateFrom}
          orderDateTo={orderDateTo}
          orderFilterMonth={orderFilterMonth}
          query={query}
          rows={orderRows}
          savingSoId={savingSoId}
          summary={orderSummary}
          total={orderTotal}
          totalPages={orderTotalPages}
          {...handlers}
        />
      ) : null}
      {activeTab.id === 'rpuj-approval' ? (
        <RpujApprovalTable
          activeRpujTab={activeRpujTab}
          currentPage={rpujPage}
          onActiveRpujTabChange={onActiveRpujTabChange}
          onPageChange={onRpujPageChange}
          onResetRpujDateFilter={onResetRpujDateFilter}
          onRpujDateFromChange={onRpujDateFromChange}
          onRpujDateToChange={onRpujDateToChange}
          onRpujFilterMonthChange={onRpujFilterMonthChange}
          query={query}
          rows={rpujRows}
          rpujDateFrom={rpujDateFrom}
          rpujDateTo={rpujDateTo}
          rpujFilterMonth={rpujFilterMonth}
          rpujBusyId={rpujBusyId}
          summary={rpujSummary}
          total={rpujTotal}
          totalPages={rpujTotalPages}
          {...handlers}
        />
      ) : null}
      {activeTab.id === 'invoice-number' ? (
        <InvoiceTable
          activeInvoiceDocumentFilter={activeInvoiceDocumentFilter}
          activeInvoiceTab={activeInvoiceTab}
          currentPage={invoicePage}
          invoiceBusyId={invoiceBusyId}
          onInvoicePageChange={onInvoicePageChange}
          onActiveInvoiceDocumentFilterChange={onActiveInvoiceDocumentFilterChange}
          onActiveInvoiceTabChange={onActiveInvoiceTabChange}
          onInvoiceDateFromChange={onInvoiceDateFromChange}
          onInvoiceDateToChange={onInvoiceDateToChange}
          onInvoiceFilterMonthChange={onInvoiceFilterMonthChange}
          onResetInvoiceDateFilter={onResetInvoiceDateFilter}
          invoiceDateFrom={invoiceDateFrom}
          invoiceDateTo={invoiceDateTo}
          invoiceFilterMonth={invoiceFilterMonth}
          query={query}
          rows={invoiceRows}
          summary={invoiceSummary}
          total={invoiceTotal}
          totalPages={invoiceTotalPages}
          {...handlers}
        />
      ) : null}
    </section>
  );
}

function FinanceWorkflowPage({ initialTabId = 'order-verification' }) {
  const [activeOrderTab, setActiveOrderTab] = useState('need-so');
  const [activeRpujTab, setActiveRpujTab] = useState('need-approval');
  const [activeInvoiceTab, setActiveInvoiceTab] = useState('need-number');
  const [activeInvoiceDocumentFilter, setActiveInvoiceDocumentFilter] = useState('all');
  const [orderFilterMonth, setOrderFilterMonth] = useState('');
  const [orderDateFrom, setOrderDateFrom] = useState('');
  const [orderDateTo, setOrderDateTo] = useState('');
  const [rpujFilterMonth, setRpujFilterMonth] = useState('');
  const [rpujDateFrom, setRpujDateFrom] = useState('');
  const [rpujDateTo, setRpujDateTo] = useState('');
  const [invoiceFilterMonth, setInvoiceFilterMonth] = useState('');
  const [invoiceDateFrom, setInvoiceDateFrom] = useState('');
  const [invoiceDateTo, setInvoiceDateTo] = useState('');
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderTotalPages, setOrderTotalPages] = useState(1);
  const [rpujPage, setRpujPage] = useState(1);
  const [rpujTotal, setRpujTotal] = useState(0);
  const [rpujTotalPages, setRpujTotalPages] = useState(1);
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [invoiceTotalPages, setInvoiceTotalPages] = useState(1);
  const [query, setQuery] = useState('');
  const [orderRows, setOrderRows] = useState(initialOrderRows);
  const [rpujRows, setRpujRows] = useState(initialRpujRows);
  const [invoiceRows, setInvoiceRows] = useState(initialInvoiceRows);
  const [orderSummary, setOrderSummary] = useState(null);
  const [rpujSummary, setRpujSummary] = useState(defaultRpujSummary);
  const [invoiceSummary, setInvoiceSummary] = useState(defaultInvoiceSummary);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [savingSoId, setSavingSoId] = useState('');
  const [rpujLoading, setRpujLoading] = useState(false);
  const [rpujError, setRpujError] = useState('');
  const [rpujBusyId, setRpujBusyId] = useState('');
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');
  const [invoiceBusyId, setInvoiceBusyId] = useState('');
  const [invoiceDocumentBusyKey, setInvoiceDocumentBusyKey] = useState('');
  const [invoiceDocumentUploadError, setInvoiceDocumentUploadError] = useState('');
  const [invoiceDetail, setInvoiceDetail] = useState(null);
  const [invoiceDetailLoading, setInvoiceDetailLoading] = useState(false);
  const [invoiceDetailError, setInvoiceDetailError] = useState('');
  const [correctionHistory, setCorrectionHistory] = useState([]);
  const [correctionHistoryLoading, setCorrectionHistoryLoading] = useState(false);
  const [correctionHistoryError, setCorrectionHistoryError] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedRpujId, setSelectedRpujId] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [soModalId, setSoModalId] = useState('');
  const [soModalValue, setSoModalValue] = useState('');
  const [soModalError, setSoModalError] = useState('');
  const [rpujDecision, setRpujDecision] = useState(null);
  const [rpujDecisionNote, setRpujDecisionNote] = useState('');
  const [rpujDecisionError, setRpujDecisionError] = useState('');
  const [transferModalId, setTransferModalId] = useState('');
  const [transferFile, setTransferFile] = useState(null);
  const [transferModalError, setTransferModalError] = useState('');
  const [invoiceConfirmId, setInvoiceConfirmId] = useState('');
  const [invoiceConfirmError, setInvoiceConfirmError] = useState('');
  const [correctionModal, setCorrectionModal] = useState(null);
  const [correctionValue, setCorrectionValue] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionError, setCorrectionError] = useState('');
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const activeTab = useMemo(
    () => financeTabs.find((tab) => tab.id === initialTabId) || financeTabs[0],
    [initialTabId],
  );
  const selectedOrder = orderRows.find((row) => row.id === selectedOrderId);
  const selectedRpuj = rpujRows.find((row) => row.id === selectedRpujId);
  const selectedInvoiceSummary = invoiceRows.find((row) => row.id === selectedInvoiceId);
  const selectedInvoice = invoiceDetail || selectedInvoiceSummary;
  const soModalOrder = orderRows.find((row) => row.id === soModalId);
  const rpujDecisionRow = rpujRows.find((row) => row.id === rpujDecision?.id);
  const transferModalRow = rpujRows.find((row) => row.id === transferModalId);
  const invoiceConfirmRow = invoiceRows.find((row) => row.id === invoiceConfirmId);
  const loadOrderVerifications = useCallback(async () => {
    if (activeTab.id !== 'order-verification') return;
    setOrderLoading(true);
    setOrderError('');
    try {
      const result = await fetchFinanceOrderVerifications({
        page: orderPage,
        pageSize: ORDER_TABLE_PAGE_SIZE,
        status: orderVerificationStatusParam(activeOrderTab),
        ...(query.trim() ? { query: query.trim() } : {}),
        ...(orderDateFrom ? { dateFrom: orderDateFrom } : {}),
        ...(orderDateTo ? { dateTo: orderDateTo } : {}),
      });
      setOrderRows((result.rows || []).map(normalizeFinanceOrderRow));
      const nextOrderTotal = Number(result.total ?? result.rows?.length ?? 0);
      const nextOrderTotalPages = Math.max(1, Number(result.totalPages || Math.ceil(nextOrderTotal / ORDER_TABLE_PAGE_SIZE) || 1));
      setOrderTotal(nextOrderTotal);
      setOrderTotalPages(nextOrderTotalPages);
      if (orderPage > nextOrderTotalPages) setOrderPage(nextOrderTotalPages);
      setOrderSummary(result.summary ? {
        pendingSo: Number(result.summary.pendingSo || 0),
        verified: Number(result.summary.verified || 0),
        cancelled: Number(result.summary.cancelled || 0),
      } : null);
    } catch (error) {
      setOrderError(error.message || 'Data verifikasi order gagal dimuat.');
      setOrderRows([]);
      setOrderTotal(0);
      setOrderTotalPages(1);
      setOrderSummary(null);
    } finally {
      setOrderLoading(false);
    }
  }, [activeOrderTab, activeTab.id, orderDateFrom, orderDateTo, orderPage, query]);

  useEffect(() => {
    loadOrderVerifications();
  }, [loadOrderVerifications]);

  const handleOrderFilterMonthChange = useCallback((value) => {
    const normalizedValue = normalizeMonthFilterValue(value);
    const range = getMonthDateRange(normalizedValue);
    setOrderFilterMonth(normalizedValue);
    setOrderDateFrom(range.dateFrom);
    setOrderDateTo(range.dateTo);
    setOrderPage(1);
  }, []);

  const handleOrderDateFromChange = useCallback((value) => {
    setOrderFilterMonth('');
    setOrderDateFrom(value);
    setOrderPage(1);
  }, []);

  const handleOrderDateToChange = useCallback((value) => {
    setOrderFilterMonth('');
    setOrderDateTo(value);
    setOrderPage(1);
  }, []);

  const handleResetOrderDateFilter = useCallback(() => {
    setOrderFilterMonth('');
    setOrderDateFrom('');
    setOrderDateTo('');
    setOrderPage(1);
  }, []);

  const handleQueryChange = useCallback((value) => {
    setQuery(value);
    if (activeTab.id === 'order-verification') setOrderPage(1);
    if (activeTab.id === 'rpuj-approval') setRpujPage(1);
    if (activeTab.id === 'invoice-number') setInvoicePage(1);
  }, [activeTab.id]);

  const handleActiveOrderTabChange = useCallback((nextTab) => {
    setActiveOrderTab(nextTab);
    setOrderPage(1);
  }, []);

  const handleActiveRpujTabChange = useCallback((nextTab) => {
    setActiveRpujTab(nextTab);
    setRpujPage(1);
  }, []);

  const handleActiveInvoiceTabChange = useCallback((nextTab) => {
    setActiveInvoiceTab(nextTab);
    setActiveInvoiceDocumentFilter('all');
    setInvoicePage(1);
  }, []);

  const handleActiveInvoiceDocumentFilterChange = useCallback((nextFilter) => {
    setActiveInvoiceDocumentFilter(nextFilter);
    setInvoicePage(1);
  }, []);

  const handleRpujFilterMonthChange = useCallback((value) => {
    const normalizedValue = normalizeMonthFilterValue(value);
    const range = getMonthDateRange(normalizedValue);
    setRpujFilterMonth(normalizedValue);
    setRpujDateFrom(range.dateFrom);
    setRpujDateTo(range.dateTo);
    setRpujPage(1);
  }, []);

  const handleRpujDateFromChange = useCallback((value) => {
    setRpujFilterMonth('');
    setRpujDateFrom(value);
    setRpujPage(1);
  }, []);

  const handleRpujDateToChange = useCallback((value) => {
    setRpujFilterMonth('');
    setRpujDateTo(value);
    setRpujPage(1);
  }, []);

  const handleResetRpujDateFilter = useCallback(() => {
    setRpujFilterMonth('');
    setRpujDateFrom('');
    setRpujDateTo('');
    setRpujPage(1);
  }, []);

  const handleInvoiceFilterMonthChange = useCallback((value) => {
    const normalizedValue = normalizeMonthFilterValue(value);
    const range = getMonthDateRange(normalizedValue);
    setInvoiceFilterMonth(normalizedValue);
    setInvoiceDateFrom(range.dateFrom);
    setInvoiceDateTo(range.dateTo);
    setInvoicePage(1);
  }, []);

  const handleInvoiceDateFromChange = useCallback((value) => {
    setInvoiceFilterMonth('');
    setInvoiceDateFrom(value);
    setInvoicePage(1);
  }, []);

  const handleInvoiceDateToChange = useCallback((value) => {
    setInvoiceFilterMonth('');
    setInvoiceDateTo(value);
    setInvoicePage(1);
  }, []);

  const handleResetInvoiceDateFilter = useCallback(() => {
    setInvoiceFilterMonth('');
    setInvoiceDateFrom('');
    setInvoiceDateTo('');
    setInvoicePage(1);
  }, []);

  const loadRpujRequests = useCallback(async () => {
    if (activeTab.id !== 'rpuj-approval') return;
    setRpujLoading(true);
    setRpujError('');
    try {
      const result = await fetchFinanceRpujRequests({
        page: rpujPage,
        pageSize: RPUJ_TABLE_PAGE_SIZE,
        status: rpujStatusParam(activeRpujTab),
        ...(query.trim() ? { query: query.trim() } : {}),
        ...(rpujDateFrom ? { dateFrom: rpujDateFrom } : {}),
        ...(rpujDateTo ? { dateTo: rpujDateTo } : {}),
      });
      const normalizedRows = (result.rows || []).map(normalizeFinanceRpujRow);
      setRpujRows(normalizedRows);
      const nextRpujTotal = Number(result.total ?? result.rows?.length ?? 0);
      const nextRpujTotalPages = Math.max(1, Number(result.totalPages || Math.ceil(nextRpujTotal / RPUJ_TABLE_PAGE_SIZE) || 1));
      setRpujTotal(nextRpujTotal);
      setRpujTotalPages(nextRpujTotalPages);
      if (rpujPage > nextRpujTotalPages) setRpujPage(nextRpujTotalPages);
      setRpujSummary(result.summary ? normalizeRpujSummary(result.summary) : summarizeRpujRows(normalizedRows));
    } catch (error) {
      setRpujError(error.message || 'Data pengajuan RPUJ gagal dimuat.');
      setRpujRows([]);
      setRpujTotal(0);
      setRpujTotalPages(1);
      setRpujSummary(defaultRpujSummary);
    } finally {
      setRpujLoading(false);
    }
  }, [activeRpujTab, activeTab.id, query, rpujDateFrom, rpujDateTo, rpujPage]);

  useEffect(() => {
    loadRpujRequests();
  }, [loadRpujRequests]);

  const loadInvoiceOrders = useCallback(async () => {
    if (activeTab.id !== 'invoice-number') return;
    setInvoiceLoading(true);
    setInvoiceError('');
    try {
      const result = await fetchFinanceInvoices({
        page: invoicePage,
        pageSize: INVOICE_TABLE_PAGE_SIZE,
        ...(query.trim() ? { query: query.trim() } : {}),
        dateBasis: 'updated',
        ...(invoiceDateFrom ? { dateFrom: invoiceDateFrom } : {}),
        ...(invoiceDateTo ? { dateTo: invoiceDateTo } : {}),
        invoiceDocumentFilter: activeInvoiceTab === 'paid' ? 'all' : activeInvoiceDocumentFilter,
        ...(activeInvoiceTab === 'in-progress' || activeInvoiceTab === 'paid'
          ? { status: activeInvoiceTab }
          : activeInvoiceTab === 'need-number'
            ? { status: activeInvoiceTab }
            : {}),
      });
      setInvoiceRows((result.rows || []).map(normalizeFinanceInvoiceRow));
      const nextInvoiceTotal = Number(result.total ?? result.rows?.length ?? 0);
      const nextInvoiceTotalPages = Math.max(1, Number(result.totalPages || Math.ceil(nextInvoiceTotal / INVOICE_TABLE_PAGE_SIZE) || 1));
      setInvoiceTotal(nextInvoiceTotal);
      setInvoiceTotalPages(nextInvoiceTotalPages);
      if (invoicePage > nextInvoiceTotalPages) setInvoicePage(nextInvoiceTotalPages);
      setInvoiceSummary({
        needNumber: Number(result.summary?.needNumber || 0),
        inProgress: Number(result.summary?.inProgress || 0),
        paid: Number(result.summary?.paid || 0),
        missingInvoiceDocuments: Number(
          result.summary?.missingInvoiceDocuments
          ?? Math.max(
            Number(result.summary?.missingInvoiceDocument || 0),
            Number(result.summary?.missingTaxInvoiceDocument || 0),
          ),
        ),
        missingInvoiceDocument: Number(result.summary?.missingInvoiceDocument || 0),
        missingTaxInvoiceDocument: Number(result.summary?.missingTaxInvoiceDocument || 0),
        completeInvoiceDocuments: Number(result.summary?.completeInvoiceDocuments || 0),
        sentInvoiceDocuments: Number(result.summary?.sentInvoiceDocuments || 0),
      });
    } catch (error) {
      setInvoiceError(error.message || 'Daftar invoice gagal dimuat.');
      setInvoiceRows([]);
      setInvoiceTotal(0);
      setInvoiceTotalPages(1);
      setInvoiceSummary(defaultInvoiceSummary);
    } finally {
      setInvoiceLoading(false);
    }
  }, [activeInvoiceDocumentFilter, activeInvoiceTab, activeTab.id, invoiceDateFrom, invoiceDateTo, invoicePage, query]);

  useEffect(() => {
    loadInvoiceOrders();
  }, [loadInvoiceOrders]);

  useEffect(() => {
    if (!selectedInvoiceId) return undefined;
    let active = true;
    setInvoiceDetail(null);
    setInvoiceDetailLoading(true);
    setInvoiceDetailError('');

    fetchFinanceInvoiceDetail(selectedInvoiceId)
      .then((result) => {
        if (active) setInvoiceDetail(normalizeFinanceInvoiceRow(result));
      })
      .catch((error) => {
        if (active) setInvoiceDetailError(error.message || 'Dokumen detail invoice gagal dimuat.');
      })
      .finally(() => {
        if (active) setInvoiceDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedInvoiceId]);

  useEffect(() => {
    const targetId = selectedOrderId || selectedInvoiceId;
    if (!targetId) {
      setCorrectionHistory([]);
      setCorrectionHistoryError('');
      setCorrectionHistoryLoading(false);
      return undefined;
    }

    let active = true;
    setCorrectionHistory([]);
    setCorrectionHistoryError('');
    setCorrectionHistoryLoading(true);
    const request = selectedInvoiceId ? fetchFinanceInvoiceCorrections(targetId) : fetchFinanceOrderCorrections(targetId);
    request
      .then((result) => {
        if (active) setCorrectionHistory((Array.isArray(result) ? result : result.rows || []).map(normalizeFinanceCorrection));
      })
      .catch((error) => {
        if (active) setCorrectionHistoryError(error.message || 'Riwayat koreksi gagal dimuat.');
      })
      .finally(() => {
        if (active) setCorrectionHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedOrderId, selectedInvoiceId]);

  function resetSimulation() {
    if (activeTab.id === 'order-verification') {
      loadOrderVerifications();
      return;
    }
    if (activeTab.id === 'rpuj-approval') {
      loadRpujRequests();
      return;
    }
    if (activeTab.id === 'invoice-number') {
      loadInvoiceOrders();
      return;
    }
    setRpujRows(initialRpujRows);
    setRpujSummary(defaultRpujSummary);
    setInvoiceRows(initialInvoiceRows);
    setInvoiceSummary(defaultInvoiceSummary);
    setSelectedOrderId('');
    setSelectedRpujId('');
    setSelectedInvoiceId('');
    setQuery('');
  }

  function closeSoModal() {
    if (savingSoId) return;
    setSoModalId('');
    setSoModalValue('');
    setSoModalError('');
  }

  async function saveSoNumberFromModal(event) {
    event.preventDefault();
    const soNumber = String(soModalValue || '').trim().toUpperCase();
    if (!soNumber) {
      setSoModalError('Nomor SO Accurate wajib diisi.');
      return;
    }

    setSavingSoId(soModalId);
    setSoModalError('');
    setOrderError('');
    try {
      const saved = await updateFinanceOrderSoNumber(soModalId, soNumber);
      const normalized = normalizeFinanceOrderRow(saved);
      setOrderRows((rows) => rows.map((item) => (item.id === soModalId ? normalized : item)));
      setSoModalId('');
      setSoModalValue('');
    } catch (error) {
      setSoModalError(error.message || 'Nomor SO Accurate gagal disimpan.');
    } finally {
      setSavingSoId('');
    }
  }

  function closeRpujDecisionModal() {
    if (rpujBusyId) return;
    setRpujDecision(null);
    setRpujDecisionNote('');
    setRpujDecisionError('');
  }

  async function submitRpujDecision(event) {
    event.preventDefault();
    if (!rpujDecision?.id) return;
    const rejectionNote = rpujDecisionNote.trim();
    if (rpujDecision.type === 'reject' && !rejectionNote) {
      setRpujDecisionError('Catatan reject wajib diisi agar Operational mengetahui bagian yang harus diperbaiki.');
      return;
    }

    setRpujBusyId(rpujDecision.id);
    setRpujDecisionError('');
    setRpujError('');
    try {
      const previousStatus = rpujDecisionRow?.rpujStatus || '';
      const saved = rpujDecision.type === 'reject'
        ? await rejectFinanceRpuj(rpujDecision.id, rejectionNote)
        : await approveFinanceRpuj(rpujDecision.id);
      const normalized = normalizeFinanceRpujRow(saved);
      setRpujRows((rows) => rows.map((row) => (row.id === rpujDecision.id ? normalized : row)));
      setRpujSummary((summary) => applyRpujSummaryTransition(summary, previousStatus, normalized.rpujStatus));
      if (previousStatus && previousStatus !== normalized.rpujStatus) {
        setRpujTotal((total) => Math.max(0, Number(total || 0) - 1));
      }
      setRpujDecision(null);
      setRpujDecisionNote('');
    } catch (error) {
      setRpujDecisionError(error.message || (rpujDecision.type === 'reject' ? 'RPUJ gagal ditolak.' : 'RPUJ gagal disetujui.'));
    } finally {
      setRpujBusyId('');
    }
  }

  function closeTransferModal() {
    if (rpujBusyId) return;
    setTransferModalId('');
    setTransferFile(null);
    setTransferModalError('');
  }

  function selectTransferFile(file) {
    if (!file) return;
    const validationError = validateArchiveFile(file, { label: 'Bukti transfer UJ' });
    if (validationError) {
      setTransferFile(null);
      setTransferModalError(validationError);
      return;
    }
    setTransferFile(file);
    setTransferModalError('');
  }

  async function submitTransferProof(event) {
    event.preventDefault();
    if (!transferModalId || !transferFile) {
      setTransferModalError('Pilih file bukti transfer terlebih dahulu.');
      return;
    }

    setRpujBusyId(transferModalId);
    setTransferModalError('');
    setRpujError('');
    try {
      const previousStatus = transferModalRow?.rpujStatus || '';
      const saved = await uploadFinanceRpujTransferProof(transferModalId, transferFile);
      const normalized = normalizeFinanceRpujRow(saved);
      setRpujRows((rows) => rows.map((row) => (row.id === transferModalId ? normalized : row)));
      setRpujSummary((summary) => applyRpujSummaryTransition(summary, previousStatus, normalized.rpujStatus));
      if (previousStatus && previousStatus !== normalized.rpujStatus) {
        setRpujTotal((total) => Math.max(0, Number(total || 0) - 1));
      }
      setTransferModalId('');
      setTransferFile(null);
    } catch (error) {
      setTransferModalError(error.message || 'Bukti transfer gagal diupload.');
    } finally {
      setRpujBusyId('');
    }
  }

  function closeInvoiceConfirmModal() {
    if (invoiceBusyId) return;
    setInvoiceConfirmId('');
    setInvoiceConfirmError('');
  }

  function openCorrectionModal(row, type) {
    setCorrectionModal({
      ...row,
      type,
      invoiceNumber: row.invoiceNumber || '',
      soNumber: row.soNumber || '',
      customer: row.customer || '-',
      destination: row.destination || '-',
    });
    setCorrectionValue(type === 'invoice_number' ? row.invoiceNumber || '' : row.soNumber || '');
    setCorrectionReason('');
    setCorrectionError('');
  }

  function closeCorrectionModal() {
    if (correctionBusy) return;
    setCorrectionModal(null);
    setCorrectionValue('');
    setCorrectionReason('');
    setCorrectionError('');
  }

  async function refreshCorrectionHistory(targetId, type) {
    setCorrectionHistoryLoading(true);
    setCorrectionHistoryError('');
    try {
      const result = type === 'invoice_number'
        ? await fetchFinanceInvoiceCorrections(targetId)
        : await fetchFinanceOrderCorrections(targetId);
      setCorrectionHistory((Array.isArray(result) ? result : result.rows || []).map(normalizeFinanceCorrection));
    } catch (error) {
      setCorrectionHistoryError(error.message || 'Riwayat koreksi gagal dimuat.');
    } finally {
      setCorrectionHistoryLoading(false);
    }
  }

  async function submitCorrection(event) {
    event.preventDefault();
    if (!correctionModal?.id) return;
    const requestedValue = String(correctionValue || '').trim().toUpperCase();
    const reason = correctionReason.trim();
    if (!requestedValue) {
      setCorrectionError(correctionModal.type === 'invoice_number' ? 'Nomor invoice baru wajib diisi.' : 'Nomor SO baru wajib diisi.');
      return;
    }
    if (!reason) {
      setCorrectionError('Alasan koreksi wajib diisi.');
      return;
    }

    setCorrectionBusy(true);
    setCorrectionError('');
    try {
      const saved = correctionModal.type === 'invoice_number'
        ? await requestFinanceInvoiceCorrection(correctionModal.id, { requestedValue, reason })
        : await requestFinanceOrderSoCorrection(correctionModal.id, { requestedValue, reason });

      if (saved.status === 'applied') {
        if (correctionModal.type === 'invoice_number') {
          setInvoiceRows((rows) => rows.map((row) => (row.id === correctionModal.id ? { ...row, invoiceNumber: requestedValue } : row)));
          setInvoiceDetail((detail) => (detail?.id === correctionModal.id ? { ...detail, invoiceNumber: requestedValue } : detail));
        } else {
          setOrderRows((rows) => rows.map((row) => (row.id === correctionModal.id ? { ...row, soNumber: requestedValue, soNumberDraft: requestedValue } : row)));
        }
      }

      await refreshCorrectionHistory(correctionModal.id, correctionModal.type);
      setCorrectionModal(null);
      setCorrectionValue('');
      setCorrectionReason('');
    } catch (error) {
      setCorrectionError(error.message || 'Request koreksi gagal dikirim.');
    } finally {
      setCorrectionBusy(false);
    }
  }

  async function submitInvoiceNumber(event) {
    event.preventDefault();
    const row = invoiceRows.find((item) => item.id === invoiceConfirmId);
    const invoiceNumber = String(row?.invoiceNumber || '').trim().toUpperCase();
    if (!invoiceNumber) {
      setInvoiceConfirmError('Nomor invoice wajib diisi sebelum dikirim.');
      return;
    }
    if (invoiceNumber.length < 4) {
      setInvoiceConfirmError('Nomor invoice terlalu pendek. Cek kembali nomor dari dokumen invoice.');
      return;
    }

    setInvoiceBusyId(invoiceConfirmId);
    setInvoiceConfirmError('');
    setInvoiceError('');
    try {
      const saved = await updateFinanceInvoiceNumber(invoiceConfirmId, invoiceNumber);
      const normalized = normalizeFinanceInvoiceRow(saved);
      setInvoiceRows((rows) => rows.map((item) => (item.id === invoiceConfirmId ? normalized : item)));
      setInvoiceConfirmId('');
    } catch (error) {
      setInvoiceConfirmError(error.message || 'Nomor invoice gagal disimpan.');
    } finally {
      setInvoiceBusyId('');
    }
  }

  async function handleUploadInvoiceDocument(id, documentType, file) {
    if (!id || !documentType || !file) return;
    const busyKey = `${id}:${documentType}`;
    setInvoiceDocumentBusyKey(busyKey);
    setInvoiceDocumentUploadError('');
    setInvoiceDetailError('');
    try {
      const saved = await uploadFinanceInvoiceDocument(id, documentType, file);
      const normalized = normalizeFinanceInvoiceRow(saved);
      setInvoiceRows((rows) => rows.map((item) => (item.id === id ? { ...item, ...normalized } : item)));
      const uploadedDocument = mapUploadedInvoiceDocument(saved.uploadedDocument, documentType);
      setInvoiceDetail((current) => {
        const currentDocuments = current?.documents || [];
        const normalizedDocuments = Array.isArray(normalized.documents) && normalized.documents.length
          ? normalized.documents
          : currentDocuments;
        const base = current ? { ...current, ...normalized } : normalized;
        return {
          ...base,
          documents: mergeInvoiceDocument(normalizedDocuments, uploadedDocument),
        };
      });
    } catch (error) {
      setInvoiceDocumentUploadError(error.message || 'Dokumen invoice gagal diupload.');
      throw error;
    } finally {
      setInvoiceDocumentBusyKey('');
    }
  }

  const handlers = {
    onOpenSoModal: (id) => {
      const row = orderRows.find((item) => item.id === id);
      setSoModalId(id);
      setSoModalValue(row?.soNumberDraft || row?.soNumber || '');
      setSoModalError('');
    },
    onSelectOrder: (id) => setSelectedOrderId(id),
    onSelectRpuj: (id) => setSelectedRpujId(id),
    onSelectInvoice: (id) => {
      setSelectedInvoiceId(id);
      setInvoiceDetail(null);
      setInvoiceDetailError('');
      setInvoiceDocumentUploadError('');
    },
    onReject: (id) => {
      setRpujDecision({ id, type: 'reject' });
      setRpujDecisionNote('');
      setRpujDecisionError('');
    },
    onApprove: (id) => {
      setRpujDecision({ id, type: 'approve' });
      setRpujDecisionNote('');
      setRpujDecisionError('');
    },
    onOpenUploadModal: (id) => {
      setTransferModalId(id);
      setTransferFile(null);
      setTransferModalError('');
    },
    onInvoiceChange: (id, value) => {
      setInvoiceRows((rows) => rows.map((row) => (row.id === id ? { ...row, invoiceNumber: value } : row)));
    },
    onSaveInvoice: (id) => {
      const row = invoiceRows.find((item) => item.id === id);
      const invoiceNumber = String(row?.invoiceNumber || '').trim().toUpperCase();
      setInvoiceError('');
      setInvoiceConfirmError('');
      if (!invoiceNumber) {
        setInvoiceError('Nomor invoice wajib diisi sebelum dikirim.');
        return;
      }
      if (invoiceNumber.length < 4) {
        setInvoiceError('Nomor invoice terlalu pendek. Cek kembali nomor dari dokumen invoice.');
        return;
      }
      setInvoiceRows((rows) => rows.map((item) => (item.id === id ? { ...item, invoiceNumber } : item)));
      setInvoiceConfirmId(id);
    },
  };

  return (
    <main className="finance-workflow-page min-h-screen bg-slate-50 px-3 py-3 text-slate-900">
      <FinanceTable
        activeInvoiceDocumentFilter={activeInvoiceDocumentFilter}
        activeInvoiceTab={activeInvoiceTab}
        activeOrderTab={activeOrderTab}
        activeRpujTab={activeRpujTab}
        activeTab={activeTab}
        handlers={handlers}
        invoiceBusyId={invoiceBusyId}
        invoiceDateFrom={invoiceDateFrom}
        invoiceDateTo={invoiceDateTo}
        invoiceError={invoiceError}
        invoiceFilterMonth={invoiceFilterMonth}
        invoiceLoading={invoiceLoading}
        invoicePage={invoicePage}
        invoiceRows={invoiceRows}
        invoiceSummary={invoiceSummary}
        invoiceTotal={invoiceTotal}
        invoiceTotalPages={invoiceTotalPages}
        onActiveInvoiceDocumentFilterChange={handleActiveInvoiceDocumentFilterChange}
        onActiveInvoiceTabChange={handleActiveInvoiceTabChange}
        onActiveOrderTabChange={handleActiveOrderTabChange}
        onActiveRpujTabChange={handleActiveRpujTabChange}
        onInvoiceDateFromChange={handleInvoiceDateFromChange}
        onInvoiceDateToChange={handleInvoiceDateToChange}
        onInvoiceFilterMonthChange={handleInvoiceFilterMonthChange}
        onInvoicePageChange={setInvoicePage}
        onOrderPageChange={setOrderPage}
        onRpujPageChange={setRpujPage}
        onOrderDateFromChange={handleOrderDateFromChange}
        onOrderDateToChange={handleOrderDateToChange}
        onOrderFilterMonthChange={handleOrderFilterMonthChange}
        onReset={resetSimulation}
        onResetInvoiceDateFilter={handleResetInvoiceDateFilter}
        onResetOrderDateFilter={handleResetOrderDateFilter}
        onResetRpujDateFilter={handleResetRpujDateFilter}
        onQueryChange={handleQueryChange}
        orderDateFrom={orderDateFrom}
        orderDateTo={orderDateTo}
        orderError={orderError}
        orderFilterMonth={orderFilterMonth}
        orderLoading={orderLoading}
        orderPage={orderPage}
        orderRows={orderRows}
        orderSummary={orderSummary}
        orderTotal={orderTotal}
        orderTotalPages={orderTotalPages}
        rpujDateFrom={rpujDateFrom}
        rpujDateTo={rpujDateTo}
        rpujBusyId={rpujBusyId}
        rpujError={rpujError}
        rpujFilterMonth={rpujFilterMonth}
        rpujLoading={rpujLoading}
        rpujPage={rpujPage}
        rpujSummary={rpujSummary}
        rpujTotal={rpujTotal}
        rpujTotalPages={rpujTotalPages}
        query={query}
        rpujRows={rpujRows}
        onRpujDateFromChange={handleRpujDateFromChange}
        onRpujDateToChange={handleRpujDateToChange}
        onRpujFilterMonthChange={handleRpujFilterMonthChange}
        savingSoId={savingSoId}
      />

      <OrderDetailModal
        corrections={correctionHistory}
        correctionsError={correctionHistoryError}
        correctionsLoading={correctionHistoryLoading}
        onClose={() => setSelectedOrderId('')}
        onOpenCorrection={openCorrectionModal}
        order={selectedOrder}
      />
      <RpujDetailModal
        onClose={() => setSelectedRpujId('')}
        rpuj={selectedRpuj}
      />
      <InvoiceDetailModal
        corrections={correctionHistory}
        correctionsError={correctionHistoryError}
        correctionsLoading={correctionHistoryLoading}
        error={invoiceDetailError}
        invoice={selectedInvoice}
        invoiceDocumentBusyKey={invoiceDocumentBusyKey}
        invoiceDocumentUploadError={invoiceDocumentUploadError}
        loading={invoiceDetailLoading}
        onClose={() => {
          setSelectedInvoiceId('');
          setInvoiceDetail(null);
          setInvoiceDetailError('');
          setInvoiceDocumentUploadError('');
        }}
        onOpenCorrection={openCorrectionModal}
        onUploadInvoiceDocument={handleUploadInvoiceDocument}
      />
      <SoNumberInputModal
        busy={savingSoId === soModalId}
        error={soModalError}
        onChange={(value) => {
          setSoModalValue(value);
          setSoModalError('');
        }}
        onClose={closeSoModal}
        onConfirm={saveSoNumberFromModal}
        order={soModalOrder}
        value={soModalValue}
      />
      <RpujDecisionModal
        busy={rpujBusyId === rpujDecision?.id}
        decision={rpujDecision?.type}
        error={rpujDecisionError}
        note={rpujDecisionNote}
        onClose={closeRpujDecisionModal}
        onConfirm={submitRpujDecision}
        onNoteChange={(value) => {
          setRpujDecisionNote(value);
          setRpujDecisionError('');
        }}
        row={rpujDecisionRow}
      />
      <RpujTransferUploadModal
        busy={rpujBusyId === transferModalId}
        error={transferModalError}
        file={transferFile}
        onClose={closeTransferModal}
        onConfirm={submitTransferProof}
        onFileChange={selectTransferFile}
        row={transferModalRow}
      />
      <InvoiceNumberConfirmModal
        busy={invoiceBusyId === invoiceConfirmId}
        error={invoiceConfirmError}
        onClose={closeInvoiceConfirmModal}
        onConfirm={submitInvoiceNumber}
        row={invoiceConfirmRow}
      />
      <FinanceCorrectionModal
        busy={correctionBusy}
        context={correctionModal}
        error={correctionError}
        onClose={closeCorrectionModal}
        onConfirm={submitCorrection}
        onReasonChange={(value) => {
          setCorrectionReason(value);
          setCorrectionError('');
        }}
        onValueChange={(value) => {
          setCorrectionValue(value);
          setCorrectionError('');
        }}
        reason={correctionReason}
        value={correctionValue}
      />
    </main>
  );
}

export default FinanceWorkflowPage;
