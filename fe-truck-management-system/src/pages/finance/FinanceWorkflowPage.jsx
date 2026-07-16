import { Fragment, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  FileText,
  ReceiptText,
  RotateCcw,
  Search,
  Upload,
} from 'lucide-react';

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
    description: 'Review total UJ, biaya tambahan, approve/reject, lalu upload bukti transfer sebelum SPK terbit.',
    statusFlow: ['Menunggu Approval Finance', 'Disetujui Finance', 'Bukti Transfer Diupload', 'SPK Terbit'],
  },
  {
    id: 'invoice-number',
    label: 'Input Nomor Invoice',
    icon: FileText,
    badge: 'Billing',
    description: 'Menampilkan SO selesai yang butuh nomor invoice, sudah ada invoice namun menunggu update status, dan yang sudah lunas.',
    statusFlow: ['Butuh Nomor Invoice', 'Menunggu Update Status', 'Lunas'],
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

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function statusClass(value) {
  if (String(value).includes('Menunggu')) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (String(value).includes('Ditolak') || String(value).includes('Revisi') || String(value).includes('Belum')) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (String(value).includes('Butuh')) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (String(value).includes('Belum Lengkap')) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (String(value).includes('Lunas')) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (String(value).includes('Terbit') || String(value).includes('Disetujui') || String(value).includes('Diupload') || String(value).includes('Siap')) return 'border-slate-200 bg-white text-slate-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function StatusPill({ value }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-bold ${statusClass(value)}`}>
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
    <div className="flex flex-wrap gap-2">
      {items.map((item, index) => (
        <span className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600" key={item}>
          <span className="grid h-4 w-4 place-items-center rounded bg-slate-100 text-[10px] text-slate-500">{index + 1}</span>
          {item}
        </span>
      ))}
    </div>
  );
}

function SearchBar({ query, onChange }) {
  return (
    <label className="flex min-h-9 items-center rounded-md border border-slate-200 bg-white px-3 focus-within:border-slate-400">
      <Search className="mr-2 text-slate-400" size={16} />
      <input
        className="w-full border-0 bg-transparent text-sm font-semibold text-slate-900 outline-none"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Cari No. SO, sales, customer, tujuan..."
        value={query}
      />
    </label>
  );
}

function DetailField({ label, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
      <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <strong className="mt-0.5 block text-sm text-slate-900">{value || '-'}</strong>
    </div>
  );
}

function AmountField({ label, value, highlight = false }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${highlight ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-slate-200 bg-white text-slate-950'}`}>
      <span className={`block text-[11px] font-bold uppercase tracking-wide ${highlight ? 'text-rose-500' : 'text-slate-500'}`}>{label}</span>
      <strong className="mt-0.5 block text-base font-black">{formatCurrency(value)}</strong>
    </div>
  );
}

function CompactList({ items }) {
  return (
    <div className="grid gap-1">
      {items.map((item) => (
        <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 py-1" key={item.label || item}>
          <span className="text-xs font-bold text-slate-700">{item.label || item}</span>
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
        <div className="rounded-md bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600" key={log}>{log}</div>
      ))}
    </div>
  );
}

function PermissionStrip({ activeTab }) {
  const text = {
    'order-verification': 'Finance hanya input Nomor SO dan melihat detail order. Tidak membuat atau mengubah order Sales.',
    'rpuj-approval': 'Finance hanya approve/reject RPUJ dan upload bukti transfer. Assign truck/driver tetap di Operational.',
    'invoice-number': 'Finance hanya input nomor invoice. Pengiriman dan follow up invoice tetap di Sales.',
  }[activeTab.id];

  return (
    <div className="mt-2 rounded-md border border-rose-100 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700">
      {text}
    </div>
  );
}

function OrderDetailModal({ order, onClose }) {
  if (!order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="presentation" onMouseDown={onClose}>
      <section className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Detail Request Order</p>
            <h3 className="mt-1 text-base font-black text-slate-950">{order.customer}</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">{order.salesName} - {order.orderDate} - {order.destination}</p>
          </div>
          <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50" onClick={onClose} type="button">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="presentation" onMouseDown={onClose}>
      <section className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Detail Pengajuan RPUJ / SPK</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h3 className="text-base font-black text-slate-950">{rpuj.soNumber}</h3>
              <StatusPill value={compactRpujStatus(rpuj.status)} />
            </div>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{rpuj.customer} - {rpuj.destination}</p>
          </div>
          <button className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50" onClick={onClose} type="button">
            Tutup
          </button>
        </header>

        <div className="max-h-[calc(88vh-62px)] space-y-2 overflow-y-auto p-3">
          <section className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              <DetailField label="No. Job" value={rpuj.jobNumber} />
              <DetailField label="No. SPK" value={rpuj.spkNumber} />
              <DetailField label="Tanggal Jalan" value={rpuj.departureDate} />
              <DetailField label="Container" value={rpuj.container} />
              <DetailField label="Truck" value={rpuj.truck} />
              <DetailField label="Jenis Order" value={rpuj.orderType} />
              <DetailField label="Driver" value={rpuj.driver} />
              <DetailField label="No. Rekening Driver" value={rpuj.driverBankAccount} />
              <DetailField label="Terminal" value={rpuj.terminal} />
              <DetailField label="Depo" value={rpuj.depo} />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-sm font-black text-slate-950">Rincian Pengajuan</h4>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500">{rpuj.transferProof || 'Bukti transfer belum ada'}</span>
                <button className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 disabled:opacity-40" disabled={!rpuj.transferProof} type="button">Preview</button>
                <button className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 disabled:opacity-40" disabled={!rpuj.transferProof} type="button">Download</button>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <AmountField label="Total UJ" value={rpuj.totalUj} />
              <AmountField label="Biaya Tambahan" value={rpuj.additionalCost} />
              <AmountField highlight label="Total Pengajuan" value={totalRequest} />
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr]">
              <DetailField label="Rekomendasi UJ" value={rpuj.ujRecommendation} />
              <DetailField label="Catatan Pengajuan" value={rpuj.notes} />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="presentation" onMouseDown={onClose}>
      <section className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Detail Dasar Invoice</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-black text-slate-950">{invoice.soNumber}</h3>
              <StatusPill value={invoice.invoiceStatus} />
            </div>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{invoice.customer} - {invoice.destination}</p>
          </div>
          <button className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50" onClick={onClose} type="button">
            Tutup
          </button>
        </header>

        <div className="max-h-[calc(88vh-56px)] space-y-2 overflow-y-auto p-3">
          <section className="grid gap-2 rounded-lg border border-rose-100 bg-rose-50 p-2 md:grid-cols-[1.2fr_1fr_1fr]">
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wide text-rose-500">Nilai Tagih</span>
              <strong className="mt-0.5 block text-lg font-black text-rose-800">{formatCurrency(invoice.billingAmount)}</strong>
            </div>
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Payment Terms</span>
              <strong className="mt-0.5 block text-sm font-black text-slate-900">{invoice.paymentTerms}</strong>
            </div>
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Jatuh Tempo</span>
              <strong className="mt-0.5 block text-sm font-black text-slate-900">{invoice.dueDate}</strong>
            </div>
          </section>

          <section className="grid gap-2 md:grid-cols-4">
            <DetailField label="Tanggal Selesai" value={invoice.completedAt} />
            <DetailField label="Tanggal Invoice" value={invoice.invoiceDate} />
            <DetailField label="Nomor Invoice" value={invoice.invoiceNumber || 'Belum ada'} />
            <DetailField label="Status Dokumen" value={invoice.documentStatus} />
          </section>

          <section className="grid gap-2 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-lg border border-slate-200 bg-white p-2.5">
              <h4 className="mb-1.5 text-sm font-black text-slate-950">Dokumen Dasar Tagih</h4>
              <CompactList items={invoice.documentChecklist} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-2.5">
              <h4 className="mb-1.5 text-sm font-black text-slate-950">Rincian Tagihan</h4>
              <CompactList items={invoice.billingItems} />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-2.5">
            <h4 className="mb-1.5 text-sm font-black text-slate-950">Riwayat Finance</h4>
            <ActivityLogList logs={invoice.activityLogs} />
          </section>
        </div>
      </section>
    </div>
  );
}

function OrderVerificationTable({ rows, query, onSelectOrder, onSoChange, onSaveSoNumber }) {
  const orderTabs = [
    { id: 'need-so', label: 'Belum Ada Nomor SO', match: (row) => !row.soNumber },
    { id: 'running', label: 'SO Berjalan', match: (row) => Boolean(row.soNumber) },
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
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        {orderTabs.map((tab) => {
          const count = searchedRows.filter((row) => tab.match(row)).length;
          const active = tab.id === activeOrderTab;

          return (
            <button
              className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-black ${active ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              key={tab.id}
              onClick={() => setActiveOrderTab(tab.id)}
              type="button"
            >
              {tab.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] border-collapse text-left text-xs">
        <thead className="bg-slate-100 uppercase tracking-wide text-slate-500">
          <tr>
            {['Order Dibuat', 'Tujuan', 'Jenis Order', 'Payment Terms', 'Tanggal Jalan', 'Nomor SO Accurate', 'Aksi'].map((column) => (
              <th className="px-3 py-2.5" key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(groupedRows).map(([salesName, salesRows]) => (
            <Fragment key={salesName}>
              <tr className="bg-white">
                <td className="border-b border-t border-slate-300 px-3 py-2.5" colSpan={7}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Sales</span>
                      <strong className="ml-2 text-sm font-black text-slate-950">{salesName}</strong>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">{salesRows.length} order</span>
                  </div>
                </td>
              </tr>
              <tr aria-hidden="true">
                <td className="h-px bg-slate-300 p-0" colSpan={7} />
              </tr>
              {salesRows.map((row) => (
                <Fragment key={row.id}>
                  <tr className="align-middle hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-semibold text-slate-700">{row.orderDate}</td>
                    <td className="px-3 py-2.5 font-black text-slate-950">{row.destination}</td>
                    <td className="px-3 py-2.5 text-slate-700">{row.orderType}</td>
                    <td className="px-3 py-2.5">
                      <StatusPill value={row.paymentTerms} />
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-slate-800">{row.runningDate}</td>
                    <td className="px-3 py-2.5">
                      {activeOrderTab === 'need-so' ? (
                        <div className="flex min-w-[250px] items-center gap-2">
                          <input
                            className="min-h-8 w-40 rounded-md border border-slate-200 px-2 text-xs font-bold text-slate-900 outline-none focus:border-slate-400"
                            onChange={(event) => onSoChange(row.id, event.target.value)}
                            placeholder="SO Accurate"
                            value={row.soNumber}
                          />
                          <button
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                            disabled={!row.soNumber}
                            onClick={() => onSaveSoNumber(row.id)}
                            type="button"
                          >
                            Simpan
                          </button>
                        </div>
                      ) : (
                        <div>
                          <span className="block font-black text-slate-950">{row.soNumber}</span>
                          <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">Order sedang berjalan</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <button className="rounded-md bg-rose-600 px-2.5 py-1.5 font-bold text-white hover:bg-rose-700" onClick={() => onSelectOrder(row.id)} type="button">Detail</button>
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
              <td className="px-3 py-6 text-center text-sm font-semibold text-slate-400" colSpan={7}>Tidak ada order pada klasifikasi ini.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function RpujApprovalTable({ rows, query, onApprove, onReject, onUpload, onSelectRpuj }) {
  const filteredRows = rows.filter((row) => `${row.soNumber} ${row.jobNumber} ${row.customer} ${row.destination} ${row.container} ${row.driver} ${row.truck}`.toLowerCase().includes(query.toLowerCase()));
  const groupedRows = filteredRows.reduce((groups, row) => {
    if (!groups[row.soNumber]) groups[row.soNumber] = [];
    groups[row.soNumber].push(row);
    return groups;
  }, {});

  return (
    <div className="overflow-hidden">
      <table className="w-full table-fixed border-collapse text-left text-[11px]">
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[20%]" />
          <col className="w-[13%]" />
          <col className="w-[26%]" />
          <col className="w-[23%]" />
        </colgroup>
        <thead className="bg-slate-100 uppercase tracking-wide text-slate-500">
          <tr>
            {['Job / Container', 'Pengajuan', 'Status', 'Driver / Rekening', 'Aksi'].map((column) => (
              <th className="px-2 py-1.5" key={column}>{column}</th>
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
                <tr className="bg-white">
                  <td className="border-b border-t border-slate-300 px-2 py-1.5" colSpan={5}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <strong className="text-sm font-black text-slate-950">{soNumber}</strong>
                        <span className="font-bold text-slate-700">{firstRow.customer}</span>
                        <span className="text-slate-400">|</span>
                        <span className="font-semibold text-slate-600">{firstRow.destination}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{soRows.length} container</span>
                        {pendingCount ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">{pendingCount} pending</span> : null}
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-black text-rose-700">Total {formatCurrency(totalRequest)}</span>
                      </div>
                    </div>
                  </td>
                </tr>
                <tr aria-hidden="true">
                  <td className="h-px bg-slate-300 p-0" colSpan={5} />
                </tr>
                {soRows.map((row) => {
                  const approved = row.status === 'Disetujui Finance' || row.status === 'Bukti Transfer Diupload' || row.status === 'SPK Terbit';
                  const rowTotal = row.totalUj + row.additionalCost;

                  return (
                    <Fragment key={row.id}>
                      <tr className="align-middle hover:bg-slate-50">
                        <td className="px-2 py-1.5">
                          <strong className="block font-black text-slate-950">{row.jobNumber}</strong>
                          <span className="mt-0.5 block break-words font-semibold text-slate-500">{row.container}</span>
                          <span className="mt-0.5 block font-bold text-slate-400">{row.departureDate}</span>
                        </td>
                        <td className="px-2 py-1.5">
                          <strong className="block font-black text-slate-950">{formatCurrency(rowTotal)}</strong>
                          <span className="mt-0.5 block font-semibold leading-snug text-slate-500">UJ {formatCurrency(row.totalUj)} + Tambahan {formatCurrency(row.additionalCost)}</span>
                        </td>
                        <td className="px-2 py-1.5"><StatusPill value={compactRpujStatus(row.status)} /></td>
                        <td className="px-2 py-1.5">
                          <span className="block font-semibold text-slate-800">{row.driver}</span>
                          <span className="mt-0.5 block break-words font-black leading-snug text-slate-600">{row.driverBankAccount}</span>
                          <span className="mt-0.5 block font-bold text-slate-400">{row.truck}</span>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="grid grid-cols-2 gap-1">
                            <button className="whitespace-nowrap rounded-md border border-slate-200 bg-white px-1.5 py-1 font-bold text-slate-700 hover:bg-slate-50" onClick={() => onSelectRpuj(row.id)} type="button">Detail</button>
                            <button className="whitespace-nowrap rounded-md bg-rose-600 px-1.5 py-1 font-bold text-white hover:bg-rose-700" onClick={() => onApprove(row.id)} type="button">Approve</button>
                            <button className="whitespace-nowrap rounded-md border border-rose-200 bg-white px-1.5 py-1 font-bold text-rose-700" onClick={() => onReject(row.id)} type="button">Reject</button>
                            <button className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-1.5 py-1 font-bold text-slate-700 disabled:opacity-40" disabled={!approved} onClick={() => onUpload(row.id)} type="button">
                              <Upload size={14} /> Upload
                            </button>
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
        </tbody>
      </table>
    </div>
  );
}

function InvoiceTable({ rows, query, onInvoiceChange, onSaveInvoice, onSelectInvoice }) {
  const invoiceTabs = [
    { id: 'need-number', label: 'Belum Nomor Invoice', match: (row) => row.invoiceStatus === 'Butuh Nomor Invoice' },
    { id: 'in-progress', label: 'Pengajuan', match: (row) => row.invoiceStatus === 'Menunggu Update Status' },
    { id: 'paid', label: 'Lunas', match: (row) => row.invoiceStatus === 'Lunas' },
  ];
  const [activeInvoiceTab, setActiveInvoiceTab] = useState(invoiceTabs[0].id);
  const currentTab = invoiceTabs.find((tab) => tab.id === activeInvoiceTab) || invoiceTabs[0];
  const searchedRows = rows.filter((row) => `${row.soNumber} ${row.customer} ${row.destination} ${row.invoiceNumber} ${row.invoiceStatus}`.toLowerCase().includes(query.toLowerCase()));
  const filteredRows = searchedRows.filter((row) => currentTab.match(row));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        {invoiceTabs.map((tab) => {
          const count = searchedRows.filter((row) => tab.match(row)).length;
          const active = tab.id === activeInvoiceTab;

          return (
            <button
              className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-black ${active ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              key={tab.id}
              onClick={() => setActiveInvoiceTab(tab.id)}
              type="button"
            >
              {tab.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <table className="w-full table-fixed border-collapse text-left text-xs">
        <colgroup>
          <col className="w-[16%]" />
          <col className="w-[15%]" />
          <col className="w-[24%]" />
          <col className="w-[18%]" />
          <col className="w-[15%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead className="bg-slate-100 uppercase tracking-wide text-slate-500">
          <tr>
            {['Nomor SO', 'Tujuan', 'Dasar Tagih', 'Nomor Invoice', 'Status', 'Aksi'].map((column) => (
              <th className="px-2.5 py-2" key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((row) => {
            const needsInvoiceNumber = row.invoiceStatus === 'Butuh Nomor Invoice';

            return (
              <tr className="border-t border-slate-200 align-middle hover:bg-slate-50" key={row.id}>
                <td className="px-2.5 py-2 font-black text-slate-950">{row.soNumber}</td>
                <td className="px-2.5 py-2">
                  <span className="block font-semibold text-slate-800">{row.destination}</span>
                  <span className="mt-0.5 block text-[11px] font-bold text-slate-400">Selesai {row.completedAt}</span>
                </td>
                <td className="px-2.5 py-2">
                  <strong className="block font-black text-slate-950">{formatCurrency(row.billingAmount)}</strong>
                  <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">{row.documentStatus} - {row.paymentTerms}</span>
                  <span className="block text-[11px] font-semibold text-slate-400">Tempo {row.dueDate}</span>
                </td>
                <td className="px-2.5 py-2">
                  {needsInvoiceNumber ? (
                    <input
                      className="min-h-8 w-full rounded-md border border-slate-200 px-2 text-xs font-bold text-slate-900 outline-none focus:border-slate-400"
                      onChange={(event) => onInvoiceChange(row.id, event.target.value)}
                      placeholder="INV-202607-..."
                      value={row.invoiceNumber}
                    />
                  ) : (
                    <span className="font-black text-slate-950">{row.invoiceNumber}</span>
                  )}
                </td>
                <td className="px-2.5 py-2">
                  <StatusPill value={row.invoiceStatus} />
                  <span className="mt-1 block text-[11px] font-semibold text-slate-500">{row.paymentStatus}</span>
                </td>
                <td className="px-2.5 py-2">
                  <div className="grid gap-1">
                    <button className="rounded-md border border-slate-200 bg-white px-2 py-1.5 font-bold text-slate-700 hover:bg-slate-50" onClick={() => onSelectInvoice(row.id)} type="button">
                      Detail
                    </button>
                    {needsInvoiceNumber ? (
                      <button className="rounded-md bg-rose-600 px-2 py-1.5 font-bold text-white hover:bg-rose-700 disabled:opacity-40" disabled={!row.invoiceNumber} onClick={() => onSaveInvoice(row.id)} type="button">
                        Simpan
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
          {!filteredRows.length ? (
            <tr>
              <td className="px-3 py-6 text-center text-sm font-semibold text-slate-400" colSpan={6}>Tidak ada data pada klasifikasi ini.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
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
  handlers,
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1.5 inline-flex rounded-md bg-slate-100 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
              {activeTab.badge}
            </div>
            <h2 className="text-base font-black text-slate-950">{activeTab.label}</h2>
            <p className="mt-1 max-w-3xl text-xs font-medium text-slate-500">{activeTab.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-500">
              <Clock3 size={15} /> Data simulasi meeting
            </div>
            <button className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50" onClick={onReset} type="button">
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>

        {activeTab.id !== 'invoice-number' && activeTab.id !== 'order-verification' ? (
          <div className="mt-2">
            <StatusFlow items={activeTab.statusFlow} />
          </div>
        ) : null}
        <PermissionStrip activeTab={activeTab} />
      </div>

      <div className="border-b border-slate-200 p-3">
        <SearchBar query={query} onChange={onQueryChange} />
      </div>

      {activeTab.id === 'order-verification' ? (
        <OrderVerificationTable rows={orderRows} query={query} {...handlers} />
      ) : null}
      {activeTab.id === 'rpuj-approval' ? (
        <RpujApprovalTable rows={rpujRows} query={query} {...handlers} />
      ) : null}
      {activeTab.id === 'invoice-number' ? (
        <InvoiceTable rows={invoiceRows} query={query} {...handlers} />
      ) : null}
    </section>
  );
}

function FinanceWorkflowPage({ initialTabId = 'order-verification' }) {
  const [query, setQuery] = useState('');
  const [orderRows, setOrderRows] = useState(initialOrderRows);
  const [rpujRows, setRpujRows] = useState(initialRpujRows);
  const [invoiceRows, setInvoiceRows] = useState(initialInvoiceRows);
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

  function resetSimulation() {
    setOrderRows(initialOrderRows);
    setRpujRows(initialRpujRows);
    setInvoiceRows(initialInvoiceRows);
    setSelectedOrderId('');
    setSelectedRpujId('');
    setSelectedInvoiceId('');
    setQuery('');
  }

  const handlers = {
    onSaveSoNumber: (id) => {
      setOrderRows((rows) => rows.map((row) => (
        row.id === id ? { ...row, status: 'No. SO Terisi' } : row
      )));
    },
    onSelectOrder: (id) => setSelectedOrderId(id),
    onSelectRpuj: (id) => setSelectedRpujId(id),
    onSelectInvoice: (id) => setSelectedInvoiceId(id),
    onReject: (id) => {
      setRpujRows((rows) => rows.map((row) => (
        row.id === id ? { ...row, status: 'Ditolak Finance' } : row
      )));
    },
    onApprove: (id) => {
      setRpujRows((rows) => rows.map((row) => (
        row.id === id ? { ...row, status: 'Disetujui Finance' } : row
      )));
    },
    onSoChange: (id, value) => {
      setOrderRows((rows) => rows.map((row) => (row.id === id ? { ...row, soNumber: value } : row)));
    },
    onUpload: (id) => {
      setRpujRows((rows) => rows.map((row) => (
        row.id === id
          ? { ...row, status: 'Bukti Transfer Diupload', transferProof: `transfer-uj-${row.soNumber.toLowerCase()}.pdf` }
          : row
      )));
    },
    onInvoiceChange: (id, value) => {
      setInvoiceRows((rows) => rows.map((row) => (row.id === id ? { ...row, invoiceNumber: value } : row)));
    },
    onSaveInvoice: (id) => {
      setInvoiceRows((rows) => rows.map((row) => (
        row.id === id
          ? {
            ...row,
            invoiceDate: '16 Jul 2026',
            dueDate: row.paymentTerms.includes('14') ? '30 Jul 2026' : '15 Agu 2026',
            invoiceStatus: 'Menunggu Update Status',
            paymentStatus: 'Menunggu Sales',
            activityLogs: [
              ...row.activityLogs,
              '16 Jul 2026 10:30 - Finance input nomor invoice',
            ],
          }
          : row
      )));
    },
  };

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-3 text-slate-900">
      <FinanceTable
        activeTab={activeTab}
        handlers={handlers}
        invoiceRows={invoiceRows}
        onReset={resetSimulation}
        onQueryChange={setQuery}
        orderRows={orderRows}
        query={query}
        rpujRows={rpujRows}
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
