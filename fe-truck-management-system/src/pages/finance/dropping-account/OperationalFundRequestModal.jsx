import { useState } from 'react';
import AttachmentUploadField from '../../../components/common/AttachmentUploadField';
import { formatCurrency } from '../../../utils/formatCurrency';
import FinanceActionModal from '../shared/FinanceActionModal';

const QUICK_AMOUNT_OPTIONS = [5000000, 10000000, 15000000, 20000000, 25000000, 30000000, 35000000, 40000000];
const CUSTOM_AMOUNT_VALUE = 'custom';

function OperationalFundRequestModal({ value, error, busy, mode = 'request', onChange, onClose, onConfirm }) {
  const isDeposit = mode === 'deposit';
  const amount = Number(value.amount || 0);
  const formattedAmount = Number.isFinite(amount) && amount > 0 ? formatCurrency(amount) : 'Rp 0';
  const [manualAmountMode, setManualAmountMode] = useState(false);
  const isPresetAmount = QUICK_AMOUNT_OPTIONS.includes(amount);
  const showManualAmountInput = manualAmountMode || (amount > 0 && !isPresetAmount);
  const amountSelectValue = showManualAmountInput ? CUSTOM_AMOUNT_VALUE : (isPresetAmount ? String(amount) : '');

  function handleAmountSelectChange(event) {
    const selected = event.target.value;
    if (selected === CUSTOM_AMOUNT_VALUE) {
      setManualAmountMode(true);
      return;
    }
    setManualAmountMode(false);
    if (selected) onChange({ ...value, amount: selected });
  }

  return (
    <FinanceActionModal
      busy={busy}
      confirmLabel={isDeposit ? 'Validasi Deposit' : 'Ajukan Saldo'}
      description={isDeposit ? 'Catat top up baru. Setiap deposit akan menambah saldo, bukan mengganti deposit sebelumnya.' : 'Ajukan saldo operasional harian untuk kebutuhan pembayaran lapangan.'}
      onClose={onClose}
      onConfirm={onConfirm}
      title={isDeposit ? 'Deposit Saldo Operasional' : 'Pengajuan Saldo Operasional'}
      tone={isDeposit ? 'approve' : 'upload'}
      widthClassName="max-w-2xl"
    >
      {isDeposit ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Nominal Akan Masuk</span>
          <strong className="mt-1 block text-2xl font-black tracking-tight text-emerald-950">{formattedAmount}</strong>
          <p className="mt-1 text-[11px] font-medium leading-relaxed text-emerald-700">Dicatat sebagai uang masuk baru dan menambah saldo berjalan.</p>
        </div>
      ) : null}
      <div className="master-form-grid">
        <label className="master-field">
          <span>Tanggal</span>
          <input
            onChange={(event) => onChange({ ...value, requestDate: event.target.value })}
            type="date"
            value={value.requestDate}
          />
        </label>
        <label className="master-field">
          <span>Nominal</span>
          <select
            onChange={handleAmountSelectChange}
            value={amountSelectValue}
          >
            <option disabled value="">Pilih nominal...</option>
            {QUICK_AMOUNT_OPTIONS.map((quickAmount) => (
              <option key={quickAmount} value={quickAmount}>{formatCurrency(quickAmount)}</option>
            ))}
            <option value={CUSTOM_AMOUNT_VALUE}>Lainnya (Input Manual)</option>
          </select>
          {showManualAmountInput ? (
            <input
              aria-label="Nominal manual"
              min="0"
              onChange={(event) => onChange({ ...value, amount: event.target.value })}
              onWheel={(event) => event.currentTarget.blur()}
              placeholder="Contoh: 22500000"
              type="number"
              value={value.amount}
            />
          ) : null}
        </label>
        <label className="master-field span-full">
          <span>Keterangan</span>
          <textarea
            className="min-h-16 resize-y"
            maxLength={500}
            onChange={(event) => onChange({ ...value, purpose: event.target.value })}
            placeholder="Contoh: Dropping operasional tanggal berjalan."
            value={value.purpose}
          />
          <small className="justify-self-end font-medium text-slate-400">{value.purpose.length}/500</small>
        </label>
      </div>
      {isDeposit ? (
        <div className="neutral-document-upload">
          <AttachmentUploadField
            compact
            helper="Wajib. PDF, JPG, atau PNG"
            id="operational-fund-deposit-proof"
            label="Bukti Transfer Deposit"
            onClear={() => onChange({ ...value, proofFile: null })}
            onSelect={(file, validationError) => {
              if (validationError) {
                onChange({ ...value, proofFile: null, proofFileError: validationError });
                return;
              }
              onChange({ ...value, proofFile: file, proofFileError: '' });
            }}
            title={value.proofFile?.name ? 'Ganti Bukti Transfer' : 'Upload Bukti Transfer'}
            value={value.proofFile}
          />
        </div>
      ) : null}
      {isDeposit && value.proofFileError ? <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{value.proofFileError}</p> : null}
      {error ? <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
    </FinanceActionModal>
  );
}

export default OperationalFundRequestModal;
