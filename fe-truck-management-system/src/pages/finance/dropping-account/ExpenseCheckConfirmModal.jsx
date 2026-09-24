import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import AttachmentUploadField from '../../../components/common/AttachmentUploadField';
import DocumentLink from '../../../components/common/DocumentLink';
import { formatCurrency } from '../../../utils/formatCurrency';
import { addExpenseTransferProof, deleteExpenseTransferProof, fetchExpenseTransferProofs, updateExpenseTransferProof } from '../../../services/finance/financeService';
import DetailField from '../shared/DetailField';
import FinanceActionModal from '../shared/FinanceActionModal';
import { expenseCategoryLabels, readableLabel } from './operationalFundUtils';

const emptyForm = () => ({ amount: '', transferDate: new Date().toISOString().slice(0, 10), note: '', proofFile: null });

function ExpenseCheckConfirmModal({ row, error, busy, adminFeeError, adminFeeAmount, adminFeeNote, adjustmentNote, onAdminFeeAmountChange, onAdminFeeNoteChange, onAdjustmentNoteChange, onProofsChange, onClose, onConfirm }) {
  const [proofs, setProofs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [proofError, setProofError] = useState('');
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const adminFeeInputRef = useRef(null);
  const adminFee = Math.max(0, Number(adminFeeAmount || 0));
  const normalAmount = Math.max(0, Number(row?.amount || 0) - adminFee);
  const totalActual = proofs.reduce((total, proof) => total + Number(proof.amount || 0), 0);
  const adjustment = totalActual - normalAmount;
  const locked = row?.batchStatus === 'closed';

  async function loadProofs() {
    if (!row?.id) return;
    setLoading(true);
    try {
      const result = await fetchExpenseTransferProofs(row.id);
      const next = Array.isArray(result) ? result : (result?.rows || []);
      setProofs(next);
      onProofsChange?.(next);
      setProofError('');
    } catch (loadError) {
      setProofError(loadError.message || 'Bukti transfer gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setProofs([]);
    setEditingId('');
    setForm(emptyForm());
    if (row?.id) loadProofs();
  }, [row?.id]);

  useEffect(() => {
    if (adminFeeError) adminFeeInputRef.current?.focus();
    else if (error) document.getElementById('expense-check-general-error')?.focus();
  }, [adminFeeError, error]);

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setProofError('');
  }

  function edit(proof) {
    setEditingId(proof.id);
    setForm({ amount: String(proof.amount || ''), transferDate: String(proof.transferDate || '').slice(0, 10), note: proof.note || '', proofFile: null });
  }

  function cancelEdit() {
    setEditingId('');
    setForm(emptyForm());
  }

  async function saveProof() {
    if (Number(form.amount) <= 0) return setProofError('Nominal transfer wajib lebih dari 0.');
    if (!form.transferDate) return setProofError('Tanggal transfer wajib diisi.');
    if (!editingId && !form.proofFile) return setProofError('File bukti transfer wajib dipilih.');
    setProofBusy(true);
    try {
      const payload = { ...form, amount: Number(form.amount) };
      if (editingId) await updateExpenseTransferProof(row.id, editingId, payload);
      else await addExpenseTransferProof(row.id, payload);
      cancelEdit();
      await loadProofs();
    } catch (saveError) {
      setProofError(saveError.message || 'Bukti transfer gagal disimpan.');
    } finally {
      setProofBusy(false);
    }
  }

  async function removeProof(proof) {
    if (!window.confirm(`Hapus bukti transfer ${formatCurrency(proof.amount)}?`)) return;
    setProofBusy(true);
    try {
      await deleteExpenseTransferProof(row.id, proof.id);
      if (editingId === proof.id) cancelEdit();
      await loadProofs();
    } catch (deleteError) {
      setProofError(deleteError.message || 'Bukti transfer gagal dihapus.');
    } finally {
      setProofBusy(false);
    }
  }

  if (!row) return null;
  const needsNote = adjustment !== 0 && !String(adjustmentNote || '').trim();

  return (
    <FinanceActionModal busy={busy || proofBusy} confirmDisabled={locked || loading || proofs.length === 0 || needsNote} confirmLabel="Validasi Transaksi" description="Cocokkan nominal sistem dengan seluruh transfer aktual." onClose={onClose} onConfirm={onConfirm} footerError={error} footerErrorId="expense-check-general-error" title="Validasi UJ dan Bukti Transfer" tone="approve" widthClassName="max-w-5xl">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DetailField label="UJ Sistem" value={formatCurrency(row.amount)} />
          <DetailField label="Nominal Normal" value={formatCurrency(normalAmount)} />
          <DetailField label="Total Aktual" value={formatCurrency(totalActual)} />
          <DetailField label="Penyesuaian" value={formatCurrency(adjustment)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DetailField label="Nomor SO" value={row.soNumber} /><DetailField label="Container" value={row.containerNumber} />
          <DetailField label="Driver" value={row.driverName} /><DetailField label="Kategori" value={readableLabel(expenseCategoryLabels, row.category)} />
        </div>

        <section className="border-y border-slate-200 py-3">
          <div className="mb-2 flex justify-between"><h3 className="text-sm font-black">Bukti Transfer</h3><span className="text-xs font-bold text-slate-500">{locked ? 'Batch ditutup' : `${proofs.length} bukti`}</span></div>
          {loading ? <p className="text-sm text-slate-500">Memuat bukti...</p> : null}
          {!loading && !proofs.length ? <p className="text-sm font-semibold text-amber-700">Belum ada bukti transfer.</p> : null}
          {proofs.map((proof) => (
            <div className="grid items-center gap-2 border-b border-slate-100 py-2 sm:grid-cols-[1fr_140px_110px_auto]" key={proof.id}>
              <div className="min-w-0"><DocumentLink file={proof.attachment} label={proof.attachment?.name || 'Lihat bukti'} />{proof.note ? <p className="truncate text-xs text-slate-500">{proof.note}</p> : null}</div>
              <strong className="text-sm">{formatCurrency(proof.amount)}</strong><span className="text-xs font-semibold">{String(proof.transferDate || '').slice(0, 10)}</span>
              <div className="flex gap-1"><button aria-label="Edit bukti transfer" className="flex size-9 items-center justify-center rounded-md border" disabled={locked || proofBusy} onClick={() => edit(proof)} type="button"><Pencil size={15} /></button><button aria-label="Hapus bukti transfer" className="flex size-9 items-center justify-center rounded-md border border-rose-200 text-rose-700" disabled={locked || proofBusy} onClick={() => removeProof(proof)} type="button"><Trash2 size={15} /></button></div>
            </div>
          ))}
        </section>

        <section className={locked ? 'pointer-events-none opacity-50' : ''}>
          <div className="mb-2 flex justify-between"><h3 className="text-sm font-black">{editingId ? 'Edit Bukti' : 'Tambah Bukti'}</h3>{editingId ? <button className="flex items-center gap-1 text-xs font-bold" onClick={cancelEdit} type="button"><X size={14} /> Batal</button> : null}</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label><span className="text-[10px] font-black uppercase text-slate-500">Nominal</span><input aria-label="Nominal bukti transfer" className="mt-1 h-10 w-full rounded-md border px-3" min="1" type="number" value={form.amount} onChange={(event) => change('amount', event.target.value)} /></label>
            <label><span className="text-[10px] font-black uppercase text-slate-500">Tanggal</span><input aria-label="Tanggal bukti transfer" className="mt-1 h-10 w-full rounded-md border px-3" type="date" value={form.transferDate} onChange={(event) => change('transferDate', event.target.value)} /></label>
            <label className="lg:col-span-2"><span className="text-[10px] font-black uppercase text-slate-500">Catatan Bukti</span><input aria-label="Catatan bukti transfer" className="mt-1 h-10 w-full rounded-md border px-3" maxLength={500} value={form.note} onChange={(event) => change('note', event.target.value)} /></label>
          </div>
          <div className="mt-3 grid items-end gap-3 sm:grid-cols-[1fr_auto]"><AttachmentUploadField compact id="finance-expense-transfer-proof" label="File Bukti" onClear={() => change('proofFile', null)} onSelect={(file) => change('proofFile', file)} title={editingId ? 'Ganti File (opsional)' : 'Pilih File Bukti'} value={form.proofFile} /><button className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-bold text-white" onClick={saveProof} type="button"><Plus size={16} /> {editingId ? 'Simpan' : 'Tambah Bukti'}</button></div>
          {proofError ? <p className="mt-2 text-xs font-semibold text-rose-700" role="alert">{proofError}</p> : null}
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="text-[10px] font-black uppercase text-slate-500">Biaya Admin Transfer</span><input aria-label="Biaya Admin Transfer" className="mt-1 h-10 w-full rounded-md border px-3" disabled={locked} min="0" ref={adminFeeInputRef} type="number" value={adminFeeAmount} onChange={(event) => onAdminFeeAmountChange(event.target.value)} />{adminFeeError ? <span className="text-xs font-semibold text-rose-700">{adminFeeError}</span> : null}</label>
          <label><span className="text-[10px] font-black uppercase text-slate-500">Catatan Admin</span><input aria-label="Catatan Admin" className="mt-1 h-10 w-full rounded-md border px-3" disabled={locked} maxLength={500} value={adminFeeNote} onChange={(event) => onAdminFeeNoteChange(event.target.value)} /></label>
        </div>
        <label className="block"><span className="text-[10px] font-black uppercase text-slate-500">Catatan Penyesuaian {adjustment !== 0 ? '(wajib)' : ''}</span><textarea aria-label="Catatan Penyesuaian" className="mt-1 min-h-20 w-full rounded-md border p-3" disabled={locked} maxLength={500} value={adjustmentNote} onChange={(event) => onAdjustmentNoteChange(event.target.value)} />{needsNote ? <span className="text-xs font-semibold text-amber-700">Isi alasan karena total aktual berbeda dari nominal normal.</span> : null}</label>
      </div>
    </FinanceActionModal>
  );
}

export default ExpenseCheckConfirmModal;
