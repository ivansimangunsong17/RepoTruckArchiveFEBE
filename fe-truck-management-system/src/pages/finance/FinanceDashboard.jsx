import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileQuestion,
  FileText,
  Loader2,
  ReceiptText,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import DocumentLink from '../../components/common/DocumentLink';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate, formatDateTime } from '../../utils/formatDate';
import {
  fetchFinanceCompletedTripDetail,
  fetchFinanceCompletedTrips,
  fetchFinanceDashboard,
} from '../../services/finance/financeService';

const documentStatusOptions = [
  { value: '', label: 'Semua Status Dokumen' },
  { value: 'BELUM_LENGKAP', label: 'Belum Lengkap' },
  { value: 'LENGKAP', label: 'Lengkap' },
  { value: 'SIAP_DITAGIHKAN', label: 'Siap Ditagihkan' },
];

const invoiceStatusOptions = [
  { value: '', label: 'Semua Status Invoice' },
  { value: 'BELUM_DIBUAT', label: 'Belum Dibuat' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUDAH_DIBUAT', label: 'Sudah Dibuat' },
  { value: 'SUDAH_DIKIRIM', label: 'Sudah Dikirim' },
  { value: 'LUNAS', label: 'Lunas' },
];

const statusLabel = {
  BELUM_LENGKAP: 'Belum Lengkap',
  LENGKAP: 'Lengkap',
  SIAP_DITAGIHKAN: 'Siap Ditagihkan',
  BELUM_DIBUAT: 'Belum Dibuat',
  DRAFT: 'Draft',
  SUDAH_DIBUAT: 'Sudah Dibuat',
  SUDAH_DIKIRIM: 'Sudah Dikirim',
  LUNAS: 'Lunas',
};

const statusTone = {
  BELUM_LENGKAP: 'border-rose-200 bg-rose-50 text-rose-700',
  LENGKAP: 'border-sky-200 bg-sky-50 text-sky-700',
  SIAP_DITAGIHKAN: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  BELUM_DIBUAT: 'border-slate-200 bg-slate-50 text-slate-600',
  DRAFT: 'border-amber-200 bg-amber-50 text-amber-700',
  SUDAH_DIBUAT: 'border-blue-200 bg-blue-50 text-blue-700',
  SUDAH_DIKIRIM: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  LUNAS: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const initialFilters = {
  dateFrom: '',
  dateTo: '',
  customer: '',
  destination: '',
  containerSize: '',
  documentStatus: '',
  invoiceStatus: '',
  query: '',
};

const financeViews = {
  dashboard: {
    eyebrow: 'Finance',
    title: 'Dashboard Finance',
    description: 'Ringkasan cepat antrean tagihan, dokumen, dan invoice.',
  },
  completed: {
    eyebrow: 'Finance',
    title: 'Perjalanan Selesai',
    description: 'Daftar seluruh perjalanan selesai untuk audit revenue, uang jalan, dan margin.',
  },
  readiness: {
    eyebrow: 'Finance',
    title: 'Kesiapan Tagihan',
    description: 'Fokus kerja harian Finance: siap tagih, dokumen kurang, dan invoice belum dibuat.',
  },
};

function moneyValue(value) {
  return value == null ? 'Data belum tersedia' : formatCurrency(value);
}

function StatusPill({ value }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone[value] || statusTone.BELUM_DIBUAT}`}>
      {statusLabel[value] || value || '-'}
    </span>
  );
}

function SummaryCard({ icon: Icon, label, value, helper, tone = 'slate' }) {
  const accents = {
    slate: 'bg-slate-900',
    green: 'bg-emerald-500',
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
  };

  return (
    <section className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className={`mb-2 block h-1 w-8 rounded-full ${accents[tone] || accents.slate}`} />
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
          <strong className="mt-1 block text-xl font-black text-slate-950">{value}</strong>
        </div>
        <span className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
          <Icon size={16} />
        </span>
      </div>
      {helper ? <p className="mt-1.5 text-[11px] font-medium text-slate-500">{helper}</p> : null}
    </section>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <strong className="mt-0.5 block break-words text-sm font-semibold text-slate-950">{value || '-'}</strong>
    </div>
  );
}

function FinanceDetailModal({ trip, loading, error, onClose, onRetry }) {
  if (!trip && !loading && !error) return null;

  const docs = [
    ['SPK', trip?.spkNumber, trip?.attachments?.find((item) => item.category === 'spkDocument')?.file],
    ['Bon Muat / Bon Bongkar', trip?.operationalDocuments?.loadingVoucher, trip?.attachments?.find((item) => item.category === 'loadingVoucherDocument')?.file],
    ['TILA / Delivery Card / Gatepass / SP2', trip?.operationalDocuments?.tilaGatepassDocument, trip?.attachments?.find((item) => ['tilaGatepassDocumentFile', 'unloadingVoucherDocument', 'weighingDocumentFile', 'deliveryCard', 'gatepass'].includes(item.category))?.file],
    ['Surat Jalan', trip?.operationalDocuments?.travelDocument, trip?.attachments?.find((item) => item.category === 'travelDocumentFile')?.file],
    ['EIR', trip?.operationalDocuments?.eirNumber, trip?.attachments?.find((item) => item.category === 'eirDocument')?.file],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={onClose}>
      <section className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-xl" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Detail Perjalanan Finance</p>
            <h2 className="mt-0.5 text-lg font-black text-slate-950">{trip?.soNumber || 'Memuat detail'}</h2>
            <p className="text-xs text-slate-500">{trip?.customer || '-'}</p>
          </div>
          <button className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100" type="button" onClick={onClose} aria-label="Tutup detail">
            <X size={19} />
          </button>
        </header>

        <div className="max-h-[calc(92vh-72px)] overflow-y-auto p-4">
          {loading ? (
            <div className="grid min-h-64 place-items-center text-sm font-semibold text-slate-500">
              <span className="inline-flex items-center gap-2"><Loader2 className="animate-spin" size={18} /> Memuat detail perjalanan...</span>
            </div>
          ) : null}

          {!loading && error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              <strong className="block">Detail tidak dapat dimuat.</strong>
              <p className="mt-1">{error}</p>
              <button className="mt-3 inline-flex items-center gap-2 rounded-md border border-rose-200 bg-white px-3 py-2 text-xs font-bold" type="button" onClick={onRetry}>
                <RefreshCw size={15} /> Coba lagi
              </button>
            </div>
          ) : null}

          {!loading && trip ? (
            <div className="grid gap-4">
              <section>
                <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-700">Informasi Sales Order</h3>
                <div className="grid gap-2 md:grid-cols-3">
                  <ReadOnlyField label="Nomor SO" value={trip.soNumber} />
                  <ReadOnlyField label="Nomor DO" value={trip.doNumber} />
                  <ReadOnlyField label="Nomor SPK" value={trip.spkNumber} />
                  <ReadOnlyField label="Jenis Order" value={trip.shipment} />
                  <ReadOnlyField label="Nama Jasa" value={trip.serviceName} />
                  <ReadOnlyField label="Invoice" value={trip.invoiceNumber || statusLabel[trip.invoiceStatus]} />
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-700">Informasi Customer</h3>
                <div className="grid gap-2 md:grid-cols-4">
                  <ReadOnlyField label="Customer" value={trip.customer} />
                  <ReadOnlyField label="PIC" value={trip.customerPic} />
                  <ReadOnlyField label="Telepon" value={trip.customerPhone} />
                  <ReadOnlyField label="Alamat" value={trip.customerAddress} />
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-700">Container / Ritase</h3>
                <div className="grid gap-2 md:grid-cols-4">
                  <ReadOnlyField label="Container" value={trip.containerNumber} />
                  <ReadOnlyField label="Ukuran" value={trip.containerSize} />
                  <ReadOnlyField label="Tipe" value={trip.containerType} />
                  <ReadOnlyField label="Jumlah" value={trip.quantity} />
                  <ReadOnlyField label="Truck" value={trip.truck} />
                  <ReadOnlyField label="Driver" value={trip.driver} />
                  <ReadOnlyField label="Lokasi Muat" value={trip.origin} />
                  <ReadOnlyField label="Tujuan" value={trip.destination} />
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-700">Riwayat Perjalanan</h3>
                <div className="grid gap-2 md:grid-cols-4">
                  <ReadOnlyField label="Tanggal Berangkat" value={formatDate(trip.tripDate)} />
                  <ReadOnlyField label="Diterima" value={formatDateTime(trip.receivedAt)} />
                  <ReadOnlyField label="Mulai" value={formatDateTime(trip.runningAt)} />
                  <ReadOnlyField label="Selesai" value={formatDateTime(trip.completedAt)} />
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-700">Revenue dan Uang Jalan</h3>
                <div className="grid gap-2 md:grid-cols-4">
                  <ReadOnlyField label="Tarif" value={moneyValue(trip.tariff)} />
                  <ReadOnlyField label="Total Revenue" value={moneyValue(trip.totalRevenue)} />
                  <ReadOnlyField label="Uang Jalan" value={moneyValue(trip.journeyMoney)} />
                  <ReadOnlyField label="Biaya Tambahan" value={formatCurrency(trip.additionalCost || 0)} />
                  <ReadOnlyField label="Estimasi Margin" value={moneyValue(trip.estimatedMargin)} />
                  <ReadOnlyField label="Status Dokumen" value={statusLabel[trip.documentStatus]} />
                  <ReadOnlyField label="Status Invoice" value={statusLabel[trip.invoiceStatus]} />
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-700">Daftar Dokumen Perjalanan</h3>
                <div className="table-wrap rounded-md border border-slate-200 bg-white">
                  <table className="data-table master-table finance-master-table min-w-[760px]">
                    <thead>
                      <tr>
                        <th>Dokumen</th>
                        <th>Nomor</th>
                        <th>File</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docs.map(([label, number, file]) => (
                        <tr className="border-t border-slate-100" key={label}>
                          <td className="px-3 py-2 font-semibold text-slate-900">{label}</td>
                          <td className="px-3 py-2 text-slate-700">{number || '-'}</td>
                          <td className="px-3 py-2">
                            <DocumentLink file={file} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function FinanceWorkspace({ mode = 'dashboard' }) {
  const view = financeViews[mode] || financeViews.dashboard;
  const isDashboard = mode === 'dashboard';
  const isReadiness = mode === 'readiness';
  const defaultFilters = useMemo(() => (
    isReadiness
      ? { ...initialFilters, documentStatus: 'SIAP_DITAGIHKAN', invoiceStatus: 'BELUM_DIBUAT' }
      : initialFilters
  ), [isReadiness]);
  const [filters, setFilters] = useState(defaultFilters);
  const [page, setPage] = useState(1);
  const [dashboard, setDashboard] = useState(null);
  const [trips, setTrips] = useState({ rows: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const requestParams = useMemo(() => ({ ...filters, page, pageSize: 20 }), [filters, page]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    const request = isDashboard
      ? fetchFinanceDashboard()
      : Promise.all([
        fetchFinanceDashboard(filters),
        fetchFinanceCompletedTrips(requestParams),
      ]);

    request
      .then((result) => {
        if (!active) return;
        if (isDashboard) {
          setDashboard(result);
          setTrips({ rows: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
          return;
        }
        const [dashboardResult, tripsResult] = result;
        setDashboard(dashboardResult);
        setTrips(tripsResult);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError.message || 'Dashboard Finance gagal dimuat.');
        setTrips({ rows: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filters, isDashboard, requestParams]);

  useEffect(() => {
    if (!detailId) return undefined;
    let active = true;
    setDetailLoading(true);
    setDetailError('');
    setDetail(null);

    fetchFinanceCompletedTripDetail(detailId)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((requestError) => {
        if (active) setDetailError(requestError.message || 'Detail perjalanan gagal dimuat.');
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [detailId]);

  function updateFilter(event) {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
    setPage(1);
  }

  function resetFilters() {
    setFilters(defaultFilters);
    setPage(1);
  }

  function applyReadinessFilter(nextFilters) {
    setFilters((current) => ({ ...current, ...nextFilters }));
    setPage(1);
  }

  const summary = dashboard || {};
  const queues = summary.queues || {};
  const rows = trips.rows || [];
  const hasRows = rows.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-900">
      <header className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{view.eyebrow}</p>
            <h1 className="mt-0.5 text-lg font-black text-slate-950">{view.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{view.description}</p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50" type="button" onClick={() => setFilters((current) => ({ ...current }))}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </header>

      {isDashboard ? (
        <>
          <section className="mb-4 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-slate-950">Antrean Kerja Finance</h2>
                <p className="mt-1 text-xs text-slate-500">Ringkasan pekerjaan yang perlu dicek tanpa membuka tiap menu.</p>
              </div>
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-600">Armada Workflow</span>
            </div>
            <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Menunggu No. SO</span>
                <strong className="mt-1 block text-lg text-slate-950">{queues.pendingSo || 0}</strong>
                <small className="mt-1 block text-xs text-slate-500">Order dari Sales perlu nomor SO Accurate.</small>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Approval RPUJ</span>
                <strong className="mt-1 block text-lg text-slate-950">{queues.rpujSubmitted || 0}</strong>
                <small className="mt-1 block text-xs text-slate-500">Pengajuan UJ menunggu approve/reject.</small>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Transfer Pending</span>
                <strong className="mt-1 block text-lg text-slate-950">{queues.rpujApprovedWaitingTransfer || 0}</strong>
                <small className="mt-1 block text-xs text-slate-500">RPUJ approve, bukti transfer belum upload.</small>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Menunggu Sales</span>
                <strong className="mt-1 block text-lg text-slate-950">{queues.invoiceWaitingSales || 0}</strong>
                <small className="mt-1 block text-xs text-slate-500">Invoice sudah ada, follow up di Sales.</small>
              </div>
            </div>
          </section>

          <section className="mb-4 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
            <div className="grid gap-2 text-sm md:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Perjalanan selesai</span>
                <strong className="mt-1 block text-sm text-slate-950">{summary.totalCompletedTrips || 0} trip</strong>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Customer</span>
                <strong className="mt-1 block text-sm text-slate-950">{summary.totalCustomers || 0} customer</strong>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Container / ritase</span>
                <strong className="mt-1 block text-sm text-slate-950">{summary.totalCompletedContainers || 0} ritase</strong>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Revenue</span>
                <strong className="mt-1 block text-sm text-slate-950">{summary.missingRevenue && !summary.totalRevenue ? 'Data belum tersedia' : formatCurrency(summary.totalRevenue || 0)}</strong>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Uang jalan</span>
                <strong className="mt-1 block text-sm text-slate-950">{summary.missingJourneyMoney && !summary.totalJourneyMoney ? 'Data belum tersedia' : formatCurrency(summary.totalJourneyMoney || 0)}</strong>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Estimasi margin</span>
                <strong className="mt-1 block text-sm text-slate-950">{(summary.missingRevenue || summary.missingJourneyMoney) && !summary.estimatedMargin ? 'Data belum tersedia' : formatCurrency(summary.estimatedMargin || 0)}</strong>
              </div>
            </div>
            {summary.missingRevenue || summary.missingJourneyMoney ? (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {summary.missingRevenue || 0} perjalanan belum punya tarif, {summary.missingJourneyMoney || 0} perjalanan belum punya uang jalan.
              </p>
            ) : null}
          </section>

          <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon={ReceiptText} label="Siap ditagihkan" value={summary.readyToInvoice || 0} tone="green" />
            <SummaryCard icon={FileQuestion} label="Dokumen belum lengkap" value={summary.incompleteDocuments || 0} tone="rose" />
            <SummaryCard icon={FileText} label="Belum dibuat invoice" value={summary.notInvoiced || 0} tone="amber" />
            <SummaryCard icon={CheckCircle2} label="Sudah invoice / lunas" value={summary.invoiced || 0} tone="blue" />
          </div>
        </>
      ) : null}

      {isDashboard ? null : (
        <>
          {isReadiness ? (
            <section className="mb-4 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black text-slate-950">Fokus Kesiapan Tagihan</h2>
                  <p className="mt-1 text-xs text-slate-500">Pilih antrean kerja yang ingin dicek Finance.</p>
                </div>
                <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50" type="button" onClick={resetFilters}>
                  Reset Antrean
                </button>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <button className="rounded-md border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-bold text-slate-700 hover:bg-slate-50" type="button" onClick={() => applyReadinessFilter({ documentStatus: 'SIAP_DITAGIHKAN', invoiceStatus: 'BELUM_DIBUAT' })}>
                  Siap Ditagihkan
                </button>
                <button className="rounded-md border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-bold text-slate-700 hover:bg-slate-50" type="button" onClick={() => applyReadinessFilter({ documentStatus: 'BELUM_LENGKAP', invoiceStatus: '' })}>
                  Dokumen Belum Lengkap
                </button>
                <button className="rounded-md border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-bold text-slate-700 hover:bg-slate-50" type="button" onClick={() => applyReadinessFilter({ documentStatus: '', invoiceStatus: 'BELUM_DIBUAT' })}>
                  Belum Invoice
                </button>
              </div>
            </section>
          ) : null}

      <section className="mb-4 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-950">Filter Data</h2>
            <p className="mt-1 text-xs text-slate-500">Persempit daftar berdasarkan tanggal selesai, customer, tujuan, dokumen, atau invoice.</p>
          </div>
          <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50" type="button" onClick={resetFilters}>Reset Filter</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Rentang selesai dari
            <input className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-slate-400" type="date" name="dateFrom" value={filters.dateFrom} onChange={updateFilter} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Rentang selesai sampai
            <input className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-slate-400" type="date" name="dateTo" value={filters.dateTo} onChange={updateFilter} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Customer
            <input className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-slate-400" name="customer" value={filters.customer} onChange={updateFilter} placeholder="Nama customer" />
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Tujuan
            <input className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-slate-400" name="destination" value={filters.destination} onChange={updateFilter} placeholder="Lokasi tujuan" />
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Ukuran container
            <select className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-slate-400" name="containerSize" value={filters.containerSize} onChange={updateFilter}>
              <option value="">Semua Ukuran</option>
              <option value="20FT">20FT</option>
              <option value="40FT">40FT</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Status dokumen
            <select className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-slate-400" name="documentStatus" value={filters.documentStatus} onChange={updateFilter}>
              {documentStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Status invoice
            <select className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-slate-400" name="invoiceStatus" value={filters.invoiceStatus} onChange={updateFilter}>
              {invoiceStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Cari SO / DO
            <span className="flex items-center rounded-md border border-slate-200 px-3 py-2 focus-within:border-slate-400">
              <Search size={16} className="mr-2 text-slate-400" />
              <input className="w-full border-0 p-0 text-sm text-slate-900 outline-none" name="query" value={filters.query} onChange={updateFilter} placeholder="SO, DO, SPK" />
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-black text-slate-950">Perjalanan Selesai</h2>
            <p className="text-xs text-slate-500">Menampilkan {rows.length} dari {trips.total || 0} perjalanan selesai.</p>
          </div>
          {loading ? <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-500"><Loader2 className="animate-spin" size={15} /> Memuat</span> : null}
        </header>

        {error ? (
          <div className="m-4 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} />
              <div>
                <strong className="block">Data Finance tidak dapat dimuat.</strong>
                <p>{error}</p>
              </div>
            </div>
          </div>
        ) : null}

        {!loading && !error && !hasRows ? (
          <div className="grid min-h-72 place-items-center px-4 py-10 text-center">
            <div>
              <FileQuestion className="mx-auto text-slate-300" size={42} />
              <h3 className="mt-3 text-base font-black text-slate-800">Belum ada perjalanan selesai</h3>
              <p className="mt-1 text-sm text-slate-500">Data akan muncul setelah Container Job berstatus Selesai.</p>
            </div>
          </div>
        ) : null}

        {hasRows ? (
          <div className="table-wrap">
            <table className="data-table master-table finance-master-table min-w-[1120px]">
              <thead>
                <tr>
                  {[
                    'Selesai',
                    'SO / Dokumen',
                    'Customer',
                    'Rute',
                    'Unit',
                    'Nilai',
                    'Status',
                    'Aksi',
                  ].map((column) => <th key={column}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-t border-slate-100 align-top hover:bg-slate-50" key={row.id}>
                    <td className="finance-wrap-cell px-3 py-2">
                      <strong className="block text-sm text-slate-900">{formatDate(row.completedAt)}</strong>
                      <span className="mt-0.5 block text-[10px] font-semibold text-slate-500">{formatDateTime(row.completedAt)}</span>
                    </td>
                    <td className="finance-wrap-cell px-3 py-2">
                      <strong className="block text-sm text-slate-950">{row.soNumber || '-'}</strong>
                      <span className="mt-0.5 block text-[10px] font-semibold text-slate-500">DO: {row.doNumber || '-'}</span>
                      <span className="block text-[10px] font-semibold text-slate-500">SPK: {row.spkNumber || '-'}</span>
                    </td>
                    <td className="px-3 py-2">
                      <strong className="block max-w-[210px] text-sm text-slate-900">{row.customer || '-'}</strong>
                      <span className="mt-0.5 block max-w-[210px] text-[10px] font-semibold text-slate-500">{row.serviceName || '-'}</span>
                    </td>
                    <td className="px-3 py-2">
                      <strong className="block max-w-[220px] text-sm text-slate-900">{row.origin || '-'} ke {row.destination || '-'}</strong>
                      <span className="mt-0.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{row.containerSize || '-'} - {row.quantity || 1} ritase</span>
                    </td>
                    <td className="px-3 py-2">
                      <strong className="block text-sm text-slate-900">{row.truck || '-'}</strong>
                      <span className="mt-0.5 block text-[10px] font-semibold text-slate-500">{row.driver || '-'}</span>
                      <span className="block text-[10px] font-semibold text-slate-500">Jalan: {formatDate(row.tripDate)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="grid min-w-[210px] grid-cols-2 gap-2">
                        <div className="rounded-md bg-emerald-50 px-2 py-1.5">
                          <span className="block text-[10px] font-bold uppercase text-emerald-700">Revenue</span>
                          <strong className="text-[11px] text-slate-950">{moneyValue(row.totalRevenue)}</strong>
                        </div>
                        <div className="rounded-md bg-blue-50 px-2 py-1.5">
                          <span className="block text-[10px] font-bold uppercase text-blue-700">Uang jalan</span>
                          <strong className="text-[11px] text-slate-950">{moneyValue(row.journeyMoney)}</strong>
                        </div>
                        <div className="rounded-md bg-slate-50 px-2 py-1.5">
                          <span className="block text-[10px] font-bold uppercase text-slate-500">Tambahan</span>
                          <strong className="text-[11px] text-slate-950">{formatCurrency(row.additionalCost || 0)}</strong>
                        </div>
                        <div className="rounded-md bg-slate-900 px-2 py-1.5">
                          <span className="block text-[10px] font-bold uppercase text-slate-300">Margin</span>
                          <strong className="text-[11px] text-white">{moneyValue(row.estimatedMargin)}</strong>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex min-w-[150px] flex-col items-start gap-1.5">
                        <StatusPill value={row.documentStatus} />
                        <StatusPill value={row.invoiceStatus} />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <button className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50" type="button" onClick={() => setDetailId(row.id)}>
                        <Eye size={15} /> Detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <p className="text-xs font-semibold text-slate-500">Halaman {trips.page || page} dari {trips.totalPages || 1}</p>
          <div className="flex gap-2">
            <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Sebelumnya</button>
            <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" type="button" disabled={page >= (trips.totalPages || 1)} onClick={() => setPage((current) => current + 1)}>Berikutnya</button>
          </div>
        </footer>
      </section>

      <FinanceDetailModal
        trip={detail}
        loading={detailLoading}
        error={detailError}
        onClose={() => {
          setDetailId('');
          setDetail(null);
          setDetailError('');
        }}
        onRetry={() => setDetailId((current) => `${current}`)}
      />
        </>
      )}
    </div>
  );
}

function FinanceDashboard() {
  return <FinanceWorkspace mode="dashboard" />;
}

export default FinanceDashboard;
