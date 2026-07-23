import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Search, XCircle } from 'lucide-react';
import {
  approveFinanceCorrection,
  fetchFinanceCorrections,
  rejectFinanceCorrection,
} from '../../services/finance/financeService';

function formatDisplayDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function normalizeCorrection(row = {}) {
  return {
    id: row.id,
    salesOrderId: row.salesOrderId || '',
    soNumber: row.soNumber || '-',
    invoiceNumber: row.invoiceNumber || '-',
    customer: row.customer || '-',
    destination: row.destination || '-',
    correctionType: row.correctionType || '',
    currentValue: row.currentValue || '-',
    requestedValue: row.requestedValue || '-',
    reason: row.reason || '-',
    status: row.status || 'pending',
    requestedByName: row.requestedByName || '-',
    requestedAt: formatDisplayDate(row.requestedAt),
    reviewedByName: row.reviewedByName || '',
    reviewedAt: formatDisplayDate(row.reviewedAt),
    reviewNote: row.reviewNote || '',
  };
}

function statusLabel(status) {
  const labels = {
    pending: 'Menunggu Approval',
    applied: 'Sudah Diterapkan',
    rejected: 'Ditolak',
    approved: 'Disetujui',
  };
  return labels[status] || status || '-';
}

function typeLabel(type) {
  return type === 'invoice_number' ? 'No. Invoice' : 'No. SO';
}

function StatusPill({ value }) {
  const tone = value === 'pending'
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : value === 'rejected'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${tone}`}>{statusLabel(value)}</span>;
}

function ReviewModal({ decision, row, note, error, busy, onNoteChange, onClose, onConfirm }) {
  if (!decision || !row) return null;
  const isReject = decision === 'reject';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" role="presentation" onMouseDown={onClose}>
      <section className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Approval Koreksi Finance</p>
            <h2 className="mt-0.5 text-base font-black text-slate-950">{isReject ? 'Reject Koreksi' : 'Approve Koreksi'}</h2>
          </div>
          <button className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600" disabled={busy} onClick={onClose} type="button">Tutup</button>
        </header>
        <form className="grid gap-3 p-4" onSubmit={onConfirm}>
          <div className={`rounded-lg border px-3 py-2.5 ${isReject ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <div className="flex gap-2.5">
              {isReject ? <XCircle className="mt-0.5 shrink-0 text-rose-600" size={18} /> : <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} />}
              <div className="min-w-0">
                <strong className="block text-xs text-slate-950">{typeLabel(row.correctionType)}: {row.currentValue} {'>'} {row.requestedValue}</strong>
                <span className="mt-0.5 block text-[11px] font-semibold text-slate-600">{row.soNumber} - {row.customer}</span>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Alasan Finance</span>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-700">{row.reason}</p>
          </div>
          <label className="grid gap-1.5 text-xs font-bold text-slate-700">
            Catatan Admin {isReject ? <span className="font-semibold text-rose-600">Wajib diisi</span> : null}
            <textarea
              autoFocus
              className="min-h-24 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-slate-500"
              maxLength={500}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder={isReject ? 'Jelaskan alasan penolakan...' : 'Opsional'}
              value={note}
            />
            <small className="justify-self-end font-medium text-slate-400">{note.length}/500</small>
          </label>
          {error ? <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600" disabled={busy} onClick={onClose} type="button">Batal</button>
            <button className={`rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50 ${isReject ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`} disabled={busy} type="submit">
              {busy ? 'Memproses...' : isReject ? 'Reject' : 'Approve'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function FinanceCorrectionsPage() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ pending: 0, applied: 0, rejected: 0 });
  const [status, setStatus] = useState('pending');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [decision, setDecision] = useState(null);
  const [note, setNote] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchFinanceCorrections({ page: 1, pageSize: 100, status, query });
      setRows((result.rows || []).map(normalizeCorrection));
      setSummary({
        pending: Number(result.summary?.pending || 0),
        applied: Number(result.summary?.applied || 0),
        rejected: Number(result.summary?.rejected || 0),
      });
    } catch (requestError) {
      setError(requestError.message || 'Data koreksi Finance gagal dimuat.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const tabs = useMemo(() => [
    { id: 'pending', label: 'Menunggu', count: summary.pending, icon: Clock3 },
    { id: 'applied', label: 'Diterapkan', count: summary.applied, icon: CheckCircle2 },
    { id: 'rejected', label: 'Ditolak', count: summary.rejected, icon: XCircle },
  ], [summary]);

  async function submitDecision(event) {
    event.preventDefault();
    if (!decision?.row) return;
    if (decision.type === 'reject' && !note.trim()) {
      setDecisionError('Catatan reject wajib diisi.');
      return;
    }
    setBusy(true);
    setDecisionError('');
    try {
      if (decision.type === 'reject') await rejectFinanceCorrection(decision.row.id, note.trim());
      else await approveFinanceCorrection(decision.row.id, note.trim());
      setDecision(null);
      setNote('');
      await loadRows();
    } catch (requestError) {
      setDecisionError(requestError.message || 'Approval koreksi gagal diproses.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-3 text-slate-900">
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Approval Admin</p>
            <h1 className="mt-1 text-xl font-black text-slate-950">Koreksi Finance</h1>
          </div>
          <label className="flex h-9 min-w-[280px] items-center rounded-lg border border-slate-300 bg-white px-3 focus-within:border-slate-500">
            <Search className="mr-2 text-slate-400" size={15} />
            <input className="w-full border-0 bg-transparent text-xs font-semibold outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="Cari SO, invoice, customer..." value={query} />
          </label>
        </header>

        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = tab.id === status;
              return (
                <button className={`inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-bold ${active ? 'border-sky-200 bg-white text-slate-950 shadow-sm' : 'border-transparent text-slate-500 hover:bg-white'}`} key={tab.id} onClick={() => setStatus(tab.id)} type="button">
                  <Icon size={13} />
                  {tab.label}
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px]">{tab.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {error ? <p className="mx-4 mt-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
        {loading ? <p className="px-4 py-6 text-center text-xs font-semibold text-slate-500">Memuat data koreksi...</p> : (
          <div className="table-wrap">
            <table className="data-table master-table finance-master-table min-w-[1180px]">
              <thead>
                <tr>
                  {['Tanggal', 'Jenis', 'SO / Customer', 'Nilai Lama', 'Nilai Baru', 'Alasan Finance', 'Status', 'Aksi'].map((column) => <th key={column}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-t border-slate-100 align-middle hover:bg-slate-50" key={row.id}>
                    <td className="px-3 py-2 text-xs font-semibold text-slate-600">{row.requestedAt}</td>
                    <td className="px-3 py-2 text-xs font-black text-slate-900">{typeLabel(row.correctionType)}</td>
                    <td className="px-3 py-2">
                      <strong className="block text-xs text-slate-950">{row.soNumber}</strong>
                      <span className="mt-0.5 block text-[11px] font-medium text-slate-500">{row.customer} - {row.destination}</span>
                    </td>
                    <td className="px-3 py-2 text-xs font-semibold text-slate-700">{row.currentValue}</td>
                    <td className="px-3 py-2 text-xs font-black text-slate-950">{row.requestedValue}</td>
                    <td className="max-w-[280px] px-3 py-2 text-[11px] font-semibold leading-relaxed text-slate-600">{row.reason}</td>
                    <td className="px-3 py-2"><StatusPill value={row.status} /></td>
                    <td className="px-3 py-2">
                      {row.status === 'pending' ? (
                        <div className="flex gap-1.5">
                          <button className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-700" onClick={() => { setDecision({ type: 'approve', row }); setNote(''); setDecisionError(''); }} type="button">Approve</button>
                          <button className="rounded-md bg-rose-600 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-rose-700" onClick={() => { setDecision({ type: 'reject', row }); setNote(''); setDecisionError(''); }} type="button">Reject</button>
                        </div>
                      ) : (
                        <span className="text-[10px] font-semibold text-slate-400">{row.reviewedByName || '-'}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-xs font-semibold text-slate-400" colSpan={8}>Tidak ada request koreksi pada status ini.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ReviewModal
        busy={busy}
        decision={decision?.type}
        error={decisionError}
        note={note}
        onClose={() => {
          if (busy) return;
          setDecision(null);
          setNote('');
          setDecisionError('');
        }}
        onConfirm={submitDecision}
        onNoteChange={(value) => {
          setNote(value);
          setDecisionError('');
        }}
        row={decision?.row}
      />
    </main>
  );
}

export default FinanceCorrectionsPage;
