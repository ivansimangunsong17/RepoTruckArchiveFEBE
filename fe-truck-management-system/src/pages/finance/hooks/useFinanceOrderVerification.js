import { useCallback, useEffect, useState } from 'react';
import { getMonthDateRange, normalizeMonthFilterValue } from '../shared/monthFilterUtils';
import { ORDER_TABLE_PAGE_SIZE, normalizeFinanceOrderRow, orderVerificationStatusParam } from '../order-verification/orderVerificationUtils';
import { fetchFinanceOrderVerifications, updateFinanceOrderSoNumber } from '../../../services/finance/financeService';

function useFinanceOrderVerification({ activeTab, query, initialOrderRows }) {
  const [activeOrderTab, setActiveOrderTab] = useState('need-so');
  const [orderFilterMonth, setOrderFilterMonth] = useState('');
  const [orderDateFrom, setOrderDateFrom] = useState('');
  const [orderDateTo, setOrderDateTo] = useState('');
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderTotalPages, setOrderTotalPages] = useState(1);
  const [orderRows, setOrderRows] = useState(initialOrderRows);
  const [orderSummary, setOrderSummary] = useState(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [savingSoId, setSavingSoId] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [soModalId, setSoModalId] = useState('');
  const [soModalValue, setSoModalValue] = useState('');
  const [soModalError, setSoModalError] = useState('');

  const selectedOrder = orderRows.find((row) => row.id === selectedOrderId);
  const soModalOrder = orderRows.find((row) => row.id === soModalId);

  const loadOrderVerifications = useCallback(async () => {
    if (activeTab.id !== 'order-verification') return;
    setOrderLoading(true);
    setOrderError('');
    try {
      const result = await fetchFinanceOrderVerifications({
        page: orderPage,
        pageSize: ORDER_TABLE_PAGE_SIZE,
        status: orderVerificationStatusParam(activeOrderTab),
        ...(query.trim() ? { query: query.trim() } : {}),
        ...(orderDateFrom ? { dateFrom: orderDateFrom } : {}),
        ...(orderDateTo ? { dateTo: orderDateTo } : {}),
      });
      setOrderRows((result.rows || []).map(normalizeFinanceOrderRow));
      const nextOrderTotal = Number(result.total ?? result.rows?.length ?? 0);
      const nextOrderTotalPages = Math.max(1, Number(result.totalPages || Math.ceil(nextOrderTotal / ORDER_TABLE_PAGE_SIZE) || 1));
      setOrderTotal(nextOrderTotal);
      setOrderTotalPages(nextOrderTotalPages);
      if (orderPage > nextOrderTotalPages) setOrderPage(nextOrderTotalPages);
      setOrderSummary(result.summary ? {
        pendingSo: Number(result.summary.pendingSo || 0),
        verified: Number(result.summary.verified || 0),
        cancelled: Number(result.summary.cancelled || 0),
      } : null);
    } catch (error) {
      setOrderError(error.message || 'Data verifikasi order gagal dimuat.');
      setOrderRows([]);
      setOrderTotal(0);
      setOrderTotalPages(1);
      setOrderSummary(null);
    } finally {
      setOrderLoading(false);
    }
  }, [activeOrderTab, activeTab.id, orderDateFrom, orderDateTo, orderPage, query]);

  useEffect(() => {
    loadOrderVerifications();
  }, [loadOrderVerifications]);

  const handleOrderFilterMonthChange = useCallback((value) => {
    const normalizedValue = normalizeMonthFilterValue(value);
    const range = getMonthDateRange(normalizedValue);
    setOrderFilterMonth(normalizedValue);
    setOrderDateFrom(range.dateFrom);
    setOrderDateTo(range.dateTo);
    setOrderPage(1);
  }, []);

  const handleOrderDateFromChange = useCallback((value) => {
    setOrderFilterMonth('');
    setOrderDateFrom(value);
    setOrderPage(1);
  }, []);

  const handleOrderDateToChange = useCallback((value) => {
    setOrderFilterMonth('');
    setOrderDateTo(value);
    setOrderPage(1);
  }, []);

  const handleResetOrderDateFilter = useCallback(() => {
    setOrderFilterMonth('');
    setOrderDateFrom('');
    setOrderDateTo('');
    setOrderPage(1);
  }, []);

  const handleActiveOrderTabChange = useCallback((nextTab) => {
    setActiveOrderTab(nextTab);
    setOrderPage(1);
  }, []);

  function onSelectOrder(id) {
    setSelectedOrderId(id);
  }

  function closeOrderDetail() {
    setSelectedOrderId('');
  }

  function onOpenSoModal(id) {
    const row = orderRows.find((item) => item.id === id);
    setSoModalId(id);
    setSoModalValue(row?.soNumberDraft || row?.soNumber || '');
    setSoModalError('');
  }

  function closeSoModal() {
    if (savingSoId) return;
    setSoModalId('');
    setSoModalValue('');
    setSoModalError('');
  }

  function handleSoModalValueChange(value) {
    setSoModalValue(value);
    setSoModalError('');
  }

  async function saveSoNumberFromModal(event) {
    event.preventDefault();
    const soNumber = String(soModalValue || '').trim().toUpperCase();
    if (!soNumber) {
      setSoModalError('Nomor SO Accurate wajib diisi.');
      return;
    }

    setSavingSoId(soModalId);
    setSoModalError('');
    setOrderError('');
    try {
      const saved = await updateFinanceOrderSoNumber(soModalId, soNumber);
      const normalized = normalizeFinanceOrderRow(saved);
      setOrderRows((rows) => rows.map((item) => (item.id === soModalId ? normalized : item)));
      setSoModalId('');
      setSoModalValue('');
    } catch (error) {
      setSoModalError(error.message || 'Nomor SO Accurate gagal disimpan.');
    } finally {
      setSavingSoId('');
    }
  }

  function applySoNumberCorrection(id, value) {
    setOrderRows((rows) => rows.map((row) => (row.id === id ? { ...row, soNumber: value, soNumberDraft: value } : row)));
  }

  return {
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
    selectedOrderId,
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
    onSelectOrder,
    closeOrderDetail,
    onOpenSoModal,
    closeSoModal,
    handleSoModalValueChange,
    saveSoNumberFromModal,
    loadOrderVerifications,
    applySoNumberCorrection,
  };
}

export default useFinanceOrderVerification;
