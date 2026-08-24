import { AlertTriangle, BadgeCheck, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, RefreshCw, Search, Upload, Wallet, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useFeedback } from '../../contexts/FeedbackContext';
import { USER_ROLES } from '../../constants/roles';
import {
  fetchFinanceInvoicePayments,
  fetchFinanceOutstanding,
  recordFinanceInvoicePayment,
} from '../../services/finance/financeService';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';

const PAGE_SIZE = 20;

const emptySummary = {
  totalOutstandingAmount: 0,
  totalOrders: 0,
  current: 0,
  overdue1To30: 0,
  overdue31To60: 0,
  overdue61To90: 0,
  overdue90Plus: 0,
  unknownDueDate: 0,
  needsReview: 0,
};

const AGING_OPTIONS = [
  { value: '', label: 'Semua Umur Piutang' },
  { value: 'current', label: 'Belum Jatuh Tempo' },
  { value: 'overdue_1_30', label: 'Terlambat 1-30 Hari' },
  { value: 'overdue_31_60', label: 'Terlambat 31-60 Hari' },
  { value: 'overdue_61_90', label: 'Terlambat 61-90 Hari' },
  { value: 'overdue_90_plus', label: 'Terlambat >90 Hari' },
  { value: 'unknown', label: 'Tanggal Jatuh Tempo Belum Ada' },
];

const AGING_LABELS = AGING_OPTIONS.reduce((acc, option) => {
  if (option.value) acc[option.value] = option.label;
  return acc;
}, {});

const AGING_TONE = {
  current: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  overdue_1_30: 'border-amber-200 bg-amber-50 text-amber-700',
  overdue_31_60: 'border-orange-200 bg-orange-50 text-orange-700',
  overdue_61_90: 'border-rose-200 bg-rose-50 text-rose-700',
  overdue_90_plus: 'border-rose-300 bg-rose-100 text-rose-800',
  unknown: 'border-slate-200 bg-slate-50 text-slate-500',
};

function AgingBadge({ bucket }) {
  const tone = AGING_TONE[bucket] || AGING_TONE.unknown;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black uppercase leading-none ${tone}`}>
      {AGING_LABELS[bucket] || bucket || '-'}
    </span>
  );
}

function MetricCard({ icon: Icon, label, value, helper, tone = 'red' }) {
  const toneClass = tone === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600';
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
          <strong className="mt-1 block break-words text-xl font-black text-slate-950">{value}</strong>
          {helper ? <small className="mt-1 block text-xs leading-relaxed text-slate-500">{helper}</small> : null}
        </div>
      </div>
    </article>
  );
}

function ModalPortal({ children }) {
  if (typeof document === 'undefined') return children;
  return createPortal(children, document.body);
}

function RecordPaymentModal({ row, busy, error, payments, paymentsLoading, onChange, form, onClose, onConfirm }) {
  if (!row) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3" role="presentation" onMouseDown={onClose}>
      <section
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-outstanding-payment-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Catat Pembayaran</p>
            <h2 id="customer-outstanding-payment-title" className="mt-1 break-words text-xl font-black text-slate-950">{row.soNumber}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{row.customer}</p>
          </div>
          <button className="secondary-button inline-flex h-10 w-10 shrink-0 items-center justify-center p-0" type="button" onClick={onClose} aria-label="Tutup catat pembayaran">
            <X size={18} />
          </button>
        </header>

        <div className="overflow-y-auto p-5">
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="block text-[11px] font-black uppercase text-slate-400">Total Tagihan</span>
                <strong className="mt-1 block text-sm text-slate-800">{formatCurrency(row.billingAmount)}</strong>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="block text-[11px] font-black uppercase text-slate-400">Sudah Dibayar</span>
                <strong className="mt-1 block text-sm text-slate-800">{formatCurrency(row.totalPaid)}</strong>
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                <span className="block text-[11px] font-black uppercase text-amber-600">Sisa Outstanding</span>
                <strong className="mt-1 block text-lg text-amber-700">{formatCurrency(row.outstandingAmount)}</strong>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3.5">
              <BadgeCheck className="mt-0.5 shrink-0 text-emerald-600" size={18} />
              <p className="text-xs font-semibold leading-relaxed text-emerald-800">
                Pembayaran ini akan mencatat pelunasan penuh sebesar <strong>{formatCurrency(row.outstandingAmount)}</strong> (sisa outstanding saat ini). Nominal tidak diinput manual supaya tidak ada risiko salah ketik &mdash; sesuai catatan bahwa outstanding di sini tidak dicicil.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-bold text-slate-700 sm:col-span-2">
                Tanggal Pembayaran
                <input
                  className="h-10 max-w-xs rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                  onChange={(event) => onChange({ ...form, paymentDate: event.target.value })}
                  type="date"
                  value={form.paymentDate}
                />
              </label>
              <label className="grid gap-1.5 text-xs font-bold text-slate-700 sm:col-span-2">
                Nomor Referensi Transfer
                <input
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                  maxLength={80}
                  onChange={(event) => onChange({ ...form, referenceNumber: event.target.value })}
                  placeholder="Contoh: TRF-20260821-001"
                  value={form.referenceNumber}
                />
              </label>
              <label className="grid gap-1.5 text-xs font-bold text-slate-700 sm:col-span-2">
                Catatan
                <textarea
                  className="min-h-16 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                  maxLength={500}
                  onChange={(event) => onChange({ ...form, note: event.target.value })}
                  value={form.note}
                />
              </label>
              <div className="grid gap-1.5 text-xs font-bold text-slate-700 sm:col-span-2">
                <span>Bukti Transfer <span className="font-semibold text-rose-600">Wajib diisi</span></span>
                <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5">
                  <label className="secondary-button inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap">
                    <Upload size={15} /> Pilih File
                    <input
                      accept="application/pdf,image/jpeg,image/png"
                      aria-label="Bukti Transfer"
                      className="sr-only"
                      onChange={(event) => onChange({ ...form, proofFile: event.target.files?.[0] || null })}
                      type="file"
                    />
                  </label>
                  <span className={`min-w-0 truncate text-xs font-semibold normal-case ${form.proofFile ? 'text-slate-700' : 'text-slate-400'}`}>
                    {form.proofFile ? form.proofFile.name : 'Belum ada file dipilih (PDF, JPG, atau PNG)'}
                  </span>
                </div>
              </div>
            </div>

            {error ? <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}

            <div className="rounded-lg border border-slate-200 p-3">
              <span className="block text-[11px] font-black uppercase text-slate-400">Riwayat Pembayaran</span>
              {paymentsLoading ? (
                <p className="mt-2 text-xs font-semibold text-slate-500">Memuat riwayat...</p>
              ) : payments.length ? (
                <ul className="mt-2 space-y-2">
                  {payments.map((payment) => (
                    <li key={payment.id} className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs first:border-t-0 first:pt-0">
                      <div>
                        <strong className="block text-slate-800">{formatCurrency(payment.amount)}</strong>
                        <span className="block text-slate-500">{formatDate(payment.paymentDate)} {payment.referenceNumber ? `- ${payment.referenceNumber}` : ''}</span>
                      </div>
                      <span className="text-slate-400">{payment.recordedByName || '-'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs font-semibold text-slate-500">Belum ada pembayaran tercatat.</p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button className="secondary-button" disabled={busy} onClick={onClose} type="button">Batal</button>
              <button className="primary-button" disabled={busy || Number(row.outstandingAmount) <= 0 || !form.proofFile} onClick={onConfirm} type="button">
                {busy ? 'Menyimpan...' : 'Tandai Lunas'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function CustomerOutstandingPage() {
  const { user } = useAuth();
  const { notify } = useFeedback();
  const canRecordPayment = [USER_ROLES.ADMIN, USER_ROLES.FINANCE].includes(user?.role);

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(emptySummary);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [query, setQuery] = useState('');
  const [agingBucket, setAgingBucket] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedRow, setSelectedRow] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ paymentDate: '', referenceNumber: '', note: '', proofFile: null, idempotencyKey: crypto.randomUUID() });
  const [paymentError, setPaymentError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchFinanceOutstanding({ page, pageSize: PAGE_SIZE, query, agingBucket });
      setRows(result?.rows || []);
      setSummary(result?.summary || emptySummary);
      setTotal(Number(result?.total || 0));
      setTotalPages(Math.max(1, Number(result?.totalPages || 1)));
    } catch (err) {
      setError(err.message || 'Data outstanding gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }, [page, query, agingBucket]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openPaymentModal(row) {
    setSelectedRow(row);
    setPaymentError('');
    setPaymentForm({
      paymentDate: new Date().toISOString().slice(0, 10),
      referenceNumber: '',
      note: '',
      proofFile: null,
      idempotencyKey: crypto.randomUUID(),
    });
    setPayments([]);
    setPaymentsLoading(true);
    fetchFinanceInvoicePayments(row.id)
      .then((rowsResult) => setPayments(rowsResult || []))
      .catch(() => setPayments([]))
      .finally(() => setPaymentsLoading(false));
  }

  function closePaymentModal() {
    setSelectedRow(null);
    setPaymentError('');
  }

  async function confirmPayment() {
    if (!selectedRow) return;
    // Nominal selalu diambil dari sisa outstanding saat ini (bukan input manual) supaya tidak ada
    // risiko salah ketik jumlah pelunasan.
    const amount = Number(selectedRow.outstandingAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError('Sales order ini tidak memiliki sisa outstanding untuk dilunasi.');
      return;
    }
    if (!paymentForm.proofFile) {
      setPaymentError('Bukti transfer wajib dilampirkan sebelum pembayaran bisa dicatat.');
      return;
    }

    setSaving(true);
    setPaymentError('');
    try {
      await recordFinanceInvoicePayment(selectedRow.id, {
        amount,
        paymentDate: paymentForm.paymentDate || undefined,
        referenceNumber: paymentForm.referenceNumber || undefined,
        note: paymentForm.note || undefined,
        idempotencyKey: paymentForm.idempotencyKey,
      }, paymentForm.proofFile);
      notify({ title: 'Pembayaran tercatat', message: `${selectedRow.soNumber} berhasil diperbarui.` });
      closePaymentModal();
      await loadData();
    } catch (err) {
      if (err.payload?.error?.code === 'SALES_ORDER_PAYMENT_IDEMPOTENCY_KEY_MISMATCH') {
        setPaymentForm((current) => ({ ...current, idempotencyKey: crypto.randomUUID() }));
      }
      setPaymentError(err.message || 'Pembayaran gagal disimpan.');
    } finally {
      setSaving(false);
    }
  }

  const summaryCards = useMemo(() => ([
    {
      icon: Wallet,
      label: 'Total Outstanding',
      value: formatCurrency(summary.totalOutstandingAmount),
      helper: `${summary.totalOrders || 0} sales order belum lunas`,
    },
    {
      icon: Clock3,
      label: 'Belum Jatuh Tempo',
      value: `${summary.current || 0} SO`,
      helper: 'Aging: current',
    },
    {
      icon: CircleDollarSign,
      label: 'Terlambat Bayar',
      value: `${(summary.overdue1To30 || 0) + (summary.overdue31To60 || 0) + (summary.overdue61To90 || 0) + (summary.overdue90Plus || 0)} SO`,
      helper: `>90 hari: ${summary.overdue90Plus || 0} SO`,
    },
    {
      icon: AlertTriangle,
      label: 'Perlu Ditinjau',
      value: `${summary.needsReview || 0} SO`,
      helper: 'Data invoice lama/tidak lengkap',
      tone: 'amber',
    },
  ]), [summary]);

  return (
    <main className="space-y-5">
      <header className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Finance</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Customer Outstanding</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
              Piutang customer dari Sales Order yang sudah selesai tapi belum lunas, dihitung dari tagihan dikurangi pembayaran yang sudah tercatat.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:min-w-[420px] sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-xs font-black uppercase tracking-wide text-slate-500">
              Cari
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-bold normal-case text-slate-900 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                  onChange={(event) => { setPage(1); setQuery(event.target.value); }}
                  placeholder="No. SO, invoice, atau customer"
                  value={query}
                />
              </div>
            </label>
            <label className="min-w-0 text-xs font-black uppercase tracking-wide text-slate-500">
              Umur Piutang
              <select
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                onChange={(event) => { setPage(1); setAgingBucket(event.target.value); }}
                value={agingBucket}
              >
                {AGING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <button className="secondary-button inline-flex items-center justify-center gap-2" onClick={loadData} type="button" disabled={loading}>
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        {summaryCards.map((card) => (
          <MetricCard key={card.label} icon={card.icon} label={card.label} value={card.value} helper={card.helper} tone={card.tone} />
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <h2 className="text-base font-black text-slate-950">Daftar Piutang</h2>
          <p className="text-xs text-slate-500">Diurutkan dari tanggal jatuh tempo terdekat.</p>
        </div>

        {error ? <div className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700">{error}</div> : null}

        <div className="table-wrap">
          <table className="responsive-data-table w-full min-w-[1080px] text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3">No. SO</th>
                <th className="px-3 py-3">Customer</th>
                <th className="px-3 py-3">No. Invoice</th>
                <th className="px-3 py-3 text-right">Tagihan</th>
                <th className="px-3 py-3 text-right">Dibayar</th>
                <th className="px-3 py-3 text-right">Outstanding</th>
                <th className="px-3 py-3">Jatuh Tempo</th>
                <th className="px-3 py-3">Umur Piutang</th>
                <th className="px-3 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-3 font-black text-slate-950" data-label="No. SO">
                    {row.soNumber}
                    {row.dataReviewStatus === 'perlu_dicek' ? (
                      <span className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-black uppercase text-amber-700">
                        <AlertTriangle size={10} /> Perlu Ditinjau
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-slate-700" data-label="Customer">{row.customer}</td>
                  <td className="px-3 py-3 text-slate-700" data-label="No. Invoice">{row.invoiceNumber || '-'}</td>
                  <td className="px-3 py-3 text-right font-bold text-slate-700" data-label="Tagihan">{formatCurrency(row.billingAmount)}</td>
                  <td className="px-3 py-3 text-right font-bold text-slate-700" data-label="Dibayar">{formatCurrency(row.totalPaid)}</td>
                  <td className="px-3 py-3 text-right font-black text-amber-700" data-label="Outstanding">{formatCurrency(row.outstandingAmount)}</td>
                  <td className="px-3 py-3 text-slate-700" data-label="Jatuh Tempo">{row.dueDate ? formatDate(row.dueDate) : '-'}</td>
                  <td className="px-3 py-3" data-label="Umur Piutang"><AgingBadge bucket={row.agingBucket} /></td>
                  <td className="px-3 py-3 text-right" data-label="Aksi">
                    {canRecordPayment ? (
                      <button className="secondary-button inline-flex items-center gap-2" onClick={() => openPaymentModal(row)} type="button">
                        Catat Pembayaran
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr className="responsive-empty-row">
                  <td className="px-3 py-8 text-center text-slate-500" colSpan={9}>{loading ? 'Memuat data outstanding...' : 'Tidak ada piutang yang cocok dengan filter ini.'}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <span className="text-xs font-semibold text-slate-500">Menampilkan {rows.length ? (page - 1) * PAGE_SIZE + 1 : 0}-{(page - 1) * PAGE_SIZE + rows.length} dari {total} data</span>
          <div className="flex items-center gap-2">
            <button className="secondary-button inline-flex h-8 w-8 items-center justify-center p-0" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button" aria-label="Halaman sebelumnya">
              <ChevronLeft size={15} />
            </button>
            <strong className="text-xs font-bold text-slate-600">Halaman {page} dari {totalPages}</strong>
            <button className="secondary-button inline-flex h-8 w-8 items-center justify-center p-0" disabled={page === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} type="button" aria-label="Halaman berikutnya">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </section>

      <ModalPortal>
        <RecordPaymentModal
          row={selectedRow}
          busy={saving}
          error={paymentError}
          payments={payments}
          paymentsLoading={paymentsLoading}
          form={paymentForm}
          onChange={setPaymentForm}
          onClose={closePaymentModal}
          onConfirm={confirmPayment}
        />
      </ModalPortal>
    </main>
  );
}

export default CustomerOutstandingPage;
