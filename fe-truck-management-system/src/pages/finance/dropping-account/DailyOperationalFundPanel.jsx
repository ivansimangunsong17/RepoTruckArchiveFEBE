import { AlertTriangle, Banknote, CheckCircle2, Download, Pencil, ReceiptText } from 'lucide-react';
import DocumentLink from '../../../components/common/DocumentLink';
import { downloadCsv } from '../../../utils/csvExport';
import { downloadPdfReport } from '../../../utils/simplePdfReport';
import { formatCurrency } from '../../../utils/formatCurrency';
import { formatDate } from '../../../utils/formatDate';
import AmountField from '../shared/AmountField';
import StatusPill from '../shared/StatusPill';
import {
  defaultExpenseReconciliationSummary,
  defaultOperationalFundBatch,
  defaultOperationalFundSummary,
  defaultOperationalFundTransactionSummary,
  expenseCategoryLabels,
  expenseFinanceStatusLabels,
  expensePaymentStatusLabels,
  operationalFundBatchStatusLabel,
  operationalFundTransactionCategoryLabel,
  operationalFundTransactionCategoryLabels,
  operationalFundTransactionCsvRows,
  operationalFundTransactionTypeLabels,
  readableLabel,
} from './operationalFundUtils';

function reportDateKey(value = '') {
  return String(value || '').replace(/[^0-9]/g, '') || 'batch';
}

function DailyOperationalFundPanel({
  batch = defaultOperationalFundBatch,
  batchDate = '',
  batchLoading = false,
  batchError = '',
  batchBusy = false,
  fundRows = [],
  fundSummary = defaultOperationalFundSummary,
  fundLoading = false,
  fundError = '',
  fundBusyId = '',
  canRequest = false,
  canDeposit = false,
  canReconcile = false,
  canReopen = false,
  pendingCloseBatches = [],
  onBatchDateChange,
  onCloseBatch,
  onReopenBatch,
  onOpenRequest,
  onOpenDeposit,
  onApproveFund,
  onRejectFund,
  transactionRows = [],
  transactionSummary = defaultOperationalFundTransactionSummary,
  transactionLoading = false,
  transactionError = '',
  expenseRows = [],
  expenseSummary = defaultExpenseReconciliationSummary,
  expenseLoading = false,
  expenseError = '',
  expenseBusyId = '',
  onOpenExpenseCheckConfirm,
  onOpenExpenseClarification,
}) {
  const normalizedFundSummary = {
    submitted: Number(fundSummary.submitted || 0),
    approved: Number(fundSummary.approved || 0),
    transferred: Number(fundSummary.transferred || 0),
    rejected: Number(fundSummary.rejected || 0),
  };
  const normalizedTransactionSummary = {
    totalCredit: Number(transactionSummary.totalCredit || 0),
    totalDebit: Number(transactionSummary.totalDebit || 0),
    balance: Number(transactionSummary.balance || 0),
    creditCount: Number(transactionSummary.creditCount || 0),
    debitCount: Number(transactionSummary.debitCount || 0),
    voidCount: Number(transactionSummary.voidCount || 0),
  };
  const normalizedExpenseSummary = {
    belumDicek: Number(expenseSummary.belumDicek || 0),
    sudahDicek: Number(expenseSummary.sudahDicek || 0),
    perluKlarifikasi: Number(expenseSummary.perluKlarifikasi || 0),
    dikoreksi: Number(expenseSummary.dikoreksi || 0),
    pendingAmount: Number(expenseSummary.pendingAmount || 0),
  };
  const expenseNeedProofCount = expenseRows.filter((row) => row.paymentStatus === 'sudah_dibayar' && !row.proofAttachment).length;
  const expenseQueueCount = normalizedExpenseSummary.belumDicek + normalizedExpenseSummary.dikoreksi;
  const pendingFundRows = fundRows.filter((row) => row.status === 'submitted');
  const hasActionRows = pendingFundRows.length > 0 || expenseRows.length > 0;
  const normalizedBatch = { ...defaultOperationalFundBatch, ...batch };
  const unresolvedBatchExpenses = Number(normalizedBatch.uncheckedCount || 0) + Number(normalizedBatch.needClarificationCount || 0);
  const canCloseBatch = canReconcile
    && Boolean(normalizedBatch.id)
    && normalizedBatch.status !== 'closed'
    && unresolvedBatchExpenses === 0
    && !batchBusy;
  const todayDate = new Date().toISOString().slice(0, 10);
  const showPendingCloseWarning = batchDate === todayDate && pendingCloseBatches.length > 0;
  function exportTransactionRows() {
    downloadCsv(
      'rekening-dropping-finance',
      ['No', 'Tanggal', 'Keterangan', 'Kategori', 'Uang Masuk', 'Uang Keluar', 'Saldo', 'Bukti'],
      operationalFundTransactionCsvRows(transactionRows),
    );
  }

  function exportTransactionPdf() {
    const chronologicalRows = [...transactionRows].reverse();
    downloadPdfReport({
      reportLabel: 'Finance Report',
      title: 'Report Rekening Dropping',
      subtitle: `Batch ${formatDate(batchDate || normalizedBatch.batchDate)} - ${operationalFundBatchStatusLabel(normalizedBatch.status)}`,
      filename: `rekening-dropping-${reportDateKey(batchDate || normalizedBatch.batchDate)}.pdf`,
      meta: [
        { label: 'Sisa Saldo', value: formatCurrency(normalizedTransactionSummary.balance) },
        { label: 'Uang Masuk', value: formatCurrency(normalizedTransactionSummary.totalCredit) },
        { label: 'Uang Keluar', value: formatCurrency(normalizedTransactionSummary.totalDebit) },
        { label: 'Belum Bukti', value: `${expenseNeedProofCount} transaksi` },
      ],
      columns: [
        { label: 'No', width: 0.45, value: (row) => row.reportNumber, align: 'center' },
        { label: 'Tanggal', width: 1.05, value: (row) => row.transactionDate },
        { label: 'Keterangan', width: 2.75, value: (row) => row.description, bold: true },
        { label: 'Kategori', width: 1.25, value: (row) => operationalFundTransactionCategoryLabel(row) || '-' },
        { label: 'Masuk', width: 1, value: (row) => (row.moneyIn ? formatCurrency(row.moneyIn) : '-'), align: 'right' },
        { label: 'Keluar', width: 1, value: (row) => (row.moneyOut ? formatCurrency(row.moneyOut) : '-'), align: 'right' },
        { label: 'Saldo', width: 1, value: (row) => (row.runningBalance == null ? '-' : formatCurrency(row.runningBalance)), align: 'right' },
        { label: 'Bukti', width: 0.75, value: (row) => (row.proofAttachment ? 'Ada' : 'Belum'), align: 'center' },
      ],
      rows: chronologicalRows.map((row, index) => ({ ...row, reportNumber: index + 1 })),
    });
  }

  return (
    <section className="border-b border-slate-200 bg-slate-50 p-2.5">
      <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-black text-slate-950">Batch Dropping Harian</h3>
            <p className="mt-0.5 text-[11px] font-medium text-slate-500">Satu batch tanggal: top up masuk, uang keluar, bukti, validasi Finance, dan close batch.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
              Batch Dropping
              <input
                className="master-filter-select max-w-none normal-case"
                onChange={(event) => onBatchDateChange?.(event.target.value)}
                type="date"
                value={batchDate}
              />
            </label>
            <StatusPill value={batchLoading ? 'Memuat Batch' : operationalFundBatchStatusLabel(normalizedBatch.status)} />
            {canDeposit ? (
              <button className="primary-button" onClick={onOpenDeposit} type="button">
                <Banknote size={15} /> Deposit Saldo
              </button>
            ) : null}
            {canReconcile ? (
              <button
                className="primary-button"
                disabled={!canCloseBatch}
                onClick={onCloseBatch}
                type="button"
              >
                <CheckCircle2 size={15} /> Close Batch
              </button>
            ) : null}
            {canRequest ? (
              <button className="secondary-button" onClick={onOpenRequest} type="button">
                <ReceiptText size={15} /> Ajukan Saldo
              </button>
            ) : null}
          </div>
        </div>

        {showPendingCloseWarning ? (
          <div className="alert warning mx-4 mt-3 flex items-start gap-2">
            <AlertTriangle className="mt-0.5 shrink-0" size={16} />
            <span>
              Batch dropping tanggal {pendingCloseBatches.map((row) => formatDate(row.batchDate)).join(', ')} belum ditutup. Mohon close batch sebelumnya sebelum melanjutkan transaksi hari ini.
            </span>
          </div>
        ) : null}

        <div className="grid gap-3 border-b border-slate-100 p-3 md:grid-cols-3">
          <AmountField
            highlight
            label="Sisa Saldo Batch"
            value={normalizedTransactionSummary.balance}
            helper={unresolvedBatchExpenses ? `${unresolvedBatchExpenses} transaksi belum valid` : ''}
          />
          <AmountField label="Total Uang Masuk" value={normalizedTransactionSummary.totalCredit} />
          <AmountField label="Uang Keluar Batch" value={normalizedTransactionSummary.totalDebit} />
        </div>

        {fundLoading || transactionLoading || expenseLoading || batchLoading ? (
          <div className="px-4 py-3 text-xs font-semibold text-slate-500">Memuat rincian batch dropping...</div>
        ) : null}
        {!batchLoading && batchError ? <div className="px-4 py-2 text-xs font-bold text-rose-700">{batchError}</div> : null}
        {!fundLoading && fundError ? <div className="px-4 py-2 text-xs font-bold text-rose-700">{fundError}</div> : null}
        {!transactionLoading && transactionError ? <div className="px-4 py-2 text-xs font-bold text-rose-700">{transactionError}</div> : null}
        {!expenseLoading && expenseError ? <div className="px-4 py-2 text-xs font-bold text-rose-700">{expenseError}</div> : null}
        {!batchLoading && normalizedBatch.status === 'closed' ? (
          <div className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            <span>
              Batch ini sudah ditutup{normalizedBatch.closedByName ? ` oleh ${normalizedBatch.closedByName}` : ''}. Data setelah close terkunci untuk pembukuan harian.
            </span>
            {canReopen ? (
              <button
                className="secondary-button shrink-0"
                disabled={batchBusy}
                onClick={onReopenBatch}
                type="button"
              >
                Buka Kembali Batch
              </button>
            ) : null}
          </div>
        ) : null}

        {!fundLoading && !fundError && pendingFundRows.length ? (
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-xs font-black text-slate-950">Pengajuan Saldo Menunggu Keputusan</h4>
              <StatusPill value={`${normalizedFundSummary.submitted} pengajuan`} />
            </div>
            <div className="grid gap-1.5">
              {pendingFundRows.map((row) => {
                const busy = fundBusyId === row.id;
                return (
                  <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 md:grid-cols-[130px_140px_1fr_150px] md:items-center" key={row.id}>
                    <span className="text-xs font-bold text-slate-700">{row.requestDate}</span>
                    <strong className="text-xs font-black text-slate-950">{formatCurrency(row.amount)}</strong>
                    <span className="text-xs font-medium text-slate-600">{row.purpose}</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button className="h-8 rounded-md bg-emerald-600 px-2 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40" disabled={busy} onClick={() => onApproveFund(row.id)} type="button">Setujui</button>
                      <button className="h-8 rounded-md border border-rose-200 bg-white px-2 text-[10px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40" disabled={busy} onClick={() => onRejectFund(row.id)} type="button">Tolak</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-black text-slate-950">Catatan Saldo</h4>
              <p className="mt-0.5 text-[11px] font-medium text-slate-500">Pencatatan utama: masuk menambah saldo, keluar mengurangi saldo.</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusPill value={`${normalizedTransactionSummary.voidCount} void`} />
              <button
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                disabled={!transactionRows.length}
                onClick={exportTransactionRows}
                type="button"
              >
                <Download size={13} /> Export CSV
              </button>
              <button
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                disabled={!transactionRows.length}
                onClick={exportTransactionPdf}
                type="button"
              >
                <Download size={13} /> Download PDF
              </button>
            </div>
          </div>
          {!transactionLoading && !transactionError && !transactionRows.length ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-500">
              Belum ada catatan saldo pada filter ini.
            </div>
          ) : null}
          {!transactionLoading && !transactionError && transactionRows.length ? (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full min-w-[920px] divide-y divide-slate-200 text-left text-sm">
                <colgroup>
                  <col className="w-[6%]" />
                  <col className="w-[12%]" />
                  <col className="w-[35%]" />
                  <col className="w-[12%]" />
                  <col className="w-[12%]" />
                  <col className="w-[12%]" />
                  <col className="w-[11%]" />
                </colgroup>
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3 text-center">No</th>
                    <th className="whitespace-nowrap px-4 py-3">Tanggal</th>
                    <th className="px-4 py-3">Keterangan</th>
                    <th className="px-4 py-3 text-right">Uang Masuk</th>
                    <th className="px-4 py-3 text-right">Uang Keluar</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                    <th className="px-4 py-3 text-right">Bukti / Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactionRows.map((row, index) => (
                    <tr className="align-middle hover:bg-slate-50/70" key={row.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-xs font-black text-slate-600">{index + 1}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-slate-700">{row.transactionDate}</td>
                      <td className="px-4 py-3">
                        <span className="line-clamp-2 block text-xs font-bold text-slate-900">{row.description}</span>
                        <span className="mt-1 block text-[10px] font-semibold text-slate-500">{operationalFundTransactionCategoryLabel(row) || '-'}</span>
                        <span className="mt-0.5 block text-[10px] font-medium text-slate-400">{row.soNumber || row.containerNumber || operationalFundTransactionTypeLabels[row.transactionType] || '-'}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-emerald-700">{row.moneyIn ? formatCurrency(row.moneyIn) : <span className="text-slate-300">-</span>}</td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-rose-600">{row.moneyOut ? formatCurrency(row.moneyOut) : <span className="text-slate-300">-</span>}</td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-slate-900">{row.runningBalance == null ? '-' : formatCurrency(row.runningBalance)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {row.transferProofs?.length ? (
                            row.transferProofs.map((proof, proofIndex) => <DocumentLink className="inline-flex h-7 items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-[10px] font-bold text-slate-800 hover:bg-slate-50" file={proof} key={proof.id} label={row.transferProofs.length > 1 ? `View ${proofIndex + 1}` : 'View'} />)
                          ) : row.proofAttachment ? (
                          <DocumentLink className="inline-flex h-7 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-[10px] font-bold text-slate-800 hover:bg-slate-50" file={row.proofAttachment} label="View" />
                          ) : (
                          <span className="text-[10px] font-semibold text-slate-400">-</span>
                          )}
                          {canReconcile && row.containerJobExpenseId && row.financeCheckStatus === 'sudah_dicek' && row.batchStatus !== 'closed' ? <button aria-label="Edit transaksi tervalidasi" className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-slate-400 bg-white px-2 text-[10px] font-bold text-slate-800 hover:bg-slate-100" onClick={() => onOpenExpenseCheckConfirm(row.containerJobExpenseId)} title="Edit transaksi tervalidasi" type="button"><Pencil size={12} /> Edit</button> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-100 px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-black text-slate-950">Antrian Validasi Finance</h4>
              <p className="mt-0.5 text-[11px] font-medium text-slate-500">Cek bukti, nominal, dan catatan biaya sebelum batch dropping ditutup.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <StatusPill value={`${expenseQueueCount} menunggu`} />
              <StatusPill value={`${normalizedExpenseSummary.perluKlarifikasi} klarifikasi`} />
            </div>
          </div>
          <div className="mb-3 grid gap-2 md:grid-cols-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="block text-[10px] font-black uppercase tracking-wide text-slate-500">Menunggu Validasi</span>
              <strong className="mt-1 block text-base font-black text-slate-950">{expenseQueueCount} transaksi</strong>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <span className="block text-[10px] font-black uppercase tracking-wide text-amber-700">Belum Ada Bukti</span>
              <strong className="mt-1 block text-base font-black text-amber-900">{expenseNeedProofCount} transaksi</strong>
            </div>
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
              <span className="block text-[10px] font-black uppercase tracking-wide text-rose-700">Perlu Klarifikasi</span>
              <strong className="mt-1 block text-base font-black text-rose-900">{normalizedExpenseSummary.perluKlarifikasi} transaksi</strong>
            </div>
            <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2">
              <span className="block text-[10px] font-black uppercase tracking-wide text-sky-700">Nominal Pending</span>
              <strong className="mt-1 block text-base font-black text-sky-900">{formatCurrency(normalizedExpenseSummary.pendingAmount)}</strong>
            </div>
          </div>
          {!expenseLoading && !expenseError && !expenseRows.length ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-500">
              Tidak ada biaya yang perlu dicek.
            </div>
          ) : null}
          {!expenseLoading && !expenseError && expenseRows.length ? (
            <div className="table-wrap rounded-md border border-slate-200">
              <table className="data-table master-table finance-master-table min-w-[1060px] table-fixed">
                <colgroup>
                  <col className="w-[6%]" />
                  <col className="w-[19%]" />
                  <col className="w-[17%]" />
                  <col className="w-[23%]" />
                  <col className="w-[13%]" />
                  <col className="w-[11%]" />
                  <col className="w-[11%]" />
                </colgroup>
                <thead>
                  <tr>
                    {['No', 'SO / Container', 'Driver', 'Biaya', 'Pembayaran', 'Status', 'Aksi'].map((column) => (
                      <th className={column === 'No' || column === 'Aksi' ? 'text-center' : ''} key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expenseRows.map((row, index) => {
                    const busy = expenseBusyId === row.id;
                    const alreadyChecked = row.financeCheckStatus === 'sudah_dicek';
                    const batchClosed = row.batchStatus === 'closed';
                    return (
                      <tr className="align-middle hover:bg-slate-50" key={row.id}>
                        <td className="px-3 py-2 text-center text-xs font-black text-slate-600">{index + 1}</td>
                        <td className="px-3 py-2">
                          <span className="block text-xs font-black text-slate-950">{row.soNumber}</span>
                          <span className="mt-0.5 block text-[10px] font-semibold text-slate-500">{row.containerNumber} - {row.destination}</span>
                          <span className="mt-0.5 block text-[10px] font-medium text-slate-400">{row.customer}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="block text-xs font-bold text-slate-800">{row.driverName}</span>
                          <span className="mt-0.5 block text-[10px] font-semibold text-slate-500">{row.truck}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="block text-xs font-black text-slate-900">{readableLabel(expenseCategoryLabels, row.category)}</span>
                          <span className="mt-0.5 block text-[11px] font-black text-slate-950">{formatCurrency(row.amount)}</span>
                          <span className="mt-0.5 line-clamp-2 block text-[10px] font-medium text-slate-500">{row.description}</span>
                        </td>
                        <td className="px-3 py-2">
                          <StatusPill value={readableLabel(expensePaymentStatusLabels, row.paymentStatus)} />
                          <span className="mt-1 block text-[10px] font-medium text-slate-500">{row.paidAt || row.createdAt || '-'}</span>
                          {row.proofAttachment ? (
                            <DocumentLink
                              className="mt-1 inline-flex h-7 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                              file={row.proofAttachment}
                              label="Bukti"
                            />
                          ) : row.paymentStatus === 'sudah_dibayar' ? (
                            <span className="mt-1 inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-800">
                              Belum ada bukti
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <StatusPill value={readableLabel(expenseFinanceStatusLabels, row.financeCheckStatus)} />
                          {row.financeCheckStatus === 'belum_dicek' ? (
                            <span className="mt-1 block text-[10px] font-semibold text-slate-500">Normal: menunggu Finance validasi.</span>
                          ) : null}
                          {row.financeNote ? <span className="mt-1 line-clamp-2 block text-[10px] font-medium text-slate-500">{row.financeNote}</span> : null}
                          {alreadyChecked && row.financeCheckedByName ? <span className="mt-1 block text-[10px] font-semibold text-slate-500">Terakhir oleh {row.financeCheckedByName}{row.financeCheckedAt ? `, ${row.financeCheckedAt}` : ''}</span> : null}
                        </td>
                        <td className="px-3 py-2">
                          {canReconcile ? (
                            <div className="grid min-w-[160px] grid-cols-2 gap-1.5">
                              <button
                                className="inline-flex h-8 items-center justify-center rounded-md bg-emerald-600 px-2 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                                disabled={busy || batchClosed}
                                onClick={() => onOpenExpenseCheckConfirm(row.id)}
                                type="button"
                              >
                                {alreadyChecked ? 'Edit' : 'Validasi'}
                              </button>
                              <button
                                className="inline-flex h-8 items-center justify-center rounded-md border border-amber-200 bg-white px-2 text-[10px] font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-40"
                                disabled={busy}
                                onClick={() => onOpenExpenseClarification(row.id)}
                                type="button"
                              >
                                Klarifikasi
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-400">Read only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        {!fundLoading && !transactionLoading && !expenseLoading && !transactionRows.length && !hasActionRows ? (
          <div className="border-t border-slate-100 px-4 py-3 text-xs font-semibold text-slate-500">
            Belum ada pencatatan saldo pada filter ini.
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default DailyOperationalFundPanel;
