import { AlertTriangle, BadgeCheck, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, CreditCard, Download, FileText, Plus, RefreshCw, Upload, UserRound, X, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DocumentLink from '../../components/common/DocumentLink';
import { useAuth } from '../../contexts/AuthContext';
import { useFeedback } from '../../contexts/FeedbackContext';
import { hasPermission, USER_ROLES } from '../../constants/roles';
import {
  approveDriverCommissionBatch,
  fetchDriverCommissionBatchDetail,
  fetchDriverCommissionBatches,
  fetchDriverCommissionPeriodReport,
  markDriverCommissionPaymentPaid,
  recordDriverCommissionDeduction,
  rejectDriverCommissionBatch,
  uploadDriverCommissionTransferProof,
  voidDriverCommissionDeduction,
  voidDriverCommissionPayment,
} from '../../services/finance/driverCommissionService';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate, formatDateTime } from '../../utils/formatDate';
import { downloadPdfReport } from '../../utils/simplePdfReport';
import { downloadCsv } from '../../utils/csvExport';
import {
  buildDriverCommissionCsvRows,
  driverCommissionFinanceStatus,
  driverCommissionProofStatus,
  driverCommissionStatusLabel,
  DRIVER_COMMISSION_CSV_HEADERS,
  summarizeDriverCommissions,
} from '../../utils/driverCommissionCsv';

const emptyReport = {
  periodStart: '',
  periodEnd: '',
  status: 'empty',
  activeBatch: null,
  summary: {
    totalDrivers: 0,
    totalItems: 0,
    totalAmount: 0,
    paidAmount: 0,
    unpaidAmount: 0,
  },
  drivers: [],
};

const statusLabels = {
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

const deductionTypeLabels = {
  hutang_sopir: 'Hutang Sopir',
  kasbon: 'Kasbon',
  penalti: 'Penalti',
  lainnya: 'Lainnya',
};

function pad2(value) {
  return String(value).padStart(2, '0');
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function defaultCompletedCommissionPeriod() {
  const today = new Date();
  const day = today.getDay();
  const daysSinceSunday = day;
  const currentSunday = addDays(today, -daysSinceSunday);
  const previousSunday = addDays(currentSunday, -7);
  return {
    periodStart: dateKey(previousSunday),
    periodEnd: dateKey(addDays(previousSunday, 6)),
  };
}

function currentCommissionPeriod() {
  const today = new Date();
  const day = today.getDay();
  const daysSinceSunday = day;
  const currentSunday = addDays(today, -daysSinceSunday);
  return {
    periodStart: dateKey(currentSunday),
    periodEnd: dateKey(addDays(currentSunday, 6)),
  };
}

function commissionPeriodKey(period = {}) {
  return `${period.periodStart || ''}|${period.periodEnd || ''}`;
}

const COMMISSION_PERIOD_LOOKBACK = 9;

function addDateKeyDays(dateKeyValue, days) {
  const [year, month, day] = String(dateKeyValue || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function buildCommissionPeriodOptions(batches = []) {
  const current = currentCommissionPeriod();
  const byPeriod = new Map();

  for (let offset = 0; offset < COMMISSION_PERIOD_LOOKBACK; offset += 1) {
    const periodStart = addDateKeyDays(current.periodStart, -offset * 7);
    const period = { periodStart, periodEnd: addDateKeyDays(periodStart, 6) };
    byPeriod.set(commissionPeriodKey(period), { ...period, status: 'draft', totalItems: 0, totalAmount: 0 });
  }

  for (const batch of batches) {
    const key = commissionPeriodKey(batch);
    if (!byPeriod.has(key)) continue;
    byPeriod.set(key, { ...byPeriod.get(key), ...batch, status: batch.status || 'draft' });
  }

  return Array.from(byPeriod.values()).sort((left, right) => (
    String(right.periodStart || '').localeCompare(String(left.periodStart || ''))
  ));
}

function commissionReportFilename(prefix, periodStart, periodEnd) {
  return `${prefix}-${String(periodStart || 'periode').replaceAll('-', '')}-${String(periodEnd || 'akhir').replaceAll('-', '')}.pdf`;
}

function commissionAmount(driver, field, fallback = 0) {
  const value = Number(driver?.[field]);
  return Number.isFinite(value) ? value : fallback;
}

function buildCommissionPdfRows(drivers = [], statusResolver = driverFinanceStatus) {
  return drivers.map((driver, index) => {
    const grossAmount = commissionAmount(driver, 'grossAmount', commissionAmount(driver, 'totalAmount'));
    const deductionAmount = commissionAmount(driver, 'deductionAmount');
    const netAmount = commissionAmount(driver, 'netAmount', grossAmount - deductionAmount);
    const status = statusResolver(driver);

    return {
      reportNumber: index + 1,
      driverName: driver.driverName || '-',
      account: paymentAccountLabel(driver),
      totalItems: driver.totalItems || 0,
      grossAmount,
      deductionAmount,
      netAmount,
      statusLabel: driverCommissionStatusLabel(status),
      proofStatus: driverCommissionProofStatus(driver),
    };
  });
}

function StatusPill({ status }) {
  const tone = {
    empty: 'border-slate-200 bg-slate-50 text-slate-500',
    draft: 'border-amber-200 bg-amber-50 text-amber-700',
    unsubmitted: 'border-amber-200 bg-amber-50 text-amber-700',
    submitted: 'border-sky-200 bg-sky-50 text-sky-700',
    approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    paid: 'border-slate-300 bg-slate-100 text-slate-700',
    deducted_paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    rejected: 'border-rose-200 bg-rose-50 text-rose-700',
  }[status] || 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black uppercase leading-none ${tone}`}>
      {statusLabels[status] || status || '-'}
    </span>
  );
}

function BatchCommissionDropdown({ batches, selectedPeriodStart, selectedPeriodEnd, selectedStatus, loading, onSelect }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const disabled = loading || !batches.length;
  const selectedKey = commissionPeriodKey({ periodStart: selectedPeriodStart, periodEnd: selectedPeriodEnd });

  return (
    <div className="relative min-w-0 flex-1" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-label="Pilih batch komisi"
        className="master-filter-select flex h-10 w-full max-w-none items-center justify-between gap-2 normal-case disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {selectedPeriodStart && selectedPeriodEnd ? (
          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="truncate text-sm font-bold text-slate-900">{formatDate(selectedPeriodStart)} - {formatDate(selectedPeriodEnd)}</span>
            <StatusPill status={selectedStatus} />
          </span>
        ) : (
          <span className="text-sm font-semibold text-slate-500">{loading ? 'Memuat batch...' : 'Belum ada batch'}</span>
        )}
        <ChevronDown className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} size={16} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {batches.map((batch) => (
            <button
              aria-label={`Pilih batch ${formatDate(batch.periodStart)} - ${formatDate(batch.periodEnd)}`}
              className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-slate-50 ${commissionPeriodKey(batch) === selectedKey ? 'bg-red-50/60' : ''}`}
              key={batch.id || commissionPeriodKey(batch)}
              onClick={() => {
                onSelect(batch);
                setOpen(false);
              }}
              type="button"
            >
              <div className="min-w-0">
                <strong className="block truncate text-xs font-black text-slate-900">{formatDate(batch.periodStart)} - {formatDate(batch.periodEnd)}</strong>
                <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">{batch.totalItems || 0} job | {formatCurrency(batch.totalAmount || 0)}</span>
                {batch.status === 'rejected' && batch.rejectionNote ? (
                  <span className="mt-1 block truncate text-[11px] font-bold text-rose-600">Catatan: {batch.rejectionNote}</span>
                ) : null}
              </div>
              <StatusPill status={batch.status} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const metricCardTones = {
  slate: 'bg-slate-100 text-slate-600',
  sky: 'bg-sky-50 text-sky-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
  emerald: 'bg-emerald-50 text-emerald-600',
};

function MetricCard({ icon: Icon, label, value, helper, tone = 'slate', pill = false, onClick }) {
  const Wrapper = onClick ? 'button' : 'article';
  return (
    <Wrapper
      className={`w-full rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:shadow-md ${onClick ? 'cursor-pointer hover:border-red-200' : ''}`}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      <div className="flex items-start gap-3">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${metricCardTones[tone] || metricCardTones.slate}`}>
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
          {pill ? (
            <div className="mt-1.5">{value}</div>
          ) : (
            <strong className="mt-1 block break-words text-xl font-black text-slate-950">{value}</strong>
          )}
          {helper ? <small className="mt-1 block text-xs leading-relaxed text-slate-500">{helper}</small> : null}
        </div>
      </div>
    </Wrapper>
  );
}

function driverFinanceStatus(driver) {
  return driverCommissionFinanceStatus(driver);
}

function paymentAccountLabel(driver = {}) {
  if (driver.paymentMethod === 'emoney') {
    return `${driver.emoneyProvider || '-'} ${driver.emoneyNumber || ''}`.trim();
  }
  return `${driver.bankName || '-'} ${driver.bankAccountNumber || ''}`.trim();
}

function accountHolderLabel(driver = {}) {
  if (driver.paymentMethod === 'emoney') return driver.emoneyAccountHolder || '-';
  return driver.bankAccountHolder || '-';
}

function resolveSelectedPayment(batch, driver) {
  if (!batch || !driver) return null;
  return (batch.payments || []).find((payment) => (
    payment.id === driver.paymentId
      || (driver.driverKey && payment.driverKey === driver.driverKey)
      || (driver.driverId && payment.driverId === driver.driverId)
      || payment.driverName === driver.driverName
  )) || null;
}

function ModalPortal({ children }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

const emptyDeductionDraft = { deductionType: 'hutang_sopir', amount: '', reason: '' };

function DeductionSection({ paymentId, deductions, grossAmount, deductionAmount, netAmount, canManage, paymentPaid, saving, onAddDeduction, onVoidDeduction }) {
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDeductionDraft);
  const [formError, setFormError] = useState('');
  const [voidingTarget, setVoidingTarget] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidFormError, setVoidFormError] = useState('');

  const activeDeductions = (deductions || []).filter((item) => item.status === 'active');
  const voidedDeductions = (deductions || []).filter((item) => item.status !== 'active');

  async function submitDraft(event) {
    event.preventDefault();
    if (!paymentId) {
      setFormError('Komisi ini belum diajukan ke Finance (belum masuk batch), jadi belum ada payment untuk dilekati potongan.');
      return;
    }
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Nominal potongan wajib lebih dari 0.');
      return;
    }
    if (draft.reason.trim().length < 8) {
      setFormError('Alasan potongan wajib diisi minimal 8 karakter.');
      return;
    }
    setFormError('');
    try {
      await onAddDeduction(paymentId, {
        deductionType: draft.deductionType,
        amount,
        reason: draft.reason.trim(),
        operationalNote: '',
      });
      setDraft(emptyDeductionDraft);
      setFormOpen(false);
    } catch (error) {
      setFormError(error.message || 'Potongan gagal disimpan.');
    }
  }

  async function confirmVoid(deductionId) {
    if (voidReason.trim().length < 1) {
      setVoidFormError('Alasan pembatalan wajib diisi.');
      return;
    }
    setVoidFormError('');
    try {
      await onVoidDeduction(deductionId, voidReason.trim());
      setVoidingTarget(null);
      setVoidReason('');
    } catch (error) {
      setVoidFormError(error.message || 'Potongan gagal dibatalkan.');
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-black text-slate-950">Potongan Komisi</h3>
        {canManage && !paymentPaid && paymentId ? (
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-50"
            onClick={() => { setFormOpen(true); setFormError(''); }}
            type="button"
          >
            <Plus size={14} />
            Tambah Potongan
          </button>
        ) : null}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <span className="block text-[10px] font-black uppercase text-slate-400">Sebelum Potongan</span>
          <strong className="mt-0.5 block text-sm text-slate-800">{formatCurrency(grossAmount)}</strong>
        </div>
        <div className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2">
          <span className="block text-[10px] font-black uppercase text-rose-500">Potongan Finance</span>
          <strong className="mt-0.5 block text-sm text-rose-700">{formatCurrency(deductionAmount)}</strong>
        </div>
        <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2">
          <span className="block text-[10px] font-black uppercase text-emerald-600">Harus Dibayar</span>
          <strong className="mt-0.5 block text-sm text-emerald-700">{formatCurrency(netAmount)}</strong>
        </div>
      </div>

      {paymentPaid ? (
        <p className="mt-2 text-[11px] font-medium text-slate-500">Potongan terkunci karena pembayaran sudah paid. Batalkan pembayaran terlebih dahulu untuk mengubah potongan.</p>
      ) : !paymentId ? (
        <p className="mt-2 text-[11px] font-medium text-slate-500">Potongan bisa ditambahkan setelah komisi sopir ini diajukan Operational ke Finance (masuk batch).</p>
      ) : null}

      {formOpen ? (
        <ModalPortal>
          <div className="master-modal-backdrop !z-[140]" role="presentation" onMouseDown={() => { if (!saving) setFormOpen(false); }}>
            <section
              aria-labelledby="driver-commission-deduction-title"
              className="master-modal w-full !max-w-2xl"
              onMouseDown={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <form className="master-form" onSubmit={submitDraft}>
                <div className="master-form-heading">
                  <div>
                    <span>Potongan Komisi</span>
                    <h2 id="driver-commission-deduction-title">Tambah Potongan</h2>
                    <p>Catatan potongan akan terbaca oleh Finance dan Operational.</p>
                  </div>
                  <button
                    aria-label="Tutup form potongan"
                    className="modal-close-button"
                    disabled={saving}
                    onClick={() => { setFormOpen(false); setDraft(emptyDeductionDraft); setFormError(''); }}
                    type="button"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="master-form-sections">
                  {formError ? <p className="master-form-error rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{formError}</p> : null}
                  <fieldset className="master-fieldset">
                    <legend>Data Potongan</legend>
                    <div className="master-form-grid">
                      <label className="master-field">
                        <span>Jenis Potongan</span>
                        <select
                          onChange={(event) => setDraft((current) => ({ ...current, deductionType: event.target.value }))}
                          value={draft.deductionType}
                        >
                          {Object.entries(deductionTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <label className="master-field">
                        <span>Nominal Potongan</span>
                        <input
                          inputMode="numeric"
                          min="0"
                          onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
                          placeholder="100000"
                          type="number"
                          value={draft.amount}
                        />
                      </label>
                      <label className="master-field span-full">
                        <span>Catatan Potongan</span>
                        <textarea
                          onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))}
                          placeholder="Contoh: Potongan kasbon sopir sesuai catatan Finance"
                          rows={4}
                          value={draft.reason}
                        />
                        <small>Satu catatan ini dipakai sebagai keterangan Finance dan informasi untuk Operational.</small>
                      </label>
                    </div>
                  </fieldset>
                </div>
                <div className="master-form-actions">
                  <button
                    className="secondary-button"
                    disabled={saving}
                    onClick={() => { setFormOpen(false); setDraft(emptyDeductionDraft); setFormError(''); }}
                    type="button"
                  >
                    Batal
                  </button>
                  <button className="primary-button" disabled={saving} type="submit">{saving ? 'Menyimpan...' : 'Simpan Potongan'}</button>
                </div>
              </form>
            </section>
          </div>
        </ModalPortal>
      ) : null}

      <div className="mt-3 grid gap-1.5">
        {!activeDeductions.length && !voidedDeductions.length ? (
          <p className="text-xs font-semibold text-slate-400">Belum ada potongan untuk sopir ini.</p>
        ) : null}
        {[...activeDeductions, ...voidedDeductions].map((item) => (
          <div className={`rounded-md border px-3 py-2 ${item.status === 'active' ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-70'}`} key={item.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className={`text-xs text-slate-800 ${item.status !== 'active' ? 'line-through' : ''}`}>
                {deductionTypeLabels[item.deductionType] || item.deductionType} - {formatCurrency(item.amount)}
              </strong>
              {item.status === 'active' ? (
                canManage && !paymentPaid ? (
                  <button
                    className="inline-flex items-center rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase text-rose-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-50"
                    onClick={() => { setVoidingTarget(item); setVoidReason(''); setVoidFormError(''); }}
                    type="button"
                  >
                    Batalkan
                  </button>
                ) : null
              ) : (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-black uppercase text-rose-700">Dibatalkan</span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-600">Catatan: {item.reason}</p>
            <p className="mt-1 text-[10px] font-semibold text-slate-400">{item.createdByName || '-'} - {formatDateTime(item.createdAt)}</p>
            {item.status !== 'active' ? (
              <p className="mt-1 text-[10px] font-semibold text-rose-600">Dibatalkan: {item.voidReason} - {item.voidedByName || '-'} - {formatDateTime(item.voidedAt)}</p>
            ) : null}
          </div>
        ))}
      </div>
      {voidingTarget ? (
        <ModalPortal>
          <div className="master-modal-backdrop !z-[140]" role="presentation" onMouseDown={() => { if (!saving) setVoidingTarget(null); }}>
            <section
              aria-labelledby="driver-commission-void-deduction-title"
              className="master-modal w-full !max-w-xl"
              onMouseDown={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <form className="master-form" onSubmit={(event) => { event.preventDefault(); confirmVoid(voidingTarget.id); }}>
                <div className="master-form-heading">
                  <div>
                    <span>Batalkan Potongan</span>
                    <h2 id="driver-commission-void-deduction-title">Konfirmasi Pembatalan</h2>
                    <p>Potongan ini akan dibatalkan dari perhitungan net komisi sopir.</p>
                  </div>
                  <button
                    aria-label="Tutup konfirmasi pembatalan potongan"
                    className="modal-close-button"
                    disabled={saving}
                    onClick={() => { setVoidingTarget(null); setVoidReason(''); setVoidFormError(''); }}
                    type="button"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="master-form-sections">
                  {voidFormError ? <p className="master-form-error rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{voidFormError}</p> : null}
                  <fieldset className="master-fieldset">
                    <legend>Detail Potongan</legend>
                    <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
                      <strong className="block text-sm font-black text-slate-900">
                        {deductionTypeLabels[voidingTarget.deductionType] || voidingTarget.deductionType} - {formatCurrency(voidingTarget.amount)}
                      </strong>
                      <p className="mt-1 text-xs font-medium text-slate-600">Catatan: {voidingTarget.reason || '-'}</p>
                    </div>
                    <div className="master-form-grid">
                      <label className="master-field span-full">
                        <span>Alasan Pembatalan</span>
                        <textarea
                          onChange={(event) => setVoidReason(event.target.value)}
                          placeholder="Contoh: Kasbon sudah dilunasi sopir"
                          rows={3}
                          value={voidReason}
                        />
                      </label>
                    </div>
                  </fieldset>
                </div>
                <div className="master-form-actions">
                  <button
                    className="secondary-button"
                    disabled={saving}
                    onClick={() => { setVoidingTarget(null); setVoidReason(''); setVoidFormError(''); }}
                    type="button"
                  >
                    Batal
                  </button>
                  <button className="primary-button" disabled={!voidReason.trim() || saving} type="submit">
                    {saving ? 'Memproses...' : 'Konfirmasi Batalkan'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}

function DriverFinanceDetailModal({ driver, payment, selectedBatch, canFinance, canManageDeduction, saving, onUploadProof, onSettleDeductionOnly, canVoidPayment, voidBusyId, voidError, onVoidPayment, onAddDeduction, onVoidDeduction, open, onClose }) {
  const [noteDraft, setNoteDraft] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [voidingOpen, setVoidingOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (open) {
      setNoteDraft('');
      setPendingFile(null);
      setVoidingOpen(false);
      setVoidReason('');
    }
  }, [open, driver?.driverKey, driver?.driverId, driver?.driverName]);

  if (!open || !driver) return null;

  const accountSource = payment || driver;
  const alreadyPaid = payment?.status === 'paid';
  const canUploadProof = canFinance && ['approved', 'paid'].includes(selectedBatch?.status || '');
  const grossAmount = accountSource.grossAmount ?? accountSource.totalAmount ?? 0;
  const deductionAmount = accountSource.deductionAmount ?? 0;
  const netAmount = accountSource.netAmount ?? grossAmount;
  const deductions = accountSource.deductions || [];
  // payment bisa belum ada (komisi masih "eligible", belum diajukan Operational jadi belum masuk
  // driver_commission_payments) -- jatuhkan balik ke driver.paymentId dari period-report, dan kalau
  // dua-duanya kosong berarti memang belum ada payment sama sekali untuk dilekati potongan.
  const paymentId = payment?.id || driver.paymentId || '';
  const hasTransferProof = Boolean(payment?.paymentProofAttachmentId || driver.paymentProofAttachmentId);
  const isFullyDeducted = grossAmount > 0 && deductionAmount >= grossAmount && netAmount === 0;
  const canSettleByDeduction = canFinance && ['approved', 'paid'].includes(selectedBatch?.status || '') && paymentId && isFullyDeducted && !alreadyPaid;
  const canUploadTransferProof = canUploadProof && (netAmount > 0 || hasTransferProof);

  function submitProof(event) {
    event.preventDefault();
    if (!pendingFile) return;
    onUploadProof(payment, pendingFile, noteDraft);
    setPendingFile(null);
  }

  return (
    <ModalPortal>
    <div className="master-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="master-modal flex max-h-[92vh] w-full max-w-5xl flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="finance-driver-commission-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="master-form-heading">
          <div className="min-w-0">
            <span>Detail Pembayaran</span>
            <h2 id="finance-driver-commission-detail-title" className="break-words">{driver.driverName}</h2>
            <p>{driver.totalItems} job | {formatCurrency(driver.totalAmount)}</p>
          </div>
          <button className="modal-close-button" type="button" onClick={onClose} aria-label="Tutup detail pembayaran">
            <X size={17} />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          {deductionAmount > 0 ? (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 shrink-0" size={16} />
                <div>
                  <strong className="block">Ada potongan Finance untuk sopir ini</strong>
                  <p className="mt-0.5 font-semibold">
                    Harus dibayar {formatCurrency(netAmount)} dari nilai sebelum potongan {formatCurrency(grossAmount)}, setelah potongan {formatCurrency(deductionAmount)}. Catatan potongan akan terlihat di Operational.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="block text-[11px] font-black uppercase text-slate-400">Status</span>
              <span className="mt-2 block"><StatusPill status={driverFinanceStatus(driver)} /></span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="block text-[11px] font-black uppercase text-slate-400">Rekening</span>
              <strong className="mt-1 block break-words text-sm text-slate-800">{paymentAccountLabel(accountSource)}</strong>
              <span className="mt-1 block text-xs text-slate-500">{accountHolderLabel(accountSource)}</span>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
              <span className="block text-[11px] font-black uppercase text-emerald-600">Harus Dibayar</span>
              <strong className="mt-1 block text-lg text-emerald-700">{formatCurrency(netAmount)}</strong>
              {deductionAmount > 0 ? <span className="mt-0.5 block text-[11px] font-semibold text-rose-600">Sebelum potongan {formatCurrency(grossAmount)} - Potongan {formatCurrency(deductionAmount)}</span> : null}
            </div>
          </div>

          <DeductionSection
            canManage={canManageDeduction}
            deductionAmount={deductionAmount}
            deductions={deductions}
            grossAmount={grossAmount}
            netAmount={netAmount}
            onAddDeduction={onAddDeduction}
            onVoidDeduction={onVoidDeduction}
            paymentId={paymentId}
            paymentPaid={alreadyPaid}
            saving={saving}
          />

          <div className="mt-4 rounded-lg border border-slate-200 p-3">
            {payment?.paidAt ? (
              <p className="text-xs font-semibold text-emerald-700">Paid {formatDateTime(payment.paidAt)} oleh {payment.paidByName || '-'}</p>
            ) : <p className="text-xs font-semibold text-slate-500">Pembayaran belum dicatat paid.</p>}
            {payment?.voidedAt ? (
              <p className="mt-1 text-xs font-semibold text-rose-700">
                Dibatalkan {formatDateTime(payment.voidedAt)} oleh {payment.voidedByName || '-'}{payment.voidReason ? ` — ${payment.voidReason}` : ''}
              </p>
            ) : null}
            {payment?.paymentProofAttachmentId || driver.paymentProofAttachmentId ? (
              <p className="mt-1 text-xs font-semibold text-sky-700">Bukti transfer tersimpan.</p>
            ) : null}
            {alreadyPaid && isFullyDeducted && !hasTransferProof ? (
              <p className="mt-1 text-xs font-semibold text-emerald-700">Lunas via potongan Finance penuh. Tidak ada transfer ke sopir.</p>
            ) : null}
            {payment?.paymentNote || driver.paymentNote ? (
              <p className="mt-1 text-xs text-slate-500">{payment?.paymentNote || driver.paymentNote}</p>
            ) : null}
            {canVoidPayment && alreadyPaid && !payment?.voidedAt ? (
              <div className="mt-3">
                {voidingOpen ? (
                  <div className="grid gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
                    <label className="grid gap-1.5 text-[11px] font-black uppercase tracking-wide text-rose-600">
                      Alasan Pembatalan
                      <textarea
                        autoFocus
                        className="min-h-16 w-full resize-y rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-medium normal-case text-slate-900 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                        disabled={voidBusyId === payment?.id}
                        onChange={(event) => setVoidReason(event.target.value)}
                        placeholder="Contoh: Salah input nominal, batal atas permintaan driver"
                        value={voidReason}
                      />
                    </label>
                    {voidError ? <p className="text-xs font-semibold text-rose-700">{voidError}</p> : null}
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-md bg-rose-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
                        disabled={!voidReason.trim() || voidBusyId === payment?.id}
                        onClick={() => onVoidPayment(payment.id, voidReason.trim())}
                        type="button"
                      >
                        {voidBusyId === payment?.id ? 'Membatalkan...' : 'Konfirmasi Batalkan'}
                      </button>
                      <button
                        className="secondary-button"
                        disabled={voidBusyId === payment?.id}
                        onClick={() => { setVoidingOpen(false); setVoidReason(''); }}
                        type="button"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="text-xs font-bold text-rose-600 hover:underline" onClick={() => setVoidingOpen(true)} type="button">
                    Batalkan Pembayaran
                  </button>
                )}
              </div>
            ) : null}
            {canSettleByDeduction ? (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-800">
                  Komisi sudah habis dipotong Finance, jadi tidak ada nominal transfer.
                </p>
                <button
                  className="primary-button mt-3 inline-flex items-center gap-2"
                  disabled={saving}
                  onClick={() => onSettleDeductionOnly(payment || { id: paymentId, driverName: driver.driverName })}
                  type="button"
                >
                  <CheckCircle2 size={16} /> {saving ? 'Memproses...' : 'Tandai Lunas via Potongan'}
                </button>
              </div>
            ) : null}
            {canUploadTransferProof ? (
              <div className="mt-4">
                {!alreadyPaid ? (
                  <p className="mb-2 text-xs font-bold text-emerald-700">
                    Nominal yang harus dibayarkan: {formatCurrency(netAmount)}
                    {deductionAmount > 0 ? <span className="font-medium text-slate-500"> (Sebelum potongan {formatCurrency(grossAmount)} - Potongan {formatCurrency(deductionAmount)})</span> : null}
                  </p>
                ) : null}
                {pendingFile ? (
                  <form className="grid gap-3" onSubmit={submitProof}>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="min-w-0 truncate text-xs font-bold text-slate-800">{pendingFile.name}</span>
                      <label
                        className={`secondary-button inline-flex shrink-0 cursor-pointer items-center gap-1.5 px-3 py-1.5 text-xs ${saving ? 'pointer-events-none opacity-60' : ''}`}
                        title="Ganti file bukti transfer"
                      >
                        <Upload size={14} />
                        Ganti File
                        <input
                          accept=".jpg,.jpeg,.png,.pdf"
                          className="sr-only"
                          disabled={saving}
                          onChange={(event) => setPendingFile(event.target.files?.[0] || pendingFile)}
                          type="file"
                        />
                      </label>
                    </div>
                    <label className="grid gap-1.5 text-[11px] font-black uppercase tracking-wide text-slate-400">
                      Catatan Pembayaran (opsional)
                      <textarea
                        autoFocus
                        className="min-h-16 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium normal-case text-slate-900 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
                        disabled={saving}
                        onChange={(event) => setNoteDraft(event.target.value)}
                        placeholder="Contoh: Transfer via BCA, referensi TRX123"
                        value={noteDraft}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button className="primary-button inline-flex items-center gap-2" disabled={saving} type="submit">
                        <Upload size={16} /> {saving ? 'Mengirim...' : 'Kirim Bukti'}
                      </button>
                      <button className="secondary-button" disabled={saving} onClick={() => setPendingFile(null)} type="button">Batal</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <label className={`primary-button inline-flex cursor-pointer items-center gap-2 ${saving ? 'pointer-events-none opacity-60' : ''}`}>
                      <Upload size={16} /> {alreadyPaid ? 'Ganti Bukti' : 'Upload Bukti'}
                      <input
                        className="sr-only"
                        type="file"
                        accept="application/pdf,image/jpeg,image/png"
                        disabled={saving}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          if (file) setPendingFile(file);
                        }}
                      />
                    </label>
                    {alreadyPaid ? (
                      <p className="mt-2 text-xs text-slate-500">Salah kirim bukti? Upload file yang benar untuk menggantikan bukti sebelumnya.</p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>

          <div className="mt-5 space-y-3">
            {(driver.items || []).map((item, index) => (
              <article key={item.id || item.containerJobId || index} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <strong className="block break-words text-sm text-slate-950">{item.containerNumber || '-'}</strong>
                    <small className="mt-0.5 block break-words text-xs text-slate-500">{item.accurateSoNumber || item.soNumber || '-'} | {item.containerSize || '-'}</small>
                  </div>
                  <strong className="text-sm text-amber-700">{formatCurrency(item.amount)}</strong>
                </div>
                <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                  <div><dt className="font-black uppercase text-slate-400">Tanggal Selesai</dt><dd className="ml-0 mt-0.5 font-bold text-slate-700">{formatDate(item.completedDate)}</dd></div>
                  <div><dt className="font-black uppercase text-slate-400">Truck</dt><dd className="ml-0 mt-0.5 font-bold text-slate-700">{item.truckPlateNumber || '-'}</dd></div>
                  <div><dt className="font-black uppercase text-slate-400">Customer</dt><dd className="ml-0 mt-0.5 font-bold text-slate-700">{item.customerName || '-'}</dd></div>
                  <div><dt className="font-black uppercase text-slate-400">Tujuan</dt><dd className="ml-0 mt-0.5 font-bold text-slate-700">{item.destination || '-'}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
    </ModalPortal>
  );
}

const BATCH_PICKER_PAGE_SIZE = 20;

function BatchPickerModal({ open, onClose, onSelectBatch, selectedBatchId }) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (open) setPage(1);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;

    async function loadBatches() {
      setLoading(true);
      setError('');
      try {
        const result = await fetchDriverCommissionBatches({ page, pageSize: BATCH_PICKER_PAGE_SIZE });
        if (!active) return;
        setRows(result?.rows || []);
        setTotal(Number(result?.pagination?.total || 0));
      } catch (fetchError) {
        if (active) {
          setRows([]);
          setError(fetchError.message || 'Daftar batch gagal dimuat.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadBatches();
    return () => {
      active = false;
    };
  }, [open, page]);

  if (!open) return null;

  const totalPages = Math.max(1, Math.ceil(total / BATCH_PICKER_PAGE_SIZE));

  return (
    <ModalPortal>
    <div className="master-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="master-modal flex max-h-[90vh] w-full max-w-5xl flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-picker-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="master-form-heading">
          <div className="min-w-0">
            <span>Riwayat Pengajuan</span>
            <h2 id="batch-picker-modal-title">Pilih Batch Komisi</h2>
            <p>{total} batch dari Operational, terbaru di atas.</p>
          </div>
          <button className="modal-close-button" type="button" onClick={onClose} aria-label="Tutup pilih batch komisi">
            <X size={17} />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          {loading ? <p className="text-sm font-semibold text-slate-500">Memuat batch...</p> : null}
          {!loading && error ? <div className="alert error">{error}</div> : null}
          {!loading && !error && !rows.length ? (
            <p className="text-sm font-semibold text-slate-500">Belum ada batch komisi.</p>
          ) : null}
          {!loading && !error && rows.length ? (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {rows.map((batch) => (
                <button
                  className={`flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-3 ${selectedBatchId === batch.id ? 'bg-red-50/60' : ''}`}
                  key={batch.id}
                  onClick={() => {
                    onSelectBatch(batch.id);
                    onClose();
                  }}
                  type="button"
                >
                  <div className="min-w-0 flex-1">
                    <strong className="block break-words text-xs text-slate-950">{formatDate(batch.periodStart)} - {formatDate(batch.periodEnd)}</strong>
                    <small className="mt-0.5 block break-words text-[11px] text-slate-500">
                      {batch.totalItems || 0} job | {formatCurrency(batch.totalAmount || 0)} | Diajukan {batch.submittedByName || '-'} | {formatDateTime(batch.submittedAt)}
                    </small>
                    {batch.status === 'rejected' && batch.rejectionNote ? (
                      <small className="mt-1 block break-words text-[11px] font-bold text-rose-600">
                        Ditolak Finance: {batch.rejectionNote}
                      </small>
                    ) : null}
                  </div>
                  <StatusPill status={batch.status} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {totalPages > 1 ? (
          <div className="master-form-actions justify-between">
            <button className="secondary-button inline-flex items-center gap-1.5" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">
              <ChevronLeft size={15} /> Sebelumnya
            </button>
            <strong className="text-xs font-bold text-slate-700">Halaman {page} dari {totalPages}</strong>
            <button className="secondary-button inline-flex items-center gap-1.5" disabled={loading || page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} type="button">
              Berikutnya <ChevronRight size={15} />
            </button>
          </div>
        ) : null}
      </section>
    </div>
    </ModalPortal>
  );
}

function RejectBatchModal({ batch, saving, onClose, onConfirm }) {
  const [note, setNote] = useState(batch?.rejectionNote || '');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!batch) return undefined;

    setNote(batch.rejectionNote || '');
    setError('');

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [batch, onClose]);

  if (!batch) return null;

  function submitReject(event) {
    event.preventDefault();
    const trimmedNote = note.trim();
    if (trimmedNote.length < 8) {
      setError('Catatan minimal 8 karakter agar Operational tahu bagian yang harus diperbaiki.');
      return;
    }
    onConfirm(batch, trimmedNote);
  }

  return (
    <ModalPortal>
    <div className="master-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="master-modal flex max-h-[90vh] w-full max-w-2xl flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-driver-commission-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submitReject}
      >
        <div className="master-form-heading">
          <div className="min-w-0">
            <span>Reject Batch Komisi</span>
            <h2 id="reject-driver-commission-title">Catatan untuk Operational</h2>
            <p>{formatDate(batch.periodStart)} - {formatDate(batch.periodEnd)} | {batch.totalItems || 0} job | {formatCurrency(batch.totalAmount || 0)}</p>
          </div>
          <button className="modal-close-button" type="button" onClick={onClose} aria-label="Tutup reject batch">
            <X size={17} />
          </button>
        </div>

        <div className="grid gap-4 p-5">
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold leading-relaxed text-rose-800">
            Batch akan dikembalikan ke Operational. Isi catatan yang jelas, misalnya nama sopir, ritasi, atau nominal yang perlu diperbaiki.
          </div>
          <label className="grid gap-1.5 text-xs font-black uppercase tracking-wide text-slate-500">
            Alasan Penolakan
            <textarea
              autoFocus
              className="min-h-28 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium normal-case text-slate-900 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
              disabled={saving}
              onChange={(event) => {
                setNote(event.target.value);
                setError('');
              }}
              placeholder="Contoh: Komisi Driver Andi tanggal 28 Agustus perlu dicek karena nominal kasbon belum dipotong."
              value={note}
            />
          </label>
          {error ? <p className="text-xs font-semibold text-rose-700">{error}</p> : null}
        </div>

        <div className="master-form-actions">
          <button className="secondary-button" disabled={saving} onClick={onClose} type="button">Batal</button>
          <button className="rounded-md bg-rose-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={saving || note.trim().length < 8} type="submit">
            {saving ? 'Menolak...' : 'Reject Batch'}
          </button>
        </div>
      </form>
    </div>
    </ModalPortal>
  );
}

function DriverCommissionPage() {
  const { user } = useAuth();
  const { notify, confirmAction } = useFeedback();
  const defaultPeriod = useMemo(() => defaultCompletedCommissionPeriod(), []);
  const [periodStart, setPeriodStart] = useState(defaultPeriod.periodStart);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriod.periodEnd);
  const [report, setReport] = useState(emptyReport);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedDriverKey, setSelectedDriverKey] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [batchPickerOpen, setBatchPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voidBusyId, setVoidBusyId] = useState('');
  const [voidError, setVoidError] = useState('');
  const [rejectBatch, setRejectBatch] = useState(null);
  const [acknowledgedRevisionBatchId, setAcknowledgedRevisionBatchId] = useState('');

  const canFinance = [USER_ROLES.ADMIN, USER_ROLES.FINANCE].includes(user?.role);
  const canVoidPayment = user?.role === USER_ROLES.ADMIN;
  const canManageDeduction = hasPermission(user, 'finance.driver_commission.deduction.manage');
  const summary = report.summary || emptyReport.summary;
  const drivers = report.drivers || [];
  const commissionTotals = useMemo(() => summarizeDriverCommissions(drivers), [drivers]);
  const dropdownBatches = useMemo(() => buildCommissionPeriodOptions(batches), [batches]);
  const selectedDriver = drivers.find((driver) => (driver.driverKey || driver.driverId || driver.driverName) === selectedDriverKey) || drivers[0] || null;
  const selectedPayment = resolveSelectedPayment(selectedBatch, selectedDriver);
  const requiresRevisionAcknowledgement = selectedBatch?.status === 'submitted' && selectedBatch.revisionCount > 0;
  const revisionAcknowledged = !requiresRevisionAcknowledgement || acknowledgedRevisionBatchId === selectedBatch?.id;

  useEffect(() => {
    setAcknowledgedRevisionBatchId('');
  }, [selectedBatch?.id, selectedBatch?.revisionCount]);

  const applySelectedReport = useCallback((nextReport) => {
    setReport(nextReport || emptyReport);
    setSelectedDriverKey((current) => {
      const nextDrivers = nextReport?.drivers || [];
      if (nextDrivers.some((driver) => (driver.driverKey || driver.driverId || driver.driverName) === current)) return current;
      const firstDriver = nextDrivers[0];
      return firstDriver ? firstDriver.driverKey || firstDriver.driverId || firstDriver.driverName : '';
    });
  }, []);

  const loadData = useCallback(async (preferredBatchId = '') => {
    setLoading(true);
    try {
      const batchResult = await fetchDriverCommissionBatches({ pageSize: 50 });
      const nextBatches = batchResult?.rows || [];
      setBatches(nextBatches);

      const targetBatch = nextBatches.find((batch) => batch.id === preferredBatchId) || nextBatches[0] || null;
      const nextPeriodStart = targetBatch?.periodStart || defaultPeriod.periodStart;
      const nextPeriodEnd = targetBatch?.periodEnd || defaultPeriod.periodEnd;
      setPeriodStart(nextPeriodStart);
      setPeriodEnd(nextPeriodEnd);

      const [reportResult, detailResult] = await Promise.all([
        fetchDriverCommissionPeriodReport({ periodStart: nextPeriodStart, periodEnd: nextPeriodEnd }),
        targetBatch?.id ? fetchDriverCommissionBatchDetail(targetBatch.id).catch(() => null) : Promise.resolve(null),
      ]);

      applySelectedReport(reportResult || emptyReport);
      setSelectedBatch(detailResult || targetBatch || null);
    } catch (error) {
      notify({ type: 'error', title: 'Komisi gagal dimuat', message: error.message });
    } finally {
      setLoading(false);
    }
  }, [applySelectedReport, defaultPeriod.periodEnd, defaultPeriod.periodStart, notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function openBatch(batchId) {
    try {
      setLoading(true);
      const detail = await fetchDriverCommissionBatchDetail(batchId);
      const nextPeriodStart = detail?.periodStart || defaultPeriod.periodStart;
      const nextPeriodEnd = detail?.periodEnd || defaultPeriod.periodEnd;
      const reportResult = await fetchDriverCommissionPeriodReport({ periodStart: nextPeriodStart, periodEnd: nextPeriodEnd });
      setPeriodStart(nextPeriodStart);
      setPeriodEnd(nextPeriodEnd);
      setSelectedBatch(detail);
      applySelectedReport(reportResult || emptyReport);
    } catch (error) {
      notify({ type: 'error', title: 'Detail gagal dimuat', message: error.message });
    } finally {
      setLoading(false);
    }
  }

  async function previewPeriod(period) {
    try {
      setLoading(true);
      const reportResult = await fetchDriverCommissionPeriodReport({ periodStart: period.periodStart, periodEnd: period.periodEnd });
      setPeriodStart(period.periodStart);
      setPeriodEnd(period.periodEnd);
      setSelectedBatch(null);
      applySelectedReport(reportResult || emptyReport);
    } catch (error) {
      notify({ type: 'error', title: 'Report gagal dimuat', message: error.message });
    } finally {
      setLoading(false);
    }
  }

  function selectDropdownPeriod(period) {
    if (period.id) {
      openBatch(period.id);
      return;
    }
    previewPeriod(period);
  }

  async function handleApprove(batch) {
    const confirmed = await confirmAction({
      title: 'Setujui komisi?',
      message: `Batch ${formatDate(batch.periodStart)} - ${formatDate(batch.periodEnd)} akan masuk daftar pembayaran Finance.`,
      confirmLabel: 'Setujui',
      cancelLabel: 'Batal',
      tone: 'info',
    });
    if (!confirmed) return;

    setSaving(true);
    try {
      const updated = await approveDriverCommissionBatch(batch.id);
      notify({ title: 'Komisi disetujui', message: 'Finance bisa mulai mencatat pembayaran per sopir.' });
      setSelectedBatch(updated);
      await loadData(updated.id);
    } catch (error) {
      notify({ type: 'error', title: 'Approve gagal', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  function handleReject(batch) {
    setRejectBatch(batch);
  }

  async function confirmReject(batch, rejectionNote) {
    setSaving(true);
    try {
      const updated = await rejectDriverCommissionBatch(batch.id, rejectionNote);
      notify({ title: 'Komisi ditolak', message: 'Item batch dibuka agar Operational bisa mengajukan ulang.' });
      setSelectedBatch(updated);
      setRejectBatch(null);
      await loadData(updated.id);
    } catch (error) {
      notify({ type: 'error', title: 'Reject gagal', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadProof(payment, file, paymentNote = '') {
    if (!payment?.id || !file) return;

    setSaving(true);
    try {
      const updated = await uploadDriverCommissionTransferProof(payment.id, file, { paymentNote });
      notify({ title: 'Bukti transfer disimpan', message: `${payment.driverName} ditandai paid.` });
      setSelectedBatch(updated);
      await loadData(updated.id);
    } catch (error) {
      notify({ type: 'error', title: 'Upload bukti gagal', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleSettleDeductionOnly(payment) {
    if (!payment?.id) return;

    setSaving(true);
    try {
      const updated = await markDriverCommissionPaymentPaid(payment.id, {
        paymentNote: 'Lunas via potongan Finance penuh.',
      });
      notify({ title: 'Komisi dilunasi via potongan', message: `${payment.driverName || 'Sopir'} ditandai paid tanpa bukti transfer.` });
      setSelectedBatch(updated);
      await loadData(updated.id);
    } catch (error) {
      notify({ type: 'error', title: 'Settlement potongan gagal', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function voidPayment(paymentId, reason) {
    if (!paymentId) return;

    setVoidBusyId(paymentId);
    setVoidError('');
    try {
      const updated = await voidDriverCommissionPayment(paymentId, reason);
      notify({ title: 'Pembayaran dibatalkan', message: 'Status komisi kembali menunggu pembayaran.' });
      setSelectedBatch(updated);
      await loadData(updated.id);
    } catch (error) {
      setVoidError(error.message || 'Pembatalan pembayaran gagal.');
    } finally {
      setVoidBusyId('');
    }
  }

  async function handleAddDeduction(paymentId, payload) {
    setSaving(true);
    try {
      const updated = await recordDriverCommissionDeduction(paymentId, payload);
      notify({ title: 'Potongan komisi ditambahkan', message: 'Nilai yang harus dibayarkan kepada sopir sudah diperbarui.' });
      setSelectedBatch(updated);
      await loadData(updated.id);
    } catch (error) {
      throw new Error(error.message || 'Potongan komisi gagal disimpan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleVoidDeduction(deductionId, reason) {
    setSaving(true);
    try {
      const updated = await voidDriverCommissionDeduction(deductionId, reason);
      notify({ title: 'Potongan komisi dibatalkan', message: 'Nilai yang harus dibayarkan kepada sopir sudah diperbarui.' });
      setSelectedBatch(updated);
      await loadData(updated.id);
    } catch (error) {
      throw new Error(error.message || 'Potongan komisi gagal dibatalkan.');
    } finally {
      setSaving(false);
    }
  }

  function handleDownloadPdf() {
    downloadPdfReport({
      reportLabel: 'Finance Report',
      title: 'Pembayaran Komisi Sopir',
      subtitle: `Periode ${formatDate(periodStart)} - ${formatDate(periodEnd)} | ${statusLabels[selectedBatch?.status || report.status] || '-'}`,
      filename: commissionReportFilename('komisi-sopir-finance', periodStart, periodEnd),
      meta: [
        { label: 'Sopir', value: `${summary.totalDrivers || 0}` },
        { label: 'Sebelum Potongan', value: formatCurrency(commissionTotals.grossAmount) },
        { label: 'Potongan Finance', value: formatCurrency(commissionTotals.deductionAmount) },
        { label: 'Harus Dibayar', value: formatCurrency(commissionTotals.netAmount) },
      ],
      columns: [
        { label: 'No', width: 0.4, value: (row) => row.reportNumber, align: 'center' },
        { label: 'Sopir', width: 1.45, value: (row) => row.driverName, bold: true },
        { label: 'Rekening', width: 1.45, value: (row) => row.account },
        { label: 'Job', width: 0.5, value: (row) => row.totalItems, align: 'center' },
        { label: 'Sebelum Potongan', width: 0.95, value: (row) => formatCurrency(row.grossAmount), align: 'right' },
        { label: 'Potongan', width: 0.95, value: (row) => (row.deductionAmount ? formatCurrency(row.deductionAmount) : '-'), align: 'right' },
        { label: 'Harus Dibayar', width: 0.95, value: (row) => formatCurrency(row.netAmount), align: 'right' },
        { label: 'Status', width: 0.9, value: (row) => row.statusLabel },
        { label: 'Bukti', width: 0.65, value: (row) => row.proofStatus, align: 'center' },
      ],
      rows: buildCommissionPdfRows(drivers),
    });
  }

  function handleDownloadCsv() {
    downloadCsv(
      commissionReportFilename('komisi-sopir-finance-detail', periodStart, periodEnd).replace(/\.pdf$/, '.csv'),
      DRIVER_COMMISSION_CSV_HEADERS,
      buildDriverCommissionCsvRows(drivers, {
        periodStart,
        periodEnd,
        batchStatus: selectedBatch?.status || report.status,
      }),
    );
  }

  return (
    <main className="space-y-5 p-4 md:p-6">
      <header className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Finance</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Pembayaran Komisi Sopir</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
              Cek pengajuan Operational per sopir, approve batch Minggu-Sabtu, lalu catat pembayaran mingguan target Rabu.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:min-w-[420px] sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Batch Komisi</span>
              <BatchCommissionDropdown
                batches={dropdownBatches}
                loading={loading}
                onSelect={selectDropdownPeriod}
                selectedPeriodEnd={periodEnd}
                selectedPeriodStart={periodStart}
                selectedStatus={report.status}
              />
            </div>
            <button className="secondary-button inline-flex items-center justify-center gap-2" type="button" onClick={() => loadData(selectedBatch?.id)} disabled={loading}>
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          icon={CalendarDays}
          label="Periode"
          tone="slate"
          value={`${formatDate(periodStart)} - ${formatDate(periodEnd)}`}
          helper={<>Berdasarkan tanggal selesai job. <span className="font-bold text-red-600">Klik untuk pilih batch lain.</span></>}
          onClick={() => setBatchPickerOpen(true)}
        />
        <MetricCard icon={UserRound} label="Sopir" tone="sky" value={`${summary.totalDrivers || 0} sopir`} helper={`${summary.totalItems || 0} job komisi`} />
        <MetricCard icon={CircleDollarSign} label="Sebelum Potongan" tone="amber" value={formatCurrency(commissionTotals.grossAmount)} helper="Total komisi bruto" />
        <MetricCard icon={CircleDollarSign} label="Potongan Finance" tone="rose" value={formatCurrency(commissionTotals.deductionAmount)} helper="Total potongan aktif" />
        <MetricCard icon={CircleDollarSign} label="Harus Dibayar" tone="emerald" value={formatCurrency(commissionTotals.netAmount)} helper="Nilai transfer setelah potongan" />
        <MetricCard icon={BadgeCheck} label="Status Batch" tone="emerald" pill value={<StatusPill status={selectedBatch?.status || report.status || ''} />} helper={selectedBatch ? `Diajukan ${formatDateTime(selectedBatch.submittedAt)}` : 'Belum ada pengajuan aktif.'} />
      </section>

      <section>
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-black text-slate-950">Report Per Sopir</h2>
              <p className="text-xs leading-relaxed text-slate-500">Daftar komisi dari batch yang dipilih.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="secondary-button inline-flex items-center gap-2" type="button" disabled={loading || !drivers.length} onClick={handleDownloadPdf}>
                <Download size={16} /> Download PDF
              </button>
              <button className="secondary-button inline-flex items-center gap-2" type="button" disabled={loading || !drivers.length} onClick={handleDownloadCsv}>
                <Download size={16} /> Download CSV
              </button>
              {canFinance && selectedBatch?.status === 'submitted' ? (
                <>
                <button className="primary-button inline-flex items-center gap-2" type="button" disabled={saving || !revisionAcknowledged} onClick={() => handleApprove(selectedBatch)}>
                  <CheckCircle2 size={16} /> Approve
                </button>
                <button className="secondary-button inline-flex items-center gap-2" type="button" disabled={saving} onClick={() => handleReject(selectedBatch)}>
                  <XCircle size={16} /> Reject
                </button>
                </>
              ) : null}
            </div>
          </div>
          {!selectedBatch ? (
            <div className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              Belum ada batch aktif dari Operational untuk periode ini.
            </div>
          ) : null}
          {selectedBatch?.status === 'submitted' && selectedBatch.revisionCount > 0 ? (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 shrink-0" size={16} />
                <div>
                  <strong className="block">Batch berubah setelah diajukan</strong>
                  <p className="mt-0.5 text-xs font-semibold">
                    Penerima komisi {selectedBatch.lastRevisionPreviousDriverName || '-'} dipindahkan ke {selectedBatch.lastRevisionNextDriverName || '-'}
                    {' '}oleh {selectedBatch.lastRevisedByName || 'Admin'} pada {formatDateTime(selectedBatch.lastRevisedAt)}.
                  </p>
                  {selectedBatch.lastRevisionReason ? <p className="mt-1 text-xs">Alasan: {selectedBatch.lastRevisionReason}</p> : null}
                  <p className="mt-1 text-xs font-bold">Periksa kembali rincian sopir dan nominal sebelum menyetujui batch.</p>
                  <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs font-bold">
                    <input
                      checked={acknowledgedRevisionBatchId === selectedBatch.id}
                      className="mt-0.5 h-4 w-4 accent-amber-700"
                      onChange={(event) => setAcknowledgedRevisionBatchId(event.target.checked ? selectedBatch.id : '')}
                      type="checkbox"
                    />
                    Saya sudah memeriksa ulang penerima dan nominal komisi dalam batch ini.
                  </label>
                </div>
              </div>
            </div>
          ) : null}
          {selectedBatch?.status === 'rejected' && selectedBatch.rejectionNote ? (
            <div className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 shrink-0" size={16} />
                <div>
                  <strong className="block">Batch ditolak Finance</strong>
                  <p className="mt-0.5 font-semibold">{selectedBatch.rejectionNote}</p>
                </div>
              </div>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Sopir</th>
                  <th className="px-4 py-3">Rekening</th>
                  <th className="px-4 py-3 text-right">Job</th>
                  <th className="px-4 py-3 text-right">Sebelum Potongan</th>
                  <th className="px-4 py-3 text-right">Potongan Finance</th>
                  <th className="px-4 py-3 text-right">Harus Dibayar</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {drivers.map((driver) => {
                  const driverKey = driver.driverKey || driver.driverId || driver.driverName;
                  return (
                  <tr key={driverKey} className="align-middle hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-xs font-bold text-slate-950">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {driver.driverName}
                        {driver.deductionAmount > 0 ? (
                          <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[9px] font-black uppercase text-rose-700">
                            Ada Potongan
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 text-xs font-semibold text-slate-700"><CreditCard size={15} /> {paymentAccountLabel(driver)}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700">{driver.totalItems}</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-amber-700">{formatCurrency(driver.grossAmount ?? driver.totalAmount)}</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-rose-600">{driver.deductionAmount ? formatCurrency(driver.deductionAmount) : '-'}</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-emerald-700">{formatCurrency(driver.netAmount ?? driver.totalAmount)}</td>
                    <td className="px-4 py-3"><StatusPill status={driverFinanceStatus(driver)} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        {driver.paymentProofAttachment ? (
                          <>
                            <DocumentLink
                              className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50"
                              file={driver.paymentProofAttachment}
                              label="View"
                            />
                            <DocumentLink
                              className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2.5 text-[10px] font-bold text-sky-700 hover:bg-sky-100"
                              download
                              file={driver.paymentProofAttachment}
                              label="Download"
                            />
                          </>
                        ) : null}
                        <button
                          className="secondary-button inline-flex items-center gap-2"
                          type="button"
                          onClick={() => {
                            setSelectedDriverKey(driverKey);
                            setDetailOpen(true);
                          }}
                        >
                          <FileText size={15} /> Detail <ChevronRight size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {!drivers.length ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-xs font-semibold text-slate-500" colSpan={8}>{loading ? 'Memuat report komisi...' : 'Belum ada komisi pada periode ini.'}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <BatchPickerModal
        onClose={() => setBatchPickerOpen(false)}
        onSelectBatch={(batchId) => openBatch(batchId)}
        open={batchPickerOpen}
        selectedBatchId={selectedBatch?.id}
      />

      <RejectBatchModal
        batch={rejectBatch}
        saving={saving}
        onClose={() => setRejectBatch(null)}
        onConfirm={confirmReject}
      />

      <DriverFinanceDetailModal
        driver={selectedDriver}
        payment={selectedPayment}
        selectedBatch={selectedBatch}
        canFinance={canFinance}
        canManageDeduction={canManageDeduction}
        saving={saving}
        onUploadProof={handleUploadProof}
        onSettleDeductionOnly={handleSettleDeductionOnly}
        canVoidPayment={canVoidPayment}
        voidBusyId={voidBusyId}
        voidError={voidError}
        onVoidPayment={voidPayment}
        onAddDeduction={handleAddDeduction}
        onVoidDeduction={handleVoidDeduction}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </main>
  );
}

export default DriverCommissionPage;
