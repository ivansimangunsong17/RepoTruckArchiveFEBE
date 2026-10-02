import { AlertTriangle, Pencil, Plus, Trash2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import AttachmentUploadField from '../../../components/common/AttachmentUploadField';
import DocumentLink from '../../../components/common/DocumentLink';
import { formatCurrency } from '../../../utils/formatCurrency';
import { addExpenseTransferProof, deleteExpenseTransferProof, fetchExpenseTransferProofs, updateExpenseTransferProof } from '../../../services/finance/financeService';
import DetailField from '../shared/DetailField';
import FinanceActionModal from '../shared/FinanceActionModal';
import { expenseCategoryLabels, readableLabel } from './operationalFundUtils';

const emptyForm = (amount = '', batchDate = '') => ({
  amount,
  transferDate: String(batchDate || new Date().toISOString().slice(0, 10)).slice(0, 10),
  note: '',
  proofFile: null,
});

function DeleteProofConfirmDialog({ proof, busy, onCancel, onConfirm }) {
  if (!proof) return null;
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={busy ? undefined : onCancel}>
      <section aria-labelledby="delete-proof-title" aria-modal="true" className="w-full max-w-md rounded-md border border-slate-200 bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()} role="alertdialog">
        <div className="flex gap-3 border-b border-slate-200 p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600"><AlertTriangle size={20} /></div>
          <div><h3 className="text-base font-black text-slate-950" id="delete-proof-title">Hapus bukti transfer?</h3><p className="mt-1 text-sm leading-relaxed text-slate-600">Bukti <strong>{proof.attachment?.name || 'transfer'}</strong> sebesar <strong>{formatCurrency(proof.amount)}</strong> akan dihapus dari ritasi ini.</p></div>
        </div>
        <div className="flex justify-end gap-2 p-4"><button className="secondary-button" disabled={busy} onClick={onCancel} type="button">Batal</button><button className="inline-flex min-h-[42px] items-center gap-2 rounded-[7px] bg-rose-600 px-4 text-[13px] font-bold text-white hover:bg-rose-700 disabled:opacity-40" disabled={busy} onClick={onConfirm} type="button"><Trash2 size={15} /> {busy ? 'Menghapus...' : 'Hapus Bukti'}</button></div>
      </section>
    </div>,
    document.body,
  );
}

function ExpenseCheckConfirmModal({ row, batchDate, error, busy, adminFeeError, adminFeeAmount, adjustmentNote, onAdminFeeAmountChange, onAdjustmentNoteChange, onProofsChange, onClose, onConfirm }) {
  const activeBatchDate = String(batchDate || row?.batchDate || '').slice(0, 10);
  const [proofs, setProofs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [proofError, setProofError] = useState('');
  const [editingId, setEditingId] = useState('');
  const [showProofForm, setShowProofForm] = useState(false);
  const [showAdminFee, setShowAdminFee] = useState(false);
  const [proofToDelete, setProofToDelete] = useState(null);
  const [form, setForm] = useState(() => emptyForm('', activeBatchDate));
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
      if (next.length > 0 && !editingId) setShowProofForm(false);
      setForm((current) => (
        !editingId && !current.proofFile
          ? emptyForm(next.length === 0 && normalAmount > 0 ? String(normalAmount) : '', activeBatchDate)
          : current
      ));
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
    setShowProofForm(!row?.proofAttachment);
    setShowAdminFee(Number(adminFeeAmount || 0) > 0);
    setForm(emptyForm(normalAmount > 0 ? String(normalAmount) : '', activeBatchDate));
    if (row?.id) loadProofs();
  }, [row?.id, activeBatchDate]);

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
    setShowProofForm(true);
    setForm({ amount: String(proof.amount || ''), transferDate: String(proof.transferDate || '').slice(0, 10), note: proof.note || '', proofFile: null });
  }

  function cancelEdit() {
    setEditingId('');
    setForm(emptyForm('', activeBatchDate));
    setShowProofForm(false);
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
      setShowProofForm(false);
    } catch (saveError) {
      setProofError(saveError.message || 'Bukti transfer gagal disimpan.');
    } finally {
      setProofBusy(false);
    }
  }

  async function removeProof() {
    if (!proofToDelete) return;
    const proof = proofToDelete;
    setProofBusy(true);
    try {
      await deleteExpenseTransferProof(row.id, proof.id);
      setProofToDelete(null);
      if (editingId === proof.id) cancelEdit();
      await loadProofs();
    } catch (deleteError) {
      setProofError(deleteError.message || 'Bukti transfer gagal dihapus.');
    } finally {
      setProofBusy(false);
    }
  }

  if (!row) return null;
  const hasProofs = proofs.length > 0;
  const hasOperationalProof = Boolean(row.proofAttachment);
  const hasAdjustment = hasProofs && adjustment !== 0;
  const isAdminFeeAdjustment = hasAdjustment && adminFee > 0 && adjustment === adminFee;
  const manualAdjustmentNote = String(adjustmentNote || '').trim() === 'Biaya admin' ? '' : String(adjustmentNote || '').trim();
  const effectiveAdjustmentNote = isAdminFeeAdjustment ? 'Biaya admin' : manualAdjustmentNote;
  const needsNote = hasAdjustment && !isAdminFeeAdjustment && !effectiveAdjustmentNote;
  const editingValidatedTransaction = row.financeCheckStatus === 'sudah_dicek';
  const proofReadyToSave = Number(form.amount) > 0 && Boolean(form.transferDate) && (Boolean(editingId) || Boolean(form.proofFile));
  const verificationMessage = locked
    ? 'Batch sudah ditutup dan tidak dapat diubah.'
    : loading
      ? 'Daftar bukti transfer sedang dimuat.'
      : hasOperationalProof
        ? 'Bukti pembayaran dari Operational sudah tersedia. Transaksi siap divalidasi.'
        : !hasProofs && form.proofFile
        ? 'File sudah dipilih. Klik Simpan Bukti untuk melanjutkan.'
        : !hasProofs
          ? 'Pilih file bukti transfer, lalu klik Simpan Bukti.'
        : needsNote
          ? 'Isi alasan selisih untuk melanjutkan validasi.'
          : 'Data bukti sudah lengkap dan transaksi siap divalidasi.';
  const verificationReady = !locked && !loading && (hasOperationalProof || hasProofs) && !needsNote;

  return (
    <FinanceActionModal busy={busy || proofBusy} confirmDisabled={locked || loading || (!hasOperationalProof && proofs.length === 0) || needsNote} confirmLabel={editingValidatedTransaction ? 'Simpan Perubahan' : 'Validasi Transaksi'} description={editingValidatedTransaction ? 'Perbarui bukti pembayaran selama batch masih terbuka.' : 'Cocokkan biaya dengan bukti pembayaran yang tersedia.'} onClose={onClose} onConfirm={(event) => onConfirm(event, { adjustmentNote: effectiveAdjustmentNote })} footerError={error} footerErrorId="expense-check-general-error" footerNotice={verificationMessage} footerNoticeReady={verificationReady} title={editingValidatedTransaction ? 'Edit UJ dan Bukti Transfer' : 'Validasi UJ dan Bukti Transfer'} tone="approve" widthClassName="max-w-5xl">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <DetailField label="UJ Sistem" value={formatCurrency(row.amount)} />
          <DetailField label="Total Transfer" value={formatCurrency(totalActual)} />
          <DetailField label="Selisih Akhir" value={formatCurrency(adjustment)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DetailField label="Nomor SO" value={row.soNumber} /><DetailField label="Container" value={row.containerNumber} />
          <DetailField label="Driver" value={row.driverName} /><DetailField label="Kategori" value={readableLabel(expenseCategoryLabels, row.category)} />
        </div>

        <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
          {hasOperationalProof ? <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Bukti dari Operational</p><div className="mt-1"><DocumentLink file={row.proofAttachment} label={row.proofAttachment.name || 'Lihat bukti pembayaran'} /></div><p className="mt-1 text-xs font-medium text-emerald-700">Finance tidak perlu mengunggah ulang bukti ini.</p></div> : null}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-black text-slate-950">{hasOperationalProof ? 'Bukti Tambahan Finance' : 'Bukti Pembayaran Finance'}</h3><p className="mt-0.5 text-xs font-medium text-slate-500">{hasOperationalProof ? 'Opsional, hanya bila ada transfer aktual tambahan.' : 'Bukti ini wajib bila Operational belum mengunggahnya.'}</p></div><div className="flex items-center gap-2"><span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600">{locked ? 'Batch ditutup' : `${proofs.length} bukti`}</span>{hasProofs && !showProofForm && !locked ? <button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-bold text-white hover:bg-slate-800" onClick={() => { setForm(emptyForm('', activeBatchDate)); setShowProofForm(true); }} type="button"><Plus size={14} /> Tambah Bukti</button> : null}</div></div>
          {loading ? <p className="text-sm text-slate-500">Memuat bukti...</p> : null}
          {!loading && !proofs.length ? <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">Belum ada bukti yang disimpan.</p> : null}
          {proofs.map((proof) => (
            <div className="mt-2 grid items-center gap-2 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_140px_110px_auto]" key={proof.id}>
              <div className="min-w-0"><DocumentLink file={proof.attachment} label={proof.attachment?.name || 'Lihat bukti'} />{proof.note ? <p className="truncate text-xs text-slate-500">{proof.note}</p> : null}</div>
              <strong className="text-sm">{formatCurrency(proof.amount)}</strong><span className="text-xs font-semibold">{String(proof.transferDate || '').slice(0, 10)}</span>
              <div className="flex gap-1"><button aria-label="Edit bukti transfer" className="flex size-9 items-center justify-center rounded-md border" disabled={locked || proofBusy} onClick={() => edit(proof)} type="button"><Pencil size={15} /></button><button aria-label="Hapus bukti transfer" className="flex size-9 items-center justify-center rounded-md border border-rose-200 text-rose-700" disabled={locked || proofBusy} onClick={() => setProofToDelete(proof)} type="button"><Trash2 size={15} /></button></div>
            </div>
          ))}
        </section>

        {((!hasOperationalProof && !hasProofs) || showProofForm || editingId) ? <section className={`rounded-md border border-slate-200 bg-white p-4 ${locked ? 'pointer-events-none opacity-50' : ''}`}>
          <div className="mb-3 flex justify-between"><div><h3 className="text-sm font-black text-slate-950">{editingId ? 'Edit Bukti Transfer' : 'Form Bukti Transfer'}</h3><p className="mt-0.5 text-xs font-medium text-slate-500">Isi data lalu simpan. Form akan kosong kembali untuk bukti berikutnya.</p></div>{editingId ? <button className="flex items-center gap-1 text-xs font-bold text-slate-600" onClick={cancelEdit} type="button"><X size={14} /> Batal Edit</button> : null}</div>
          <div className="master-form-grid">
            <label className="master-field span-quarter"><span>Nominal Transfer <em>Wajib</em></span><input aria-label="Nominal bukti transfer" min="1" placeholder="Contoh: 740000" type="number" value={form.amount} onChange={(event) => change('amount', event.target.value)} /><small>{proofs.length === 0 && !editingId ? 'Otomatis mengikuti nominal normal. Ubah hanya jika transfer aktual berbeda.' : 'Isi sesuai nominal pada bukti transfer ini.'}</small></label>
            <label className="master-field span-quarter"><span>Tanggal Transfer <em>Wajib</em></span><input aria-label="Tanggal bukti transfer" type="date" value={form.transferDate} onChange={(event) => change('transferDate', event.target.value)} /></label>
            <label className="master-field"><span>Catatan Bukti</span><input aria-label="Catatan bukti transfer" maxLength={500} placeholder="Opsional" value={form.note} onChange={(event) => change('note', event.target.value)} /></label>
          </div>
          <div className="mt-3 grid items-end gap-3 sm:grid-cols-[1fr_auto]"><div className="neutral-document-upload"><AttachmentUploadField compact helper={editingId ? 'Opsional jika file tidak diganti' : 'Wajib. PDF, JPG, atau PNG'} id="finance-expense-transfer-proof" label="File Bukti Transfer" onClear={() => change('proofFile', null)} onSelect={(file) => change('proofFile', file)} title={editingId ? 'Ganti File Bukti' : 'Pilih File Bukti'} value={form.proofFile} /></div><button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[7px] bg-slate-900 px-4 text-[13px] font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40" disabled={!proofReadyToSave || proofBusy} onClick={saveProof} type="button"><Plus size={16} /> {editingId ? 'Simpan Perubahan' : 'Simpan Bukti'}</button></div>
          {proofError ? <p className="mt-2 text-xs font-semibold text-rose-700" role="alert">{proofError}</p> : null}
        </section> : null}

        {!locked ? <section className={`rounded-md border px-4 py-3 ${showAdminFee ? 'border-slate-300 bg-white' : 'border-dashed border-slate-300 bg-white'}`}>
          {showAdminFee ? <div className="max-w-md"><div className="mb-2 flex items-center gap-2"><label className="text-sm font-black text-slate-900" htmlFor="expense-admin-fee">Biaya admin bank</label><span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">Opsional</span></div><div className="finance-admin-fee-row"><div className="finance-admin-fee-control"><span>Rp</span><input aria-label="Biaya Admin Transfer" id="expense-admin-fee" min="0" placeholder="0" ref={adminFeeInputRef} type="number" value={adminFeeAmount} onChange={(event) => onAdminFeeAmountChange(event.target.value)} /></div><button aria-label="Hapus biaya admin" className="finance-admin-fee-remove" onClick={() => { onAdminFeeAmountChange(''); setShowAdminFee(false); }} title="Hapus biaya admin" type="button"><X size={18} /></button></div>{adminFeeError ? <p className="mt-2 text-xs font-bold text-rose-700">{adminFeeError}</p> : <p className="mt-2 text-xs font-semibold text-slate-600">Isi hanya jika ada potongan biaya dari bank.</p>}</div> : <button className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-400 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-100" onClick={() => setShowAdminFee(true)} type="button"><Plus size={14} /> Tambah biaya admin</button>}
        </section> : null}

        {hasAdjustment && !isAdminFeeAdjustment ? <section className="rounded-md border border-amber-200 bg-amber-50 p-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><label className="text-xs font-bold text-slate-800" htmlFor="expense-adjustment-note">Alasan selisih <span className="text-rose-600">Wajib</span></label><strong className="text-xs text-amber-800">{adjustment > 0 ? 'Lebih bayar' : 'Kurang bayar'} {formatCurrency(Math.abs(adjustment))}</strong></div><textarea aria-label="Catatan Penyesuaian" className="min-h-20 w-full resize-y rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" disabled={locked} id="expense-adjustment-note" maxLength={500} placeholder="Tuliskan alasan selisih pembayaran" value={adjustmentNote} onChange={(event) => onAdjustmentNoteChange(event.target.value)} /></section> : null}
      </div>
      <DeleteProofConfirmDialog busy={proofBusy} onCancel={() => setProofToDelete(null)} onConfirm={removeProof} proof={proofToDelete} />
    </FinanceActionModal>
  );
}

export default ExpenseCheckConfirmModal;
