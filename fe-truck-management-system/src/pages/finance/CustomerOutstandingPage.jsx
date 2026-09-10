import { AlertTriangle, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Download, RefreshCw, Search, Wallet, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useFeedback } from '../../contexts/FeedbackContext';
import { USER_ROLES } from '../../constants/roles';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import AttachmentUploadField from '../../components/common/AttachmentUploadField';
import SearchBar from './shared/SearchBar';
import {
  fetchFinanceInvoicePayments,
  fetchFinanceOutstanding,
  fetchFinanceOutstandingByCustomer,
  recordFinanceInvoicePayment,
  voidFinanceInvoicePayment,
} from '../../services/finance/financeService';
import { downloadCsv } from '../../utils/csvExport';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';

const PAGE_SIZE = 20;
const DETAIL_PAGE_SIZE = 100;

const emptySummary = {
  totalOutstandingAmount: 0,
  totalOrders: 0,
  current: 0,
  overdue1To15: 0,
  overdue16To30: 0,
  overdue1To30: 0,
  overdue31To60: 0,
  overdue60Plus: 0,
  overdue61To90: 0,
  overdue90Plus: 0,
  unknownDueDate: 0,
  needsReview: 0,
};

const AGING_OPTIONS = [
  { value: '', label: 'Semua Umur Piutang' },
  { value: 'current', label: 'Current / Belum Jatuh Tempo' },
  { value: 'overdue_1_15', label: 'Overdue 1-15 Hari' },
  { value: 'overdue_16_30', label: 'Overdue 16-30 Hari' },
  { value: 'overdue_31_60', label: 'Overdue 31-60 Hari' },
  { value: 'overdue_60_plus', label: 'Overdue >60 Hari' },
  { value: 'overdue_all', label: 'Semua Overdue' },
];

// Terpisah dari AGING_OPTIONS (bukan hasil reduce dari situ) karena label ini juga dipakai untuk
// menampilkan badge per-invoice di modal detail (row.agingBucket bisa bernilai 'unknown' untuk
// invoice tanpa tanggal jatuh tempo), sementara dropdown filter "Umur Piutang" sengaja tidak lagi
// menawarkan opsi 'unknown' sebagai pilihan filter.
const AGING_LABELS = {
  current: 'Belum Jatuh Tempo',
  overdue_1_15: 'Terlambat 1-15 Hari',
  overdue_16_30: 'Terlambat 16-30 Hari',
  overdue_1_30: 'Terlambat 1-30 Hari',
  overdue_31_60: 'Terlambat 31-60 Hari',
  overdue_60_plus: 'Terlambat >60 Hari',
  overdue_61_90: 'Terlambat >60 Hari',
  overdue_90_plus: 'Terlambat >60 Hari',
  unknown: 'Tanggal Jatuh Tempo Belum Ada',
};

const SORT_OPTIONS = [
  { value: 'outstanding_desc', label: 'Outstanding Terbesar' },
  { value: 'oldest_overdue_desc', label: 'Umur Piutang Terlama' },
  { value: 'overdue_desc', label: 'Overdue Terbesar' },
  { value: 'customer_asc', label: 'Nama Customer A-Z' },
];

const AGING_TONE = {
  current: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  overdue_1_15: 'border-amber-200 bg-amber-50 text-amber-700',
  overdue_16_30: 'border-orange-200 bg-orange-50 text-orange-700',
  overdue_1_30: 'border-amber-200 bg-amber-50 text-amber-700',
  overdue_31_60: 'border-orange-200 bg-orange-50 text-orange-700',
  overdue_60_plus: 'border-rose-300 bg-rose-100 text-rose-800',
  overdue_61_90: 'border-rose-300 bg-rose-100 text-rose-800',
  overdue_90_plus: 'border-rose-300 bg-rose-100 text-rose-800',
  unknown: 'border-slate-200 bg-slate-50 text-slate-500',
};

function customerRollupCsvRows(rows) {
  return rows.map((row) => [
    row.customer || '-',
    row.totalOutstandingAmount || 0,
    row.currentAmount || 0,
    row.overdueAmount || 0,
    row.oldestOverdueDays || 0,
    row.invoiceCount || 0,
  ]);
}

function AgingBadge({ bucket }) {
  const tone = AGING_TONE[bucket] || AGING_TONE.unknown;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase leading-none ${tone}`}>
      {AGING_LABELS[bucket] || bucket || '-'}
    </span>
  );
}

function MetricCard({ icon: Icon, label, value, helper, tone = 'text-slate-950' }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-400">
        <Icon size={15} />
        <span>{label}</span>
      </div>
      <strong className={`mt-3 block text-xl ${tone}`}>{value}</strong>
      <span className="mt-1 block text-xs font-semibold text-slate-500">{helper}</span>
    </div>
  );
}

function ModalPortal({ children }) {
  if (typeof document === 'undefined') return children;
  return createPortal(children, document.body);
}

function CustomerDetailModal({ customer, rows, loading, error, canRecordPayment, onClose, onRecordPayment }) {
  const [detailQuery, setDetailQuery] = useState('');

  useEffect(() => {
    setDetailQuery('');
  }, [customer?.customer]);

  if (!customer) return null;

  const normalizedQuery = detailQuery.trim().toLowerCase();
  const visibleRows = normalizedQuery
    ? rows.filter((row) => [
      row.soNumber,
      row.invoiceNumber,
      row.customer,
      row.dueDate ? formatDate(row.dueDate) : '',
      row.billingAmount,
      row.totalPaid,
      row.outstandingAmount,
      AGING_LABELS[row.agingBucket],
    ].join(' ').toLowerCase().includes(normalizedQuery))
    : rows;

  return (
    <ModalPortal>
      <div className="master-modal-backdrop" role="presentation" onMouseDown={onClose}>
        <section className="master-modal customer-outstanding-detail-modal flex flex-col" role="dialog" aria-modal="true" aria-labelledby="customer-outstanding-detail-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="master-form-heading">
            <div className="min-w-0">
              <span>Detail Piutang</span>
              <h2 id="customer-outstanding-detail-title">{customer.customer}</h2>
              <p>{customer.invoiceCount} invoice belum lunas</p>
            </div>
            <button className="modal-close-button" type="button" onClick={onClose} aria-label="Tutup detail piutang">
              <X size={17} />
            </button>
          </div>

          <div className="master-form-sections min-h-0 flex-1 overflow-y-auto">
            <div className="master-fieldset">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">Total Piutang Belum Lunas</span>
                <strong className="text-2xl font-black normal-case text-amber-700">{formatCurrency(customer.totalOutstandingAmount)}</strong>
              </div>
            </div>
            {error ? <div className="alert error">{error}</div> : null}
            {loading ? (
              <p className="p-2 text-sm font-semibold text-slate-500">Memuat rincian invoice...</p>
            ) : !error && !rows.length ? (
              <EmptyState title="Tidak ada invoice" description="Customer ini tidak memiliki invoice outstanding." />
            ) : !error ? (
              <div className="space-y-3">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                  <SearchBar
                    ariaLabel="Cari invoice piutang"
                    query={detailQuery}
                    onChange={setDetailQuery}
                    placeholder="Cari No. SO, invoice, nominal..."
                  />
                </div>
                {!visibleRows.length ? (
                  <EmptyState title="Invoice tidak ditemukan" description="Coba gunakan nomor SO atau nomor invoice lain." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] divide-y divide-slate-200 text-left text-sm">
                      <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">No. SO</th>
                          <th className="px-4 py-3">No. Invoice</th>
                          <th className="px-4 py-3 text-right">Tagihan</th>
                          <th className="px-4 py-3 text-right">Dibayar</th>
                          <th className="px-4 py-3 text-right">Outstanding</th>
                          <th className="px-4 py-3">Jatuh Tempo</th>
                          <th className="px-4 py-3">Umur Piutang</th>
                          <th className="px-4 py-3 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleRows.map((row) => (
                          <tr key={row.id} className="align-middle hover:bg-slate-50/70">
                            <td className="px-4 py-3 font-black text-slate-950">
                              {row.soNumber}
                              {row.dataReviewStatus === 'perlu_dicek' ? (
                                <span className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-700">
                                  <AlertTriangle size={10} /> Perlu Ditinjau
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-xs font-medium text-slate-700">{row.invoiceNumber || '-'}</td>
                            <td className="px-4 py-3 text-right text-xs font-bold text-slate-700">{formatCurrency(row.billingAmount)}</td>
                            <td className="px-4 py-3 text-right text-xs font-bold text-slate-700">{formatCurrency(row.totalPaid)}</td>
                            <td className="px-4 py-3 text-right text-sm font-black text-amber-700">{formatCurrency(row.outstandingAmount)}</td>
                            <td className="px-4 py-3 text-xs font-medium text-slate-700">{row.dueDate ? formatDate(row.dueDate) : '-'}</td>
                            <td className="px-4 py-3"><AgingBadge bucket={row.agingBucket} /></td>
                            <td className="px-4 py-3 text-right">
                              {canRecordPayment ? (
                                <button className="secondary-button" onClick={() => onRecordPayment(row)} type="button">
                                  Catat Pembayaran
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="master-form-actions">
            <button className="secondary-button" onClick={onClose} type="button">Tutup</button>
          </div>
        </section>
      </div>
    </ModalPortal>
  );
}

function RecordPaymentModal({ row, busy, error, payments, paymentsLoading, onChange, form, onClose, onConfirm, canVoidPayment, voidBusyId, voidError, onVoidPayment }) {
  const [voidingId, setVoidingId] = useState(null);
  const [voidReason, setVoidReason] = useState('');

  useEffect(() => {
    setVoidingId(null);
    setVoidReason('');
  }, [row?.id]);

  if (!row) return null;

  return (
    <ModalPortal>
      <div className="master-modal-backdrop" role="presentation" onMouseDown={onClose}>
        <section className="master-modal max-w-2xl" role="dialog" aria-modal="true" aria-labelledby="customer-outstanding-payment-title" onMouseDown={(event) => event.stopPropagation()}>
          <form
            className="master-form"
            onSubmit={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            <div className="master-form-heading">
              <div className="min-w-0">
                <span>Catat Pembayaran</span>
                <h2 id="customer-outstanding-payment-title">{row.soNumber}</h2>
                <p>{row.customer}</p>
              </div>
              <button className="modal-close-button" type="button" onClick={onClose} aria-label="Tutup catat pembayaran">
                <X size={17} />
              </button>
            </div>

            <div className="master-form-sections">
              <fieldset className="master-fieldset">
                <legend>Ringkasan Tagihan</legend>
                <div className="master-form-grid">
                  <div className="master-field">
                    <span>Total Tagihan</span>
                    <strong className="text-sm font-black normal-case text-slate-950">{formatCurrency(row.billingAmount)}</strong>
                  </div>
                  <div className="master-field">
                    <span>Sudah Dibayar</span>
                    <strong className="text-sm font-black normal-case text-slate-950">{formatCurrency(row.totalPaid)}</strong>
                  </div>
                  <div className="master-field span-full">
                    <span>Sisa Outstanding</span>
                    <strong className="text-lg font-black normal-case text-amber-700">{formatCurrency(row.outstandingAmount)}</strong>
                  </div>
                </div>
                <div className="alert warning mt-3">
                  Pembayaran ini akan mencatat pelunasan penuh sebesar <strong>{formatCurrency(row.outstandingAmount)}</strong> (sisa outstanding saat ini). Nominal tidak diinput manual supaya tidak ada risiko salah ketik &mdash; outstanding di sini tidak dicicil.
                </div>
              </fieldset>

              <fieldset className="master-fieldset">
                <legend>Detail Pembayaran</legend>
                <div className="master-form-grid">
                  <label className="master-field">
                    <span>Tanggal Pembayaran</span>
                    <input
                      onChange={(event) => onChange({ ...form, paymentDate: event.target.value })}
                      type="date"
                      value={form.paymentDate}
                    />
                  </label>
                  <label className="master-field">
                    <span>Nomor Referensi Transfer</span>
                    <input
                      maxLength={80}
                      onChange={(event) => onChange({ ...form, referenceNumber: event.target.value })}
                      placeholder="Contoh: TRF-20260821-001"
                      value={form.referenceNumber}
                    />
                  </label>
                  <label className="master-field span-full">
                    <span>Catatan</span>
                    <textarea
                      maxLength={500}
                      onChange={(event) => onChange({ ...form, note: event.target.value })}
                      rows={3}
                      value={form.note}
                    />
                  </label>
                  <div className="master-field span-full">
                    <AttachmentUploadField
                      compact
                      helper="Wajib. Format PDF, JPG, PNG."
                      id="customer-outstanding-payment-proof"
                      label="Bukti Transfer"
                      onClear={() => onChange({ ...form, proofFile: null })}
                      onSelect={(file, validationError) => {
                        if (validationError) return;
                        onChange({ ...form, proofFile: file });
                      }}
                      title={form.proofFile?.name ? 'Ganti Bukti' : 'Pilih Bukti'}
                      value={form.proofFile}
                    />
                  </div>
                </div>
              </fieldset>

              {error ? <div className="alert error">{error}</div> : null}

              <fieldset className="master-fieldset">
                <legend>Riwayat Pembayaran</legend>
                {paymentsLoading ? (
                  <p className="text-xs font-semibold text-slate-500">Memuat riwayat...</p>
                ) : payments.length ? (
                  <ul className="grid gap-2">
                    {payments.map((payment) => (
                      <li key={payment.id} className="border-t border-slate-100 pt-2 text-xs first:border-t-0 first:pt-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className={payment.voidedAt ? 'opacity-60' : ''}>
                            <strong className={`block text-slate-800 ${payment.voidedAt ? 'line-through' : ''}`}>{formatCurrency(payment.amount)}</strong>
                            <span className="block text-slate-500">{formatDate(payment.paymentDate)} {payment.referenceNumber ? `- ${payment.referenceNumber}` : ''}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {payment.voidedAt ? (
                              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-black uppercase text-rose-700">Dibatalkan</span>
                            ) : (
                              <span className="text-slate-400">{payment.recordedByName || '-'}</span>
                            )}
                            {canVoidPayment && !payment.voidedAt ? (
                              <button
                                className="rounded-md border border-rose-200 px-2 py-1 text-[10px] font-black uppercase text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                                disabled={voidBusyId === payment.id}
                                onClick={() => { setVoidingId(voidingId === payment.id ? null : payment.id); setVoidReason(''); }}
                                type="button"
                              >
                                Batalkan
                              </button>
                            ) : null}
                          </div>
                        </div>
                        {payment.voidedAt ? (
                          <p className="mt-1 text-[10px] font-semibold text-rose-600">Alasan: {payment.voidReason} &middot; oleh {payment.voidedByName}</p>
                        ) : null}
                        {voidingId === payment.id ? (
                          <div className="mt-2 grid gap-1.5 rounded-md border border-rose-200 bg-rose-50 p-2">
                            <textarea
                              className="w-full rounded-md border border-rose-200 px-2 py-1.5 text-xs"
                              onChange={(event) => setVoidReason(event.target.value)}
                              placeholder="Alasan pembatalan (wajib)"
                              rows={2}
                              value={voidReason}
                            />
                            {voidError ? <p className="text-[10px] font-semibold text-rose-700">{voidError}</p> : null}
                            <div className="flex justify-end gap-2">
                              <button className="secondary-button" onClick={() => setVoidingId(null)} type="button">Batal</button>
                              <button
                                className="rounded-md border border-rose-300 bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                                disabled={!voidReason.trim() || voidBusyId === payment.id}
                                onClick={() => onVoidPayment(payment.id, voidReason)}
                                type="button"
                              >
                                {voidBusyId === payment.id ? 'Membatalkan...' : 'Konfirmasi Batalkan'}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs font-semibold text-slate-500">Belum ada pembayaran tercatat.</p>
                )}
              </fieldset>
            </div>

            <div className="master-form-actions">
              <button className="secondary-button" disabled={busy} onClick={onClose} type="button">Batal</button>
              <button className="primary-button" disabled={busy || Number(row.outstandingAmount) <= 0 || !form.proofFile} type="submit">
                {busy ? 'Menyimpan...' : 'Tandai Lunas'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </ModalPortal>
  );
}

function CustomerOutstandingPage() {
  const { user } = useAuth();
  const { notify } = useFeedback();
  const canRecordPayment = [USER_ROLES.ADMIN, USER_ROLES.FINANCE].includes(user?.role);
  const canVoidPayment = [USER_ROLES.ADMIN, USER_ROLES.FINANCE].includes(user?.role);

  const [customerRows, setCustomerRows] = useState([]);
  const [summary, setSummary] = useState(emptySummary);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [query, setQuery] = useState('');
  const [agingBucket, setAgingBucket] = useState('');
  const [sortBy, setSortBy] = useState('outstanding_desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [detailCustomer, setDetailCustomer] = useState(null);
  const [detailRows, setDetailRows] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [selectedRow, setSelectedRow] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ paymentDate: '', referenceNumber: '', note: '', proofFile: null, idempotencyKey: crypto.randomUUID() });
  const [paymentError, setPaymentError] = useState('');
  const [saving, setSaving] = useState(false);
  const [voidBusyId, setVoidBusyId] = useState('');
  const [voidError, setVoidError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Satu fetch saja: /finance/outstanding/by-customer sudah mengembalikan data tabel rollup
      // DAN summary sekaligus, supaya query outstanding yang berat tidak dijalankan dua kali
      // (dulu ada panggilan kedua ke fetchFinanceOutstanding({ pageSize: 1 }) hanya untuk summary).
      const rollup = await fetchFinanceOutstandingByCustomer({ page, pageSize: PAGE_SIZE, query, agingBucket, sortBy, dateFrom, dateTo });
      setCustomerRows(rollup?.rows || []);
      setTotal(Number(rollup?.total || 0));
      setTotalPages(Math.max(1, Number(rollup?.totalPages || 1)));
      setSummary(rollup?.summary || emptySummary);
    } catch (err) {
      setError(err.message || 'Data outstanding gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }, [page, query, agingBucket, sortBy, dateFrom, dateTo]);

  function exportCustomerRows() {
    downloadCsv(
      'customer-outstanding',
      ['Customer', 'Total OTS', 'Current', 'Overdue', 'Oldest Overdue (Hari)', 'Jumlah Invoice'],
      customerRollupCsvRows(customerRows),
    );
  }

  useEffect(() => {
    loadData();
  }, [loadData]);

  function loadDetailRows(customerName) {
    setDetailLoading(true);
    setDetailError('');
    fetchFinanceOutstanding({ query: customerName, pageSize: DETAIL_PAGE_SIZE, dateFrom, dateTo })
      .then((result) => setDetailRows((result?.rows || []).filter((row) => row.customer === customerName)))
      .catch((err) => setDetailError(err.message || 'Rincian invoice gagal dimuat.'))
      .finally(() => setDetailLoading(false));
  }

  function openDetailModal(row) {
    setDetailCustomer(row);
    setDetailRows([]);
    loadDetailRows(row.customer);
  }

  function closeDetailModal() {
    setDetailCustomer(null);
    setDetailRows([]);
    setDetailError('');
  }

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
      if (detailCustomer) loadDetailRows(detailCustomer.customer);
    } catch (err) {
      if (err.payload?.error?.code === 'SALES_ORDER_PAYMENT_IDEMPOTENCY_KEY_MISMATCH') {
        setPaymentForm((current) => ({ ...current, idempotencyKey: crypto.randomUUID() }));
      }
      setPaymentError(err.message || 'Pembayaran gagal disimpan.');
    } finally {
      setSaving(false);
    }
  }

  async function voidPayment(paymentId, reason) {
    if (!selectedRow) return;
    setVoidBusyId(paymentId);
    setVoidError('');
    try {
      await voidFinanceInvoicePayment(selectedRow.id, paymentId, reason);
      notify({ title: 'Pembayaran dibatalkan', message: `${selectedRow.soNumber} - outstanding kebuka lagi.` });
      const refreshed = await fetchFinanceInvoicePayments(selectedRow.id).catch(() => []);
      setPayments(refreshed || []);
      await loadData();
      if (detailCustomer) loadDetailRows(detailCustomer.customer);
    } catch (err) {
      setVoidError(err.message || 'Pembayaran gagal dibatalkan.');
    } finally {
      setVoidBusyId('');
    }
  }

  const summaryCards = useMemo(() => {
    const overdue1To30 = (summary.overdue1To15 || 0) + (summary.overdue16To30 || 0) || (summary.overdue1To30 || 0);
    const legacy60Plus = (summary.overdue61To90 || 0) + (summary.overdue90Plus || 0);
    const overdue60Plus = (summary.overdue60Plus || 0) || legacy60Plus;
    return [
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
        value: `${overdue1To30 + (summary.overdue31To60 || 0) + overdue60Plus} SO`,
        helper: `>60 hari: ${overdue60Plus} SO`,
      },
      {
        icon: AlertTriangle,
        label: 'Perlu Ditinjau',
        value: `${summary.needsReview || 0} SO`,
        helper: 'Data invoice lama/tidak lengkap',
        tone: 'text-amber-700',
      },
    ];
  }, [summary]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Finance"
        title="Customer Outstanding"
        description="Piutang customer dari Sales Order yang sudah selesai tapi belum lunas, dijumlahkan per customer dari tagihan dikurangi pembayaran yang sudah tercatat."
      />

      <section className="grid gap-3 md:grid-cols-4">
        {summaryCards.map((card) => (
          <MetricCard key={card.label} icon={card.icon} label={card.label} value={card.value} helper={card.helper} tone={card.tone} />
        ))}
      </section>

      <section className="panel master-table-panel">
        <div className="master-toolbar flex-wrap gap-y-3">
          <div>
            <span>Piutang</span>
            <h2>Piutang per Customer</h2>
            <p>Filter berdasarkan umur piutang dan urutkan sesuai prioritas penagihan. Klik Detail untuk melihat rincian invoice.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="search-field md:w-72">
              <Search size={16} />
              <input
                onChange={(event) => { setPage(1); setQuery(event.target.value); }}
                placeholder="Nama customer"
                value={query}
              />
            </label>
            <label className="grid gap-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
              Trip Date Dari
              <input
                className="master-filter-select"
                onChange={(event) => { setPage(1); setDateFrom(event.target.value); }}
                type="date"
                value={dateFrom}
              />
            </label>
            <label className="grid gap-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
              Trip Date Sampai
              <input
                className="master-filter-select"
                onChange={(event) => { setPage(1); setDateTo(event.target.value); }}
                type="date"
                value={dateTo}
              />
            </label>
            <label className="grid gap-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
              Umur Piutang
              <select
                className="master-filter-select"
                onChange={(event) => { setPage(1); setAgingBucket(event.target.value); }}
                value={agingBucket}
              >
                {AGING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
              Urutkan
              <select
                className="master-filter-select"
                onChange={(event) => { setPage(1); setSortBy(event.target.value); }}
                value={sortBy}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <button className="secondary-button" onClick={exportCustomerRows} type="button" disabled={!customerRows.length}>
              <Download size={15} /> Export CSV
            </button>
            <button className="secondary-button" onClick={loadData} type="button" disabled={loading}>
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className="m-4 rounded-md border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>
        ) : null}
        {loading ? (
          <div className="p-6 text-sm font-semibold text-slate-500">Memuat data outstanding...</div>
        ) : null}
        {!loading && !error && !customerRows.length ? (
          <div className="p-6">
            <EmptyState title="Tidak ada piutang" description="Tidak ada customer dengan piutang yang cocok dengan filter ini." />
          </div>
        ) : null}
        {!loading && !error && customerRows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 text-right">Total OTS</th>
                  <th className="px-4 py-3 text-right">Current</th>
                  <th className="px-4 py-3 text-right">Overdue</th>
                  <th className="px-4 py-3 text-right">Oldest Overdue</th>
                  <th className="px-4 py-3 text-right">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customerRows.map((row) => (
                  <tr key={row.customer} className="align-middle hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-black text-slate-950">
                      {row.customer}
                      {row.needsReview ? (
                        <span className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-700">
                          <AlertTriangle size={10} /> Perlu Ditinjau
                        </span>
                      ) : null}
                      <span className="ml-1.5 text-[10px] font-semibold normal-case text-slate-400">{row.invoiceCount} invoice</span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-black text-amber-700">{formatCurrency(row.totalOutstandingAmount)}</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-slate-700">{formatCurrency(row.currentAmount)}</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-slate-700">{formatCurrency(row.overdueAmount)}</td>
                    <td className="px-4 py-3 text-right text-xs font-medium text-slate-700">{row.oldestOverdueDays > 0 ? `${row.oldestOverdueDays} hari` : '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <button className="secondary-button" onClick={() => openDetailModal(row)} type="button">
                        Detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 text-xs font-semibold text-slate-500 md:flex-row md:items-center md:justify-between">
              <span>Menampilkan {customerRows.length ? (page - 1) * PAGE_SIZE + 1 : 0}-{(page - 1) * PAGE_SIZE + customerRows.length} dari {total} customer</span>
              <div className="flex items-center justify-end gap-2">
                <button className="secondary-button" type="button" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  <ChevronLeft size={14} /> Sebelumnya
                </button>
                <strong className="text-slate-700">Halaman {page} dari {totalPages}</strong>
                <button className="secondary-button" type="button" disabled={page === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
                  Berikutnya <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <CustomerDetailModal
        customer={detailCustomer}
        rows={detailRows}
        loading={detailLoading}
        error={detailError}
        canRecordPayment={canRecordPayment}
        onClose={closeDetailModal}
        onRecordPayment={openPaymentModal}
      />

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
        canVoidPayment={canVoidPayment}
        voidBusyId={voidBusyId}
        voidError={voidError}
        onVoidPayment={voidPayment}
      />
    </div>
  );
}

export default CustomerOutstandingPage;
