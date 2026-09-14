import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Banknote, CheckCircle2, ChevronLeft, ChevronRight, Download, FileUp, Pencil, Plus, RefreshCw, Search, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import DocumentLink from '../../components/common/DocumentLink';
import AttachmentUploadField from '../../components/common/AttachmentUploadField';
import { useAuth } from '../../hooks/useAuth';
import { useFeedback } from '../../hooks/useFeedback';
import { fetchOperationalFundBatches, fetchOperationalFundTransactions } from '../../services/finance/financeService';
import {
  correctContainerJobExpense,
  createContainerJobExpense,
  fetchContainerJobExpenseLedger,
  fetchContainerJobsPage,
  moveDroppingExpense,
  updateDroppingExpense,
  uploadContainerJobExpenseProof,
  uploadUjTransferProof,
  voidDroppingExpense,
} from '../../services/archive/containerJobService';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';
import { downloadCsv } from '../../utils/csvExport';

const expenseCategoryLabels = {
  uj_awal: 'UJ Perjalanan',
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

const paymentStatusLabels = {
  belum_dibayar: 'Belum Dibayar',
  sudah_dibayar: 'Sudah Dibayar',
};

const financeStatusLabels = {
  belum_dicek: 'Menunggu Finance',
  sudah_dicek: 'Sudah Valid',
  perlu_klarifikasi: 'Perlu Klarifikasi',
  dikoreksi: 'Dikoreksi',
};

const proofStatusBadgeTone = 'border-amber-200 bg-amber-50 text-amber-700';

const financeStatusBadgeTone = {
  belum_dicek: 'border-slate-200 bg-slate-50 text-slate-600',
  sudah_dicek: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  perlu_klarifikasi: 'border-amber-200 bg-amber-50 text-amber-800',
  dikoreksi: 'border-sky-200 bg-sky-50 text-sky-700',
};

const fundCategoryLabels = {
  saldo_awal: 'Saldo Awal',
  deposit_saldo: 'Uang Masuk',
  dropping_in: 'Uang Masuk',
  uj_order: 'UJ Perjalanan',
  top_up_uj: 'Top Up UJ',
  biaya_lainnya: 'Biaya Lainnya',
  container_job_expense: 'Biaya Perjalanan',
  driver_uj_balance: 'Saldo UJ Driver',
  correction: 'Koreksi Saldo',
  lainnya: 'Lainnya',
};


const REIMBURSEMENT_LAINNYA_PRESET = 'Reimbursement Lainnya';
const UANG_ADMIN_TF_PRESET = 'Uang Admin TF';
const EXPENSE_DESCRIPTION_GROUPS = [
  {
    id: 'operational',
    label: 'Biaya Operational',
    presets: ['Biaya MEL', 'Biaya Tambal Ban', 'Biaya Ganti Ban Dalam', 'Biaya BAN Kurang Angin', UANG_ADMIN_TF_PRESET],
  },
  {
    id: 'reimbursement',
    label: 'Biaya Reimbursement',
    presets: ['Reimbursement Bon Muat/Bongkar', 'Reimbursement Gatepass/TILA', 'Ekstend Closing', REIMBURSEMENT_LAINNYA_PRESET],
  },
];
const EXPENSE_DESCRIPTION_PRESETS = EXPENSE_DESCRIPTION_GROUPS.flatMap((group) => group.presets);
const EXPENSE_GROUP_BY_PRESET = EXPENSE_DESCRIPTION_GROUPS.reduce((acc, group) => {
  for (const preset of group.presets) acc[preset] = group.id;
  return acc;
}, {});
const EXPENSE_GROUP_LABELS = { operational: 'Biaya Operational', reimbursement: 'Biaya Reimbursement' };
const CUSTOM_DESCRIPTION_VALUE = 'custom';

const expenseCategoryOptions = [
  { value: 'uj_awal', label: expenseCategoryLabels.uj_awal },
  { value: 'top_up_uj', label: expenseCategoryLabels.top_up_uj },
  { value: 'tol', label: expenseCategoryLabels.tol },
  { value: 'parkir', label: expenseCategoryLabels.parkir },
  { value: 'bongkar', label: expenseCategoryLabels.bongkar },
  { value: 'muat', label: expenseCategoryLabels.muat },
  { value: 'lolo', label: expenseCategoryLabels.lolo },
  { value: 'inap', label: expenseCategoryLabels.inap },
  { value: 'terminal_depo', label: expenseCategoryLabels.terminal_depo },
  { value: 'tunggu', label: expenseCategoryLabels.tunggu },
  { value: 'uang_admin_tf', label: expenseCategoryLabels.uang_admin_tf },
  { value: 'reimbursement', label: expenseCategoryLabels.reimbursement },
  { value: 'lainnya', label: expenseCategoryLabels.lainnya },
];

const paymentStatusOptions = [
  { value: 'belum_dibayar', label: paymentStatusLabels.belum_dibayar },
  { value: 'sudah_dibayar', label: paymentStatusLabels.sudah_dibayar },
];

const filterOptions = [
  { value: 'all', label: 'Semua' },
  { value: 'need_proof', label: 'Belum Ada Bukti' },
  { value: 'need_correction', label: 'Perlu Koreksi' },
  { value: 'waiting_finance', label: 'Menunggu Finance' },
  { value: 'checked', label: 'Sudah Divalidasi' },
];

function ModalPortal({ children }) {
  if (typeof document === 'undefined') return children;
  return createPortal(children, document.body);
}

function canOperationalEditRow(financeCheckStatus, paymentStatus) {
  return (financeCheckStatus || 'belum_dicek') === 'belum_dicek' && paymentStatus !== 'batal';
}

function isAutoJourneyMoneyRow(row = {}) {
  return row.source === 'auto_uj_order' || row.sourceRefId === row.jobId && row.category === 'uj_awal';
}

function isManualOperationalExpenseRow(row = {}) {
  return Boolean(row.jobId && actionExpenseId(row)) && !isAutoJourneyMoneyRow(row);
}

function normalizeExpenseRow(job, expense) {
  const sourceJob = job || expense || {};
  const paymentStatus = expense.paymentStatus || 'belum_dibayar';
  const financeCheckStatus = expense.financeCheckStatus || 'belum_dicek';
  return {
    ...expense,
    id: expense.id,
    expenseId: expense.id,
    transactionType: 'debit',
    transactionDate: expense.paidAt || expense.createdAt || expense.tripDate || null,
    moneyIn: 0,
    moneyOut: Number(expense.amount || 0),
    runningBalance: expense.runningBalance,
    jobId: expense.jobId || expense.containerJobId || sourceJob.id,
    soNumber: expense.soNumber || sourceJob.soNumber || sourceJob.internalSoNumber || '-',
    containerNumber: expense.containerNumber || sourceJob.containerNumber || '-',
    customer: expense.customer || sourceJob.customer || '-',
    customerName: expense.customer || sourceJob.customer || '-',
    destination: expense.destination || sourceJob.destination || '-',
    driver: expense.driver || sourceJob.driver || '-',
    driverName: expense.driver || sourceJob.driver || '-',
    plateNumber: expense.plateNumber || sourceJob.plateNumber || '-',
    topName: expense.topName || expense.paidByName || '',
    doNumber: expense.doNumber || expense.destination || sourceJob.destination || '-',
    tripDate: expense.tripDate || sourceJob.tripDate || null,
    amount: Number(expense.amount || 0),
    paymentStatus,
    financeCheckStatus,
    canEdit: expense.canEdit ?? canOperationalEditRow(financeCheckStatus, paymentStatus),
  };
}

function normalizeFundTransactionRow(row = {}) {
  const expenseCategory = row.expenseCategory || row.category || '';
  return {
    ...row,
    id: row.id,
    expenseId: row.containerJobExpenseId || '',
    jobId: row.containerJobId || '',
    transactionDate: row.transactionDate || row.createdAt || null,
    tripDate: row.requestDate || row.transactionDate || null,
    category: expenseCategory,
    fundCategory: row.category || '',
    amount: Number(row.amount || 0),
    moneyIn: Number(row.moneyIn || (row.transactionType === 'credit' ? row.amount : 0) || 0),
    moneyOut: Number(row.moneyOut || (row.transactionType === 'debit' ? row.amount : 0) || 0),
    runningBalance: Number(row.runningBalance || 0),
    soNumber: row.soNumber || '-',
    containerNumber: row.containerNumber || '-',
    customer: row.customerName || row.customer || '-',
    customerName: row.customerName || row.customer || '-',
    destination: row.destination || '-',
    driver: row.driverName || '-',
    driverName: row.driverName || '-',
    plateNumber: row.plateNumber || '-',
    topName: row.topName || '',
    doNumber: row.doNumber || '-',
    paymentStatus: row.expensePaymentStatus || row.paymentStatus || '',
    financeCheckStatus: row.financeCheckStatus || '',
    proofAttachment: row.proofAttachment || null,
    proofAttachmentId: row.proofAttachmentId || '',
    canEdit: row.containerJobExpenseId ? canOperationalEditRow(row.financeCheckStatus, row.expensePaymentStatus || row.paymentStatus) : false,
  };
}

function actionExpenseId(row) {
  return row.expenseId || row.containerJobExpenseId || (row.jobId ? row.id : '');
}

function normalizeJobOption(job = {}) {
  const assignment = job.assignmentSnapshot || job.assignment || {};
  return {
    ...job,
    id: job.id,
    label: [
      job.soNumber || job.internalSoNumber,
      job.containerNumber,
      job.customer,
      job.destination,
    ].filter(Boolean).join(' - '),
    soNumber: job.soNumber || job.internalSoNumber || '-',
    containerNumber: job.containerNumber || '-',
    customer: job.customer || '-',
    destination: job.destination || '-',
    driver: job.driver || assignment.driver || '-',
    plateNumber: job.plateNumber || assignment.plateNumber || '-',
    status: job.status || '',
  };
}

function isExpenseJobOption(job = {}) {
  return ['running', 'completed'].includes(job.status);
}

function rowSearchText(row) {
  return [
    row.soNumber,
    row.containerNumber,
    row.customer,
    row.destination,
    row.driver,
    row.driverName,
    row.plateNumber,
    row.topName,
    row.doNumber,
    row.customerName,
    row.description,
    row.recipientName,
    expenseCategoryLabels[row.category],
    fundCategoryLabels[row.fundCategory],
  ].filter(Boolean).join(' ').toLowerCase();
}

function ledgerCsvRows(rows = []) {
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
  const reportDate = formatDate(firstRow.transactionDate || firstRow.paidAt || firstRow.createdAt);

  return [
    ['', reportDate, 'SISA SALDO', '', '', '', '', '', '', openingBalance, '', ''],
    ['', reportDate, 'UANG MASUK', '', '', '', '', totalMoneyIn, '', '', '', ''],
    ...chronologicalRows.map((row, index) => [
      index + 1,
      formatDate(row.transactionDate || row.paidAt || row.createdAt),
      row.description || fundCategoryLabels[row.fundCategory] || expenseCategoryLabels[row.category] || '',
      row.topName || '',
      row.driverName || row.driver || '',
      row.doNumber || row.destination || '',
      row.customerName || row.customer || '',
      row.moneyIn || 0,
      row.moneyOut || 0,
      Number.isFinite(Number(row.runningBalance)) ? row.runningBalance : '',
      financeStatusLabels[row.financeCheckStatus] || row.financeCheckStatus || '',
      row.proofAttachment ? 'Ada' : '',
    ]),
    ['', '', 'TOTAL PENGELUARAN', '', '', '', '', '', totalMoneyOut, '', '', ''],
    ['', '', 'SISA SALDO', '', '', '', '', '', '', closingBalance, '', ''],
  ];
}

function EditDroppingExpenseModal({ expense, onClose, onSave }) {
  const [form, setForm] = useState({
    category: expense.category || 'tol',
    amount: expense.amount ? String(expense.amount) : '',
    description: expense.description || '',
    recipientType: expense.recipientType || 'vendor',
    recipientName: expense.recipientName || expense.driver || '',
    proofFile: null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    const amount = Number(form.amount || 0);
    if (!amount) {
      setError('Nominal wajib lebih dari Rp 0.');
      return;
    }
    if (!form.description.trim()) {
      setError('Keterangan wajib diisi.');
      return;
    }
    if (!form.recipientName.trim()) {
      setError('Penerima wajib diisi.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ ...form, amount });
    } catch (submitError) {
      setError(submitError.message || 'Perubahan gagal disimpan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal>
      <div className="master-modal-backdrop" role="presentation" onMouseDown={() => { if (!saving) onClose(); }}>
        <section className="master-modal max-w-2xl" role="dialog" aria-modal="true" aria-label="Edit transaksi biaya" onMouseDown={(event) => event.stopPropagation()}>
          <form className="master-form" onSubmit={handleSubmit}>
            <div className="master-form-heading">
              <div>
                <span>{expense.soNumber}</span>
                <h2>Edit Transaksi</h2>
                <p>{expense.containerNumber} - Menunggu validasi Finance, masih bisa diperbaiki sendiri.</p>
              </div>
              <button className="modal-close-button" type="button" aria-label="Tutup edit transaksi" onClick={onClose} disabled={saving}>
                <X size={17} />
              </button>
            </div>
            <div className="master-form-sections">
              <fieldset className="master-fieldset">
                <legend>Detail Biaya</legend>
                <div className="master-form-grid">
                  <label className="master-field">
                    <span>Jenis Biaya <em>*</em></span>
                    <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>
                      {expenseCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className="master-field">
                    <span>Nominal <em>*</em></span>
                    <input min="0" type="number" onWheel={(event) => event.currentTarget.blur()} value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} />
                  </label>
                  <label className="master-field span-full">
                    <span>Keterangan <em>*</em></span>
                    <input type="text" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
                  </label>
                  <label className="master-field">
                    <span>Penerima <em>*</em></span>
                    <input type="text" value={form.recipientName} onChange={(event) => setForm((current) => ({ ...current, recipientName: event.target.value }))} />
                  </label>
                  <div className="master-field span-full">
                    <AttachmentUploadField
                      compact
                      helper="Opsional -- kosongkan kalau bukti tidak berubah"
                      id="dropping-edit-proof"
                      label="Ganti Bukti Pembayaran (opsional)"
                      onClear={() => setForm((current) => ({ ...current, proofFile: null }))}
                      onSelect={(file, validationError) => {
                        if (validationError) {
                          setError(validationError);
                          return;
                        }
                        setForm((current) => ({ ...current, proofFile: file }));
                        setError('');
                      }}
                      title={form.proofFile?.name ? 'Ganti' : 'Pilih Bukti Baru'}
                      value={form.proofFile}
                    />
                  </div>
                </div>
              </fieldset>
              {error ? <div className="alert error">{error}</div> : null}
            </div>
            <div className="master-form-actions">
              <button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Batal</button>
              <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Perubahan'}</button>
            </div>
          </form>
        </section>
      </div>
    </ModalPortal>
  );
}

function MoveDroppingExpenseModal({ expense, onClose, onSave }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [options, setOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [selectedTargetJob, setSelectedTargetJob] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const debounce = setTimeout(async () => {
      setLoadingOptions(true);
      try {
        const result = await fetchContainerJobsPage({
          page: 1,
          pageSize: 20,
          query: searchTerm.trim(),
          entrySource: 'realtime',
        });
        const rows = Array.isArray(result?.rows) ? result.rows : [];
        if (active) {
          setOptions(rows
            .map(normalizeJobOption)
            .filter(isExpenseJobOption)
            .filter((job) => job.id !== expense.jobId));
        }
      } catch (loadError) {
        if (active) setError(loadError.message || 'Ritasi gagal dimuat.');
      } finally {
        if (active) setLoadingOptions(false);
      }
    }, searchTerm.trim() ? 300 : 0);
    return () => {
      active = false;
      clearTimeout(debounce);
    };
  }, [expense.jobId, searchTerm]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedTargetJob) {
      setError('Pilih ritasi tujuan terlebih dahulu.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(selectedTargetJob);
    } catch (submitError) {
      setError(submitError.message || 'Pindah ritasi gagal disimpan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal>
      <div className="master-modal-backdrop" role="presentation" onMouseDown={() => { if (!saving) onClose(); }}>
        <section className="master-modal max-w-2xl" role="dialog" aria-modal="true" aria-label="Pindah ritasi transaksi biaya" onMouseDown={(event) => event.stopPropagation()}>
          <form className="master-form" onSubmit={handleSubmit}>
            <div className="master-form-heading">
              <div>
                <span>{expense.soNumber}</span>
                <h2>Pindah Ritasi</h2>
                <p>{expense.containerNumber} - {formatCurrency(expense.amount)} - salah pilih ritasi? pindahkan ke ritasi yang benar.</p>
              </div>
              <button className="modal-close-button" type="button" aria-label="Tutup pindah ritasi" onClick={onClose} disabled={saving}>
                <X size={17} />
              </button>
            </div>
            <div className="master-form-sections">
              <fieldset className="master-fieldset">
                <legend>Ritasi Tujuan</legend>
                <div className="master-form-grid">
                  <label className="master-field span-full">
                    <span>Cari Ritasi <em>*</em></span>
                    <input
                      onChange={(event) => { setSearchTerm(event.target.value); setSelectedTargetJob(null); }}
                      placeholder="Cari nomor SO, container, customer, tujuan..."
                      value={searchTerm}
                    />
                  </label>
                  <div className="master-field span-full max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                    {loadingOptions ? (
                      <p className="px-3 py-2.5 text-[11px] font-semibold normal-case text-slate-500">Memuat ritasi...</p>
                    ) : options.length ? (
                      options.map((job) => (
                        <button
                          className={`flex w-full items-start justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50 ${selectedTargetJob?.id === job.id ? 'bg-slate-50' : ''}`}
                          key={job.id}
                          onClick={() => setSelectedTargetJob(job)}
                          type="button"
                        >
                          <div className="min-w-0">
                            <strong className="block truncate text-xs font-black normal-case text-slate-900">{job.soNumber}</strong>
                            <span className="mt-0.5 block truncate text-[11px] font-semibold normal-case text-slate-500">{job.customer} - {job.destination}</span>
                          </div>
                          {selectedTargetJob?.id === job.id ? <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black normal-case text-emerald-700">Dipilih</span> : null}
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-2.5 text-[11px] font-semibold normal-case text-slate-500">Ritasi tidak ditemukan.</p>
                    )}
                  </div>
                </div>
              </fieldset>
              {error ? <div className="alert error">{error}</div> : null}
            </div>
            <div className="master-form-actions">
              <button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Batal</button>
              <button className="primary-button" disabled={saving || !selectedTargetJob} type="submit">{saving ? 'Menyimpan...' : 'Pindahkan'}</button>
            </div>
          </form>
        </section>
      </div>
    </ModalPortal>
  );
}

function VoidDroppingExpenseModal({ expense, onClose, onSave }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(reason.trim());
    } catch (submitError) {
      setError(submitError.message || 'Transaksi gagal dibatalkan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal>
      <div className="master-modal-backdrop" role="presentation" onMouseDown={() => { if (!saving) onClose(); }}>
        <section className="master-modal max-w-lg" role="dialog" aria-modal="true" aria-label="Void transaksi biaya" onMouseDown={(event) => event.stopPropagation()}>
          <form className="master-form" onSubmit={handleSubmit}>
            <div className="master-form-heading">
              <div>
                <span>{expense.soNumber}</span>
                <h2>Void / Batalkan Transaksi</h2>
                <p>{expense.containerNumber} - {formatCurrency(expense.amount)}</p>
              </div>
              <button className="modal-close-button" type="button" aria-label="Tutup void transaksi" onClick={onClose} disabled={saving}>
                <X size={17} />
              </button>
            </div>
            <div className="master-form-sections">
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                Transaksi yang dibatalkan tidak terhapus, tetap tersimpan sebagai histori void dan saldo batch akan pulih.
              </p>
              <label className="master-field">
                <span>Catatan / Alasan (opsional)</span>
                <textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
              </label>
              {error ? <div className="alert error">{error}</div> : null}
            </div>
            <div className="master-form-actions">
              <button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Batal</button>
              <button className="danger-button" type="submit" disabled={saving}>{saving ? 'Memproses...' : 'Ya, Void Transaksi'}</button>
            </div>
          </form>
        </section>
      </div>
    </ModalPortal>
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

function summarizeRows(rows = []) {
  return {
    totalAmount: rows.reduce((total, row) => total + Number(row.amount || 0), 0),
    needProof: rows.filter((row) => row.paymentStatus === 'sudah_dibayar' && !row.proofAttachment).length,
    needCorrection: rows.filter((row) => row.financeCheckStatus === 'perlu_klarifikasi').length,
    waitingFinance: rows.filter((row) => ['belum_dicek', 'dikoreksi'].includes(row.financeCheckStatus)).length,
    checked: rows.filter((row) => row.financeCheckStatus === 'sudah_dicek').length,
  };
}

function OperationalDroppingAccountPage() {
  const { user } = useAuth();
  const { notify } = useFeedback();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const todayDate = new Date().toISOString().slice(0, 10);
  const [batchDate, setBatchDate] = useState(todayDate);
  const [batchStatus, setBatchStatus] = useState('open');
  const [pendingCloseBatches, setPendingCloseBatches] = useState([]);
  const [page, setPage] = useState(1);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [ledgerSummary, setLedgerSummary] = useState({
    totalCredit: 0,
    totalDebit: 0,
    balance: 0,
    creditCount: 0,
    debitCount: 0,
  });
  const [expenseSummary, setExpenseSummary] = useState({
    totalAmount: 0,
    needProof: 0,
    needCorrection: 0,
    waitingFinance: 0,
    checked: 0,
  });
  const [ledgerRows, setLedgerRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [correctionExpense, setCorrectionExpense] = useState(null);
  const [editExpenseTarget, setEditExpenseTarget] = useState(null);
  const [moveExpenseTarget, setMoveExpenseTarget] = useState(null);
  const [voidExpenseTarget, setVoidExpenseTarget] = useState(null);
  const [ujProofTarget, setUjProofTarget] = useState(null);
  const [ujProofFile, setUjProofFile] = useState(null);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [addExpenseValidationOpen, setAddExpenseValidationOpen] = useState(false);
  const [jobOptions, setJobOptions] = useState([]);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobSearchTerm, setJobSearchTerm] = useState('');
  const [jobDropdownOpen, setJobDropdownOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [descriptionManualMode, setDescriptionManualMode] = useState(false);
  const [addExpenseForm, setAddExpenseForm] = useState({
    category: 'lainnya',
    expenseGroup: '',
    amount: '',
    description: '',
    lainnyaNote: '',
    recipientType: 'vendor',
    recipientName: '',
    paymentStatus: 'sudah_dibayar',
    proofFile: null,
    idempotencyKey: crypto.randomUUID(),
  });
  const [correctionForm, setCorrectionForm] = useState({
    category: 'tol',
    amount: '',
    description: '',
    recipientType: 'vendor',
    recipientName: '',
    paymentStatus: 'sudah_dibayar',
    proofFile: null,
  });
  const [proofFile, setProofFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!addExpenseOpen || !jobDropdownOpen) return undefined;
    let active = true;

    const trimmedTerm = jobSearchTerm.trim();

    const debounce = setTimeout(async () => {
      setJobLoading(true);
      try {
        let rows;
        if (trimmedTerm) {
          const result = await fetchContainerJobsPage({
            page: 1,
            pageSize: 20,
            query: trimmedTerm,
            entrySource: 'realtime',
          });
          rows = Array.isArray(result?.rows) ? result.rows : [];
        } else {
          const [runningResult, completedResult] = await Promise.all([
            fetchContainerJobsPage({ page: 1, pageSize: 10, status: 'running', entrySource: 'realtime' }),
            fetchContainerJobsPage({ page: 1, pageSize: 5, status: 'completed', entrySource: 'realtime' }),
          ]);
          const combinedRows = [
            ...(Array.isArray(runningResult?.rows) ? runningResult.rows : []),
            ...(Array.isArray(completedResult?.rows) ? completedResult.rows : []),
          ];
          const seenIds = new Set();
          rows = combinedRows.filter((row) => {
            if (seenIds.has(row.id)) return false;
            seenIds.add(row.id);
            return true;
          });
        }
        if (active) setJobOptions(rows.map(normalizeJobOption).filter(isExpenseJobOption));
      } catch (loadError) {
        if (active) {
          setJobOptions([]);
          setFileError(loadError.message || 'Ritasi gagal dimuat.');
        }
      } finally {
        if (active) setJobLoading(false);
      }
    }, trimmedTerm ? 300 : 0);

    return () => {
      active = false;
      clearTimeout(debounce);
    };
  }, [addExpenseOpen, jobDropdownOpen, jobSearchTerm]);

  useEffect(() => {
    if (batchDate !== todayDate) {
      setPendingCloseBatches([]);
      return undefined;
    }
    let active = true;

    async function loadPendingCloseBatches() {
      try {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const result = await fetchOperationalFundBatches({ page: 1, pageSize: 10, dateTo: yesterday });
        if (!active) return;
        const rows = Array.isArray(result?.rows) ? result.rows : [];
        setPendingCloseBatches(rows.filter((row) => row.status && row.status !== 'closed'));
      } catch {
        if (active) setPendingCloseBatches([]);
      }
    }

    loadPendingCloseBatches();
    return () => {
      active = false;
    };
  }, [batchDate, todayDate, refreshVersion]);

  useEffect(() => {
    let active = true;

    async function loadRows() {
      setLoading(true);
      setError('');
      try {
        const [batchResult, fundLedger, expenseLedger] = await Promise.all([
          fetchOperationalFundBatches({
            page: 1,
            pageSize: 1,
            dateFrom: batchDate,
            dateTo: batchDate,
          }),
          fetchOperationalFundTransactions({
            page,
            pageSize: 25,
            query,
            batchDate,
          }),
          fetchContainerJobExpenseLedger({
            page,
            pageSize: 25,
            query,
            ledgerStatus: statusFilter === 'all' ? '' : statusFilter,
            dateFrom: batchDate,
            dateTo: batchDate,
          }),
        ]);
        const useExpenseRows = statusFilter !== 'all';
        const fundRows = Array.isArray(fundLedger?.rows) ? fundLedger.rows.map(normalizeFundTransactionRow) : [];
        const expenses = Array.isArray(expenseLedger?.rows) ? expenseLedger.rows : [];
        const normalizedExpenseRows = expenses.map((expense) => normalizeExpenseRow(expense, expense)).sort((left, right) => (
          String(right.paidAt || right.createdAt || '').localeCompare(String(left.paidAt || left.createdAt || ''))
        ));
        if (!active) return;
        setBatchStatus(batchResult?.rows?.[0]?.status || 'open');
        setTotalRows(Number((useExpenseRows ? expenseLedger?.total : fundLedger?.total) || (useExpenseRows ? normalizedExpenseRows.length : fundRows.length) || 0));
        setLedgerRows(useExpenseRows ? normalizedExpenseRows : fundRows);
        setLedgerSummary(fundLedger?.summary || {
          totalCredit: 0,
          totalDebit: 0,
          balance: 0,
          creditCount: 0,
          debitCount: 0,
        });
        setExpenseSummary(expenseLedger?.summary || summarizeRows(normalizedExpenseRows));
      } catch (loadError) {
        if (active) setError(loadError.message || 'Gagal memuat rekening dropping.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadRows();
    return () => {
      active = false;
    };
  }, [batchDate, page, query, refreshVersion, statusFilter]);

  function updateQuery(value) {
    setQuery(value);
    setPage(1);
  }

  function updateStatusFilter(value) {
    setStatusFilter(value);
    setPage(1);
  }

  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return ledgerRows;
    return ledgerRows.filter((row) => rowSearchText(row).includes(keyword));
  }, [ledgerRows, query]);

  const summary = useMemo(() => ({
    balance: Number(ledgerRows[0]?.runningBalance ?? ledgerSummary.balance ?? 0),
    moneyIn: Number(ledgerSummary.totalCredit || 0),
    moneyOut: Number(ledgerSummary.totalDebit || 0),
    needProof: Number(expenseSummary.needProof || 0),
    needCorrection: Number(expenseSummary.needCorrection || 0),
    waitingFinance: Number(expenseSummary.waitingFinance || 0),
    checked: Number(expenseSummary.checked || 0),
  }), [expenseSummary, ledgerRows, ledgerSummary]);
  const totalPages = Math.max(1, Math.ceil(totalRows / 25));
  const selectedAddExpenseJob = selectedJob;
  const isPresetDescription = EXPENSE_DESCRIPTION_PRESETS.includes(addExpenseForm.description);
  const showManualDescription = descriptionManualMode || (addExpenseForm.description.trim() && !isPresetDescription);
  const descriptionSelectValue = showManualDescription ? CUSTOM_DESCRIPTION_VALUE : (isPresetDescription ? addExpenseForm.description : '');
  const showReimbursementLainnyaNote = addExpenseForm.description === REIMBURSEMENT_LAINNYA_PRESET;
  function handleDescriptionSelectChange(event) {
    const selected = event.target.value;
    if (selected === CUSTOM_DESCRIPTION_VALUE) {
      setDescriptionManualMode(true);
      setAddExpenseForm((current) => ({ ...current, category: 'lainnya', expenseGroup: '', lainnyaNote: '' }));
      return;
    }
    setDescriptionManualMode(false);
    setAddExpenseForm((current) => ({
      ...current,
      category: selected === UANG_ADMIN_TF_PRESET ? 'uang_admin_tf' : 'lainnya',
      description: selected,
      expenseGroup: EXPENSE_GROUP_BY_PRESET[selected] || '',
      lainnyaNote: '',
      proofFile: null,
    }));
    setFileError('');
  }

  function closeAddExpenseModal() {
    if (saving) return;
    setAddExpenseOpen(false);
    setAddExpenseValidationOpen(false);
    setJobDropdownOpen(false);
    setFileError('');
  }

  function pickAddExpenseJob(job) {
    setSelectedJob(job);
    setJobSearchTerm(job.label);
    setJobDropdownOpen(false);
    setFileError('');
  }

  function changeJobSearchTerm(value) {
    setJobSearchTerm(value);
    setSelectedJob(null);
    setJobDropdownOpen(true);
    setFileError('');
  }

  function openUpload(row) {
    setSelectedExpense(row);
    setProofFile(null);
    setFileError('');
  }

  function openCorrection(row) {
    setCorrectionExpense(row);
    setCorrectionForm({
      category: row.category || 'tol',
      amount: row.amount ? String(row.amount) : '',
      description: row.description || '',
      recipientType: row.recipientType || 'vendor',
      recipientName: row.recipientName || row.driver || '',
      paymentStatus: row.paymentStatus || 'sudah_dibayar',
      proofFile: null,
    });
    setFileError('');
  }

  function openEditExpense(row) {
    setEditExpenseTarget(row);
  }

  function openUjProof(row) {
    setUjProofTarget(row);
    setUjProofFile(null);
    setFileError('');
  }

  function openAddExpense() {
    if (batchStatus === 'closed') {
      setFileError('Batch rekening dropping tanggal ini sudah ditutup.');
      return;
    }
    setAddExpenseOpen(true);
    setSelectedJob(null);
    setJobSearchTerm('');
    setJobOptions([]);
    setJobDropdownOpen(false);
    setDescriptionManualMode(false);
    setAddExpenseForm({
      category: 'lainnya',
      amount: '',
      description: '',
      lainnyaNote: '',
      recipientType: 'vendor',
      recipientName: '',
      paymentStatus: 'sudah_dibayar',
      proofFile: null,
      idempotencyKey: crypto.randomUUID(),
    });
    setFileError('');
  }

  function validateAddExpenseForm() {
    const amount = Number(addExpenseForm.amount || 0);
    if (!selectedAddExpenseJob) {
      setFileError('Pilih ritasi yang akan dicatat biayanya.');
      return null;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFileError('Nominal biaya wajib lebih dari Rp 0.');
      return null;
    }
    if (!String(addExpenseForm.description || '').trim()) {
      setFileError('Keterangan biaya wajib diisi agar pencatatan jelas.');
      return null;
    }
    if (addExpenseForm.description === REIMBURSEMENT_LAINNYA_PRESET && !String(addExpenseForm.lainnyaNote || '').trim()) {
      setFileError('Isi keterangan untuk Reimbursement Lainnya agar pencatatan jelas.');
      return null;
    }
    if (!['operational', 'reimbursement'].includes(addExpenseForm.expenseGroup)) {
      setFileError('Jenis biaya (Operational/Reimbursement) wajib dipilih.');
      return null;
    }
    if (!String(addExpenseForm.recipientName || '').trim()) {
      setFileError('Penerima wajib diisi agar pencatatan pengeluaran jelas.');
      return null;
    }
    setFileError('');
    return {
      selectedJob: selectedAddExpenseJob,
      amount,
    };
  }

  function updateExpenseRow(sourceRow, saved) {
    const updatedRow = normalizeExpenseRow(sourceRow, {
      ...sourceRow,
      ...saved,
      id: sourceRow.id,
      expenseId: saved.id || sourceRow.expenseId,
      containerJobId: sourceRow.jobId,
      transactionDate: sourceRow.transactionDate,
      moneyIn: sourceRow.moneyIn,
      moneyOut: saved.amount || sourceRow.moneyOut,
      runningBalance: sourceRow.runningBalance,
    });
    setLedgerRows((current) => current.map((row) => (row.id === sourceRow.id ? updatedRow : row)));
  }

  async function submitProof(event) {
    event.preventDefault();
    if (!selectedExpense || saving) return;
    if (!proofFile) {
      setFileError('File bukti pembayaran wajib dipilih.');
      return;
    }

    setSaving(true);
    setFileError('');
    try {
      const actorName = user?.fullName || user?.name || user?.email || 'Operational';
      const saved = await uploadContainerJobExpenseProof(selectedExpense.jobId, actionExpenseId(selectedExpense), {
        proofFile,
        paidAt: new Date().toISOString(),
        updatedBy: actorName,
        description: selectedExpense.description || expenseCategoryLabels[selectedExpense.category] || 'Bukti pembayaran biaya',
      });
      updateExpenseRow(selectedExpense, saved);
      setSelectedExpense(null);
      setRefreshVersion((value) => value + 1);
      notify?.({ title: 'Bukti tersimpan', message: `${selectedExpense.soNumber} - ${selectedExpense.containerNumber}` });
    } catch (submitError) {
      setFileError(submitError.message || 'Bukti pembayaran gagal diupload.');
    } finally {
      setSaving(false);
    }
  }

  async function submitCorrection(event) {
    event.preventDefault();
    if (!correctionExpense || saving) return;
    const amount = Number(correctionForm.amount || 0);
    if (!amount) {
      setFileError('Nominal koreksi wajib lebih dari Rp 0.');
      return;
    }
    setSaving(true);
    setFileError('');
    try {
      const actorName = user?.fullName || user?.name || user?.email || 'Operational';
      const saved = await correctContainerJobExpense(correctionExpense.jobId, actionExpenseId(correctionExpense), {
        ...correctionForm,
        amount,
        proofAttachmentId: correctionExpense.proofAttachmentId || correctionExpense.proofAttachment?.path || correctionExpense.proofAttachment?.id || null,
        updatedBy: actorName,
      });
      updateExpenseRow(correctionExpense, saved);
      setCorrectionExpense(null);
      setRefreshVersion((value) => value + 1);
      notify?.({ title: 'Koreksi tersimpan', message: `${correctionExpense.soNumber} - ${correctionExpense.containerNumber}` });
    } catch (submitError) {
      setFileError(submitError.message || 'Koreksi penggunaan saldo gagal disimpan.');
    } finally {
      setSaving(false);
    }
  }

  async function submitEditExpense(form) {
    if (!editExpenseTarget) return;
    const actorName = user?.fullName || user?.name || user?.email || 'Operational';
    const saved = await updateDroppingExpense(editExpenseTarget.jobId, actionExpenseId(editExpenseTarget), {
      ...form,
      paymentStatus: 'sudah_dibayar',
      updatedBy: actorName,
    });
    updateExpenseRow(editExpenseTarget, saved);
    setEditExpenseTarget(null);
    setRefreshVersion((value) => value + 1);
    notify?.({ title: 'Transaksi tersimpan', message: `${editExpenseTarget.soNumber} - ${editExpenseTarget.containerNumber}` });
  }

  async function submitMoveExpense(targetJob) {
    if (!moveExpenseTarget) return;
    const actorName = user?.fullName || user?.name || user?.email || 'Operational';
    const saved = await moveDroppingExpense(moveExpenseTarget.jobId, actionExpenseId(moveExpenseTarget), {
      targetContainerJobId: targetJob.id,
      updatedBy: actorName,
    });
    setMoveExpenseTarget(null);
    setRefreshVersion((value) => value + 1);
    notify?.({ title: 'Ritasi dipindahkan', message: `${moveExpenseTarget.soNumber} -> ${saved.soNumber || targetJob.soNumber}` });
  }

  async function submitVoidExpense(voidReason) {
    if (!voidExpenseTarget) return;
    const actorName = user?.fullName || user?.name || user?.email || 'Operational';
    await voidDroppingExpense(voidExpenseTarget.jobId, actionExpenseId(voidExpenseTarget), {
      voidReason,
      updatedBy: actorName,
    });
    setVoidExpenseTarget(null);
    setRefreshVersion((value) => value + 1);
    notify?.({ title: 'Transaksi dibatalkan', message: `${voidExpenseTarget.soNumber} - ${voidExpenseTarget.containerNumber}` });
  }

  async function submitUjProof(event) {
    event.preventDefault();
    if (!ujProofTarget || saving) return;
    if (!ujProofFile) {
      setFileError('Bukti transfer UJ wajib dipilih.');
      return;
    }

    setSaving(true);
    setFileError('');
    try {
      const actorName = user?.fullName || user?.name || user?.email || 'Operational';
      const saved = await uploadUjTransferProof(ujProofTarget.jobId, actionExpenseId(ujProofTarget), {
        proofFile: ujProofFile,
        updatedBy: actorName,
      });
      updateExpenseRow(ujProofTarget, saved);
      setUjProofTarget(null);
      setRefreshVersion((value) => value + 1);
      notify?.({ title: 'Bukti transfer UJ tersimpan', message: `${ujProofTarget.soNumber} - ${ujProofTarget.containerNumber}` });
    } catch (submitError) {
      setFileError(submitError.message || 'Bukti transfer UJ gagal diupload.');
    } finally {
      setSaving(false);
    }
  }

  function submitAddExpense(event) {
    event.preventDefault();
    if (saving) return;
    const validated = validateAddExpenseForm();
    if (!validated) return;
    setAddExpenseValidationOpen(true);
  }

  async function confirmAddExpense(event) {
    event.preventDefault();
    if (saving) return;
    const validated = validateAddExpenseForm();
    if (!validated) {
      setAddExpenseValidationOpen(false);
      return;
    }
    const { selectedJob, amount } = validated;
    setSaving(true);
    setFileError('');
    try {
      const actorName = user?.fullName || user?.name || user?.email || 'Operational';
      const description = showReimbursementLainnyaNote
        ? `${addExpenseForm.description} - ${addExpenseForm.lainnyaNote.trim()}`
        : addExpenseForm.description;
      await createContainerJobExpense(selectedJob.id, {
        ...addExpenseForm,
        description,
        amount,
        updatedBy: actorName,
      });
      setAddExpenseOpen(false);
      setAddExpenseValidationOpen(false);
      setRefreshVersion((value) => value + 1);
      notify?.({ title: 'Biaya tersimpan', message: `${selectedJob.soNumber} - ${formatCurrency(amount)}` });
    } catch (submitError) {
      if (submitError.payload?.error?.code === 'CONTAINER_JOB_EXPENSE_IDEMPOTENCY_KEY_MISMATCH') {
        setAddExpenseForm((current) => ({ ...current, idempotencyKey: crypto.randomUUID() }));
      }
      setFileError(submitError.message || 'Biaya lainnya gagal disimpan.');
      setAddExpenseValidationOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function closeAddExpenseValidationModal() {
    if (saving) return;
    setAddExpenseValidationOpen(false);
  }

  function exportLedgerRows() {
    downloadCsv(
      'rekening-dropping-operational',
      ['No', 'Tanggal', 'Keterangan', 'Dicatat Oleh', 'Driver', 'Nomor DO', 'Customer', 'Uang Masuk', 'Uang Keluar', 'Saldo', 'Status Finance', 'Bukti'],
      ledgerCsvRows(filteredRows),
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operational"
        title="Rekening Dropping"
        description="Riwayat penggunaan saldo dan bukti pembayaran Operational."
        actions={(
          <div className="flex flex-wrap gap-2">
            <button className="primary-button" type="button" disabled={batchStatus === 'closed'} onClick={openAddExpense}>
              <Plus size={15} /> Catat Biaya
            </button>
            <button className="secondary-button" type="button" disabled={!filteredRows.length} onClick={exportLedgerRows}>
              <Download size={15} /> Export CSV
            </button>
            <button className="secondary-button" type="button" onClick={() => setRefreshVersion((value) => value + 1)}>
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
        )}
      />

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard icon={Banknote} label="Saldo Aktif" value={formatCurrency(summary.balance)} helper={`${totalRows} mutasi`} tone="text-emerald-700" />
        <MetricCard icon={ArrowDownLeft} label="Uang Masuk" value={formatCurrency(summary.moneyIn)} helper="Dropping dari Finance" />
        <MetricCard icon={ArrowUpRight} label="Uang Keluar" value={formatCurrency(summary.moneyOut)} helper="UJ dan biaya lapangan" />
        <MetricCard icon={FileUp} label="Belum Ada Bukti" value={`${expenseSummary.needProof || 0} transaksi`} helper="Bukti diupload dan divalidasi Finance" tone="text-amber-700" />
        <MetricCard icon={CheckCircle2} label="Validasi Finance" value={`${expenseSummary.waitingFinance || 0} menunggu`} helper={`${expenseSummary.needCorrection || 0} perlu klarifikasi`} tone="text-sky-700" />
      </section>

      {batchDate === todayDate && pendingCloseBatches.length ? (
        <div className="alert warning flex items-start gap-2">
          <AlertTriangle className="mt-0.5 shrink-0" size={16} />
          <span>
            Batch dropping tanggal {pendingCloseBatches.map((row) => formatDate(row.batchDate)).join(', ')} belum ditutup Finance. Mohon tutup batch sebelumnya sebelum melanjutkan transaksi hari ini.
          </span>
        </div>
      ) : null}

      <section className="panel master-table-panel">
        <div className="master-toolbar flex-wrap gap-y-3">
          <div>
            <span>Riwayat Saldo</span>
            <h2>Buku Kas Rekening Dropping</h2>
            <p>Riwayat penggunaan saldo per batch harian Operational.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
              Batch Dropping
              <input
                aria-label="Batch rekening dropping"
                className="master-filter-select max-w-none normal-case"
                onChange={(event) => {
                  setBatchDate(event.target.value);
                  setPage(1);
                }}
                type="date"
                value={batchDate}
              />
            </label>
            <label className="grid gap-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
              Status Transaksi
              <select
                aria-label="Filter status rekening dropping"
                className="master-filter-select"
                onChange={(event) => updateStatusFilter(event.target.value)}
                value={statusFilter}
              >
                {filterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="search-field md:w-80">
              <Search size={16} />
              <input
                onChange={(event) => updateQuery(event.target.value)}
                placeholder="Cari SO, container, driver..."
                value={query}
              />
            </label>
          </div>
        </div>

        {batchStatus === 'closed' ? (
          <div className="mx-4 mt-4 alert warning flex items-start gap-2">
            <AlertTriangle className="mt-0.5 shrink-0" size={16} />
            <span>Batch tanggal ini sudah ditutup Finance. Perubahan hanya bisa melalui Finance/Admin.</span>
          </div>
        ) : null}

        {loading ? (
          <div className="p-6 text-sm font-semibold text-slate-500">Memuat riwayat saldo...</div>
        ) : null}
        {error ? (
          <div className="m-4 rounded-md border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>
        ) : null}
        {!loading && !error && !filteredRows.length ? (
          <div className="p-6">
            <EmptyState title="Belum ada mutasi saldo" description="Dropping masuk dan penggunaan saldo akan tampil di sini." />
          </div>
        ) : null}
        {!loading && !error && filteredRows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] divide-y divide-slate-200 text-left text-sm">
              <colgroup>
                <col className="w-[11%]" />
                <col className="w-[27%]" />
                <col className="w-[10%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[19%]" />
              </colgroup>
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Keterangan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Uang Masuk</th>
                  <th className="px-4 py-3 text-right">Uang Keluar</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row, index) => {
                  const isVoided = row.paymentStatus === 'batal';
                  const hasExpenseAction = Boolean(row.jobId && actionExpenseId(row));
                  const canChangeBeforeFinance = hasExpenseAction && canOperationalEditRow(row.financeCheckStatus, row.expensePaymentStatus || row.paymentStatus) && batchStatus === 'open' && !isVoided;
                  const canManualEdit = canChangeBeforeFinance && Boolean(row.canEdit) && isManualOperationalExpenseRow(row);
                  const missingProof = canChangeBeforeFinance && !row.proofAttachment;
                  const secondaryInfo = [row.soNumber, row.containerNumber !== '-' ? row.containerNumber : '', row.driverName || row.driver || '', row.customerName || row.customer || '']
                    .filter(Boolean)
                    .filter((value) => value !== '-')
                    .join(' - ');
                  return (
                    <tr key={row.id} className="align-middle hover:bg-slate-50/70">
                      <td className="px-4 py-3 text-xs font-medium text-slate-700">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-black text-slate-700">
                            {(page - 1) * 25 + index + 1}
                          </span>
                          <span>{formatDate(row.transactionDate || row.paidAt || row.createdAt)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <strong className="block text-sm font-semibold text-slate-950">{row.description || fundCategoryLabels[row.fundCategory] || expenseCategoryLabels[row.category] || '-'}</strong>
                        <span className="mt-1 block text-xs font-medium text-slate-500">{fundCategoryLabels[row.fundCategory] || expenseCategoryLabels[row.category] || row.category || '-'}</span>
                        {secondaryInfo ? <span className="mt-0.5 block truncate text-xs font-medium text-slate-500/70">{secondaryInfo}</span> : null}
                        {row.financeNote ? <span className="mt-1 block rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">{row.financeNote}</span> : null}
                      </td>
                      <td className="px-4 py-3">
                        {hasExpenseAction ? (
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold normal-case ${isVoided ? 'border-rose-200 bg-rose-50 text-rose-700' : financeStatusBadgeTone[row.financeCheckStatus] || financeStatusBadgeTone.belum_dicek}`}>
                            {isVoided ? 'Void/Batal' : financeStatusLabels[row.financeCheckStatus] || row.financeCheckStatus}
                          </span>
                        ) : <span className="text-slate-300">-</span>}
                        {missingProof ? (
                          <span className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold normal-case ${proofStatusBadgeTone}`}>Belum Ada Bukti</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-700">{row.moneyIn ? formatCurrency(row.moneyIn) : <span className="text-slate-300">-</span>}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-rose-600">{row.moneyOut ? formatCurrency(row.moneyOut) : <span className="text-slate-300">-</span>}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">{Number.isFinite(Number(row.runningBalance)) ? formatCurrency(row.runningBalance) : '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {row.proofAttachment ? (
                            <DocumentLink
                              className="secondary-button"
                              file={row.proofAttachment}
                              label="View"
                            />
                          ) : null}
                          {canManualEdit ? (
                            <button className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => openEditExpense(row)}>
                              <Pencil size={13} /> Edit
                            </button>
                          ) : null}
                          {missingProof ? <span className="inline-flex h-8 items-center justify-center rounded-md bg-slate-50 px-3 text-xs font-semibold text-slate-500">Menunggu Finance</span> : null}
                          {hasExpenseAction && row.financeCheckStatus === 'perlu_klarifikasi' ? (
                            <button className="secondary-button" type="button" onClick={() => openCorrection(row)}>
                              Koreksi
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 text-xs font-semibold text-slate-500 md:flex-row md:items-center md:justify-between">
              <span>Menampilkan {filteredRows.length} dari {totalRows} transaksi</span>
              <div className="flex items-center justify-end gap-2">
                <button className="secondary-button" type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                  <ChevronLeft size={14} /> Sebelumnya
                </button>
                <strong className="text-slate-700">Halaman {page} dari {totalPages}</strong>
                <button className="secondary-button" type="button" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                  Berikutnya <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {selectedExpense ? (
        <ModalPortal>
        <div className="master-modal-backdrop" role="presentation" onMouseDown={() => setSelectedExpense(null)}>
          <section className="master-modal max-w-2xl" role="dialog" aria-modal="true" aria-label="Upload bukti pembayaran" onMouseDown={(event) => event.stopPropagation()}>
            <form className="master-form" onSubmit={submitProof}>
              <div className="master-form-heading">
                <div>
                  <span>{selectedExpense.soNumber}</span>
                  <h2>Upload Bukti Pembayaran</h2>
                  <p>{selectedExpense.containerNumber} - {formatCurrency(selectedExpense.amount)}</p>
                </div>
                <button className="modal-close-button" type="button" aria-label="Tutup upload bukti" onClick={() => setSelectedExpense(null)}>
                  <X size={17} />
                </button>
              </div>
              <div className="master-form-sections">
                <AttachmentUploadField
                  helper="PDF, JPG, PNG"
                  id="dropping-payment-proof"
                  label="Bukti Pembayaran"
                  onClear={() => setProofFile(null)}
                  onSelect={(file, validationError) => {
                    if (validationError) {
                      setFileError(validationError);
                      return;
                    }
                    setProofFile(file);
                    setFileError('');
                  }}
                  title={proofFile?.name ? 'Ganti Bukti' : 'Pilih Bukti'}
                  value={proofFile}
                />
                {fileError ? <div className="alert error">{fileError}</div> : null}
              </div>
              <div className="master-form-actions">
                <button className="secondary-button" type="button" onClick={() => setSelectedExpense(null)} disabled={saving}>Batal</button>
                <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Bukti'}</button>
              </div>
            </form>
          </section>
        </div>
        </ModalPortal>
      ) : null}

      {editExpenseTarget ? (
        <EditDroppingExpenseModal
          expense={editExpenseTarget}
          onClose={() => setEditExpenseTarget(null)}
          onSave={submitEditExpense}
        />
      ) : null}

      {moveExpenseTarget ? (
        <MoveDroppingExpenseModal
          expense={moveExpenseTarget}
          onClose={() => setMoveExpenseTarget(null)}
          onSave={submitMoveExpense}
        />
      ) : null}

      {voidExpenseTarget ? (
        <VoidDroppingExpenseModal
          expense={voidExpenseTarget}
          onClose={() => setVoidExpenseTarget(null)}
          onSave={submitVoidExpense}
        />
      ) : null}

      {ujProofTarget ? (
        <ModalPortal>
        <div className="master-modal-backdrop" role="presentation" onMouseDown={() => { if (!saving) setUjProofTarget(null); }}>
          <section className="master-modal max-w-2xl" role="dialog" aria-modal="true" aria-label="Upload bukti transfer UJ" onMouseDown={(event) => event.stopPropagation()}>
            <form className="master-form" onSubmit={submitUjProof}>
              <div className="master-form-heading">
                <div>
                  <span>{ujProofTarget.soNumber}</span>
                  <h2>Upload Bukti Transfer UJ</h2>
                  <p>{ujProofTarget.containerNumber} - UJ Perjalanan {formatCurrency(ujProofTarget.amount)} ke {ujProofTarget.driverName || ujProofTarget.driver || 'driver'}.</p>
                </div>
                <button className="modal-close-button" type="button" aria-label="Tutup upload bukti transfer UJ" onClick={() => setUjProofTarget(null)} disabled={saving}>
                  <X size={17} />
                </button>
              </div>
              <div className="master-form-sections">
                <AttachmentUploadField
                  helper="PDF, JPG, PNG"
                  id="uj-transfer-proof"
                  label="Bukti Transfer UJ"
                  onClear={() => setUjProofFile(null)}
                  onSelect={(file, validationError) => {
                    if (validationError) {
                      setFileError(validationError);
                      return;
                    }
                    setUjProofFile(file);
                    setFileError('');
                  }}
                  title={ujProofFile?.name ? 'Ganti Bukti' : 'Pilih Bukti'}
                  value={ujProofFile}
                />
                {fileError ? <div className="alert error">{fileError}</div> : null}
              </div>
              <div className="master-form-actions">
                <button className="secondary-button" type="button" onClick={() => setUjProofTarget(null)} disabled={saving}>Batal</button>
                <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Bukti'}</button>
              </div>
            </form>
          </section>
        </div>
        </ModalPortal>
      ) : null}

      {addExpenseOpen && !addExpenseValidationOpen ? (
        <ModalPortal>
        <div className="master-modal-backdrop" role="presentation" onMouseDown={closeAddExpenseModal}>
          <section className="master-modal dropping-expense-modal" role="dialog" aria-modal="true" aria-label="Catat biaya penggunaan saldo" onMouseDown={(event) => event.stopPropagation()}>
            <form className="master-form" onSubmit={submitAddExpense}>
              <div className="master-form-heading">
                <div className="min-w-0">
                  <span>Rekening Dropping</span>
                  <h2>Catat Biaya Penggunaan Saldo</h2>
                  <p>Catat hanya biaya lapangan di luar UJ utama. Data ini langsung mengurangi saldo batch berjalan setelah divalidasi.</p>
                </div>
                <button className="modal-close-button" type="button" aria-label="Tutup catat biaya" onClick={closeAddExpenseModal} disabled={saving}>
                  <X size={19} />
                </button>
              </div>
              <div className="master-form-sections">
                <fieldset className="master-fieldset">
                  <legend>1. Pilih Ritasi</legend>
                  <p className="mb-2 text-[11px] font-semibold text-slate-500">Biaya akan menempel pada ritasi yang dipilih.</p>
                  <div className="master-form-grid">
                    <div className="master-field span-full relative">
                      <span>Ritasi <em>*</em></span>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                        <input
                          className="!pl-9"
                          onChange={(event) => changeJobSearchTerm(event.target.value)}
                          onFocus={() => setJobDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setJobDropdownOpen(false), 120)}
                          placeholder="Cari nomor SO, container, customer, tujuan..."
                          value={jobSearchTerm}
                          aria-label="Ritasi"
                          role="combobox"
                          aria-expanded={jobDropdownOpen}
                        />
                      </div>
                      {jobDropdownOpen ? (
                        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                          {!jobSearchTerm.trim() ? (
                            <p className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] font-black normal-case tracking-wide text-slate-400">Ritasi sedang jalan &amp; baru selesai</p>
                          ) : null}
                          {jobLoading ? (
                            <p className="px-3 py-2.5 text-[11px] font-semibold normal-case text-slate-500">Memuat ritasi...</p>
                          ) : jobOptions.length ? (
                            jobOptions.map((job) => (
                              <button
                                className="flex w-full items-start justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
                                key={job.id}
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  pickAddExpenseJob(job);
                                }}
                                type="button"
                              >
                                <div className="min-w-0">
                                  <strong className="block truncate text-xs font-black normal-case text-slate-900">{job.soNumber}</strong>
                                  <span className="mt-0.5 block truncate text-[11px] font-semibold normal-case text-slate-500">{job.customer} - {job.destination}</span>
                                </div>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black normal-case ${job.status === 'running' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                  {job.status === 'running' ? 'Sedang Jalan' : 'Selesai'}
                                </span>
                              </button>
                            ))
                          ) : (
                            <p className="px-3 py-2.5 text-[11px] font-semibold normal-case text-slate-500">
                              {jobSearchTerm.trim() ? 'Ritasi tidak ditemukan.' : 'Belum ada ritasi yang sedang jalan atau baru selesai.'}
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                    {selectedAddExpenseJob ? (
                      <div className="master-field span-full">
                        <div className="grid min-w-0 gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 md:grid-cols-3">
                          <div className="min-w-0"><span className="block text-[10px] font-black uppercase text-slate-400">Driver</span><strong className="mt-0.5 block truncate text-slate-900">{selectedAddExpenseJob.driver || '-'}</strong></div>
                          <div className="min-w-0"><span className="block text-[10px] font-black uppercase text-slate-400">Truck</span><strong className="mt-0.5 block truncate text-slate-900">{selectedAddExpenseJob.plateNumber || '-'}</strong></div>
                          <div className="min-w-0"><span className="block text-[10px] font-black uppercase text-slate-400">Tujuan</span><strong className="mt-0.5 block truncate text-slate-900">{selectedAddExpenseJob.destination || '-'}</strong></div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </fieldset>

                <fieldset className="master-fieldset">
                  <legend>2. Isi Pengeluaran</legend>
                  <p className="mb-2 text-[11px] font-semibold text-slate-500">Isi nominal, penerima, keterangan, dan bukti bayar. Semua biaya dicatat sebagai Biaya Lainnya.</p>
                  <div className="master-form-grid">
                    <label className="master-field span-full">
                      <span>Keterangan <em>*</em></span>
                      <select
                        aria-label="Keterangan"
                        onChange={handleDescriptionSelectChange}
                        value={descriptionSelectValue}
                      >
                        <option disabled value="">Pilih keterangan...</option>
                        {EXPENSE_DESCRIPTION_GROUPS.map((group) => (
                          <optgroup key={group.id} label={group.label}>
                            {group.presets.map((preset) => (
                              <option key={preset} value={preset}>{preset}</option>
                            ))}
                          </optgroup>
                        ))}
                        <option value={CUSTOM_DESCRIPTION_VALUE}>Lainnya (Input Manual)</option>
                      </select>
                    </label>
                    {showManualDescription ? (
                      <>
                        <label className="master-field span-full">
                          <span className="sr-only">Keterangan manual</span>
                          <input
                            aria-label="Keterangan manual"
                            placeholder="Contoh: Parkir depo / tol Cikampek / bongkar"
                            value={addExpenseForm.description}
                            onChange={(event) => {
                              setAddExpenseForm((current) => ({ ...current, description: event.target.value }));
                              setFileError('');
                            }}
                          />
                        </label>
                        <label className="master-field span-full">
                          <span>Jenis Biaya <em>*</em></span>
                          <select
                            aria-label="Jenis biaya"
                            onChange={(event) => setAddExpenseForm((current) => ({ ...current, expenseGroup: event.target.value }))}
                            value={addExpenseForm.expenseGroup}
                          >
                            <option disabled value="">Pilih jenis biaya...</option>
                            <option value="operational">{EXPENSE_GROUP_LABELS.operational}</option>
                            <option value="reimbursement">{EXPENSE_GROUP_LABELS.reimbursement}</option>
                          </select>
                        </label>
                      </>
                    ) : null}
                    {showReimbursementLainnyaNote ? (
                      <label className="master-field span-full">
                        <span>Keterangan Reimbursement Lainnya <em>*</em></span>
                        <input
                          aria-label="Keterangan Reimbursement Lainnya"
                          placeholder="Contoh: biaya admin, LOLO, seal, atau catatan lain"
                          value={addExpenseForm.lainnyaNote}
                          onChange={(event) => {
                            setAddExpenseForm((current) => ({ ...current, lainnyaNote: event.target.value }));
                            setFileError('');
                          }}
                        />
                      </label>
                    ) : null}
                    <label className="master-field">
                      <span className="flex items-center justify-between gap-2">
                        <span>Nominal Biaya <em>*</em></span>
                        {Number(addExpenseForm.amount) > 0 ? (
                          <span className="truncate normal-case text-emerald-700">{formatCurrency(Number(addExpenseForm.amount))}</span>
                        ) : null}
                      </span>
                      <input min="0" placeholder="Contoh: 150000" type="number" value={addExpenseForm.amount} onWheel={(event) => event.currentTarget.blur()} onChange={(event) => {
                        setAddExpenseForm((current) => ({ ...current, amount: event.target.value }));
                        setFileError('');
                      }} />
                    </label>
                    <label className="master-field">
                      <span>Penerima <em>*</em></span>
                      <input placeholder="Contoh: Petugas depo / vendor / driver" value={addExpenseForm.recipientName} onChange={(event) => {
                        setAddExpenseForm((current) => ({ ...current, recipientName: event.target.value }));
                        setFileError('');
                      }} />
                    </label>
                    <div className="master-field span-full">
                      <div className="rounded-md border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800">
                        Bukti pembayaran akan diupload Finance saat validasi rekening dropping.
                      </div>
                    </div>
                  </div>
                </fieldset>

                {fileError ? <div className="alert error master-form-error">{fileError}</div> : null}
              </div>
              <div className="master-form-actions">
                <button className="secondary-button" type="button" onClick={closeAddExpenseModal} disabled={saving}>Batal</button>
                <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Memvalidasi...' : 'Validasi Biaya'}</button>
              </div>
            </form>
          </section>
        </div>
        </ModalPortal>
      ) : null}

      {addExpenseValidationOpen ? (
        <ModalPortal>
        <div className="master-modal-backdrop" role="presentation" onMouseDown={closeAddExpenseValidationModal}>
          <section className="master-modal max-w-2xl" role="dialog" aria-modal="true" aria-label="Validasi catat biaya penggunaan saldo" onMouseDown={(event) => event.stopPropagation()}>
            <form className="master-form" onSubmit={confirmAddExpense}>
              <div className="master-form-heading">
                <div>
                  <span>Validasi Akhir</span>
                  <h2>Validasi Catat Biaya</h2>
                  <p>Pastikan nominal dan ritasi sudah benar sebelum saldo batch dikurangi.</p>
                </div>
                <button className="modal-close-button" type="button" aria-label="Tutup validasi catat biaya" onClick={closeAddExpenseValidationModal} disabled={saving}>
                  <X size={17} />
                </button>
              </div>
              <div className="master-form-sections">
                <fieldset className="master-fieldset">
                  <legend>Ringkasan Biaya</legend>
                  <div className="master-form-grid">
                    <div className="master-field">
                      <span>Ritasi</span>
                      <strong className="text-sm font-black normal-case text-slate-950">{selectedAddExpenseJob?.soNumber || '-'}</strong>
                      <span className="text-xs font-semibold normal-case text-slate-500">{selectedAddExpenseJob?.containerNumber || '-'} - {selectedAddExpenseJob?.destination || '-'}</span>
                    </div>
                    <div className="master-field">
                      <span>Jenis Biaya</span>
                      <strong className="text-sm font-black normal-case text-slate-950">{EXPENSE_GROUP_LABELS[addExpenseForm.expenseGroup] || '-'}</strong>
                    </div>
                    <div className="master-field">
                      <span>Nominal Keluar</span>
                      <strong className="text-lg font-black normal-case text-emerald-700">{formatCurrency(Number(addExpenseForm.amount || 0))}</strong>
                    </div>
                    <div className="master-field">
                      <span>Penerima</span>
                      <strong className="text-sm font-bold normal-case text-slate-950">{addExpenseForm.recipientName || '-'}</strong>
                    </div>
                    <div className="master-field">
                      <span>Bukti</span>
                      <strong className="text-sm font-bold normal-case text-slate-950">Diupload Finance</strong>
                    </div>
                    <div className="master-field span-full">
                      <span>Keterangan</span>
                      <strong className="text-sm font-semibold normal-case leading-relaxed text-slate-950">{addExpenseForm.description || '-'}</strong>
                    </div>
                  </div>
                </fieldset>
                <div className="alert warning flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                  <span>Setelah dikonfirmasi, biaya langsung masuk ke riwayat penggunaan saldo dan menunggu pengecekan Finance.</span>
                </div>
                {fileError ? <div className="alert error">{fileError}</div> : null}
              </div>
              <div className="master-form-actions">
                <button className="secondary-button" type="button" onClick={closeAddExpenseValidationModal} disabled={saving}>Kembali</button>
                <button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[7px] bg-emerald-600 px-4 text-[13px] font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40" type="submit" disabled={saving}>
                  <CheckCircle2 size={15} /> {saving ? 'Menyimpan...' : 'Ya, Simpan Biaya'}
                </button>
              </div>
            </form>
          </section>
        </div>
        </ModalPortal>
      ) : null}

      {correctionExpense ? (
        <ModalPortal>
        <div className="master-modal-backdrop" role="presentation" onMouseDown={() => setCorrectionExpense(null)}>
          <section className="master-modal" role="dialog" aria-modal="true" aria-label="Koreksi penggunaan saldo" onMouseDown={(event) => event.stopPropagation()}>
            <form className="master-form" onSubmit={submitCorrection}>
              <div className="master-form-heading">
                <div className="min-w-0">
                  <span>{correctionExpense.soNumber}</span>
                  <h2>Koreksi Penggunaan Saldo</h2>
                  <p>{correctionExpense.containerNumber} - Catatan Finance: {correctionExpense.financeNote || '-'}</p>
                </div>
                <button className="modal-close-button" type="button" aria-label="Tutup koreksi penggunaan saldo" onClick={() => setCorrectionExpense(null)} disabled={saving}>
                  <X size={19} />
                </button>
              </div>
              <div className="master-form-sections">
                <fieldset className="master-fieldset">
                  <legend>Detail Koreksi</legend>
                  <div className="master-form-grid">
                    <label className="master-field span-third">
                      <span>Kategori</span>
                      <select value={correctionForm.category} onChange={(event) => setCorrectionForm((current) => ({ ...current, category: event.target.value }))}>
                        {expenseCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className="master-field span-third">
                      <span className="flex items-center justify-between gap-2">
                        <span>Nominal</span>
                        {Number(correctionForm.amount) > 0 ? (
                          <span className="truncate normal-case text-emerald-700">{formatCurrency(Number(correctionForm.amount))}</span>
                        ) : null}
                      </span>
                      <input min="0" type="number" value={correctionForm.amount} onWheel={(event) => event.currentTarget.blur()} onChange={(event) => setCorrectionForm((current) => ({ ...current, amount: event.target.value }))} />
                    </label>
                    <label className="master-field span-third">
                      <span>Status Bayar</span>
                      <select value={correctionForm.paymentStatus} onChange={(event) => setCorrectionForm((current) => ({ ...current, paymentStatus: event.target.value }))}>
                        {paymentStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className="master-field">
                      <span>Penerima</span>
                      <input value={correctionForm.recipientName} onChange={(event) => setCorrectionForm((current) => ({ ...current, recipientName: event.target.value }))} />
                    </label>
                    <label className="master-field">
                      <span>Keterangan</span>
                      <input value={correctionForm.description} onChange={(event) => setCorrectionForm((current) => ({ ...current, description: event.target.value }))} />
                    </label>
                    <div className="master-field span-full">
                      <div className="rounded-md border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800">
                        Bukti pembayaran koreksi tetap diupload Finance saat validasi ulang.
                      </div>
                    </div>
                  </div>
                </fieldset>
                {fileError ? <div className="alert error master-form-error">{fileError}</div> : null}
              </div>
              <div className="master-form-actions">
                <button className="secondary-button" type="button" onClick={() => setCorrectionExpense(null)} disabled={saving}>Batal</button>
                <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Kirim Koreksi'}</button>
              </div>
            </form>
          </section>
        </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}

export default OperationalDroppingAccountPage;
