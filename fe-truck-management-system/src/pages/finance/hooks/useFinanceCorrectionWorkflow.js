import { useEffect, useState } from 'react';
import {
  fetchFinanceInvoiceCorrections,
  fetchFinanceOrderCorrections,
  requestFinanceInvoiceCorrection,
  requestFinanceOrderSoCorrection,
} from '../../../services/finance/financeService';

function formatDisplayDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function normalizeFinanceCorrection(row = {}) {
  return {
    id: row.id,
    salesOrderId: row.salesOrderId || row.sales_order_id || '',
    correctionType: row.correctionType || row.correction_type || '',
    currentValue: row.currentValue || row.current_value || '-',
    requestedValue: row.requestedValue || row.requested_value || '-',
    reason: row.reason || '-',
    status: row.status || 'pending',
    requiresAdminApproval: Boolean(row.requiresAdminApproval ?? row.requires_admin_approval),
    requestedByName: row.requestedByName || row.requested_by_name || '-',
    requestedAt: formatDisplayDate(row.requestedAt || row.requested_at),
    reviewedByName: row.reviewedByName || row.reviewed_by_name || '',
    reviewedAt: formatDisplayDate(row.reviewedAt || row.reviewed_at),
    reviewNote: row.reviewNote || row.review_note || '',
  };
}

function useFinanceCorrectionWorkflow({ selectedOrderId, selectedInvoiceId, onSoNumberApplied, onInvoiceNumberApplied }) {
  const [correctionHistory, setCorrectionHistory] = useState([]);
  const [correctionHistoryLoading, setCorrectionHistoryLoading] = useState(false);
  const [correctionHistoryError, setCorrectionHistoryError] = useState('');
  const [correctionModal, setCorrectionModal] = useState(null);
  const [correctionValue, setCorrectionValue] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionError, setCorrectionError] = useState('');
  const [correctionBusy, setCorrectionBusy] = useState(false);

  useEffect(() => {
    const targetId = selectedOrderId || selectedInvoiceId;
    if (!targetId) {
      setCorrectionHistory([]);
      setCorrectionHistoryError('');
      setCorrectionHistoryLoading(false);
      return undefined;
    }

    let active = true;
    setCorrectionHistory([]);
    setCorrectionHistoryError('');
    setCorrectionHistoryLoading(true);
    const request = selectedInvoiceId ? fetchFinanceInvoiceCorrections(targetId) : fetchFinanceOrderCorrections(targetId);
    request
      .then((result) => {
        if (active) setCorrectionHistory((Array.isArray(result) ? result : result.rows || []).map(normalizeFinanceCorrection));
      })
      .catch((error) => {
        if (active) setCorrectionHistoryError(error.message || 'Riwayat koreksi gagal dimuat.');
      })
      .finally(() => {
        if (active) setCorrectionHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedOrderId, selectedInvoiceId]);

  function openCorrectionModal(row, type) {
    setCorrectionModal({
      ...row,
      type,
      invoiceNumber: row.invoiceNumber || '',
      soNumber: row.soNumber || '',
      customer: row.customer || '-',
      destination: row.destination || '-',
    });
    setCorrectionValue(type === 'invoice_number' ? row.invoiceNumber || '' : row.soNumber || '');
    setCorrectionReason('');
    setCorrectionError('');
  }

  function closeCorrectionModal() {
    if (correctionBusy) return;
    setCorrectionModal(null);
    setCorrectionValue('');
    setCorrectionReason('');
    setCorrectionError('');
  }

  function handleCorrectionValueChange(value) {
    setCorrectionValue(value);
    setCorrectionError('');
  }

  function handleCorrectionReasonChange(value) {
    setCorrectionReason(value);
    setCorrectionError('');
  }

  async function refreshCorrectionHistory(targetId, type) {
    setCorrectionHistoryLoading(true);
    setCorrectionHistoryError('');
    try {
      const result = type === 'invoice_number'
        ? await fetchFinanceInvoiceCorrections(targetId)
        : await fetchFinanceOrderCorrections(targetId);
      setCorrectionHistory((Array.isArray(result) ? result : result.rows || []).map(normalizeFinanceCorrection));
    } catch (error) {
      setCorrectionHistoryError(error.message || 'Riwayat koreksi gagal dimuat.');
    } finally {
      setCorrectionHistoryLoading(false);
    }
  }

  async function submitCorrection(event) {
    event.preventDefault();
    if (!correctionModal?.id) return;
    const requestedValue = String(correctionValue || '').trim().toUpperCase();
    const reason = correctionReason.trim();
    if (!requestedValue) {
      setCorrectionError(correctionModal.type === 'invoice_number' ? 'Nomor invoice baru wajib diisi.' : 'Nomor SO baru wajib diisi.');
      return;
    }
    if (!reason) {
      setCorrectionError('Alasan koreksi wajib diisi.');
      return;
    }

    setCorrectionBusy(true);
    setCorrectionError('');
    try {
      const saved = correctionModal.type === 'invoice_number'
        ? await requestFinanceInvoiceCorrection(correctionModal.id, { requestedValue, reason })
        : await requestFinanceOrderSoCorrection(correctionModal.id, { requestedValue, reason });

      if (saved.status === 'applied') {
        if (correctionModal.type === 'invoice_number') {
          onInvoiceNumberApplied?.(correctionModal.id, requestedValue);
        } else {
          onSoNumberApplied?.(correctionModal.id, requestedValue);
        }
      }

      await refreshCorrectionHistory(correctionModal.id, correctionModal.type);
      setCorrectionModal(null);
      setCorrectionValue('');
      setCorrectionReason('');
    } catch (error) {
      setCorrectionError(error.message || 'Request koreksi gagal dikirim.');
    } finally {
      setCorrectionBusy(false);
    }
  }

  return {
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
  };
}

export default useFinanceCorrectionWorkflow;
