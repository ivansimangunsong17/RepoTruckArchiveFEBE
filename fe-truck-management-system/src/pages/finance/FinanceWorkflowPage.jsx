import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Eye,
  Info,
  FileText,
  ReceiptText,
  RotateCcw,
  Search,
  Upload,
} from 'lucide-react';
import {
  approveFinanceRpuj,
  fetchFinanceInvoices,
  fetchFinanceOrderVerifications,
  fetchFinanceRpujRequests,
  rejectFinanceRpuj,
  updateFinanceInvoiceNumber,
  updateFinanceOrderSoNumber,
  uploadFinanceRpujTransferProof,
} from '../../services/finance/financeService';
import { validateArchiveFile } from '../../utils/fileValidation';

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
    billingItems: ['Jasa Angkut D40 - 1 ritase', 'Jasa Handling'],
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
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function normalizeFinanceOrderRow(row = {}) {
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
    runningDate: formatDisplayDate(row.runningDate),
    container: row.container || '-',
    vesselName: row.vesselName || '-',
    terminal: row.terminal || '-',
    depo: row.depo || row.origin || '-',
    document: row.document || '-',
    notes: row.notes || '-',
    status: row.status || (row.soNumber ? 'No. SO Terisi' : 'Menunggu No. SO Accurate'),
    soNumber: row.soNumber || '',
    soNumberDraft: row.soNumber || '',
    verificationStatus: row.verificationStatus || (row.soNumber ? 'verified' : 'pending_so'),
    operationalStatus: row.operationalStatus || '',
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
  return {
    id: row.id,
    soNumber: row.soNumber || '-',
    jobNumber: row.jobNumber || '-',
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
    totalUj: Number(row.totalUj || 0),
    additionalCost: Number(row.additionalCost || 0),
    status: row.status || 'Belum Diajukan',
    rpujStatus,
    transferProof: row.transferProof || row.transferProofFile?.name || '',
    transferProofFile: row.transferProofFile || null,
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
    paymentTerms: row.paymentTerms || '-',
    invoiceDate: formatDisplayDate(row.invoiceDate),
    dueDate: formatDisplayDate(row.dueDate),
    billingItems: Array.isArray(row.billingItems) && row.billingItems.length ? row.billingItems : ['Rincian tagihan belum tersedia'],
    documentChecklist: Array.isArray(row.documentChecklist) ? row.documentChecklist : [],
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

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function statusClass(value) {
  if (String(value).includes('Lunas')) return 'border-slate-200 bg-slate-100 text-slate-700';
  if (String(value).includes('Menunggu')) return 'border-slate-200 bg-slate-50 text-slate-600';
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
    <div className={`rounded-md border px-2.5 py-2 ${highlight ? 'border-slate-200 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-950'} ${className}`}>
      <span className={`block text-[10px] font-bold uppercase tracking-wide ${highlight ? 'text-slate-300' : 'text-slate-500'}`}>{label}</span>
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

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <strong className="text-right text-xs font-semibold text-slate-900">{value || '-'}</strong>
    </div>
  );
}

function OrderDetailModal({ order, onClose }) {
  if (!order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" role="presentation" onMouseDown={onClose}>
      <section className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
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
          </div>

          <div className="mt-2 grid gap-2 xl:grid-cols-[1fr_240px]">
            <DetailField label="Catatan Order" value={order.notes} />
            <DetailField label="Nomor SO Accurate" value={order.soNumber} />
          </div>
        </div>
      </section>
    </div>
  );
}

function RpujDetailModal({ rpuj, onClose }) {
  if (!rpuj) return null;

  const totalRequest = rpuj.totalUj + rpuj.additionalCost;

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
            <p className="mt-0.5 text-xs text-slate-500">{rpuj.destination} - {rpuj.customer}</p>
          </div>
          <button className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50" onClick={onClose} type="button">
            Tutup
          </button>
        </header>

        <div className="finance-rpuj-detail-body">
          <section className="finance-rpuj-detail-card">
            <div className="finance-rpuj-info-grid">
              <DetailField className="finance-rpuj-detail-field span-2" label="No. Job" value={rpuj.jobNumber} />
              <DetailField className="finance-rpuj-detail-field" label="No. SPK" value={rpuj.spkNumber} />
              <DetailField className="finance-rpuj-detail-field" label="Tanggal Jalan" value={rpuj.departureDate} />
              <DetailField className="finance-rpuj-detail-field span-2" label="Container" value={rpuj.container} />
              <DetailField className="finance-rpuj-detail-field" label="Truck" value={rpuj.truck} />
              <DetailField className="finance-rpuj-detail-field" label="Jenis Order" value={rpuj.orderType} />
              <DetailField className="finance-rpuj-detail-field" label="Driver" value={rpuj.driver} />
              <DetailField className="finance-rpuj-detail-field" label="Rekening / E-Money Driver" value={rpuj.driverBankAccount} />
              <DetailField className="finance-rpuj-detail-field" label="Terminal" value={rpuj.terminal} />
              <DetailField className="finance-rpuj-detail-field" label="Depo" value={rpuj.depo} />
            </div>
          </section>

          <section className="finance-rpuj-detail-card is-subtle">
            <div className="finance-rpuj-section-head">
              <h4 className="text-sm font-black text-slate-950">Rincian Pengajuan</h4>
              <div>
                <span>{rpuj.transferProof || 'Bukti transfer belum ada'}</span>
                <button className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 disabled:opacity-40" disabled={!rpuj.transferProof} type="button">Preview</button>
                <button className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 disabled:opacity-40" disabled={!rpuj.transferProof} type="button">Download</button>
              </div>
            </div>
            <div className="finance-rpuj-amount-grid">
              <AmountField className="finance-rpuj-amount-field" label="Total UJ" value={rpuj.totalUj} />
              <AmountField className="finance-rpuj-amount-field" label="Biaya Tambahan" value={rpuj.additionalCost} />
              <AmountField className="finance-rpuj-amount-field" highlight label="Total Pengajuan" value={totalRequest} />
            </div>
            <div className="finance-rpuj-note-grid">
              <DetailField className="finance-rpuj-detail-field" label="Rekomendasi UJ" value={rpuj.ujRecommendation} />
              <DetailField className="finance-rpuj-detail-field" label="Catatan Pengajuan" value={rpuj.notes} />
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function InvoiceDetailModal({ invoice, onClose }) {
  if (!invoice) return null;

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
          <div className="finance-invoice-detail-grid">
            <section className="finance-invoice-summary-card">
              <div className="rounded-md bg-slate-50 p-2.5">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Nilai Tagih</span>
                <strong className="mt-1 block text-xl font-black text-slate-950">{formatCurrency(invoice.billingAmount)}</strong>
              </div>
              <div className="mt-2.5">
                <InfoRow label="Terms" value={invoice.paymentTerms} />
                <InfoRow label="Jatuh Tempo" value={invoice.dueDate} />
                <InfoRow label="Tgl Selesai" value={invoice.completedAt} />
                <InfoRow label="Tgl Invoice" value={invoice.invoiceDate} />
                <InfoRow label="No. Invoice" value={invoice.invoiceNumber || 'Belum ada'} />
                <InfoRow label="Dokumen" value={invoice.documentStatus} />
              </div>
            </section>

            <section className="finance-invoice-detail-stack">
              <div className="finance-invoice-detail-card">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-black text-slate-950">Dokumen Dasar Tagih</h4>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">Siap Invoice</span>
                </div>
                <CompactList items={invoice.documentChecklist} />
              </div>

              <div className="finance-invoice-detail-columns">
                <div className="finance-invoice-detail-card">
                  <h4 className="mb-2 text-sm font-black text-slate-950">Rincian Tagihan</h4>
                  <CompactList items={invoice.billingItems} />
                </div>
                <div className="finance-invoice-detail-card">
                  <h4 className="mb-2 text-sm font-black text-slate-950">Riwayat Finance</h4>
                  <ActivityLogList logs={invoice.activityLogs} />
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}

function OrderVerificationTable({ rows, query, onQueryChange, onSelectOrder, onSoChange, onSaveSoNumber, savingSoId }) {
  const isVerifiedOrder = (row) => row.verificationStatus === 'verified' || Boolean(row.soNumber);
  const orderTabs = [
    { id: 'need-so', label: 'Belum Ada Nomor SO', icon: Clock3, match: (row) => !isVerifiedOrder(row) },
    { id: 'running', label: 'SO Berjalan', icon: CheckCircle2, match: isVerifiedOrder },
  ];
  const [activeOrderTab, setActiveOrderTab] = useState(orderTabs[0].id);
  const currentTab = orderTabs.find((tab) => tab.id === activeOrderTab) || orderTabs[0];
  const searchedRows = rows.filter((row) => `${row.soNumber} ${row.salesName} ${row.customer} ${row.destination} ${row.paymentTerms}`.toLowerCase().includes(query.toLowerCase()));
  const filteredRows = searchedRows.filter((row) => currentTab.match(row));
  const groupedRows = filteredRows.reduce((groups, row) => {
    const salesName = row.salesName || 'Tanpa Sales';
    if (!groups[salesName]) groups[salesName] = [];
    groups[salesName].push(row);
    return groups;
  }, {});

  return (
    <div className="space-y-0">
      <div className="border-b border-slate-200 bg-slate-50 px-2 py-1">
        <div className="max-w-sm">
          <SearchBar query={query} onChange={onQueryChange} />
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 shadow-sm" role="tablist" aria-label="Filter verifikasi nomor SO">
          {orderTabs.map((tab) => {
            const count = searchedRows.filter((row) => tab.match(row)).length;
            const active = tab.id === activeOrderTab;
            const Icon = tab.icon;
            const activeTone = tab.id === 'need-so'
              ? 'border-red-200 bg-red-50 text-red-800 ring-red-100'
              : 'border-sky-200 bg-sky-50 text-sky-800 ring-sky-100';
            const inactiveTone = 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-800';
            const iconTone = active
              ? tab.id === 'need-so'
                ? 'bg-white text-red-600 ring-1 ring-red-100'
                : 'bg-white text-sky-600 ring-1 ring-sky-100'
              : 'bg-white text-slate-400';
            const countTone = active
              ? tab.id === 'need-so'
                ? 'bg-red-100 text-red-700'
                : 'bg-sky-100 text-sky-700'
              : 'bg-white text-slate-500';

            return (
              <button
                aria-selected={active}
                className={`inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-bold transition ${active ? `${activeTone} shadow-sm ring-1` : inactiveTone}`}
                key={tab.id}
                onClick={() => setActiveOrderTab(tab.id)}
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
        <table className="data-table master-table finance-master-table min-w-[1020px]">
          <thead>
            <tr>
              {['Order Dibuat', 'Tujuan', 'Jenis Order', 'Payment Terms', 'Tanggal Jalan', 'Nomor SO Accurate', 'Aksi'].map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupedRows).map(([salesName, salesRows]) => (
              <Fragment key={salesName}>
                <tr className="finance-group-row">
                  <td colSpan={7}>
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
                  <td className="h-px bg-slate-200 p-0" colSpan={7} />
                </tr>
                {salesRows.map((row) => (
                  <Fragment key={row.id}>
                    <tr className="align-middle hover:bg-slate-50">
                      <td className="px-2 py-1 font-semibold text-slate-700">{row.orderDate}</td>
                      <td className="px-2 py-1 font-black text-slate-900">{row.destination}</td>
                      <td className="px-2 py-1 text-slate-700">{row.orderType}</td>
                      <td className="px-2 py-1">
                        <StatusPill value={row.paymentTerms} />
                      </td>
                      <td className="px-2 py-1 font-semibold text-slate-800">{row.runningDate}</td>
                      <td className="px-2 py-1">
                        {activeOrderTab === 'need-so' ? (
                          <div className="flex min-w-[190px] items-center gap-1">
                            <input
                              className="h-6 w-32 rounded-lg border border-slate-300 px-2 text-[11px] font-semibold text-slate-900 outline-none focus:border-slate-400"
                              onChange={(event) => onSoChange(row.id, event.target.value)}
                              placeholder="SO Accurate"
                              value={row.soNumberDraft || ''}
                            />
                            <button
                              className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                              disabled={!String(row.soNumberDraft || '').trim() || savingSoId === row.id}
                              onClick={() => onSaveSoNumber(row.id)}
                              type="button"
                            >
                              {savingSoId === row.id ? 'Menyimpan' : 'Simpan'}
                            </button>
                          </div>
                        ) : (
                          <div>
                            <span className="block text-[11px] font-black text-slate-900">{row.soNumber}</span>
                            <span className="mt-0.5 block text-[9px] font-semibold text-slate-500">Order sedang berjalan</span>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1">
                        <button className="rounded-md bg-slate-900 px-1.5 py-1 text-[10px] font-semibold text-white hover:bg-slate-800" onClick={() => onSelectOrder(row.id)} type="button">Detail</button>
                      </td>
                    </tr>
                    <tr aria-hidden="true">
                      <td className="h-px bg-slate-200 p-0" colSpan={7} />
                    </tr>
                  </Fragment>
                ))}
              </Fragment>
            ))}
            {!filteredRows.length ? (
              <tr>
                <td className="px-3 py-2.5 text-center text-xs font-semibold text-slate-400" colSpan={7}>Tidak ada order pada klasifikasi ini.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RpujApprovalTable({ rows, query, onApprove, onReject, onUpload, onSelectRpuj, rpujBusyId }) {
  const [activeRpujTab, setActiveRpujTab] = useState('need-approval');

  const searchableRows = rows.filter((row) =>
    `${row.soNumber} ${row.jobNumber} ${row.customer} ${row.destination} ${row.container} ${row.driver} ${row.truck} ${row.status}`.toLowerCase().includes(query.toLowerCase()));

  const needsApprovalRows = searchableRows.filter((row) => row.rpujStatus === 'submitted');
  const readyTransferRows = searchableRows.filter((row) => row.rpujStatus === 'approved');
  const paidRows = searchableRows.filter((row) => row.rpujStatus === 'paid');

  const tabs = [
    { id: 'need-approval', label: 'Butuh Approval', icon: Clock3, count: needsApprovalRows.length, tone: 'red' },
    { id: 'ready-transfer', label: 'Siap Transfer', icon: Upload, count: readyTransferRows.length, tone: 'amber' },
    { id: 'paid', label: 'UJ Dikirim', icon: CheckCircle2, count: paidRows.length, tone: 'emerald' },
  ];

  const activeRows = activeRpujTab === 'ready-transfer'
    ? readyTransferRows
    : activeRpujTab === 'paid'
      ? paidRows
      : needsApprovalRows;
  const groupedRows = activeRows.reduce((groups, row) => {
    if (!groups[row.soNumber]) groups[row.soNumber] = [];
    groups[row.soNumber].push(row);
    return groups;
  }, {});

  return (
    <div className="overflow-hidden rounded-b-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
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
                onClick={() => setActiveRpujTab(tab.id)}
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
      </div>

      <div className="table-wrap">
          <table className="data-table master-table finance-master-table min-w-[1180px] table-fixed">
            <colgroup>
              <col className="w-[25%]" />
              <col className="w-[18%]" />
              <col className="w-[12%]" />
              <col className="w-[22%]" />
              <col className="w-[23%]" />
            </colgroup>
            <thead>
              <tr>
                {['Job / Container', 'Pengajuan', 'Status', 'Driver / Rekening', 'Aksi'].map((column) => (
                  <th key={column}>{column}</th>
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
                      <td colSpan={5}>
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
                      <td className="h-px bg-slate-200 p-0" colSpan={5} />
                    </tr>
                    {soRows.map((row) => {
                      const canUploadTransfer = row.rpujStatus === 'approved';
                      const busy = rpujBusyId === row.id;
                      const rowTotal = row.totalUj + row.additionalCost;

                      return (
                        <Fragment key={row.id}>
                          <tr className="align-middle hover:bg-slate-50">
                            <td className="finance-wrap-cell px-2 py-2">
                              <strong className="block break-words text-[11px] font-semibold leading-snug text-slate-900">{row.jobNumber}</strong>
                              <span className="mt-0.5 block break-words text-[9px] font-medium leading-snug text-slate-500">{row.container}</span>
                              <span className="mt-0.5 block text-[9px] font-medium text-slate-400">{row.departureDate}</span>
                            </td>
                            <td className="finance-wrap-cell px-2 py-2">
                              <strong className="block text-[12px] font-black text-slate-900">{formatCurrency(rowTotal)}</strong>
                              <span className="mt-0.5 block text-[9px] font-medium leading-snug text-slate-500">UJ {formatCurrency(row.totalUj)} + Tambahan {formatCurrency(row.additionalCost)}</span>
                            </td>
                            <td className="finance-wrap-cell px-2 py-2">
                              <StatusPill value={compactRpujStatus(row.status)} />
                            </td>
                            <td className="finance-wrap-cell px-2 py-2">
                              <span className="block break-words text-[11px] font-semibold leading-snug text-slate-800">{row.driver}</span>
                              <span className="mt-0.5 block break-words text-[9px] font-medium leading-snug text-slate-600">{row.driverBankAccount}</span>
                              <span className="mt-0.5 block break-words text-[9px] font-medium leading-snug text-slate-400">{row.truck}</span>
                            </td>
                            <td className="px-2 py-2">
                              <div className="grid min-w-[230px] grid-cols-3 gap-1.5">
                                <button className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50" onClick={() => onSelectRpuj(row.id)} type="button">Detail</button>
                                {activeRpujTab === 'need-approval' ? (
                                  <>
                                    <button className="inline-flex h-8 items-center justify-center rounded-md bg-emerald-600 px-2 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40" disabled={busy} onClick={() => onApprove(row.id)} type="button">Approve</button>
                                    <button className="inline-flex h-8 items-center justify-center rounded-md border border-rose-200 bg-white px-2 text-[10px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40" disabled={busy} onClick={() => onReject(row.id)} type="button">Reject</button>
                                  </>
                                ) : null}
                                {activeRpujTab === 'ready-transfer' ? (
                                  <label className={`col-span-2 inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-700 ${canUploadTransfer && !busy ? 'cursor-pointer hover:bg-slate-50' : 'pointer-events-none opacity-40'}`}>
                                    <Upload size={11} /> {busy ? 'Proses' : 'Upload'}
                                    <input
                                      accept=".pdf,.jpg,.jpeg,.png"
                                      className="hidden"
                                      disabled={!canUploadTransfer || busy}
                                      onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        event.target.value = '';
                                        if (file) onUpload(row.id, file);
                                      }}
                                      type="file"
                                    />
                                  </label>
                                ) : null}
                                {activeRpujTab === 'paid' ? (
                                  <span className="col-span-2 min-w-0 truncate rounded-md border border-emerald-100 bg-emerald-50 px-2 py-2 text-[10px] font-semibold text-emerald-700" title={row.transferProof || 'Bukti transfer sudah dikirim'}>
                                    {row.transferProof || 'Bukti transfer sudah dikirim'}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                          <tr aria-hidden="true">
                            <td className="h-px bg-slate-200 p-0" colSpan={5} />
                          </tr>
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
              {!Object.keys(groupedRows).length ? (
                <tr>
                  <td className="px-3 py-3 text-center text-xs font-semibold text-slate-400" colSpan={5}>Tidak ada RPUJ pada klasifikasi ini.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
    </div>
  );
}

function InvoiceTable({ rows, query, invoiceBusyId = '', onInvoiceChange, onSaveInvoice, onSelectInvoice }) {
  const invoiceTabs = [
    {
      id: 'need-number',
      label: 'Belum Nomor Invoice',
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
  const [activeInvoiceTab, setActiveInvoiceTab] = useState(invoiceTabs[0].id);
  const currentTab = invoiceTabs.find((tab) => tab.id === activeInvoiceTab) || invoiceTabs[0];
  const searchedRows = rows.filter((row) => `${row.soNumber} ${row.customer} ${row.destination} ${row.invoiceNumber} ${row.invoiceStatus}`.toLowerCase().includes(query.toLowerCase()));
  const filteredRows = searchedRows.filter((row) => currentTab.match(row));

  return (
    <div className="overflow-hidden rounded-b-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          <Info size={12} />
          <span>Keterangan</span>
        </div>
        <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 shadow-sm" role="tablist" aria-label="Filter invoice Finance">
          {invoiceTabs.map((tab) => {
          const count = searchedRows.filter((row) => tab.match(row)).length;
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
              onClick={() => setActiveInvoiceTab(tab.id)}
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

      <div className="table-wrap">
        <table className="data-table master-table finance-master-table finance-invoice-table min-w-[1160px] table-fixed">
          <colgroup>
            <col className="w-[10%]" />
            <col className="w-[16%]" />
            <col className="w-[14%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[11%]" />
            <col className="w-[13%]" />
            <col className="w-[9%]" />
          </colgroup>
          <thead>
            <tr>
              {['Nomor SO', 'Customer', 'Status', 'Selesai', 'Invoice', 'Jatuh Tempo', 'Total Penagihan', 'No. Invoice', 'Aksi'].map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const needsInvoiceNumber = row.invoiceStatus === 'Butuh Nomor Invoice';
              const isBusy = invoiceBusyId === row.id;

              return (
                <tr className="border-t border-slate-100 align-middle hover:bg-slate-50" key={row.id}>
                  <td className="finance-invoice-so font-semibold text-slate-700">{row.soNumber}</td>
                  <td className="finance-invoice-customer">
                    <span className="block truncate font-semibold text-slate-900">{row.customer}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">{row.destination}</span>
                  </td>
                  <td className="finance-invoice-status">
                    <StatusPill className="max-w-full overflow-hidden text-ellipsis" value={row.invoiceStatus} />
                  </td>
                  <td className="finance-invoice-date text-slate-700">{row.completedAt}</td>
                  <td className="finance-invoice-date text-slate-700">{row.invoiceDate}</td>
                  <td className="finance-invoice-date text-slate-700">{row.dueDate}</td>
                  <td className="finance-invoice-total font-semibold text-slate-900">{formatCurrency(row.billingAmount)}</td>
                  <td className="finance-invoice-number">
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
                  <td className="finance-invoice-actions">
                    <div className="finance-invoice-action-row">
                      <button
                        aria-label={`Lihat detail invoice ${row.soNumber}`}
                        className="finance-table-action-button is-icon-only"
                        onClick={() => onSelectInvoice(row.id)}
                        title="Detail"
                        type="button"
                      >
                        <Eye size={13} />
                        <span className="sr-only">Detail</span>
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
                <td className="px-3 py-3 text-center text-xs font-semibold text-slate-400" colSpan={9}>Tidak ada data pada klasifikasi ini.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FinanceTable({
  activeTab,
  query,
  onQueryChange,
  onReset,
  orderRows,
  rpujRows,
  invoiceRows,
  orderError,
  orderLoading,
  rpujError,
  rpujLoading,
  rpujBusyId,
  invoiceError,
  invoiceLoading,
  invoiceBusyId,
  savingSoId,
  handlers,
}) {
  const isOrderVerification = activeTab.id === 'order-verification';
  const isRpujApproval = activeTab.id === 'rpuj-approval';
  const isInvoiceNumber = activeTab.id === 'invoice-number';

  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
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
        <OrderVerificationTable rows={orderRows} query={query} onQueryChange={onQueryChange} savingSoId={savingSoId} {...handlers} />
      ) : null}
      {activeTab.id === 'rpuj-approval' ? (
        <RpujApprovalTable rows={rpujRows} query={query} rpujBusyId={rpujBusyId} {...handlers} />
      ) : null}
      {activeTab.id === 'invoice-number' ? (
        <InvoiceTable rows={invoiceRows} query={query} invoiceBusyId={invoiceBusyId} {...handlers} />
      ) : null}
    </section>
  );
}

function FinanceWorkflowPage({ initialTabId = 'order-verification' }) {
  const [query, setQuery] = useState('');
  const [orderRows, setOrderRows] = useState(initialOrderRows);
  const [rpujRows, setRpujRows] = useState(initialRpujRows);
  const [invoiceRows, setInvoiceRows] = useState(initialInvoiceRows);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [savingSoId, setSavingSoId] = useState('');
  const [rpujLoading, setRpujLoading] = useState(false);
  const [rpujError, setRpujError] = useState('');
  const [rpujBusyId, setRpujBusyId] = useState('');
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');
  const [invoiceBusyId, setInvoiceBusyId] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedRpujId, setSelectedRpujId] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const activeTab = useMemo(
    () => financeTabs.find((tab) => tab.id === initialTabId) || financeTabs[0],
    [initialTabId],
  );
  const selectedOrder = orderRows.find((row) => row.id === selectedOrderId);
  const selectedRpuj = rpujRows.find((row) => row.id === selectedRpujId);
  const selectedInvoice = invoiceRows.find((row) => row.id === selectedInvoiceId);

  const loadOrderVerifications = useCallback(async () => {
    if (activeTab.id !== 'order-verification') return;
    setOrderLoading(true);
    setOrderError('');
    try {
      const result = await fetchFinanceOrderVerifications({ page: 1, pageSize: 100 });
      setOrderRows((result.rows || []).map(normalizeFinanceOrderRow));
    } catch (error) {
      setOrderError(error.message || 'Data verifikasi order gagal dimuat.');
      setOrderRows([]);
    } finally {
      setOrderLoading(false);
    }
  }, [activeTab.id]);

  useEffect(() => {
    loadOrderVerifications();
  }, [loadOrderVerifications]);

  const loadRpujRequests = useCallback(async () => {
    if (activeTab.id !== 'rpuj-approval') return;
    setRpujLoading(true);
    setRpujError('');
    try {
      const result = await fetchFinanceRpujRequests({ page: 1, pageSize: 100 });
      setRpujRows((result.rows || []).map(normalizeFinanceRpujRow));
    } catch (error) {
      setRpujError(error.message || 'Data pengajuan RPUJ gagal dimuat.');
      setRpujRows([]);
    } finally {
      setRpujLoading(false);
    }
  }, [activeTab.id]);

  useEffect(() => {
    loadRpujRequests();
  }, [loadRpujRequests]);

  const loadInvoiceOrders = useCallback(async () => {
    if (activeTab.id !== 'invoice-number') return;
    setInvoiceLoading(true);
    setInvoiceError('');
    try {
      const result = await fetchFinanceInvoices({ page: 1, pageSize: 100 });
      setInvoiceRows((result.rows || []).map(normalizeFinanceInvoiceRow));
    } catch (error) {
      setInvoiceError(error.message || 'Daftar invoice gagal dimuat.');
      setInvoiceRows([]);
    } finally {
      setInvoiceLoading(false);
    }
  }, [activeTab.id]);

  useEffect(() => {
    loadInvoiceOrders();
  }, [loadInvoiceOrders]);

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
    setInvoiceRows(initialInvoiceRows);
    setSelectedOrderId('');
    setSelectedRpujId('');
    setSelectedInvoiceId('');
    setQuery('');
  }

  const handlers = {
    onSaveSoNumber: async (id) => {
      const row = orderRows.find((item) => item.id === id);
      const soNumber = String(row?.soNumberDraft || row?.soNumber || '').trim();
      if (!soNumber) return;

      setSavingSoId(id);
      setOrderError('');
      try {
        const saved = await updateFinanceOrderSoNumber(id, soNumber);
        const normalized = normalizeFinanceOrderRow(saved);
        setOrderRows((rows) => rows.map((item) => (
          item.id === id ? normalized : item
        )));
      } catch (error) {
        setOrderError(error.message || 'Nomor SO Accurate gagal disimpan.');
      } finally {
        setSavingSoId('');
      }
    },
    onSelectOrder: (id) => setSelectedOrderId(id),
    onSelectRpuj: (id) => setSelectedRpujId(id),
    onSelectInvoice: (id) => setSelectedInvoiceId(id),
    onReject: async (id) => {
      setRpujBusyId(id);
      setRpujError('');
      try {
        const saved = await rejectFinanceRpuj(id);
        const normalized = normalizeFinanceRpujRow(saved);
        setRpujRows((rows) => rows.map((row) => (row.id === id ? normalized : row)));
      } catch (error) {
        setRpujError(error.message || 'RPUJ gagal ditolak.');
      } finally {
        setRpujBusyId('');
      }
    },
    onApprove: async (id) => {
      setRpujBusyId(id);
      setRpujError('');
      try {
        const saved = await approveFinanceRpuj(id);
        const normalized = normalizeFinanceRpujRow(saved);
        setRpujRows((rows) => rows.map((row) => (row.id === id ? normalized : row)));
      } catch (error) {
        setRpujError(error.message || 'RPUJ gagal disetujui.');
      } finally {
        setRpujBusyId('');
      }
    },
    onSoChange: (id, value) => {
      setOrderRows((rows) => rows.map((row) => (row.id === id ? { ...row, soNumberDraft: value } : row)));
    },
    onUpload: async (id, file) => {
      const validationError = validateArchiveFile(file, { label: 'Bukti transfer UJ' });
      if (validationError) {
        setRpujError(validationError);
        return;
      }
      setRpujBusyId(id);
      setRpujError('');
      try {
        const saved = await uploadFinanceRpujTransferProof(id, file);
        const normalized = normalizeFinanceRpujRow(saved);
        setRpujRows((rows) => rows.map((row) => (row.id === id ? normalized : row)));
      } catch (error) {
        setRpujError(error.message || 'Bukti transfer gagal diupload.');
      } finally {
        setRpujBusyId('');
      }
    },
    onInvoiceChange: (id, value) => {
      setInvoiceRows((rows) => rows.map((row) => (row.id === id ? { ...row, invoiceNumber: value } : row)));
    },
    onSaveInvoice: async (id) => {
      const row = invoiceRows.find((item) => item.id === id);
      const invoiceNumber = String(row?.invoiceNumber || '').trim();
      if (!invoiceNumber) return;

      setInvoiceBusyId(id);
      setInvoiceError('');
      try {
        const saved = await updateFinanceInvoiceNumber(id, invoiceNumber);
        const normalized = normalizeFinanceInvoiceRow(saved);
        setInvoiceRows((rows) => rows.map((item) => (item.id === id ? normalized : item)));
      } catch (error) {
        setInvoiceError(error.message || 'Nomor invoice gagal disimpan.');
      } finally {
        setInvoiceBusyId('');
      }
    },
  };

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-3 text-slate-900">
      <FinanceTable
        activeTab={activeTab}
        handlers={handlers}
        invoiceBusyId={invoiceBusyId}
        invoiceError={invoiceError}
        invoiceLoading={invoiceLoading}
        invoiceRows={invoiceRows}
        onReset={resetSimulation}
        onQueryChange={setQuery}
        orderError={orderError}
        orderLoading={orderLoading}
        rpujBusyId={rpujBusyId}
        rpujError={rpujError}
        rpujLoading={rpujLoading}
        orderRows={orderRows}
        query={query}
        rpujRows={rpujRows}
        savingSoId={savingSoId}
      />

      <OrderDetailModal
        onClose={() => setSelectedOrderId('')}
        order={selectedOrder}
      />
      <RpujDetailModal
        onClose={() => setSelectedRpujId('')}
        rpuj={selectedRpuj}
      />
      <InvoiceDetailModal
        invoice={selectedInvoice}
        onClose={() => setSelectedInvoiceId('')}
      />
    </main>
  );
}

export default FinanceWorkflowPage;
