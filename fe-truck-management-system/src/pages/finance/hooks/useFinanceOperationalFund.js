import { useCallback, useEffect, useState } from 'react';
import {
  approveOperationalFundRequest,
  closeOperationalFundBatch,
  createOperationalFundRequest,
  depositOperationalFund,
  fetchFinanceContainerJobExpenses,
  fetchOperationalFundBatches,
  fetchOperationalFundRequests,
  fetchOperationalFundTransactions,
  rejectOperationalFundRequest,
  reconcileFinanceContainerJobExpense,
  reopenOperationalFundBatch,
} from '../../../services/finance/financeService';
import {
  defaultExpenseReconciliationSummary,
  defaultOperationalFundBatch,
  defaultOperationalFundSummary,
  defaultOperationalFundTransactionSummary,
  normalizeExpenseReconciliationRow,
  normalizeOperationalFundBatchRow,
  normalizeOperationalFundRequestRow,
  normalizeOperationalFundTransactionRow,
} from '../dropping-account/operationalFundUtils';

const EXPENSE_RECONCILIATION_PAGE_SIZE = 50;
const OPERATIONAL_FUND_TRANSACTION_PAGE_SIZE = 50;

function useFinanceOperationalFund({ activeTab, query, canRequestOperationalFund, canDepositOperationalFund }) {
  const todayDate = new Date().toISOString().slice(0, 10);
  const [operationalFundBatchDate, setOperationalFundBatchDate] = useState(todayDate);
  const [operationalFundBatch, setOperationalFundBatch] = useState(defaultOperationalFundBatch);
  const [pendingCloseBatches, setPendingCloseBatches] = useState([]);
  const [operationalFundRows, setOperationalFundRows] = useState([]);
  const [operationalFundTransactionRows, setOperationalFundTransactionRows] = useState([]);
  const [expenseReconciliationRows, setExpenseReconciliationRows] = useState([]);
  const [operationalFundSummary, setOperationalFundSummary] = useState(defaultOperationalFundSummary);
  const [operationalFundTransactionSummary, setOperationalFundTransactionSummary] = useState(defaultOperationalFundTransactionSummary);
  const [expenseReconciliationSummary, setExpenseReconciliationSummary] = useState(defaultExpenseReconciliationSummary);
  const [operationalFundLoading, setOperationalFundLoading] = useState(false);
  const [operationalFundError, setOperationalFundError] = useState('');
  const [operationalFundBatchLoading, setOperationalFundBatchLoading] = useState(false);
  const [operationalFundBatchError, setOperationalFundBatchError] = useState('');
  const [operationalFundBatchBusy, setOperationalFundBatchBusy] = useState(false);
  const [operationalFundBusyId, setOperationalFundBusyId] = useState('');
  const [operationalFundTransactionLoading, setOperationalFundTransactionLoading] = useState(false);
  const [operationalFundTransactionError, setOperationalFundTransactionError] = useState('');
  const [expenseReconciliationLoading, setExpenseReconciliationLoading] = useState(false);
  const [expenseReconciliationError, setExpenseReconciliationError] = useState('');
  const [expenseReconciliationBusyId, setExpenseReconciliationBusyId] = useState('');
  const [operationalFundRequestOpen, setOperationalFundRequestOpen] = useState(false);
  const [operationalFundRequestMode, setOperationalFundRequestMode] = useState('request');
  const [operationalFundRequestForm, setOperationalFundRequestForm] = useState({
    requestDate: new Date().toISOString().slice(0, 10),
    amount: '',
    purpose: '',
    proofFile: null,
    proofFileError: '',
  });
  const [operationalFundDepositValidationOpen, setOperationalFundDepositValidationOpen] = useState(false);
  const [operationalFundCloseValidationOpen, setOperationalFundCloseValidationOpen] = useState(false);
  const [operationalFundReopenValidationOpen, setOperationalFundReopenValidationOpen] = useState(false);
  const [operationalFundReopenReason, setOperationalFundReopenReason] = useState('');
  const [operationalFundRequestError, setOperationalFundRequestError] = useState('');
  const [operationalFundDecision, setOperationalFundDecision] = useState(null);
  const [operationalFundDecisionNote, setOperationalFundDecisionNote] = useState('');
  const [operationalFundDecisionError, setOperationalFundDecisionError] = useState('');
  const [expenseReconciliationDecisionId, setExpenseReconciliationDecisionId] = useState('');
  const [expenseReconciliationNote, setExpenseReconciliationNote] = useState('');
  const [expenseReconciliationDecisionError, setExpenseReconciliationDecisionError] = useState('');
  const [expenseCheckConfirmId, setExpenseCheckConfirmId] = useState('');

  const operationalFundDecisionRow = operationalFundRows.find((row) => row.id === operationalFundDecision?.id);
  const expenseReconciliationDecisionRow = expenseReconciliationRows.find((row) => row.id === expenseReconciliationDecisionId);
  const expenseCheckConfirmRow = expenseReconciliationRows.find((row) => row.id === expenseCheckConfirmId);

  const loadOperationalFundBatch = useCallback(async () => {
    if (activeTab.id !== 'rpuj-approval') return;
    setOperationalFundBatchLoading(true);
    setOperationalFundBatchError('');
    try {
      const result = await fetchOperationalFundBatches({
        page: 1,
        pageSize: 1,
        dateFrom: operationalFundBatchDate,
        dateTo: operationalFundBatchDate,
      });
      const batch = (result.rows || [])[0];
      setOperationalFundBatch(batch ? normalizeOperationalFundBatchRow(batch) : {
        ...defaultOperationalFundBatch,
        batchDate: operationalFundBatchDate,
        status: 'open',
      });
    } catch (error) {
      setOperationalFundBatch({ ...defaultOperationalFundBatch, batchDate: operationalFundBatchDate, status: 'open' });
      setOperationalFundBatchError(error.message || 'Batch rekening dropping gagal dimuat.');
    } finally {
      setOperationalFundBatchLoading(false);
    }
  }, [activeTab.id, operationalFundBatchDate]);

  useEffect(() => {
    loadOperationalFundBatch();
  }, [loadOperationalFundBatch]);

  const loadPendingCloseBatches = useCallback(async () => {
    if (activeTab.id !== 'rpuj-approval' || operationalFundBatchDate !== todayDate) {
      setPendingCloseBatches([]);
      return;
    }
    try {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const result = await fetchOperationalFundBatches({ page: 1, pageSize: 10, dateTo: yesterday });
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      setPendingCloseBatches(rows.filter((row) => row.status && row.status !== 'closed'));
    } catch {
      setPendingCloseBatches([]);
    }
  }, [activeTab.id, operationalFundBatchDate, todayDate]);

  useEffect(() => {
    loadPendingCloseBatches();
  }, [loadPendingCloseBatches]);

  const loadOperationalFundRequests = useCallback(async () => {
    if (activeTab.id !== 'rpuj-approval') return;
    setOperationalFundLoading(true);
    setOperationalFundError('');
    try {
      const result = await fetchOperationalFundRequests({
        page: 1,
        pageSize: 8,
        ...(query.trim() ? { query: query.trim() } : {}),
      });
      setOperationalFundRows((result.rows || []).map(normalizeOperationalFundRequestRow));
      setOperationalFundSummary({
        submitted: Number(result.summary?.submitted || 0),
        approved: Number(result.summary?.approved || 0),
        transferred: Number(result.summary?.transferred || 0),
        rejected: Number(result.summary?.rejected || 0),
        approvedAmount: Number(result.summary?.approvedAmount || 0),
        transferredAmount: Number(result.summary?.transferredAmount || 0),
      });
    } catch (error) {
      setOperationalFundRows([]);
      setOperationalFundSummary(defaultOperationalFundSummary);
      setOperationalFundError(error.message || 'Pengajuan saldo operasional gagal dimuat.');
    } finally {
      setOperationalFundLoading(false);
    }
  }, [activeTab.id, query]);

  useEffect(() => {
    loadOperationalFundRequests();
  }, [loadOperationalFundRequests]);

  const loadOperationalFundTransactions = useCallback(async () => {
    if (activeTab.id !== 'rpuj-approval') return;
    setOperationalFundTransactionLoading(true);
    setOperationalFundTransactionError('');
    try {
      const result = await fetchOperationalFundTransactions({
        page: 1,
        pageSize: OPERATIONAL_FUND_TRANSACTION_PAGE_SIZE,
        batchDate: operationalFundBatchDate,
        ...(query.trim() ? { query: query.trim() } : {}),
      });
      setOperationalFundTransactionRows((result.rows || []).map(normalizeOperationalFundTransactionRow));
      setOperationalFundTransactionSummary({
        totalCredit: Number(result.summary?.totalCredit || 0),
        totalDebit: Number(result.summary?.totalDebit || 0),
        totalAdjustment: Number(result.summary?.totalAdjustment || 0),
        balance: Number(result.summary?.balance || 0),
        creditCount: Number(result.summary?.creditCount || 0),
        debitCount: Number(result.summary?.debitCount || 0),
        voidCount: Number(result.summary?.voidCount || 0),
      });
    } catch (error) {
      setOperationalFundTransactionRows([]);
      setOperationalFundTransactionSummary(defaultOperationalFundTransactionSummary);
      setOperationalFundTransactionError(error.message || 'Mutasi rekening dropping gagal dimuat.');
    } finally {
      setOperationalFundTransactionLoading(false);
    }
  }, [activeTab.id, operationalFundBatchDate, query]);

  useEffect(() => {
    loadOperationalFundTransactions();
  }, [loadOperationalFundTransactions]);

  const loadExpenseReconciliation = useCallback(async () => {
    if (activeTab.id !== 'rpuj-approval') return;
    setExpenseReconciliationLoading(true);
    setExpenseReconciliationError('');
    try {
      const result = await fetchFinanceContainerJobExpenses({
        page: 1,
        pageSize: EXPENSE_RECONCILIATION_PAGE_SIZE,
        financeCheckStatus: 'open',
        dateFrom: operationalFundBatchDate,
        dateTo: operationalFundBatchDate,
        ...(query.trim() ? { query: query.trim() } : {}),
      });
      setExpenseReconciliationRows((result.rows || []).map(normalizeExpenseReconciliationRow));
      setExpenseReconciliationSummary({
        belumDicek: Number(result.summary?.belumDicek || 0),
        sudahDicek: Number(result.summary?.sudahDicek || 0),
        perluKlarifikasi: Number(result.summary?.perluKlarifikasi || 0),
        dikoreksi: Number(result.summary?.dikoreksi || 0),
        totalAmount: Number(result.summary?.totalAmount || 0),
        pendingAmount: Number(result.summary?.pendingAmount || 0),
      });
    } catch (error) {
      setExpenseReconciliationRows([]);
      setExpenseReconciliationSummary(defaultExpenseReconciliationSummary);
      setExpenseReconciliationError(error.message || 'Transaksi biaya D+1 gagal dimuat.');
    } finally {
      setExpenseReconciliationLoading(false);
    }
  }, [activeTab.id, operationalFundBatchDate, query]);

  useEffect(() => {
    loadExpenseReconciliation();
  }, [loadExpenseReconciliation]);

  function handleOperationalFundBatchDateChange(value) {
    setOperationalFundBatchDate(value || new Date().toISOString().slice(0, 10));
  }

  function openOperationalFundRequestModal() {
    if (!canRequestOperationalFund) return;
    setOperationalFundRequestOpen(true);
    setOperationalFundRequestMode('request');
    setOperationalFundRequestForm({
      requestDate: operationalFundBatchDate,
      amount: '',
      purpose: '',
      proofFile: null,
      proofFileError: '',
    });
    setOperationalFundRequestError('');
  }

  function openOperationalFundDepositModal() {
    if (!canDepositOperationalFund) return;
    setOperationalFundRequestOpen(true);
    setOperationalFundRequestMode('deposit');
    setOperationalFundRequestForm({
      requestDate: operationalFundBatchDate,
      amount: '',
      purpose: 'Deposit saldo operasional harian dari Finance',
      proofFile: null,
      proofFileError: '',
    });
    setOperationalFundRequestError('');
  }

  function closeOperationalFundRequestModal() {
    if (operationalFundBusyId === 'new') return;
    setOperationalFundRequestOpen(false);
    setOperationalFundDepositValidationOpen(false);
    setOperationalFundRequestError('');
  }

  function handleOperationalFundRequestFormChange(value) {
    setOperationalFundRequestForm(value);
    setOperationalFundRequestError('');
  }

  function validateOperationalFundRequestForm() {
    const amount = Number(operationalFundRequestForm.amount || 0);
    if (!operationalFundRequestForm.requestDate) {
      setOperationalFundRequestError(operationalFundRequestMode === 'deposit' ? 'Tanggal deposit wajib diisi.' : 'Tanggal pengajuan wajib diisi.');
      return null;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setOperationalFundRequestError('Nominal saldo wajib lebih dari 0.');
      return null;
    }
    if (operationalFundRequestMode === 'deposit' && !String(operationalFundRequestForm.purpose || '').trim()) {
      setOperationalFundRequestError('Keterangan deposit wajib diisi agar pencatatan saldo jelas.');
      return null;
    }
    if (operationalFundRequestMode === 'deposit' && operationalFundRequestForm.proofFileError) {
      setOperationalFundRequestError(operationalFundRequestForm.proofFileError);
      return null;
    }
    if (operationalFundRequestMode === 'deposit' && !operationalFundRequestForm.proofFile) {
      setOperationalFundRequestError('Bukti transfer deposit wajib diupload.');
      return null;
    }
    setOperationalFundRequestError('');
    const payload = {
      requestDate: operationalFundRequestForm.requestDate,
      amount,
      purpose: operationalFundRequestForm.purpose,
    };
    if (operationalFundRequestMode === 'deposit') payload.proofFile = operationalFundRequestForm.proofFile;
    return payload;
  }

  function submitOperationalFundRequest(event) {
    event.preventDefault();
    const payload = validateOperationalFundRequestForm();
    if (!payload) return;
    if (operationalFundRequestMode === 'deposit') {
      setOperationalFundDepositValidationOpen(true);
      return;
    }
    saveOperationalFundRequest(payload);
  }

  async function saveOperationalFundRequest(payload) {
    setOperationalFundBusyId('new');
    setOperationalFundRequestError('');
    setOperationalFundError('');
    setOperationalFundTransactionError('');
    try {
      if (operationalFundRequestMode === 'deposit') {
        await depositOperationalFund(payload);
      } else {
        await createOperationalFundRequest(payload);
      }
      setOperationalFundRequestOpen(false);
      setOperationalFundDepositValidationOpen(false);
      setOperationalFundBatchDate(payload.requestDate);
      await loadOperationalFundBatch();
      await loadOperationalFundRequests();
      await loadOperationalFundTransactions();
      await loadExpenseReconciliation();
    } catch (error) {
      setOperationalFundRequestError(error.message || (operationalFundRequestMode === 'deposit' ? 'Deposit saldo operasional gagal dicatat.' : 'Pengajuan saldo operasional gagal dibuat.'));
    } finally {
      setOperationalFundBusyId('');
    }
  }

  function closeOperationalFundDepositValidationModal() {
    if (operationalFundBusyId === 'new') return;
    setOperationalFundDepositValidationOpen(false);
  }

  function confirmOperationalFundDeposit(event) {
    event.preventDefault();
    const payload = validateOperationalFundRequestForm();
    if (!payload) {
      setOperationalFundDepositValidationOpen(false);
      return;
    }
    saveOperationalFundRequest(payload);
  }

  function closeOperationalFundDecisionModal() {
    if (operationalFundBusyId) return;
    setOperationalFundDecision(null);
    setOperationalFundDecisionNote('');
    setOperationalFundDecisionError('');
  }

  function openOperationalFundDecision(id, type) {
    setOperationalFundDecision({ id, type });
    setOperationalFundDecisionNote('');
    setOperationalFundDecisionError('');
  }

  function handleOperationalFundDecisionNoteChange(value) {
    setOperationalFundDecisionNote(value);
    setOperationalFundDecisionError('');
  }

  async function submitOperationalFundDecision(event) {
    event.preventDefault();
    if (!operationalFundDecision?.id) return;
    const isReject = operationalFundDecision.type === 'reject';
    const rejectionNote = operationalFundDecisionNote.trim();
    if (isReject && !rejectionNote) {
      setOperationalFundDecisionError('Catatan reject wajib diisi.');
      return;
    }

    setOperationalFundBusyId(operationalFundDecision.id);
    setOperationalFundDecisionError('');
    setOperationalFundError('');
    try {
      if (isReject) {
        await rejectOperationalFundRequest(operationalFundDecision.id, rejectionNote);
      } else {
        await approveOperationalFundRequest(operationalFundDecision.id);
      }
      setOperationalFundDecision(null);
      setOperationalFundDecisionNote('');
      await loadOperationalFundRequests();
    } catch (error) {
      setOperationalFundDecisionError(error.message || (isReject ? 'Saldo operasional gagal ditolak.' : 'Saldo operasional gagal disetujui.'));
    } finally {
      setOperationalFundBusyId('');
    }
  }

  function closeExpenseReconciliationModal() {
    if (expenseReconciliationBusyId) return;
    setExpenseReconciliationDecisionId('');
    setExpenseReconciliationNote('');
    setExpenseReconciliationDecisionError('');
  }

  function openExpenseClarification(id) {
    setExpenseReconciliationDecisionId(id);
    setExpenseReconciliationNote('');
    setExpenseReconciliationDecisionError('');
  }

  function handleExpenseReconciliationNoteChange(value) {
    setExpenseReconciliationNote(value);
    setExpenseReconciliationDecisionError('');
  }

  async function markExpenseChecked(id) {
    setExpenseReconciliationBusyId(id);
    setExpenseReconciliationError('');
    try {
      await reconcileFinanceContainerJobExpense(id, {
        financeCheckStatus: 'sudah_dicek',
        financeNote: '',
      });
      setExpenseCheckConfirmId('');
      await loadExpenseReconciliation();
      await loadOperationalFundBatch();
      await loadOperationalFundTransactions();
    } catch (error) {
      setExpenseReconciliationError(error.message || 'Status cek transaksi biaya gagal disimpan.');
    } finally {
      setExpenseReconciliationBusyId('');
    }
  }

  function openExpenseCheckConfirm(id) {
    setExpenseReconciliationError('');
    setExpenseCheckConfirmId(id);
  }

  function closeExpenseCheckConfirmModal() {
    if (expenseReconciliationBusyId) return;
    setExpenseCheckConfirmId('');
  }

  function confirmExpenseChecked(event) {
    event.preventDefault();
    if (!expenseCheckConfirmId) return undefined;
    return markExpenseChecked(expenseCheckConfirmId);
  }

  async function submitExpenseClarification(event) {
    event.preventDefault();
    const note = expenseReconciliationNote.trim();
    if (!expenseReconciliationDecisionId || !note) {
      setExpenseReconciliationDecisionError('Catatan klarifikasi wajib diisi.');
      return;
    }

    setExpenseReconciliationBusyId(expenseReconciliationDecisionId);
    setExpenseReconciliationDecisionError('');
    setExpenseReconciliationError('');
    try {
      await reconcileFinanceContainerJobExpense(expenseReconciliationDecisionId, {
        financeCheckStatus: 'perlu_klarifikasi',
        financeNote: note,
      });
      setExpenseReconciliationDecisionId('');
      setExpenseReconciliationNote('');
      await loadExpenseReconciliation();
      await loadOperationalFundBatch();
      await loadOperationalFundTransactions();
    } catch (error) {
      setExpenseReconciliationDecisionError(error.message || 'Klarifikasi transaksi biaya gagal dikirim.');
    } finally {
      setExpenseReconciliationBusyId('');
    }
  }

  function openOperationalFundCloseValidationModal() {
    if (!operationalFundBatch.id || operationalFundBatchBusy) return;
    setOperationalFundBatchError('');
    setOperationalFundCloseValidationOpen(true);
  }

  function closeOperationalFundCloseValidationModal() {
    if (operationalFundBatchBusy) return;
    setOperationalFundCloseValidationOpen(false);
  }

  async function confirmCloseOperationalFundBatch(event) {
    event.preventDefault();
    if (!operationalFundBatch.id || operationalFundBatchBusy) return;
    setOperationalFundBatchBusy(true);
    setOperationalFundBatchError('');
    try {
      const result = await closeOperationalFundBatch(operationalFundBatch.id, {
        closeNote: `Close batch dropping ${operationalFundBatch.batchDate || operationalFundBatchDate}`,
      });
      setOperationalFundBatch(normalizeOperationalFundBatchRow(result));
      setOperationalFundCloseValidationOpen(false);
      await loadOperationalFundBatch();
      await loadOperationalFundTransactions();
      await loadExpenseReconciliation();
      await loadPendingCloseBatches();
    } catch (error) {
      setOperationalFundBatchError(error.message || 'Batch rekening dropping gagal ditutup.');
    } finally {
      setOperationalFundBatchBusy(false);
    }
  }

  function openOperationalFundReopenValidationModal() {
    if (!operationalFundBatch.id || operationalFundBatchBusy) return;
    setOperationalFundBatchError('');
    setOperationalFundReopenReason('');
    setOperationalFundReopenValidationOpen(true);
  }

  function closeOperationalFundReopenValidationModal() {
    if (operationalFundBatchBusy) return;
    setOperationalFundReopenValidationOpen(false);
    setOperationalFundReopenReason('');
  }

  function handleOperationalFundReopenReasonChange(event) {
    setOperationalFundReopenReason(event.target.value);
  }

  async function confirmReopenOperationalFundBatch(event) {
    event.preventDefault();
    if (!operationalFundBatch.id || operationalFundBatchBusy) return;
    const reason = String(operationalFundReopenReason || '').trim();
    if (!reason) {
      setOperationalFundBatchError('Alasan membuka kembali batch wajib diisi.');
      return;
    }
    setOperationalFundBatchBusy(true);
    setOperationalFundBatchError('');
    try {
      const result = await reopenOperationalFundBatch(operationalFundBatch.id, reason);
      setOperationalFundBatch(normalizeOperationalFundBatchRow(result));
      setOperationalFundReopenValidationOpen(false);
      setOperationalFundReopenReason('');
      await loadOperationalFundBatch();
      await loadOperationalFundTransactions();
      await loadExpenseReconciliation();
      await loadPendingCloseBatches();
    } catch (error) {
      setOperationalFundBatchError(error.message || 'Batch rekening dropping gagal dibuka kembali.');
    } finally {
      setOperationalFundBatchBusy(false);
    }
  }

  function reloadAll() {
    loadOperationalFundBatch();
    loadPendingCloseBatches();
    loadOperationalFundRequests();
    loadOperationalFundTransactions();
    loadExpenseReconciliation();
  }

  function resetOperationalFund() {
    setOperationalFundRows([]);
    setOperationalFundSummary(defaultOperationalFundSummary);
    setOperationalFundTransactionRows([]);
    setOperationalFundTransactionSummary(defaultOperationalFundTransactionSummary);
    setExpenseReconciliationRows([]);
    setExpenseReconciliationSummary(defaultExpenseReconciliationSummary);
  }

  return {
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
    handleOperationalFundBatchDateChange,
    openOperationalFundRequestModal,
    openOperationalFundDepositModal,
    closeOperationalFundRequestModal,
    handleOperationalFundRequestFormChange,
    submitOperationalFundRequest,
    closeOperationalFundDepositValidationModal,
    confirmOperationalFundDeposit,
    closeOperationalFundDecisionModal,
    openOperationalFundDecision,
    handleOperationalFundDecisionNoteChange,
    submitOperationalFundDecision,
    closeExpenseReconciliationModal,
    openExpenseClarification,
    handleExpenseReconciliationNoteChange,
    markExpenseChecked,
    openExpenseCheckConfirm,
    closeExpenseCheckConfirmModal,
    confirmExpenseChecked,
    submitExpenseClarification,
    openOperationalFundCloseValidationModal,
    closeOperationalFundCloseValidationModal,
    confirmCloseOperationalFundBatch,
    openOperationalFundReopenValidationModal,
    closeOperationalFundReopenValidationModal,
    handleOperationalFundReopenReasonChange,
    confirmReopenOperationalFundBatch,
    loadOperationalFundBatch,
    loadOperationalFundRequests,
    loadOperationalFundTransactions,
    loadExpenseReconciliation,
    reloadAll,
    resetOperationalFund,
  };
}

export default useFinanceOperationalFund;
