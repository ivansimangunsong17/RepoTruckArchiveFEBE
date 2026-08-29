import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  ReceiptText,
  RotateCcw,
} from 'lucide-react';
import DetailField from './shared/DetailField';
import FinanceActionModal from './shared/FinanceActionModal';
import SearchBar from './shared/SearchBar';
import DailyOperationalFundPanel from './dropping-account/DailyOperationalFundPanel';
import ExpenseCheckConfirmModal from './dropping-account/ExpenseCheckConfirmModal';
import ExpenseReconciliationModal from './dropping-account/ExpenseReconciliationModal';
import OperationalFundCloseBatchModal from './dropping-account/OperationalFundCloseBatchModal';
import OperationalFundReopenBatchModal from './dropping-account/OperationalFundReopenBatchModal';
import OperationalFundDecisionModal from './dropping-account/OperationalFundDecisionModal';
import OperationalFundDepositValidationModal from './dropping-account/OperationalFundDepositValidationModal';
import OperationalFundRequestModal from './dropping-account/OperationalFundRequestModal';
import OrderDetailModal from './order-verification/OrderDetailModal';
import OrderVerificationTable from './order-verification/OrderVerificationTable';
import SoNumberInputModal from './order-verification/SoNumberInputModal';
import InvoiceDetailModal from './invoice/InvoiceDetailModal';
import InvoiceNumberConfirmModal from './invoice/InvoiceNumberConfirmModal';
import InvoiceTable from './invoice/InvoiceTable';
import { useAuth } from '../../hooks/useAuth';
import { hasPermission } from '../../constants/roles';
import useFinanceCorrectionWorkflow from './hooks/useFinanceCorrectionWorkflow';
import useFinanceInvoiceWorkflow from './hooks/useFinanceInvoiceWorkflow';
import useFinanceOperationalFund from './hooks/useFinanceOperationalFund';
import useFinanceOrderVerification from './hooks/useFinanceOrderVerification';

const financeTabs = [
  {
    id: 'order-verification',
    label: 'Verifikasi Order',
    icon: CheckCircle2,
    badge: 'Sales Order',
    description: 'Lihat request order yang akan dijalankan, lalu input Nomor SO resmi dari Accurate agar bisa dicari dan diproses.',
    statusFlow: ['Request Order Masuk', 'Input Nomor SO Accurate', 'Siap Diproses Operational'],
  },
  {
    id: 'rpuj-approval',
    label: 'Rekening Dropping',
    icon: ReceiptText,
    badge: 'Operational',
    description: 'Pantau pemakaian saldo operasional harian dari mutasi biaya lapangan dan rekonsiliasi Finance D+1.',
    statusFlow: ['Saldo Harian', 'Mutasi Penggunaan', 'Rekonsiliasi D+1'],
  },
  {
    id: 'invoice-number',
    label: 'Input Nomor Invoice',
    icon: FileText,
    badge: 'Billing',
    description: 'Menampilkan SO selesai yang datanya belum lengkap, yang sudah lengkap tapi menunggu pelunasan, dan yang sudah lunas.',
    statusFlow: ['Belum Lengkap', 'Menunggu Pembayaran', 'Lunas'],
  },
];

const initialOrderRows = [
  {
    id: 'ord-001',
    orderDate: '16 Jul 2026',
    salesName: 'Sinta Sales',
    customer: 'DPW (PT PAHALA BAHARI NUSANTARA)',
    customerPic: 'Budi Santoso',
    customerPhone: '021-7788-1200',
    destination: 'Karawang',
    orderType: 'Import',
    paymentTerms: 'Credit 14 Hari',
    runningDate: '17 Jul 2026',
    container: '2 x 20FT',
    vesselName: 'MV Meratus Jayakarta',
    terminal: 'UTC-2',
    depo: 'MTCON',
    document: 'DO-DPW-1607.pdf',
    notes: 'Prioritas jalan besok pagi. Customer minta update setelah keluar terminal.',
    status: 'Menunggu No. SO Accurate',
    soNumber: '',
  },
  {
    id: 'ord-002',
    orderDate: '16 Jul 2026',
    salesName: 'Sinta Sales',
    customer: 'PT Sumber Logistik',
    customerPic: 'Nadia Putri',
    customerPhone: '021-5211-8800',
    destination: 'Cikarang',
    orderType: 'Export',
    paymentTerms: 'Cash Basis',
    runningDate: '16 Jul 2026',
    container: '1 x 40FT',
    vesselName: 'MV Tanto Bersinar',
    terminal: 'NPCT1',
    depo: 'Depo Sumber Jaya',
    document: 'DO-SLG-018.pdf',
    notes: 'Stuffing sore, gate in maksimal malam.',
    status: 'No. SO Terisi',
    soNumber: 'SO-202607-018',
  },
  {
    id: 'ord-003',
    orderDate: '15 Jul 2026',
    salesName: 'Admin Demo',
    customer: 'PT Global Makmur',
    customerPic: 'Putri Lestari',
    customerPhone: '022-6655-1100',
    destination: 'Bandung',
    orderType: 'Import',
    paymentTerms: 'Credit 30 Hari',
    runningDate: '18 Jul 2026',
    container: '1 x 20FT, 1 x 40FT',
    vesselName: 'MV Tanto Sejahtera',
    terminal: 'JICT',
    depo: 'MTCON',
    document: '-',
    notes: 'Menunggu konfirmasi final DO dari customer.',
    status: 'Menunggu No. SO Accurate',
    soNumber: '',
  },
];

const initialInvoiceRows = [
  {
    id: 'inv-001',
    soNumber: 'SO-202607-014',
    customer: 'PT Mitra Kimia',
    destination: 'Tangerang',
    completedAt: '15 Jul 2026',
    documentStatus: 'Siap Ditagihkan',
    billingAmount: 1500000,
    paymentTerms: 'Credit 14 Hari',
    invoiceDate: '-',
    dueDate: '-',
    billingItems: ['Jasa Angkut D20 - 1 ritase'],
    documentChecklist: [
      { label: 'Nomor SO', ready: true },
      { label: 'Job selesai', ready: true },
      { label: 'Surat Jalan', ready: true },
      { label: 'Bon Muat/Bongkar', ready: true },
      { label: 'TILA/Gatepass', ready: true },
    ],
    activityLogs: ['15 Jul 2026 16:20 - Operational menyelesaikan job', '15 Jul 2026 17:05 - Dokumen ditandai siap tagih'],
    invoiceNumber: '',
    invoiceStatus: 'Butuh Nomor Invoice',
    paymentStatus: '-',
  },
  {
    id: 'inv-002',
    soNumber: 'SO-202607-013',
    customer: 'PT Cipta Retail',
    destination: 'Cibitung',
    completedAt: '14 Jul 2026',
    documentStatus: 'Siap Ditagihkan',
    billingAmount: 2200000,
    paymentTerms: 'Credit 30 Hari',
    invoiceDate: '15 Jul 2026',
    dueDate: '14 Agu 2026',
    billingItems: ['Jasa Angkut D40 - 1 ritase', 'Handling'],
    documentChecklist: [
      { label: 'Nomor SO', ready: true },
      { label: 'Job selesai', ready: true },
      { label: 'Surat Jalan', ready: true },
      { label: 'Bon Muat/Bongkar', ready: true },
      { label: 'TILA/Gatepass', ready: true },
    ],
    activityLogs: ['14 Jul 2026 14:40 - Job selesai', '15 Jul 2026 09:15 - Finance input nomor invoice', '15 Jul 2026 10:05 - Menunggu update pengiriman invoice dari Sales'],
    invoiceNumber: 'INV-202607-009',
    invoiceStatus: 'Menunggu Update Status',
    paymentStatus: 'Menunggu Pembayaran',
  },
  {
    id: 'inv-003',
    soNumber: 'SO-202607-012',
    customer: 'PT Mayora Indah',
    destination: 'Bekasi',
    completedAt: '14 Jul 2026',
    documentStatus: 'Siap Ditagihkan',
    billingAmount: 1750000,
    paymentTerms: 'Cash Basis',
    invoiceDate: '14 Jul 2026',
    dueDate: '14 Jul 2026',
    billingItems: ['Jasa Angkut D20 - 1 ritase', 'Jasa Lainnya - Waiting time'],
    documentChecklist: [
      { label: 'Nomor SO', ready: true },
      { label: 'Job selesai', ready: true },
      { label: 'Surat Jalan', ready: true },
      { label: 'Bon Muat/Bongkar', ready: true },
      { label: 'TILA/Gatepass', ready: true },
    ],
    activityLogs: ['14 Jul 2026 11:00 - Finance input nomor invoice', '14 Jul 2026 16:30 - Pembayaran diterima dan ditandai lunas'],
    invoiceNumber: 'INV-202607-008',
    invoiceStatus: 'Lunas',
    paymentStatus: 'Lunas',
  },
  {
    id: 'inv-004',
    soNumber: 'SO-202607-011',
    customer: 'PT Global Makmur',
    destination: 'Bandung',
    completedAt: '13 Jul 2026',
    documentStatus: 'Siap Ditagihkan',
    billingAmount: 2850000,
    paymentTerms: 'Credit 30 Hari',
    invoiceDate: '-',
    dueDate: '-',
    billingItems: ['Jasa Angkut D20 - 1 ritase', 'Jasa Angkut D40 - 1 ritase'],
    documentChecklist: [
      { label: 'Nomor SO', ready: true },
      { label: 'Job selesai', ready: true },
      { label: 'Surat Jalan', ready: true },
      { label: 'Bon Muat/Bongkar', ready: true },
      { label: 'TILA/Gatepass', ready: true },
    ],
    activityLogs: ['13 Jul 2026 18:10 - Semua container selesai', '13 Jul 2026 19:00 - Dokumen siap invoice'],
    invoiceNumber: '',
    invoiceStatus: 'Butuh Nomor Invoice',
    paymentStatus: '-',
  },
];

function StatusFlow({ items }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, index) => (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600" key={item}>
          <span className="grid h-4 w-4 place-items-center rounded bg-slate-100 text-[9px] text-slate-500">{index + 1}</span>
          {item}
        </span>
      ))}
    </div>
  );
}


function FinanceCorrectionModal({ context, value, reason, error, busy, onValueChange, onReasonChange, onClose, onConfirm }) {
  if (!context) return null;
  const isInvoice = context.type === 'invoice_number';
  const currentValue = isInvoice ? context.invoiceNumber : context.soNumber;
  const targetLabel = isInvoice ? 'Nomor Invoice Baru' : 'Nomor SO Baru';

  return (
    <FinanceActionModal
      busy={busy}
      confirmLabel="Ajukan Koreksi"
      description={isInvoice ? 'Nomor invoice resmi akan masuk approval Admin.' : 'Jika order sudah sensitif, koreksi nomor SO akan masuk approval Admin.'}
      onClose={onClose}
      onConfirm={onConfirm}
      title={isInvoice ? 'Koreksi Nomor Invoice' : 'Koreksi Nomor SO'}
      tone="upload"
    >
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <div className="flex gap-2.5">
          <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={18} />
          <div>
            <strong className="block text-xs text-amber-900">Koreksi harus punya alasan yang jelas.</strong>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-amber-800">Nomor lama, nomor baru, user, waktu, dan alasan akan masuk riwayat koreksi.</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DetailField label="Nomor SO" value={context.soNumber} />
        <DetailField label="Customer" value={context.customer} />
        <DetailField label={isInvoice ? 'Invoice Saat Ini' : 'SO Saat Ini'} value={currentValue || '-'} />
        <DetailField label="Tujuan" value={context.destination} />
      </div>
      <label className="grid gap-1.5 text-xs font-bold text-slate-700">
        {targetLabel}
        <input
          autoFocus
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-bold uppercase text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
          maxLength={80}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={isInvoice ? 'Contoh: INV-202607-001' : 'Contoh: SO-202607-019'}
          value={value}
        />
      </label>
      <label className="grid gap-1.5 text-xs font-bold text-slate-700">
        Alasan Koreksi <span className="font-semibold text-rose-600">Wajib diisi</span>
        <textarea
          className="min-h-24 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
          maxLength={500}
          onChange={(event) => onReasonChange(event.target.value)}
          placeholder="Jelaskan kenapa nomor perlu dikoreksi..."
          value={reason}
        />
        <small className="justify-self-end font-medium text-slate-400">{reason.length}/500</small>
      </label>
      {error ? <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
    </FinanceActionModal>
  );
}


function FinanceTable({
  activeTab,
  activeInvoiceTab,
  activeInvoiceDocumentFilter,
  onActiveOrderTabChange,
  onActiveInvoiceTabChange,
  onActiveInvoiceDocumentFilterChange,
  orderFilterMonth,
  orderDateFrom,
  orderDateTo,
  invoiceFilterMonth,
  invoiceDateFrom,
  invoiceDateTo,
  onOrderFilterMonthChange,
  onOrderDateFromChange,
  onOrderDateToChange,
  onResetOrderDateFilter,
  onInvoiceFilterMonthChange,
  onInvoiceDateFromChange,
  onInvoiceDateToChange,
  onResetInvoiceDateFilter,
  query,
  onQueryChange,
  onReset,
  orderRows,
  operationalFundBatch,
  pendingCloseBatches,
  operationalFundBatchDate,
  operationalFundBatchLoading,
  operationalFundBatchError,
  operationalFundBatchBusy,
  operationalFundRows,
  operationalFundTransactionRows,
  expenseReconciliationRows,
  invoiceRows,
  activeOrderTab,
  orderSummary,
  orderPage,
  orderTotal,
  orderTotalPages,
  operationalFundSummary,
  operationalFundTransactionSummary,
  expenseReconciliationSummary,
  invoiceSummary,
  invoicePage,
  invoiceTotal,
  invoiceTotalPages,
  orderError,
  orderLoading,
  operationalFundError,
  operationalFundLoading,
  operationalFundBusyId,
  canRequestOperationalFund,
  canDepositOperationalFund,
  canReopenOperationalFundBatch,
  operationalFundTransactionError,
  operationalFundTransactionLoading,
  expenseReconciliationError,
  expenseReconciliationLoading,
  expenseReconciliationBusyId,
  invoiceError,
  invoiceLoading,
  onInvoicePageChange,
  onOrderPageChange,
  savingSoId,
  handlers,
}) {
  const isOrderVerification = activeTab.id === 'order-verification';
  const isRpujApproval = activeTab.id === 'rpuj-approval';
  const isInvoiceNumber = activeTab.id === 'invoice-number';

  return (
    <section className="finance-workflow-panel overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="mb-1 inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-500">
              {activeTab.badge}
            </div>
            <h2 className="text-sm font-black text-slate-950">{activeTab.label}</h2>
            {!isRpujApproval && !isOrderVerification ? (
              <p className="mt-0.5 max-w-3xl text-[11px] font-medium text-slate-500">{activeTab.description}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500">
              <Clock3 size={13} /> {isOrderVerification || isRpujApproval || isInvoiceNumber ? 'Data Finance API' : 'Data simulasi meeting'}
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-50" onClick={onReset} type="button">
              <RotateCcw size={13} /> {isOrderVerification || isRpujApproval || isInvoiceNumber ? 'Refresh' : 'Reset'}
            </button>
          </div>
        </div>

        {activeTab.id !== 'invoice-number' && activeTab.id !== 'order-verification' && !isRpujApproval ? (
          <div className="mt-1.5">
            <StatusFlow items={activeTab.statusFlow} />
          </div>
        ) : null}
      </div>

      {isOrderVerification ? null : (
        <div className="border-b border-slate-200 px-2.5 py-1.5">
          <SearchBar query={query} onChange={onQueryChange} />
        </div>
      )}

      {isOrderVerification && orderError ? (
        <div className="border-b border-rose-100 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700">{orderError}</div>
      ) : null}

      {isOrderVerification && orderLoading ? (
        <div className="border-b border-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500">Memuat data verifikasi order...</div>
      ) : null}

      {activeTab.id === 'invoice-number' && invoiceError ? (
        <div className="border-b border-rose-100 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700">{invoiceError}</div>
      ) : null}

      {activeTab.id === 'invoice-number' && invoiceLoading ? (
        <div className="border-b border-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500">Memuat daftar invoice...</div>
      ) : null}

      {activeTab.id === 'order-verification' ? (
        <OrderVerificationTable
          onOrderDateFromChange={onOrderDateFromChange}
          onOrderDateToChange={onOrderDateToChange}
          onOrderFilterMonthChange={onOrderFilterMonthChange}
          onActiveOrderTabChange={onActiveOrderTabChange}
          onPageChange={onOrderPageChange}
          onQueryChange={onQueryChange}
          onResetOrderDateFilter={onResetOrderDateFilter}
          activeOrderTab={activeOrderTab}
          currentPage={orderPage}
          orderDateFrom={orderDateFrom}
          orderDateTo={orderDateTo}
          orderFilterMonth={orderFilterMonth}
          query={query}
          rows={orderRows}
          savingSoId={savingSoId}
          summary={orderSummary}
          total={orderTotal}
          totalPages={orderTotalPages}
          {...handlers}
        />
      ) : null}
      {activeTab.id === 'rpuj-approval' ? (
        <DailyOperationalFundPanel
          batch={operationalFundBatch}
          batchBusy={operationalFundBatchBusy}
          batchDate={operationalFundBatchDate}
          batchError={operationalFundBatchError}
          batchLoading={operationalFundBatchLoading}
          canRequest={canRequestOperationalFund}
          canDeposit={canDepositOperationalFund}
          canReopen={canReopenOperationalFundBatch}
          pendingCloseBatches={pendingCloseBatches}
          expenseBusyId={expenseReconciliationBusyId}
          expenseError={expenseReconciliationError}
          expenseLoading={expenseReconciliationLoading}
          expenseRows={expenseReconciliationRows}
          expenseSummary={expenseReconciliationSummary}
          fundBusyId={operationalFundBusyId}
          fundError={operationalFundError}
          fundLoading={operationalFundLoading}
          fundRows={operationalFundRows}
          fundSummary={operationalFundSummary}
          onApproveFund={handlers.onApproveOperationalFund}
          onBatchDateChange={handlers.onOperationalFundBatchDateChange}
          onCloseBatch={handlers.onCloseOperationalFundBatch}
          onReopenBatch={handlers.onReopenOperationalFundBatch}
          onOpenExpenseCheckConfirm={handlers.onOpenExpenseCheckConfirm}
          onOpenExpenseClarification={handlers.onOpenExpenseClarification}
          onOpenRequest={handlers.onOpenOperationalFundRequest}
          onOpenDeposit={handlers.onOpenOperationalFundDeposit}
          onRejectFund={handlers.onRejectOperationalFund}
          transactionError={operationalFundTransactionError}
          transactionLoading={operationalFundTransactionLoading}
          transactionRows={operationalFundTransactionRows}
          transactionSummary={operationalFundTransactionSummary}
        />
      ) : null}
      {activeTab.id === 'invoice-number' ? (
        <InvoiceTable
          activeInvoiceDocumentFilter={activeInvoiceDocumentFilter}
          activeInvoiceTab={activeInvoiceTab}
          currentPage={invoicePage}
          onInvoicePageChange={onInvoicePageChange}
          onActiveInvoiceDocumentFilterChange={onActiveInvoiceDocumentFilterChange}
          onActiveInvoiceTabChange={onActiveInvoiceTabChange}
          onInvoiceDateFromChange={onInvoiceDateFromChange}
          onInvoiceDateToChange={onInvoiceDateToChange}
          onInvoiceFilterMonthChange={onInvoiceFilterMonthChange}
          onResetInvoiceDateFilter={onResetInvoiceDateFilter}
          invoiceDateFrom={invoiceDateFrom}
          invoiceDateTo={invoiceDateTo}
          invoiceFilterMonth={invoiceFilterMonth}
          query={query}
          rows={invoiceRows}
          summary={invoiceSummary}
          total={invoiceTotal}
          totalPages={invoiceTotalPages}
          {...handlers}
        />
      ) : null}
    </section>
  );
}

function FinanceWorkflowPage({ initialTabId = 'order-verification' }) {

  const { user } = useAuth();
  const canRequestOperationalFund = hasPermission(user, 'finance.operational_fund.request');
  const canDepositOperationalFund = hasPermission(user, 'finance.operational_fund.deposit');
  const canVoidDebitNotePayment = hasPermission(user, 'finance.debit_note.payment.void');
  const canReopenOperationalFundBatch = hasPermission(user, 'finance.operational_fund.reopen');
  const [query, setQuery] = useState('');
  const activeTab = useMemo(
    () => financeTabs.find((tab) => tab.id === initialTabId) || financeTabs[0],
    [initialTabId],
  );

  const orderVerification = useFinanceOrderVerification({ activeTab, query, initialOrderRows });
  const invoiceWorkflow = useFinanceInvoiceWorkflow({ activeTab, query, initialInvoiceRows });
  const operationalFund = useFinanceOperationalFund({
    activeTab,
    query,
    canRequestOperationalFund,
    canDepositOperationalFund,
  });
  const correctionWorkflow = useFinanceCorrectionWorkflow({
    selectedOrderId: orderVerification.selectedOrderId,
    selectedInvoiceId: invoiceWorkflow.selectedInvoiceId,
    onSoNumberApplied: orderVerification.applySoNumberCorrection,
    onInvoiceNumberApplied: invoiceWorkflow.applyInvoiceNumberCorrection,
  });

  const {
    activeOrderTab,
    orderFilterMonth,
    orderDateFrom,
    orderDateTo,
    orderPage,
    orderTotal,
    orderTotalPages,
    orderRows,
    orderSummary,
    orderLoading,
    orderError,
    savingSoId,
    selectedOrder,
    soModalId,
    soModalValue,
    soModalError,
    soModalOrder,
    setOrderPage,
    handleActiveOrderTabChange,
    handleOrderFilterMonthChange,
    handleOrderDateFromChange,
    handleOrderDateToChange,
    handleResetOrderDateFilter,
    closeSoModal,
    handleSoModalValueChange,
    saveSoNumberFromModal,
  } = orderVerification;

  const {
    activeInvoiceTab,
    activeInvoiceDocumentFilter,
    invoiceFilterMonth,
    invoiceDateFrom,
    invoiceDateTo,
    invoicePage,
    invoiceTotal,
    invoiceTotalPages,
    invoiceRows,
    invoiceSummary,
    invoiceLoading,
    invoiceError,
    invoiceBusyId,
    invoiceDocumentBusyKey,
    invoiceDocumentUploadError,
    selectedInvoice,
    invoiceDetailLoading,
    invoiceDetailError,
    invoiceConfirmId,
    invoiceConfirmError,
    invoiceConfirmRow,
    debitNoteNumberSaving,
    debitNoteNumberError,
    debitNotePayments,
    debitNotePaymentsLoading,
    debitNotePaymentSaving,
    debitNotePaymentError,
    debitNotePaymentVoidBusyId,
    debitNotePaymentVoidError,
    submitDebitNoteNumber,
    loadDebitNotePayments,
    confirmDebitNotePayment,
    voidDebitNotePayment,
    setInvoicePage,
    handleActiveInvoiceTabChange,
    handleActiveInvoiceDocumentFilterChange,
    handleInvoiceFilterMonthChange,
    handleInvoiceDateFromChange,
    handleInvoiceDateToChange,
    handleResetInvoiceDateFilter,
    closeInvoiceConfirmModal,
    submitInvoiceNumber,
    handleUploadInvoiceDocument,
  } = invoiceWorkflow;

  const {
    operationalFundBatchDate,
    operationalFundBatch,
    pendingCloseBatches,
    operationalFundRows,
    operationalFundTransactionRows,
    expenseReconciliationRows,
    operationalFundSummary,
    operationalFundTransactionSummary,
    expenseReconciliationSummary,
    operationalFundLoading,
    operationalFundError,
    operationalFundBatchLoading,
    operationalFundBatchError,
    operationalFundBatchBusy,
    operationalFundBusyId,
    operationalFundTransactionLoading,
    operationalFundTransactionError,
    expenseReconciliationLoading,
    expenseReconciliationError,
    expenseReconciliationBusyId,
    operationalFundRequestOpen,
    operationalFundRequestMode,
    operationalFundRequestForm,
    operationalFundDepositValidationOpen,
    operationalFundCloseValidationOpen,
    operationalFundReopenValidationOpen,
    operationalFundReopenReason,
    operationalFundRequestError,
    operationalFundDecision,
    operationalFundDecisionNote,
    operationalFundDecisionError,
    operationalFundDecisionRow,
    expenseReconciliationDecisionId,
    expenseReconciliationNote,
    expenseReconciliationDecisionError,
    expenseReconciliationDecisionRow,
    expenseCheckConfirmId,
    expenseCheckConfirmRow,
    handleOperationalFundRequestFormChange,
    submitOperationalFundRequest,
    closeOperationalFundRequestModal,
    closeOperationalFundDepositValidationModal,
    confirmOperationalFundDeposit,
    closeOperationalFundDecisionModal,
    handleOperationalFundDecisionNoteChange,
    submitOperationalFundDecision,
    closeExpenseReconciliationModal,
    handleExpenseReconciliationNoteChange,
    submitExpenseClarification,
    closeExpenseCheckConfirmModal,
    confirmExpenseChecked,
    closeOperationalFundCloseValidationModal,
    confirmCloseOperationalFundBatch,
    openOperationalFundReopenValidationModal,
    closeOperationalFundReopenValidationModal,
    handleOperationalFundReopenReasonChange,
    confirmReopenOperationalFundBatch,
  } = operationalFund;

  const {
    correctionHistory,
    correctionHistoryLoading,
    correctionHistoryError,
    correctionModal,
    correctionValue,
    correctionReason,
    correctionError,
    correctionBusy,
    openCorrectionModal,
    closeCorrectionModal,
    handleCorrectionValueChange,
    handleCorrectionReasonChange,
    submitCorrection,
  } = correctionWorkflow;

  function handleQueryChange(value) {
    setQuery(value);
    if (activeTab.id === 'order-verification') setOrderPage(1);
    if (activeTab.id === 'invoice-number') setInvoicePage(1);
  }

  function resetSimulation() {
    if (activeTab.id === 'order-verification') {
      orderVerification.loadOrderVerifications();
      return;
    }
    if (activeTab.id === 'rpuj-approval') {
      operationalFund.reloadAll();
      return;
    }
    if (activeTab.id === 'invoice-number') {
      invoiceWorkflow.loadInvoiceOrders();
      return;
    }
    operationalFund.resetOperationalFund();
    invoiceWorkflow.resetInvoiceWorkflow();
    orderVerification.closeOrderDetail();
    invoiceWorkflow.closeInvoiceDetail();
    setQuery('');
  }

  const handlers = {
    onOpenSoModal: orderVerification.onOpenSoModal,
    onSelectOrder: orderVerification.onSelectOrder,
    onSelectInvoice: invoiceWorkflow.onSelectInvoice,
    onOpenOperationalFundRequest: operationalFund.openOperationalFundRequestModal,
    onOpenOperationalFundDeposit: operationalFund.openOperationalFundDepositModal,
    onOperationalFundBatchDateChange: operationalFund.handleOperationalFundBatchDateChange,
    onCloseOperationalFundBatch: operationalFund.openOperationalFundCloseValidationModal,
    onReopenOperationalFundBatch: operationalFund.openOperationalFundReopenValidationModal,
    onApproveOperationalFund: (id) => operationalFund.openOperationalFundDecision(id, 'approve'),
    onRejectOperationalFund: (id) => operationalFund.openOperationalFundDecision(id, 'reject'),
    onOpenExpenseCheckConfirm: operationalFund.openExpenseCheckConfirm,
    onOpenExpenseClarification: operationalFund.openExpenseClarification,
  };
  return (
    <main className="finance-workflow-page min-h-screen bg-slate-50 px-3 py-3 text-slate-900">
      <FinanceTable
        activeInvoiceDocumentFilter={activeInvoiceDocumentFilter}
        activeInvoiceTab={activeInvoiceTab}
        activeOrderTab={activeOrderTab}
        activeTab={activeTab}
        handlers={handlers}
        invoiceDateFrom={invoiceDateFrom}
        invoiceDateTo={invoiceDateTo}
        invoiceError={invoiceError}
        invoiceFilterMonth={invoiceFilterMonth}
        invoiceLoading={invoiceLoading}
        invoicePage={invoicePage}
        invoiceRows={invoiceRows}
        invoiceSummary={invoiceSummary}
        invoiceTotal={invoiceTotal}
        invoiceTotalPages={invoiceTotalPages}
        operationalFundBusyId={operationalFundBusyId}
        operationalFundBatch={operationalFundBatch}
        pendingCloseBatches={pendingCloseBatches}
        operationalFundBatchBusy={operationalFundBatchBusy}
        operationalFundBatchDate={operationalFundBatchDate}
        operationalFundBatchError={operationalFundBatchError}
        operationalFundBatchLoading={operationalFundBatchLoading}
        canRequestOperationalFund={canRequestOperationalFund}
        canDepositOperationalFund={canDepositOperationalFund}
        canReopenOperationalFundBatch={canReopenOperationalFundBatch}
        operationalFundError={operationalFundError}
        operationalFundLoading={operationalFundLoading}
        operationalFundRows={operationalFundRows}
        operationalFundSummary={operationalFundSummary}
        operationalFundTransactionError={operationalFundTransactionError}
        operationalFundTransactionLoading={operationalFundTransactionLoading}
        operationalFundTransactionRows={operationalFundTransactionRows}
        operationalFundTransactionSummary={operationalFundTransactionSummary}
        expenseReconciliationBusyId={expenseReconciliationBusyId}
        expenseReconciliationError={expenseReconciliationError}
        expenseReconciliationLoading={expenseReconciliationLoading}
        expenseReconciliationRows={expenseReconciliationRows}
        expenseReconciliationSummary={expenseReconciliationSummary}
        onActiveInvoiceDocumentFilterChange={handleActiveInvoiceDocumentFilterChange}
        onActiveInvoiceTabChange={handleActiveInvoiceTabChange}
        onActiveOrderTabChange={handleActiveOrderTabChange}
        onInvoiceDateFromChange={handleInvoiceDateFromChange}
        onInvoiceDateToChange={handleInvoiceDateToChange}
        onInvoiceFilterMonthChange={handleInvoiceFilterMonthChange}
        onInvoicePageChange={setInvoicePage}
        onOrderPageChange={setOrderPage}
        onOrderDateFromChange={handleOrderDateFromChange}
        onOrderDateToChange={handleOrderDateToChange}
        onOrderFilterMonthChange={handleOrderFilterMonthChange}
        onReset={resetSimulation}
        onResetInvoiceDateFilter={handleResetInvoiceDateFilter}
        onResetOrderDateFilter={handleResetOrderDateFilter}
        onQueryChange={handleQueryChange}
        orderDateFrom={orderDateFrom}
        orderDateTo={orderDateTo}
        orderError={orderError}
        orderFilterMonth={orderFilterMonth}
        orderLoading={orderLoading}
        orderPage={orderPage}
        orderRows={orderRows}
        orderSummary={orderSummary}
        orderTotal={orderTotal}
        orderTotalPages={orderTotalPages}
        query={query}
        savingSoId={savingSoId}
      />

      <OrderDetailModal
        corrections={correctionHistory}
        correctionsError={correctionHistoryError}
        correctionsLoading={correctionHistoryLoading}
        onClose={orderVerification.closeOrderDetail}
        onOpenCorrection={openCorrectionModal}
        order={selectedOrder}
      />
      <InvoiceDetailModal
        corrections={correctionHistory}
        correctionsError={correctionHistoryError}
        correctionsLoading={correctionHistoryLoading}
        debitNoteNumberSaving={debitNoteNumberSaving}
        debitNoteNumberError={debitNoteNumberError}
        debitNotePayments={debitNotePayments}
        debitNotePaymentsLoading={debitNotePaymentsLoading}
        debitNotePaymentSaving={debitNotePaymentSaving}
        debitNotePaymentError={debitNotePaymentError}
        canVoidDebitNotePayment={canVoidDebitNotePayment}
        debitNotePaymentVoidBusyId={debitNotePaymentVoidBusyId}
        debitNotePaymentVoidError={debitNotePaymentVoidError}
        error={invoiceDetailError}
        invoice={selectedInvoice}
        invoiceDocumentBusyKey={invoiceDocumentBusyKey}
        invoiceDocumentUploadError={invoiceDocumentUploadError}
        invoiceNumberSaving={Boolean(selectedInvoice) && invoiceBusyId === selectedInvoice.id}
        loading={invoiceDetailLoading}
        onClose={invoiceWorkflow.closeInvoiceDetail}
        onOpenCorrection={openCorrectionModal}
        onUploadInvoiceDocument={handleUploadInvoiceDocument}
        onSaveDebitNoteNumber={submitDebitNoteNumber}
        onLoadDebitNotePayments={loadDebitNotePayments}
        onConfirmDebitNotePayment={confirmDebitNotePayment}
        onVoidDebitNotePayment={voidDebitNotePayment}
        onSaveInvoiceNumber={invoiceWorkflow.onSaveInvoice}
      />
      <SoNumberInputModal
        busy={savingSoId === soModalId}
        error={soModalError}
        onChange={handleSoModalValueChange}
        onClose={closeSoModal}
        onConfirm={saveSoNumberFromModal}
        order={soModalOrder}
        value={soModalValue}
      />
      {operationalFundRequestOpen && !operationalFundDepositValidationOpen ? (
        <OperationalFundRequestModal
          busy={operationalFundBusyId === 'new'}
          error={operationalFundRequestError}
          mode={operationalFundRequestMode}
          onChange={handleOperationalFundRequestFormChange}
          onClose={closeOperationalFundRequestModal}
          onConfirm={submitOperationalFundRequest}
          value={operationalFundRequestForm}
        />
      ) : null}
      {operationalFundDepositValidationOpen ? (
        <OperationalFundDepositValidationModal
          busy={operationalFundBusyId === 'new'}
          onClose={closeOperationalFundDepositValidationModal}
          onConfirm={confirmOperationalFundDeposit}
          value={operationalFundRequestForm}
        />
      ) : null}
      {operationalFundCloseValidationOpen ? (
        <OperationalFundCloseBatchModal
          batch={operationalFundBatch}
          busy={operationalFundBatchBusy}
          onClose={closeOperationalFundCloseValidationModal}
          onConfirm={confirmCloseOperationalFundBatch}
          summary={operationalFundTransactionSummary}
        />
      ) : null}
      {operationalFundReopenValidationOpen ? (
        <OperationalFundReopenBatchModal
          batch={operationalFundBatch}
          busy={operationalFundBatchBusy}
          error={operationalFundBatchError}
          reason={operationalFundReopenReason}
          onClose={closeOperationalFundReopenValidationModal}
          onConfirm={confirmReopenOperationalFundBatch}
          onReasonChange={handleOperationalFundReopenReasonChange}
        />
      ) : null}
      <OperationalFundDecisionModal
        busy={operationalFundBusyId === operationalFundDecision?.id}
        decision={operationalFundDecision?.type}
        error={operationalFundDecisionError}
        note={operationalFundDecisionNote}
        onClose={closeOperationalFundDecisionModal}
        onConfirm={submitOperationalFundDecision}
        onNoteChange={handleOperationalFundDecisionNoteChange}
        row={operationalFundDecisionRow}
      />
      <ExpenseReconciliationModal
        busy={expenseReconciliationBusyId === expenseReconciliationDecisionId}
        error={expenseReconciliationDecisionError}
        note={expenseReconciliationNote}
        onClose={closeExpenseReconciliationModal}
        onConfirm={submitExpenseClarification}
        onNoteChange={handleExpenseReconciliationNoteChange}
        row={expenseReconciliationDecisionRow}
      />
      <ExpenseCheckConfirmModal
        busy={expenseReconciliationBusyId === expenseCheckConfirmId}
        error={expenseReconciliationError}
        onClose={closeExpenseCheckConfirmModal}
        onConfirm={confirmExpenseChecked}
        row={expenseCheckConfirmRow}
      />
      <InvoiceNumberConfirmModal
        busy={invoiceBusyId === invoiceConfirmId}
        error={invoiceConfirmError}
        onClose={closeInvoiceConfirmModal}
        onConfirm={submitInvoiceNumber}
        row={invoiceConfirmRow}
      />
      <FinanceCorrectionModal
        busy={correctionBusy}
        context={correctionModal}
        error={correctionError}
        onClose={closeCorrectionModal}
        onConfirm={submitCorrection}
        onReasonChange={handleCorrectionReasonChange}
        onValueChange={handleCorrectionValueChange}
        reason={correctionReason}
        value={correctionValue}
      />
    </main>
  );
}

export default FinanceWorkflowPage;
