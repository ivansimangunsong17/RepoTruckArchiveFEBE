import { useCallback, useEffect, useState } from 'react';
import { getMonthDateRange, normalizeMonthFilterValue } from '../shared/monthFilterUtils';
import {
  INVOICE_TABLE_PAGE_SIZE,
  defaultInvoiceSummary,
  mapUploadedInvoiceDocument,
  mergeInvoiceDocument,
  normalizeFinanceInvoiceRow,
} from '../invoice/invoiceUtils';
import {
  fetchFinanceInvoiceDetail,
  fetchFinanceInvoices,
  updateFinanceInvoiceNumber,
  uploadFinanceInvoiceDocument,
} from '../../../services/finance/financeService';

function useFinanceInvoiceWorkflow({ activeTab, query, initialInvoiceRows }) {
  const [activeInvoiceTab, setActiveInvoiceTab] = useState('need-number');
  const [activeInvoiceDocumentFilter, setActiveInvoiceDocumentFilter] = useState('all');
  const [invoiceFilterMonth, setInvoiceFilterMonth] = useState('');
  const [invoiceDateFrom, setInvoiceDateFrom] = useState('');
  const [invoiceDateTo, setInvoiceDateTo] = useState('');
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [invoiceTotalPages, setInvoiceTotalPages] = useState(1);
  const [invoiceRows, setInvoiceRows] = useState(initialInvoiceRows);
  const [invoiceSummary, setInvoiceSummary] = useState(defaultInvoiceSummary);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');
  const [invoiceBusyId, setInvoiceBusyId] = useState('');
  const [invoiceDocumentBusyKey, setInvoiceDocumentBusyKey] = useState('');
  const [invoiceDocumentUploadError, setInvoiceDocumentUploadError] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [invoiceDetail, setInvoiceDetail] = useState(null);
  const [invoiceDetailLoading, setInvoiceDetailLoading] = useState(false);
  const [invoiceDetailError, setInvoiceDetailError] = useState('');
  const [invoiceConfirmId, setInvoiceConfirmId] = useState('');
  const [invoiceConfirmError, setInvoiceConfirmError] = useState('');

  const selectedInvoiceSummary = invoiceRows.find((row) => row.id === selectedInvoiceId);
  const selectedInvoice = invoiceDetail || selectedInvoiceSummary;
  const invoiceConfirmRow = invoiceRows.find((row) => row.id === invoiceConfirmId);

  const loadInvoiceOrders = useCallback(async () => {
    if (activeTab.id !== 'invoice-number') return;
    setInvoiceLoading(true);
    setInvoiceError('');
    try {
      const result = await fetchFinanceInvoices({
        page: invoicePage,
        pageSize: INVOICE_TABLE_PAGE_SIZE,
        ...(query.trim() ? { query: query.trim() } : {}),
        dateBasis: 'updated',
        ...(invoiceDateFrom ? { dateFrom: invoiceDateFrom } : {}),
        ...(invoiceDateTo ? { dateTo: invoiceDateTo } : {}),
        invoiceDocumentFilter: activeInvoiceTab === 'paid' ? 'all' : activeInvoiceDocumentFilter,
        ...(activeInvoiceTab === 'in-progress' || activeInvoiceTab === 'paid'
          ? { status: activeInvoiceTab }
          : activeInvoiceTab === 'need-number'
            ? { status: activeInvoiceTab }
            : {}),
      });
      setInvoiceRows((result.rows || []).map(normalizeFinanceInvoiceRow));
      const nextInvoiceTotal = Number(result.total ?? result.rows?.length ?? 0);
      const nextInvoiceTotalPages = Math.max(1, Number(result.totalPages || Math.ceil(nextInvoiceTotal / INVOICE_TABLE_PAGE_SIZE) || 1));
      setInvoiceTotal(nextInvoiceTotal);
      setInvoiceTotalPages(nextInvoiceTotalPages);
      if (invoicePage > nextInvoiceTotalPages) setInvoicePage(nextInvoiceTotalPages);
      setInvoiceSummary({
        needNumber: Number(result.summary?.needNumber || 0),
        inProgress: Number(result.summary?.inProgress || 0),
        paid: Number(result.summary?.paid || 0),
        missingInvoiceDocuments: Number(
          result.summary?.missingInvoiceDocuments
          ?? Math.max(
            Number(result.summary?.missingInvoiceDocument || 0),
            Number(result.summary?.missingTaxInvoiceDocument || 0),
          ),
        ),
        missingInvoiceDocument: Number(result.summary?.missingInvoiceDocument || 0),
        missingTaxInvoiceDocument: Number(result.summary?.missingTaxInvoiceDocument || 0),
        completeInvoiceDocuments: Number(result.summary?.completeInvoiceDocuments || 0),
        sentInvoiceDocuments: Number(result.summary?.sentInvoiceDocuments || 0),
      });
    } catch (error) {
      setInvoiceError(error.message || 'Daftar invoice gagal dimuat.');
      setInvoiceRows([]);
      setInvoiceTotal(0);
      setInvoiceTotalPages(1);
      setInvoiceSummary(defaultInvoiceSummary);
    } finally {
      setInvoiceLoading(false);
    }
  }, [activeInvoiceDocumentFilter, activeInvoiceTab, activeTab.id, invoiceDateFrom, invoiceDateTo, invoicePage, query]);

  useEffect(() => {
    loadInvoiceOrders();
  }, [loadInvoiceOrders]);

  useEffect(() => {
    if (!selectedInvoiceId) return undefined;
    let active = true;
    setInvoiceDetail(null);
    setInvoiceDetailLoading(true);
    setInvoiceDetailError('');

    fetchFinanceInvoiceDetail(selectedInvoiceId)
      .then((result) => {
        if (active) setInvoiceDetail(normalizeFinanceInvoiceRow(result));
      })
      .catch((error) => {
        if (active) setInvoiceDetailError(error.message || 'Dokumen detail invoice gagal dimuat.');
      })
      .finally(() => {
        if (active) setInvoiceDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedInvoiceId]);

  const handleInvoiceFilterMonthChange = useCallback((value) => {
    const normalizedValue = normalizeMonthFilterValue(value);
    const range = getMonthDateRange(normalizedValue);
    setInvoiceFilterMonth(normalizedValue);
    setInvoiceDateFrom(range.dateFrom);
    setInvoiceDateTo(range.dateTo);
    setInvoicePage(1);
  }, []);

  const handleInvoiceDateFromChange = useCallback((value) => {
    setInvoiceFilterMonth('');
    setInvoiceDateFrom(value);
    setInvoicePage(1);
  }, []);

  const handleInvoiceDateToChange = useCallback((value) => {
    setInvoiceFilterMonth('');
    setInvoiceDateTo(value);
    setInvoicePage(1);
  }, []);

  const handleResetInvoiceDateFilter = useCallback(() => {
    setInvoiceFilterMonth('');
    setInvoiceDateFrom('');
    setInvoiceDateTo('');
    setInvoicePage(1);
  }, []);

  const handleActiveInvoiceTabChange = useCallback((nextTab) => {
    setActiveInvoiceTab(nextTab);
    setActiveInvoiceDocumentFilter('all');
    setInvoicePage(1);
  }, []);

  const handleActiveInvoiceDocumentFilterChange = useCallback((nextFilter) => {
    setActiveInvoiceDocumentFilter(nextFilter);
    setInvoicePage(1);
  }, []);

  function onSelectInvoice(id) {
    setSelectedInvoiceId(id);
    setInvoiceDetail(null);
    setInvoiceDetailError('');
    setInvoiceDocumentUploadError('');
  }

  function closeInvoiceDetail() {
    setSelectedInvoiceId('');
    setInvoiceDetail(null);
    setInvoiceDetailError('');
    setInvoiceDocumentUploadError('');
  }

  function closeInvoiceConfirmModal() {
    if (invoiceBusyId) return;
    setInvoiceConfirmId('');
    setInvoiceConfirmError('');
  }

  async function submitInvoiceNumber(event) {
    event.preventDefault();
    const row = invoiceRows.find((item) => item.id === invoiceConfirmId);
    const invoiceNumber = String(row?.invoiceNumber || '').trim().toUpperCase();
    if (!invoiceNumber) {
      setInvoiceConfirmError('Nomor invoice wajib diisi sebelum dikirim.');
      return;
    }
    if (invoiceNumber.length < 4) {
      setInvoiceConfirmError('Nomor invoice terlalu pendek. Cek kembali nomor dari dokumen invoice.');
      return;
    }

    setInvoiceBusyId(invoiceConfirmId);
    setInvoiceConfirmError('');
    setInvoiceError('');
    try {
      const saved = await updateFinanceInvoiceNumber(invoiceConfirmId, invoiceNumber);
      const normalized = normalizeFinanceInvoiceRow(saved);
      setInvoiceRows((rows) => rows.map((item) => (item.id === invoiceConfirmId ? normalized : item)));
      setInvoiceConfirmId('');
    } catch (error) {
      setInvoiceConfirmError(error.message || 'Nomor invoice gagal disimpan.');
    } finally {
      setInvoiceBusyId('');
    }
  }

  async function handleUploadInvoiceDocument(id, documentType, file) {
    if (!id || !documentType || !file) return;
    const busyKey = `${id}:${documentType}`;
    setInvoiceDocumentBusyKey(busyKey);
    setInvoiceDocumentUploadError('');
    setInvoiceDetailError('');
    try {
      const saved = await uploadFinanceInvoiceDocument(id, documentType, file);
      const normalized = normalizeFinanceInvoiceRow(saved);
      setInvoiceRows((rows) => rows.map((item) => (item.id === id ? { ...item, ...normalized } : item)));
      const uploadedDocument = mapUploadedInvoiceDocument(saved.uploadedDocument, documentType);
      setInvoiceDetail((current) => {
        const currentDocuments = current?.documents || [];
        const normalizedDocuments = Array.isArray(normalized.documents) && normalized.documents.length
          ? normalized.documents
          : currentDocuments;
        const base = current ? { ...current, ...normalized } : normalized;
        return {
          ...base,
          documents: mergeInvoiceDocument(normalizedDocuments, uploadedDocument),
        };
      });
    } catch (error) {
      setInvoiceDocumentUploadError(error.message || 'Dokumen invoice gagal diupload.');
      throw error;
    } finally {
      setInvoiceDocumentBusyKey('');
    }
  }

  function onInvoiceChange(id, value) {
    setInvoiceRows((rows) => rows.map((row) => (row.id === id ? { ...row, invoiceNumber: value } : row)));
  }

  function onSaveInvoice(id) {
    const row = invoiceRows.find((item) => item.id === id);
    const invoiceNumber = String(row?.invoiceNumber || '').trim().toUpperCase();
    setInvoiceError('');
    setInvoiceConfirmError('');
    if (!invoiceNumber) {
      setInvoiceError('Nomor invoice wajib diisi sebelum dikirim.');
      return;
    }
    if (invoiceNumber.length < 4) {
      setInvoiceError('Nomor invoice terlalu pendek. Cek kembali nomor dari dokumen invoice.');
      return;
    }
    setInvoiceRows((rows) => rows.map((item) => (item.id === id ? { ...item, invoiceNumber } : item)));
    setInvoiceConfirmId(id);
  }

  function applyInvoiceNumberCorrection(id, value) {
    setInvoiceRows((rows) => rows.map((row) => (row.id === id ? { ...row, invoiceNumber: value } : row)));
    setInvoiceDetail((detail) => (detail?.id === id ? { ...detail, invoiceNumber: value } : detail));
  }

  function resetInvoiceWorkflow() {
    setInvoiceRows(initialInvoiceRows);
    setInvoiceSummary(defaultInvoiceSummary);
    setSelectedInvoiceId('');
  }

  return {
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
    selectedInvoiceId,
    selectedInvoice,
    invoiceDetail,
    invoiceDetailLoading,
    invoiceDetailError,
    invoiceConfirmId,
    invoiceConfirmError,
    invoiceConfirmRow,
    setInvoicePage,
    handleActiveInvoiceTabChange,
    handleActiveInvoiceDocumentFilterChange,
    handleInvoiceFilterMonthChange,
    handleInvoiceDateFromChange,
    handleInvoiceDateToChange,
    handleResetInvoiceDateFilter,
    onSelectInvoice,
    closeInvoiceDetail,
    closeInvoiceConfirmModal,
    submitInvoiceNumber,
    handleUploadInvoiceDocument,
    onInvoiceChange,
    onSaveInvoice,
    loadInvoiceOrders,
    applyInvoiceNumberCorrection,
    resetInvoiceWorkflow,
  };
}

export default useFinanceInvoiceWorkflow;
