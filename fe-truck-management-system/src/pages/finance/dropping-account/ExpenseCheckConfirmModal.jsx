import { CheckCircle2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import AttachmentUploadField from '../../../components/common/AttachmentUploadField';
import DocumentLink from '../../../components/common/DocumentLink';
import { formatCurrency } from '../../../utils/formatCurrency';
import { addExpenseTransferProof, deleteExpenseTransferProof, fetchExpenseTransferProofs, updateExpenseTransferProof } from '../../../services/finance/financeService';
import DetailField from '../shared/DetailField';
import FinanceActionModal from '../shared/FinanceActionModal';
import { expenseCategoryLabels, readableLabel } from './operationalFundUtils';

const emptyForm = (amount = '') => ({ amount, transferDate: new Date().toISOString().slice(0, 10), note: '', proofFile: null });

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
      setForm((current) => (
        !editingId && !current.proofFile
          ? emptyForm(next.length === 0 && normalAmount > 0 ? String(normalAmount) : '')
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
    setForm(emptyForm(normalAmount > 0 ? String(normalAmount) : ''));
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
  const proofReadyToSave = Number(form.amount) > 0 && Boolean(form.transferDate) && (Boolean(editingId) || Boolean(form.proofFile));
  const verificationMessage = locked
    ? 'Batch sudah ditutup dan tidak dapat diubah.'
    : loading
      ? 'Daftar bukti transfer sedang dimuat.'
      : proofs.length === 0
        ? 'Simpan minimal satu bukti transfer untuk melanjutkan validasi.'
        : needsNote
          ? 'Isi catatan penyesuaian karena total aktual berbeda dari nominal normal.'
          : 'Data bukti sudah lengkap dan transaksi siap divalidasi.';
  const verificationReady = !locked && !loading && proofs.length > 0 && !needsNote;

  return (
    <FinanceActionModal busy={busy || proofBusy} confirmDisabled={locked || loading || proofs.length === 0 || needsNote} confirmLabel="Validasi Transaksi" description="Cocokkan nominal sistem dengan seluruh transfer aktual." onClose={onClose} onConfirm={onConfirm} footerError={error} footerErrorId="expense-check-general-error" footerNotice={verificationMessage} footerNoticeReady={verificationReady} title="Validasi UJ dan Bukti Transfer" tone="approve" widthClassName="max-w-5xl">
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

        <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-black text-slate-950">Daftar Bukti Transfer</h3><p className="mt-0.5 text-xs font-medium text-slate-500">Semua bukti yang sudah disimpan akan dijumlahkan sebagai total aktual.</p></div><span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600">{locked ? 'Batch ditutup' : `${proofs.length} bukti tersimpan`}</span></div>
          {loading ? <p className="text-sm text-slate-500">Memuat bukti...</p> : null}
          {!loading && !proofs.length ? <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">Belum ada bukti yang disimpan.</p> : null}
          {proofs.map((proof) => (
            <div className="mt-2 grid items-center gap-2 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_140px_110px_auto]" key={proof.id}>
              <div className="min-w-0"><DocumentLink file={proof.attachment} label={proof.attachment?.name || 'Lihat bukti'} />{proof.note ? <p className="truncate text-xs text-slate-500">{proof.note}</p> : null}</div>
              <strong className="text-sm">{formatCurrency(proof.amount)}</strong><span className="text-xs font-semibold">{String(proof.transferDate || '').slice(0, 10)}</span>
              <div className="flex gap-1"><button aria-label="Edit bukti transfer" className="flex size-9 items-center justify-center rounded-md border" disabled={locked || proofBusy} onClick={() => edit(proof)} type="button"><Pencil size={15} /></button><button aria-label="Hapus bukti transfer" className="flex size-9 items-center justify-center rounded-md border border-rose-200 text-rose-700" disabled={locked || proofBusy} onClick={() => removeProof(proof)} type="button"><Trash2 size={15} /></button></div>
            </div>
          ))}
        </section>

        <section className={`rounded-md border border-slate-200 bg-white p-4 ${locked ? 'pointer-events-none opacity-50' : ''}`}>
          <div className="mb-3 flex justify-between"><div><h3 className="text-sm font-black text-slate-950">{editingId ? 'Edit Bukti Transfer' : 'Form Bukti Transfer'}</h3><p className="mt-0.5 text-xs font-medium text-slate-500">Isi data lalu simpan. Form akan kosong kembali untuk bukti berikutnya.</p></div>{editingId ? <button className="flex items-center gap-1 text-xs font-bold text-slate-600" onClick={cancelEdit} type="button"><X size={14} /> Batal Edit</button> : null}</div>
          <div className="master-form-grid">
            <label className="master-field span-quarter"><span>Nominal Transfer <em>Wajib</em></span><input aria-label="Nominal bukti transfer" min="1" placeholder="Contoh: 740000" type="number" value={form.amount} onChange={(event) => change('amount', event.target.value)} /><small>{proofs.length === 0 && !editingId ? 'Otomatis mengikuti nominal normal. Ubah hanya jika transfer aktual berbeda.' : 'Isi sesuai nominal pada bukti transfer ini.'}</small></label>
            <label className="master-field span-quarter"><span>Tanggal Transfer <em>Wajib</em></span><input aria-label="Tanggal bukti transfer" type="date" value={form.transferDate} onChange={(event) => change('transferDate', event.target.value)} /></label>
            <label className="master-field"><span>Catatan Bukti</span><input aria-label="Catatan bukti transfer" maxLength={500} placeholder="Opsional" value={form.note} onChange={(event) => change('note', event.target.value)} /></label>
          </div>
          <div className="mt-3 grid items-end gap-3 sm:grid-cols-[1fr_auto]"><div className="neutral-document-upload"><AttachmentUploadField compact helper={editingId ? 'Opsional jika file tidak diganti' : 'Wajib. PDF, JPG, atau PNG'} id="finance-expense-transfer-proof" label="File Bukti Transfer" onClear={() => change('proofFile', null)} onSelect={(file) => change('proofFile', file)} title={editingId ? 'Ganti File Bukti' : 'Pilih File Bukti'} value={form.proofFile} /></div><button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[7px] bg-slate-900 px-4 text-[13px] font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40" disabled={!proofReadyToSave || proofBusy} onClick={saveProof} type="button"><Plus size={16} /> {editingId ? 'Simpan Perubahan' : 'Simpan Bukti'}</button></div>
          {form.proofFile && !editingId ? <p className="mt-2 text-xs font-semibold text-slate-600">File sudah dipilih. Klik tombol Simpan Bukti agar bukti masuk ke daftar.</p> : null}
          {proofError ? <p className="mt-2 text-xs font-semibold text-rose-700" role="alert">{proofError}</p> : null}
        </section>

        <div className="master-form-grid">
          <label className="master-field"><span>Biaya Admin Transfer</span><input aria-label="Biaya Admin Transfer" disabled={locked} min="0" placeholder="Isi 0 jika tidak ada" ref={adminFeeInputRef} type="number" value={adminFeeAmount} onChange={(event) => onAdminFeeAmountChange(event.target.value)} />{adminFeeError ? <small className="master-field-warning">{adminFeeError}</small> : null}</label>
          <label className="master-field"><span>Catatan Admin</span><input aria-label="Catatan Admin" disabled={locked} maxLength={500} placeholder="Opsional" value={adminFeeNote} onChange={(event) => onAdminFeeNoteChange(event.target.value)} /></label>
          <label className="master-field span-full"><span>Catatan Penyesuaian {adjustment !== 0 ? <em>Wajib diisi</em> : null}</span><textarea aria-label="Catatan Penyesuaian" className="min-h-20 resize-y" disabled={locked} maxLength={500} placeholder="Isi alasan jika total aktual kurang atau lebih dari nominal normal" value={adjustmentNote} onChange={(event) => onAdjustmentNoteChange(event.target.value)} />{needsNote ? <small className="master-field-warning">Isi alasan karena total aktual berbeda dari nominal normal.</small> : null}</label>
        </div>
        <div className={`flex items-start gap-2 rounded-md border px-3 py-2.5 ${verificationReady ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          {verificationReady ? <CheckCircle2 className="mt-0.5 shrink-0" size={16} /> : <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-current text-[10px] font-black">!</span>}
          <p className="text-xs font-semibold leading-relaxed">{verificationMessage}</p>
        </div>
      </div>
    </FinanceActionModal>
  );
}

export default ExpenseCheckConfirmModal;
