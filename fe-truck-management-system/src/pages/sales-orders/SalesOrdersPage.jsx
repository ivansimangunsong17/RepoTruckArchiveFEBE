import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  Eye,
  FileText,
  PackageCheck,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import SalesOrderForm from '../../components/forms/SalesOrderForm';
import { USER_ROLES, hasPermission } from '../../constants/roles';
import { useAuth } from '../../hooks/useAuth';
import { useFeedback } from '../../hooks/useFeedback';
import { useArchiveData } from '../../hooks/useArchiveData';
import { formatDate, formatDateTime } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';
import DocumentLink from '../../components/common/DocumentLink';
import FilterStatus from '../../components/common/FilterStatus';
import { fetchSalesOrdersPage, updateSalesOrderInvoiceDeliveryStatus } from '../../services/archive/salesOrderService';

const PAGE_SIZE = 8;
const LOCAL_BILLING_STATUS_KEY = 'tms-sales-order-billing-status-v2';
const BILLING_STATUS_OPTIONS = [
  { value: 'belum_dikirim', label: 'Dokumen Siap Dikirim' },
  { value: 'belum_diterima', label: 'Dokumen Terkirim' },
  { value: 'belum_dikonfirmasi', label: 'Belum Dikonfirmasi' },
  { value: 'menunggu_pembayaran', label: 'Belum Dibayar' },
  { value: 'revisi_dispute', label: 'Revisi / Dispute' },
  { value: 'lunas', label: 'Lunas' },
];
const BILLING_STATUS_LABELS = [
  { value: 'belum_invoice', label: 'Belum Invoice' },
  ...BILLING_STATUS_OPTIONS,
];
const INVOICE_DOCUMENT_LABELS = {
  belum_upload: 'Belum Upload',
  siap_dikirim: 'Dokumen Siap Dikirim',
  terkirim: 'Dokumen Terkirim',
};
const INVOICE_DELIVERY_METHOD_OPTIONS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'lainnya', label: 'Lainnya' },
];
const ACCURATE_DOCUMENT_SLOTS = [
  { category: 'invoicePdf', label: 'Invoice' },
  { category: 'taxInvoicePdf', label: 'Faktur Pajak' },
];
const STATUS_NAVIGATION = [
  { value: 'running', label: 'Sedang Jalan', tone: 'running' },
  { value: 'waiting_operational', label: 'Belum Jalan', tone: 'waiting' },
  { value: 'completed', label: 'Selesai', tone: 'completed' },
  { value: '', label: 'Semua', tone: 'all' },
];
const CUSTOMER_DOCUMENT_STATUS_NAVIGATION = [
  { value: 'completed_invoiced', label: 'Proses Billing', tone: 'completed' },
  { value: 'invoice_ready', label: 'Siap Dikirim', tone: 'invoice' },
  { value: 'invoice_sent', label: 'Dokumen Terkirim', tone: 'completed' },
  { value: '', label: 'Semua', tone: 'all' },
];
const DEFAULT_STATUS_FILTER = 'waiting_operational';
const DEFAULT_CUSTOMER_DOCUMENT_STATUS_FILTER = 'invoice_ready';

function valueOrDash(value) {
  return value || '-';
}

function formatShipmentLabel(value) {
  const shipmentMap = {
    import: 'Import',
    export: 'Export',
    'domestik inward': 'Domestik Inward',
    'domestik outward': 'Domestik Outward',
    repo_empty: 'Repo Empty',
  };
  return shipmentMap[String(value || '').toLowerCase()] || value || '-';
}

function getOrderContainers(order) {
  return Array.isArray(order?.containers) ? order.containers : [];
}

function getOrderLineItems(order) {
  if (Array.isArray(order?.lineItems) && order.lineItems.length) {
    return order.lineItems;
  }
  if (order?.serviceName) {
    return [{
      serviceName: order.serviceName,
      containerType: order.cargoType || '',
      qty: order.quantity || 0,
      price: order.price || 0,
      total: order.totalAmount || 0,
    }];
  }
  return [];
}

function getContainerProgress(order) {
  const containers = getOrderContainers(order);
  const total = containers.length || Number(order?.quantity || 0);
  const completed = containers.filter((container) => container.status === 'completed').length;
  const cancelled = containers.filter((container) => container.status === 'cancelled' || container.cancelRequestStatus === 'approved').length;
  const running = containers.filter((container) => container.status === 'running').length;
  const waiting = Math.max(0, total - completed - cancelled - running);
  const active = Math.max(0, total - cancelled);

  return { total, active, completed, cancelled, running, waiting };
}

function getPaymentTermLabel(order) {
  if (order?.paymentTerms) return order.paymentTerms;
  return order?.paymentType === 'tempo' ? `Tempo ${Number(order.paymentTermDays || 0) || 30} hari` : 'Cash';
}

function userDisplayName(user) {
  return String(user?.fullName || user?.name || user?.email || '').trim();
}

function isSalesOrderOwner(user, order) {
  if (!user || !order) return false;
  if (order.createdByUserId) return order.createdByUserId === user.id;
  return String(order.createdBy || '').trim() === userDisplayName(user);
}

function getSalesGroupName(order) {
  return String(order?.salesName || order?.createdBy || 'Tanpa Nama Sales').trim() || 'Tanpa Nama Sales';
}

function isInvoiced(order) {
  return Boolean(String(order?.invoiceNumber || '').trim());
}

function readLocalBillingStatusOverrides() {
  try {
    const stored = JSON.parse(localStorage.getItem(LOCAL_BILLING_STATUS_KEY));
    return stored && typeof stored === 'object' ? stored : {};
  } catch {
    return {};
  }
}

function persistLocalBillingStatusOverrides(nextValue) {
  try {
    localStorage.setItem(LOCAL_BILLING_STATUS_KEY, JSON.stringify(nextValue));
  } catch {
    // Ignore storage failures.
  }
}

function normalizeBillingStatus(value, invoiceNumber = '') {
  const normalized = String(value || '').toLowerCase();
  const legacyMap = {
    pending_invoice: 'belum_invoice',
    invoice_issued: 'belum_dikirim',
    waiting_payment: 'menunggu_pembayaran',
    paid: 'lunas',
  };
  if (BILLING_STATUS_LABELS.some((option) => option.value === normalized)) return normalized;
  if (legacyMap[normalized]) return legacyMap[normalized];
  return isInvoiced({ invoiceNumber }) ? 'belum_dikirim' : 'belum_invoice';
}

function getBillingStatusValue(order, overrideValue = '') {
  return normalizeBillingStatus(overrideValue || order?.billingStatus || order?.billing_status, order?.invoiceNumber);
}

function getBillingStatusLabel(order, overrideValue = '') {
  const status = getBillingStatusValue(order, overrideValue);
  return BILLING_STATUS_LABELS.find((option) => option.value === status)?.label || 'Belum Invoice';
}

function getBillingStatusTone(order, overrideValue = '') {
  const status = getBillingStatusValue(order, overrideValue);
  if (status === 'lunas') return 'paid';
  return 'pending';
}

function getBillingSelectStyle(order, overrideValue = '') {
  const status = getBillingStatusValue(order, overrideValue);
  if (status === 'lunas') {
    return { borderColor: '#5eead4', backgroundColor: '#f0fdfa', color: '#0f766e' };
  }
  if (status === 'belum_invoice') {
    return { borderColor: '#fecaca', backgroundColor: '#fff7f7', color: '#991b1b' };
  }
  return { borderColor: '#fcd34d', backgroundColor: '#fffbeb', color: '#92400e' };
}

function isWaitingStatus(value) {
  return ['received', 'waiting_operational'].includes(value || 'waiting_operational');
}

function toDateInputValue(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, '0'),
    String(parsed.getDate()).padStart(2, '0'),
  ].join('-');
}

function todayDateInputValue() {
  return toDateInputValue(new Date());
}

function toValidDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function latestDate(...values) {
  return values
    .map(toValidDate)
    .filter(Boolean)
    .sort((left, right) => right.getTime() - left.getTime())[0] || null;
}

function daysBetween(startValue, endValue = new Date()) {
  const start = toValidDate(startValue);
  const end = toValidDate(endValue);
  if (!start || !end) return 0;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}

function getOrderCompletedAt(order) {
  return latestDate(
    order?.completedAt,
    ...getOrderContainers(order).map((container) => container.completedAt),
  );
}

function getOrderInvoiceAging(order, invoiceNumber = order?.invoiceNumber || '') {
  const hasInvoiceNumber = Boolean(String(invoiceNumber || '').trim());
  const hasCompleteDocuments = Boolean(
    (order?.invoiceDocumentUploadedAt && order?.taxInvoiceDocumentUploadedAt)
    || hasReadyAccurateDocuments(order),
  );
  const isSent = Boolean(order?.invoiceDocumentSentAt);
  const hasSentStatus = order?.invoiceDocumentStatus === 'terkirim';
  const billingStatus = getBillingStatusValue(order);
  const isPaid = billingStatus === 'lunas';

  if (!hasInvoiceNumber) {
    return { stage: 'Belum ada nomor invoice', days: null };
  }
  if (!hasCompleteDocuments) {
    return { stage: 'Dokumen belum lengkap', days: null };
  }
  if (!isSent) {
    return { stage: hasSentStatus ? 'Tanggal kirim belum ada' : 'Belum dikirim customer', days: null };
  }
  if (!isPaid) {
    return { stage: 'Menunggu pelunasan', days: daysBetween(order.invoiceDocumentSentAt) };
  }
  return { stage: 'Lunas', days: daysBetween(order.invoiceDocumentSentAt, order.updatedAt) };
}

function formatInvoicePaymentDuration(days) {
  if (days === null || days === undefined || days === '') return '-';
  return `${Number(days || 0)} hari`;
}

function getInvoiceDeliveryMethodLabel(value) {
  const labels = {
    whatsapp: 'WhatsApp',
    email: 'Email',
    lainnya: 'Lainnya',
  };
  return labels[String(value || '').toLowerCase()] || value || '-';
}

function getSalesInvoiceHistory(order) {
  const rows = [];
  if (order?.invoiceIssuedAt) {
    rows.push({
      time: order.invoiceIssuedAt,
      label: 'Nomor invoice dibuat',
      detail: order.invoiceNumber || '-',
    });
  }
  if (order?.invoiceDocumentUploadedAt) {
    rows.push({
      time: order.invoiceDocumentUploadedAt,
      label: 'Invoice diupload Finance',
      detail: order.invoiceDocumentUploadedBy || '-',
    });
  }
  if (order?.taxInvoiceDocumentUploadedAt) {
    rows.push({
      time: order.taxInvoiceDocumentUploadedAt,
      label: 'Faktur Pajak diupload Finance',
      detail: order.taxInvoiceDocumentUploadedBy || '-',
    });
  }
  if (order?.invoiceDocumentSentAt) {
    rows.push({
      time: order.invoiceDocumentSentAt,
      label: 'Dokumen dikirim Sales',
      detail: getInvoiceDeliveryMethodLabel(order.invoiceDocumentDeliveryMethod),
    });
  }
  return rows.sort((left, right) => (
    (toValidDate(left.time)?.getTime() || 0) - (toValidDate(right.time)?.getTime() || 0)
  ));
}

function getInvoiceDocumentStatusLabel(order) {
  return INVOICE_DOCUMENT_LABELS[order?.invoiceDocumentStatus] || INVOICE_DOCUMENT_LABELS.belum_upload;
}

function getInvoiceDocumentTone(order) {
  if (order?.invoiceDocumentStatus === 'terkirim') return 'sent';
  if (order?.invoiceDocumentStatus === 'siap_dikirim') return 'ready';
  return 'waiting';
}

function getAccurateDocument(order, category) {
  return (order?.referenceDocuments || []).find((document) => (
    document.documentType === category && Boolean(document.file?.path)
  ));
}

function hasReadyAccurateDocuments(order) {
  return ACCURATE_DOCUMENT_SLOTS.every((slot) => getAccurateDocument(order, slot.category));
}

function canCancelOrderBeforeOperational(order) {
  if (!order || ['completed', 'cancelled'].includes(order.status)) return false;
  return getOrderContainers(order).every((container) => isWaitingStatus(container.status));
}

function hasSentRpuj(order) {
  return getOrderContainers(order).some((container) => {
    const rpujStatus = String(container.rpujStatus || container.rpuj_status || '').trim().toLowerCase();
    return Boolean(
      container.rpujRequestedAt
      || container.rpuj_requested_at
      || ['submitted', 'approved', 'paid', 'rejected'].includes(rpujStatus)
    );
  });
}

function isNumberedByFinance(order) {
  const verificationStatus = String(order?.financeVerificationStatus || order?.finance_verification_status || '').trim().toLowerCase();
  return Boolean(String(order?.soNumber || order?.so_number || '').trim() || verificationStatus === 'verified');
}

function matchesOrderStatus(order, selectedStatus, invoiceNumber = order?.invoiceNumber || '', customerDocumentsOnly = false) {
  if (!selectedStatus && customerDocumentsOnly) return order.status === 'completed' && Boolean(String(invoiceNumber || '').trim());
  if (!selectedStatus) return true;
  if (selectedStatus === 'waiting_operational') return isWaitingStatus(order.status);
  if (selectedStatus === 'completed_invoiced') return order.status === 'completed' && Boolean(String(invoiceNumber || '').trim());
  if (selectedStatus === 'invoice_ready') return order.status === 'completed' && order.invoiceDocumentStatus === 'siap_dikirim';
  if (selectedStatus === 'invoice_sent') return order.status === 'completed' && order.invoiceDocumentStatus === 'terkirim';
  return order.status === selectedStatus;
}

function getServerFilter(selectedStatus, customerDocumentsOnly = false) {
  if (selectedStatus === 'completed_invoiced') {
    return { status: 'completed', invoiced: true };
  }
  if (selectedStatus === 'invoice_ready') {
    return { status: 'completed', invoiced: true, invoiceDocumentStatus: 'siap_dikirim' };
  }
  if (selectedStatus === 'invoice_sent') {
    return { status: 'completed', invoiced: true, invoiceDocumentStatus: 'terkirim' };
  }
  if (!selectedStatus && customerDocumentsOnly) return { status: 'completed', invoiced: true };
  if (!selectedStatus) return {};
  return { status: selectedStatus, invoiced: false };
}

function ContainerDetail({ container, onRequestCancel, canRequestCancel }) {
  const allowRequestCancel = canRequestCancel && container.status === 'received' && container.cancelRequestStatus !== 'submitted';
  return (
    <div className="container-detail">
      <div className="container-detail-head">
        <div><strong>{container.containerNumber || 'Container belum diisi'}</strong><span>Container {container.size} - {valueOrDash(container.type)}</span></div>
        <StatusBadge status={container.status} />
      </div>
      <div className="sales-container-fields">
        <div><span>Ukuran</span><strong>{container.size}</strong></div>
        <div><span>Tipe</span><strong>{valueOrDash(container.type)}</strong></div>
        <div><span>Catatan</span><strong>{valueOrDash(container.notes)}</strong></div>
      </div>
      <div className="container-timeline">
        <div className="done"><span /><p>Order Masuk<strong>{formatDateTime(container.receivedAt)}</strong></p></div>
        <div className={container.runningAt ? 'done' : ''}><span /><p>Sedang Jalan<strong>{formatDateTime(container.runningAt)}</strong></p></div>
        <div className={container.completedAt ? 'done' : ''}><span /><p>Selesai<strong>{formatDateTime(container.completedAt)}</strong></p></div>
      </div>
      {container.cancelRequestStatus === 'submitted' ? (
        <div className="sales-order-cancelled-note">
          <Clock3 size={16} />
          <span>{container.cancelRequestNote || 'Permintaan batal container ini menunggu approval Ops.'}</span>
        </div>
      ) : null}
      {container.cancelRequestStatus === 'rejected' ? (
        <div className="sales-order-cancelled-note">
          <X size={16} />
          <span>{container.cancelReviewNote || 'Permintaan batal container ini ditolak Ops.'}</span>
        </div>
      ) : null}
      {container.status === 'cancelled' || container.cancelRequestStatus === 'approved' ? (
        <div className="sales-order-cancelled-note">
          <Ban size={16} />
          <span>{container.cancelReason || container.cancelRequestNote || 'Container dibatalkan.'}</span>
        </div>
      ) : null}
      {allowRequestCancel ? (
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="danger-button" type="button" onClick={() => onRequestCancel(container)}>
            <Ban size={16} /> Ajukan Batal
          </button>
        </div>
      ) : null}
    </div>
  );
}

function LineItemDetail({ item, index }) {
  const label = item.containerType ? `${item.serviceName} - ${item.containerType}` : item.serviceName;
  return (
    <div className="line-item-detail">
      <div className="line-item-detail-head">
        <strong>Rincian {index + 1}</strong>
        <span>{label}</span>
      </div>
      <div className="line-item-detail-grid">
        <div><span>Qty</span><strong>{item.qty || 0}</strong></div>
        <div><span>Price</span><strong>{formatCurrency(item.price || 0)}</strong></div>
        <div><span>Total</span><strong>{formatCurrency(item.total || 0)}</strong></div>
      </div>
      {item.serviceName === 'Jasa Lainnya' && item.notes ? (
        <p className="line-item-detail-notes">{item.notes}</p>
      ) : null}
    </div>
  );
}

function SalesOrdersPage({ customerDocumentsOnly = false }) {
  const { user } = useAuth();
  const { confirmAction, notify } = useFeedback();
  const archive = useArchiveData();
  const [databaseOrders, setDatabaseOrders] = useState([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [summary, setSummary] = useState({
    orders: 0,
    waitingOrders: 0,
    runningOrders: 0,
    completedOrders: 0,
    invoicedOrders: 0,
    readyInvoiceDocuments: 0,
    sentInvoiceDocuments: 0,
    cancelledOrders: 0,
  });
  const [query, setQuery] = useState('');
  const defaultStatusFilter = customerDocumentsOnly ? DEFAULT_CUSTOMER_DOCUMENT_STATUS_FILTER : DEFAULT_STATUS_FILTER;
  const [status, setStatus] = useState(defaultStatusFilter);
  const [page, setPage] = useState(1);
  const [listVersion, setListVersion] = useState(0);
  const [loading, setLoading] = useState(archive.isDatabaseMode);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [invoiceOverrides] = useState({});
  const [billingStatusOverrides, setBillingStatusOverrides] = useState(() => (
    archive.isDatabaseMode ? {} : readLocalBillingStatusOverrides()
  ));
  const [billingStatusDraft, setBillingStatusDraft] = useState('belum_invoice');
  const [invoiceDeliveryDateDraft, setInvoiceDeliveryDateDraft] = useState(todayDateInputValue);
  const [invoiceDeliveryMethodDraft, setInvoiceDeliveryMethodDraft] = useState('whatsapp');
  const [invoiceDeliveryNotesDraft, setInvoiceDeliveryNotesDraft] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [cancelContainerTarget, setCancelContainerTarget] = useState(null);
  const [cancelContainerReason, setCancelContainerReason] = useState('');
  const [cancelContainerSaving, setCancelContainerSaving] = useState(false);
  const canCreateOrder = !customerDocumentsOnly && user?.role === USER_ROLES.SALES && hasPermission(user, 'orders.create');
  const canUpdateOrder = hasPermission(user, 'orders.update');
  const canViewCommercial = hasPermission(user, 'commercial.read');
  const selectedOrderLockedByFinanceForSales = user?.role === USER_ROLES.SALES && isNumberedByFinance(selectedOrder);
  const selectedOrderLockedByRpujForSales = user?.role === USER_ROLES.SALES && hasSentRpuj(selectedOrder);
  const selectedOrderLockedForSales = selectedOrderLockedByFinanceForSales || selectedOrderLockedByRpujForSales;
  const canRequestCancelContainer = user?.role === USER_ROLES.ADMIN
    || (user?.role === USER_ROLES.SALES && isSalesOrderOwner(user, selectedOrder) && !selectedOrderLockedForSales);
  const canModifyOrder = (order) => {
    if (!order || !canUpdateOrder) return false;
    if (user?.role === USER_ROLES.ADMIN) return true;
    if (user?.role === USER_ROLES.SALES) return isSalesOrderOwner(user, order) && !isNumberedByFinance(order) && !hasSentRpuj(order);
    return false;
  };
  const canUpdateBillingOrder = (order) => canViewCommercial && canUpdateOrder && (
    user?.role === USER_ROLES.ADMIN
    || (user?.role === USER_ROLES.SALES && isSalesOrderOwner(user, order))
  );
  const selectedBillingStatus = getBillingStatusValue(
    selectedOrder,
    archive.isDatabaseMode ? '' : billingStatusOverrides[selectedOrder?.id] || '',
  );
  const selectedInvoiceDocumentsReady = hasReadyAccurateDocuments(selectedOrder);
  const selectedBillingLockedForSales = user?.role === USER_ROLES.SALES && selectedBillingStatus === 'lunas';
  const canEditSelectedCommercial = canUpdateBillingOrder(selectedOrder) && !selectedBillingLockedForSales;
  const canModifySelectedOrder = canModifyOrder(selectedOrder);
  const canCancelSelectedOrder = canModifySelectedOrder
    && hasPermission(user, 'orders.cancel')
    && canCancelOrderBeforeOperational(selectedOrder);
  const cancelContainerReasonValid = cancelContainerReason.trim().length >= 8;

  useEffect(() => {
    if (user?.role === USER_ROLES.OBSERVER) {
      setStatus('completed');
    }
  }, [user?.role]);

  useEffect(() => {
    setStatus(defaultStatusFilter);
    setPage(1);
  }, [defaultStatusFilter]);

  const visibleStatusNavigation = customerDocumentsOnly ? CUSTOMER_DOCUMENT_STATUS_NAVIGATION : STATUS_NAVIGATION;

  useEffect(() => {
    if (!selectedOrder) return undefined;

    function closeDetailOnEscape(event) {
      if (event.key === 'Escape') setSelectedOrder(null);
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeDetailOnEscape);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', closeDetailOnEscape);
    };
  }, [selectedOrder]);

  useEffect(() => {
    if (!cancelContainerTarget) return undefined;

    function closeCancelContainerOnEscape(event) {
      if (event.key === 'Escape' && !cancelContainerSaving) setCancelContainerTarget(null);
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeCancelContainerOnEscape);
    return () => {
      document.body.style.overflow = selectedOrder ? 'hidden' : '';
      window.removeEventListener('keydown', closeCancelContainerOnEscape);
    };
  }, [cancelContainerSaving, cancelContainerTarget, selectedOrder]);

  const getOrderInvoiceNumber = useCallback((order) => {
    if (!order) return '';
    return invoiceOverrides[order.id] ?? order.invoiceNumber ?? '';
  }, [invoiceOverrides]);

  const getBillingStatusOverride = useCallback((order) => (
    archive.isDatabaseMode ? '' : billingStatusOverrides[order?.id] || ''
  ), [archive.isDatabaseMode, billingStatusOverrides]);

  useEffect(() => {
    setBillingStatusDraft(getBillingStatusValue(selectedOrder, getBillingStatusOverride(selectedOrder)));
    setInvoiceDeliveryDateDraft(toDateInputValue(selectedOrder?.invoiceDocumentSentAt) || todayDateInputValue());
    setInvoiceDeliveryMethodDraft(selectedOrder?.invoiceDocumentDeliveryMethod || 'whatsapp');
    setInvoiceDeliveryNotesDraft(selectedOrder?.invoiceDocumentDeliveryNotes || '');
  }, [selectedOrder, getBillingStatusOverride]);

  useEffect(() => {
    if (!archive.isDatabaseMode) persistLocalBillingStatusOverrides(billingStatusOverrides);
  }, [archive.isDatabaseMode, billingStatusOverrides]);

  const localOrders = archive.orders;
  const activeLocalOrders = useMemo(() => localOrders.filter((order) => order.status !== 'cancelled'), [localOrders]);
  const queryMatchedLocalOrders = useMemo(() => activeLocalOrders.filter((order) =>
    !query || [order.soNumber, order.doNumber, order.customer].some((value) =>
      value?.toLowerCase().includes(query.toLowerCase())),
  ), [activeLocalOrders, query]);
  const filteredDemoOrders = useMemo(() => activeLocalOrders.filter((order) =>
    (!query || [order.soNumber, order.doNumber, order.customer].some((value) =>
      value?.toLowerCase().includes(query.toLowerCase()))) &&
    matchesOrderStatus(order, status, invoiceOverrides[order.id] ?? order.invoiceNumber, customerDocumentsOnly),
  ), [activeLocalOrders, query, status, invoiceOverrides, customerDocumentsOnly]);

  const totalItems = archive.isDatabaseMode ? serverTotal : filteredDemoOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleOrders = archive.isDatabaseMode
    ? databaseOrders
    : filteredDemoOrders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const groupedVisibleOrders = useMemo(() => {
    const groups = new Map();
    visibleOrders.forEach((order, index) => {
      const salesName = getSalesGroupName(order);
      if (!groups.has(salesName)) {
        groups.set(salesName, { salesName, orders: [] });
      }
      groups.get(salesName).orders.push({
        order,
        rowNumber: (currentPage - 1) * PAGE_SIZE + index + 1,
      });
    });
    return [...groups.values()];
  }, [currentPage, visibleOrders]);
  const selectedOrderContainers = getOrderContainers(selectedOrder);
  const selectedOrderLineItems = getOrderLineItems(selectedOrder);
  const selectedOrderContainerProgress = getContainerProgress(selectedOrder);
  const selectedOrderInvoiceAging = getOrderInvoiceAging(selectedOrder, getOrderInvoiceNumber(selectedOrder));
  const selectedOrderInvoiceHistory = getSalesInvoiceHistory(selectedOrder);
  const statusCounts = archive.isDatabaseMode
    ? {
      waiting_operational: summary.waitingOrders || 0,
      running: summary.runningOrders || 0,
      completed: summary.completedOrders || 0,
      completed_invoiced: summary.invoicedOrders || 0,
      invoice_ready: summary.readyInvoiceDocuments || 0,
      invoice_sent: summary.sentInvoiceDocuments || 0,
      cancelled: summary.cancelledOrders || 0,
      all: customerDocumentsOnly ? (summary.invoicedOrders || 0) : Math.max(0, (summary.orders || 0) - (summary.cancelledOrders || 0)),
    }
    : {
      waiting_operational: queryMatchedLocalOrders.filter((order) => isWaitingStatus(order.status)).length,
      running: queryMatchedLocalOrders.filter((order) => order.status === 'running').length,
      completed: queryMatchedLocalOrders.filter((order) => order.status === 'completed').length,
      completed_invoiced: queryMatchedLocalOrders.filter((order) => order.status === 'completed' && Boolean(String((invoiceOverrides[order.id] ?? order.invoiceNumber) || '').trim())).length,
      invoice_ready: queryMatchedLocalOrders.filter((order) => order.status === 'completed' && order.invoiceDocumentStatus === 'siap_dikirim').length,
      invoice_sent: queryMatchedLocalOrders.filter((order) => order.status === 'completed' && order.invoiceDocumentStatus === 'terkirim').length,
      cancelled: queryMatchedLocalOrders.filter((order) => order.status === 'cancelled').length,
      all: customerDocumentsOnly
        ? queryMatchedLocalOrders.filter((order) => order.status === 'completed' && Boolean(String((invoiceOverrides[order.id] ?? order.invoiceNumber) || '').trim())).length
        : queryMatchedLocalOrders.length,
    };

  function openOrderDetail(order) {
    setSelectedOrder(order);
    setBillingStatusDraft(getBillingStatusValue(order, getBillingStatusOverride(order)));
    setInvoiceDeliveryDateDraft(toDateInputValue(order?.invoiceDocumentSentAt) || todayDateInputValue());
    setInvoiceDeliveryMethodDraft(order?.invoiceDocumentDeliveryMethod || 'whatsapp');
    setInvoiceDeliveryNotesDraft(order?.invoiceDocumentDeliveryNotes || '');
  }

  async function saveBillingStatusDraft(nextValue = billingStatusDraft) {
    if (!canEditSelectedCommercial || !selectedOrder) return;

    const resolvedValue = typeof nextValue === 'string' ? nextValue : billingStatusDraft;
    const nextBillingStatus = normalizeBillingStatus(resolvedValue, getOrderInvoiceNumber(selectedOrder));
    if (selectedOrder.status !== 'completed') {
      notify({
        type: 'error',
        title: 'Status belum bisa diubah',
        message: 'Status billing hanya dapat diisi setelah order selesai dari operational.',
      });
      return;
    }

    if (!getOrderInvoiceNumber(selectedOrder)) {
      notify({
        type: 'error',
        title: 'Invoice belum tersedia',
        message: 'Tunggu Finance input nomor invoice sebelum update status pengiriman.',
      });
      return;
    }

    if (nextBillingStatus !== 'belum_dikirim' && !selectedInvoiceDocumentsReady) {
      notify({
        type: 'error',
        title: 'Dokumen belum lengkap',
        message: 'Tunggu Finance upload Invoice dan Faktur Pajak dari Accurate.',
      });
      return;
    }

    if (nextBillingStatus !== 'belum_dikirim' && !invoiceDeliveryDateDraft) {
      notify({
        type: 'error',
        title: 'Tanggal kirim belum diisi',
        message: 'Isi tanggal pengiriman dokumen sebelum menyimpan status.',
      });
      return;
    }

    if (!archive.isDatabaseMode) {
      setBillingStatusOverrides((current) => ({ ...current, [selectedOrder.id]: nextBillingStatus }));
      setSelectedOrder((current) => (current ? {
        ...current,
        billingStatus: nextBillingStatus,
        invoiceDocumentStatus: nextBillingStatus === 'belum_dikirim' ? current.invoiceDocumentStatus : 'terkirim',
        invoiceDocumentSentAt: nextBillingStatus === 'belum_dikirim' ? current.invoiceDocumentSentAt : invoiceDeliveryDateDraft,
        invoiceDocumentDeliveryMethod: nextBillingStatus === 'belum_dikirim' ? current.invoiceDocumentDeliveryMethod : invoiceDeliveryMethodDraft,
        invoiceDocumentDeliveryNotes: nextBillingStatus === 'belum_dikirim' ? current.invoiceDocumentDeliveryNotes : invoiceDeliveryNotesDraft,
      } : current));
    }

    try {
      const nextOrder = { ...selectedOrder, billingStatus: nextBillingStatus };
      if (archive.isDatabaseMode) {
        const savedOrder = await updateSalesOrderInvoiceDeliveryStatus(selectedOrder.id, {
          billingStatus: nextBillingStatus,
          sentAt: nextBillingStatus === 'belum_dikirim' ? null : invoiceDeliveryDateDraft,
          deliveryMethod: nextBillingStatus === 'belum_dikirim' ? '' : invoiceDeliveryMethodDraft,
          deliveryNotes: nextBillingStatus === 'belum_dikirim' ? '' : invoiceDeliveryNotesDraft.trim(),
        });
        setSelectedOrder(savedOrder);
        setListVersion((value) => value + 1);
      } else {
        setSelectedOrder({
          ...nextOrder,
          invoiceDocumentStatus: nextBillingStatus === 'belum_dikirim' ? nextOrder.invoiceDocumentStatus : 'terkirim',
          invoiceDocumentSentAt: nextBillingStatus === 'belum_dikirim' ? nextOrder.invoiceDocumentSentAt : invoiceDeliveryDateDraft,
          invoiceDocumentDeliveryMethod: nextBillingStatus === 'belum_dikirim' ? nextOrder.invoiceDocumentDeliveryMethod : invoiceDeliveryMethodDraft,
          invoiceDocumentDeliveryNotes: nextBillingStatus === 'belum_dikirim' ? nextOrder.invoiceDocumentDeliveryNotes : invoiceDeliveryNotesDraft,
        });
        setBillingStatusOverrides((current) => ({ ...current, [selectedOrder.id]: nextBillingStatus }));
      }

      notify({
        title: 'Status billing tersimpan',
        message: `${selectedOrder.soNumber} sekarang berstatus ${getBillingStatusLabel({ billingStatus: nextBillingStatus, invoiceNumber: selectedOrder.invoiceNumber })}.`,
      });
    } catch (requestError) {
      notify({
        type: 'error',
        title: 'Status billing gagal disimpan',
        message: requestError.message,
      });
    }
  }

  useEffect(() => {
    setPage(1);
  }, [query, status]);

  useEffect(() => {
    if (!archive.isDatabaseMode) return undefined;

    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const serverFilter = getServerFilter(status, customerDocumentsOnly);
        const result = await fetchSalesOrdersPage({ page, pageSize: PAGE_SIZE, query, ...serverFilter });
        if (!active) return;
        setDatabaseOrders(result.rows);
        setServerTotal(result.total);
        setSummary(result.summary);
      } catch (requestError) {
        if (!active) return;
        setDatabaseOrders([]);
        setServerTotal(0);
        setError(requestError.message || 'Data Sales Order gagal dimuat dari database.');
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [archive.isDatabaseMode, customerDocumentsOnly, listVersion, page, query, status]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  async function saveOrder(form) {
    const receivedAt = form.receivedAt || new Date().toISOString();
    try {
      await archive.upsertOrder({ ...form, receivedAt }, editingOrder);
      if (archive.isDatabaseMode) setListVersion((value) => value + 1);
      setEditingOrder(null);
      setFormOpen(false);
      setSelectedOrder(null);
      notify({
        title: editingOrder ? 'Sales Order diperbarui' : 'Sales Order dibuat',
        message: form.soNumber
          ? `${form.soNumber} berhasil disimpan.`
          : 'Order berhasil disimpan dan menunggu Nomor SO dari Finance.',
      });
    } catch (requestError) {
      notify({ type: 'error', title: 'Sales Order gagal disimpan', message: requestError.message });
    }
  }

  function openRequestCancelContainer(container) {
    setCancelContainerTarget(container);
    setCancelContainerReason(container.cancelRequestNote || '');
  }

  async function requestCancelContainer(event) {
    event.preventDefault();
    if (!cancelContainerTarget || !cancelContainerReasonValid || cancelContainerSaving) return;

    setCancelContainerSaving(true);
    try {
      const saved = await archive.requestJobCancellation(cancelContainerTarget.id, {
        cancelRequestNote: cancelContainerReason.trim(),
      });
      if (archive.isDatabaseMode) setListVersion((value) => value + 1);
      setSelectedOrder((current) => {
        if (!current || current.id !== selectedOrder?.id) return current;
        const containers = getOrderContainers(current).map((item) => (item.id === saved.id ? { ...item, ...saved } : item));
        return { ...current, containers };
      });
      setCancelContainerTarget(null);
      notify({ title: 'Permintaan pembatalan diajukan', message: `${cancelContainerTarget.containerNumber || 'Container'} menunggu approval Ops.` });
    } catch (requestError) {
      notify({ type: 'error', title: 'Permintaan pembatalan gagal', message: requestError.message });
    } finally {
      setCancelContainerSaving(false);
    }
  }

  async function cancelSelectedSalesOrder() {
    if (!selectedOrder || !canCancelSelectedOrder) return;
    const approved = await confirmAction({
      title: 'Hapus Sales Order?',
      message: `${selectedOrder.soNumber} akan dibatalkan karena belum ada container yang diproses Operational.`,
      confirmLabel: 'Hapus Sales Order',
    });
    if (!approved) return;

    try {
      await archive.cancelOrder(selectedOrder.id);
      if (archive.isDatabaseMode) setListVersion((value) => value + 1);
      setSelectedOrder(null);
      notify({
        title: 'Sales Order dihapus',
        message: `${selectedOrder.soNumber} berhasil dibatalkan dari daftar aktif.`,
      });
    } catch (requestError) {
      notify({
        type: 'error',
        title: 'Sales Order gagal dihapus',
        message: requestError.message,
      });
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Sales"
        title={customerDocumentsOnly ? 'Dokumen Customer' : 'Daftar Sales Order'}
        description={customerDocumentsOnly
          ? 'Lihat invoice dan faktur pajak yang siap dikirim ke customer.'
          : 'Lihat dan kelola order customer dari proses awal sampai selesai operational.'}
        actions={canCreateOrder ? <button className="primary-button" onClick={() => { setEditingOrder(null); setFormOpen(true); }}><Plus size={18} /> Input Sales Order</button> : null}
      />

      <section className="panel">
        <div className="filter-bar">
          <label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={customerDocumentsOnly ? 'Cari SO, customer, atau tujuan...' : 'Cari SO, DO, atau customer...'} /></label>
        </div>
        <nav className="sales-order-status-nav" aria-label={customerDocumentsOnly ? 'Navigasi dokumen customer' : 'Navigasi status Sales Order'}>
          {visibleStatusNavigation.map((item) => {
            const active = status === item.value;
            const count = item.value ? statusCounts[item.value] : statusCounts.all;
            return (
              <button
                className={`sales-order-status-tab ${item.tone} ${active ? 'active' : ''}`}
                type="button"
                key={item.label}
                aria-pressed={active}
                onClick={() => setStatus(item.value)}
              >
                <span>{item.label}</span>
                <strong>{count}</strong>
              </button>
            );
          })}
        </nav>
        <FilterStatus
          total={totalItems}
          filtered={totalItems}
          active={Boolean(query.trim() || status)}
          label={customerDocumentsOnly ? 'dokumen customer' : 'sales order'}
          onReset={() => {
            setQuery('');
            setStatus(defaultStatusFilter);
          }}
        />

        <div className="orders-list">
          {loading ? <div className="archive-inline-state"><span className="inline-loader" /><p>Memuat Sales Order...</p></div> : null}
          {!loading && error ? (
            <div className="archive-inline-state is-error">
              <h3>Sales Order gagal dimuat</h3>
              <p>{error}</p>
              <button className="secondary-button" type="button" onClick={() => setListVersion((value) => value + 1)}>Muat Ulang</button>
            </div>
          ) : null}
          {!loading && !error ? groupedVisibleOrders.map((group) => (
            <section className="sales-order-group" key={group.salesName}>
              <header className="sales-order-group-header">
                <div>
                  <span>Sales</span>
                  <strong>{group.salesName}</strong>
                </div>
                <small>{group.orders.length} SO</small>
              </header>
              {group.orders.map(({ order, rowNumber }) => {
                const shipmentLabel = formatShipmentLabel(order.shipment);
                const containerProgress = getContainerProgress(order);
                return (
                  <article className="order-card" key={order.id}>
                    <div className="order-summary">
                      <div className="order-row-number">
                        <span>No</span>
                        <strong>{rowNumber}</strong>
                      </div>
                      <div className="order-primary">
                        <span>Nomor SO</span>
                        <strong>{order.soNumber || 'Menunggu Finance'}</strong>
                      </div>
                      <div>
                        <span>Customer</span>
                        <strong>{order.customer}</strong>
                      </div>
                      <div>
                        <span>Jenis Order</span>
                        <strong>{shipmentLabel}</strong>
                      </div>
                      <div className="order-container-summary">
                        <span>Container</span>
                        <strong>{containerProgress.active}/{containerProgress.total || 0} Aktif</strong>
                        {containerProgress.cancelled ? <small>{containerProgress.cancelled} batal</small> : null}
                      </div>
                      <div className="order-billing-summary">
                        <span>Status</span>
                        <strong className={getBillingStatusTone(order, getBillingStatusOverride(order))}>
                          {getBillingStatusLabel(order, getBillingStatusOverride(order))}
                        </strong>
                      </div>
                      <div className="order-document-summary">
                        <span>Dokumen</span>
                        {isInvoiced(order) ? (
                          <strong className={getInvoiceDocumentTone(order)}>
                            {getInvoiceDocumentStatusLabel(order)}
                          </strong>
                        ) : (
                          <strong className="waiting">Belum Invoice</strong>
                        )}
                      </div>
                      <div className="order-summary-actions">
                        <button className="secondary-button" type="button" onClick={() => openOrderDetail(order)}>
                          <Eye size={16} /> Detail
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          )) : null}

          {!loading && !error && !totalItems ? (
            <div className="archive-empty-wrapper">
              <EmptyState
                title="Belum ada Sales Order"
                description={canCreateOrder ? 'Buat Sales Order pertama untuk mulai mengelola order customer.' : 'Sales Order akan tampil setelah dibuat oleh tim Sales.'}
              />
              {canCreateOrder ? <button className="primary-button" type="button" onClick={() => setFormOpen(true)}><Plus size={16} /> Buat Sales Order</button> : null}
            </div>
          ) : null}
        </div>
        {!loading && !error && totalItems ? (
          <div className="master-pagination">
            <span>
              Menampilkan {(currentPage - 1) * PAGE_SIZE + 1}-
              {Math.min(currentPage * PAGE_SIZE, totalItems)} dari {totalItems} sales order
            </span>
            <div>
              <button type="button" aria-label="Halaman sebelumnya" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                <ChevronLeft size={15} />
              </button>
              <strong>Halaman {currentPage} dari {totalPages}</strong>
              <button type="button" aria-label="Halaman berikutnya" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {selectedOrder ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedOrder(null)}>
          <section className="order-modal sales-order-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Detail Sales Order</span>
                <h2>{selectedOrder.soNumber || 'Menunggu Nomor SO Finance'}</h2>
                <p>{selectedOrder.customer} - {formatShipmentLabel(selectedOrder.shipment)}</p>
              </div>
              <button type="button" aria-label="Tutup detail Sales Order" onClick={() => setSelectedOrder(null)}><X size={19} /></button>
            </header>

            <div className="sales-order-detail-body">
              <div className="order-meta">
                <div><PackageCheck size={17} /><p>Rute<strong>{selectedOrder.origin} - {selectedOrder.destination}</strong></p></div>
                <div><Clock3 size={17} /><p>Waktu Input Sistem<strong>{formatDateTime(selectedOrder.receivedAt)}</strong></p></div>
                <div><Eye size={17} /><p>Sales Pembuat<strong>{getSalesGroupName(selectedOrder)}</strong></p></div>
                <div><Clock3 size={17} /><p>Terakhir diperbarui<strong>{selectedOrder.updatedBy || '-'} - {formatDateTime(selectedOrder.updatedAt)}</strong></p></div>
              </div>

              <div className="order-detail-sections">
                <div>
                  <span>Informasi Customer</span><strong>{selectedOrder.customer}</strong>
                  <small>{selectedOrder.customerPic || '-'} - {selectedOrder.customerPhone || '-'}</small>
                  <small>{selectedOrder.customerAddress || '-'}</small>
                </div>
                <div>
                  <span>Informasi Order</span><strong>{formatShipmentLabel(selectedOrder.shipment)}</strong>
                  <small>Nama Kapal: {selectedOrder.vesselName || '-'}</small>
                  <small>Tanggal SO: {formatDate(selectedOrder.soDate)}</small>
                  <small>Pembayaran: {getPaymentTermLabel(selectedOrder)}</small>
                  <small>No. Invoice: {getOrderInvoiceNumber(selectedOrder) || '-'}</small>
                  <small>{selectedOrder.jobDescription || selectedOrder.notes || '-'}</small>
                </div>
                <div>
                  <span>Rincian</span><strong>{selectedOrder.serviceName || 'Campuran'}</strong>
                  <small>Qty: {selectedOrder.quantity || 0} | Total: {formatCurrency(selectedOrder.totalAmount || 0)}</small>
                  <small>{selectedOrder.container || selectedOrder.terminal || '-'}</small>
                </div>
                {selectedOrder.status === 'completed' ? (
                  <div className="order-invoice-card">
                    <div className="order-invoice-card-head">
                      <div>
                        <span>Billing</span>
                        <strong className={`order-invoice-status ${getBillingStatusTone(selectedOrder, getBillingStatusOverride(selectedOrder))}`}>
                          {getBillingStatusLabel(selectedOrder, getBillingStatusOverride(selectedOrder))}
                        </strong>
                      </div>
                    </div>
                    {getOrderInvoiceNumber(selectedOrder) ? (
                      <div className="order-invoice-card-value order-invoice-card-primary">
                        <span>No. Invoice</span>
                        <strong>{getOrderInvoiceNumber(selectedOrder)}</strong>
                      </div>
                    ) : (
                      <div className="order-invoice-card-value order-invoice-card-primary">
                        <span>No. Invoice</span>
                        <strong>Menunggu Finance</strong>
                      </div>
                    )}
                    <div className="order-invoice-card-value">
                      <span>Lama Pelunasan</span>
                      <strong>{formatInvoicePaymentDuration(selectedOrderInvoiceAging.days)}</strong>
                      <small>{selectedOrderInvoiceAging.stage}</small>
                    </div>
                    {getOrderInvoiceNumber(selectedOrder) ? (
                      <div className="sales-invoice-documents">
                        <div className="sales-invoice-documents-head">
                          <span>Dokumen Accurate</span>
                          <strong>{getInvoiceDocumentStatusLabel(selectedOrder)}</strong>
                        </div>
                        {ACCURATE_DOCUMENT_SLOTS.map((slot) => {
                          const document = getAccurateDocument(selectedOrder, slot.category);
                          return (
                            <div className="sales-invoice-document-row" key={slot.category}>
                              <div>
                                <strong>{slot.label}</strong>
                                <span>{document?.file?.name || 'Belum tersedia'}</span>
                              </div>
                              {document?.file ? (
                                <div className="sales-invoice-document-actions">
                                  <DocumentLink
                                    className="secondary-button sales-invoice-document-button"
                                    file={document.file}
                                    label="View"
                                  />
                                  <DocumentLink
                                    className="secondary-button sales-invoice-document-button"
                                    download
                                    file={document.file}
                                    label="Download"
                                  />
                                </div>
                              ) : (
                                <small>Menunggu Finance</small>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                    {selectedOrderInvoiceHistory.length ? (
                      <div className="sales-invoice-history">
                        <span>Riwayat Dokumen</span>
                        {selectedOrderInvoiceHistory.map((item) => (
                          <div key={`${item.label}-${item.time}`}>
                            <strong>{item.label}</strong>
                            <small>{formatDateTime(item.time)} | {item.detail}</small>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {canEditSelectedCommercial && getOrderInvoiceNumber(selectedOrder) && selectedInvoiceDocumentsReady ? (
                      <div className="order-billing-controls">
                        <label className="order-billing-select">
                          Status Pengiriman Invoice
                          <select
                            value={billingStatusDraft}
                            style={getBillingSelectStyle(selectedOrder, billingStatusDraft)}
                            onChange={async (event) => {
                              const nextValue = event.target.value;
                              setBillingStatusDraft(nextValue);
                              setBillingStatusOverrides((current) => ({ ...current, [selectedOrder.id]: nextValue }));
                              await saveBillingStatusDraft(nextValue);
                            }}
                          >
                            {BILLING_STATUS_OPTIONS.map((option) => (
                              <option
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {billingStatusDraft !== 'belum_dikirim' ? (
                          <>
                            <label className="order-billing-select">
                              Tanggal Kirim
                              <input
                                type="date"
                                value={invoiceDeliveryDateDraft}
                                onChange={(event) => setInvoiceDeliveryDateDraft(event.target.value)}
                              />
                            </label>
                            <label className="order-billing-select">
                              Metode
                              <select
                                value={invoiceDeliveryMethodDraft}
                                onChange={(event) => setInvoiceDeliveryMethodDraft(event.target.value)}
                              >
                                {INVOICE_DELIVERY_METHOD_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </label>
                            <label className="order-billing-select order-billing-note-field">
                              Catatan
                              <input
                                placeholder="Opsional"
                                value={invoiceDeliveryNotesDraft}
                                onChange={(event) => setInvoiceDeliveryNotesDraft(event.target.value)}
                              />
                            </label>
                          </>
                        ) : null}
                        <button
                          type="button"
                          className="secondary-button invoice-edit-button"
                          onClick={() => saveBillingStatusDraft()}
                        >
                          Simpan Status
                        </button>
                      </div>
                    ) : selectedBillingLockedForSales ? (
                      <small className="order-billing-note">Invoice sudah lunas. Perubahan status hanya dapat dilakukan oleh Admin.</small>
                    ) : canEditSelectedCommercial && getOrderInvoiceNumber(selectedOrder) ? (
                      <small className="order-billing-note">Tunggu Finance upload Invoice dan Faktur Pajak sebelum dokumen dapat dikirim ke customer.</small>
                    ) : canEditSelectedCommercial ? (
                      <small className="order-billing-note">Finance perlu input nomor invoice sebelum Sales bisa update status pengiriman.</small>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="line-item-detail-list">
                {selectedOrderLineItems.map((item, index) => (
                  <LineItemDetail key={item.id || `${item.serviceName}-${index}`} item={item} index={index} />
                ))}
              </div>

              <div className="order-container-progress-panel">
                <div>
                  <span>Total Container</span>
                  <strong>{selectedOrderContainerProgress.total || 0}</strong>
                  <small>Rencana dari SO</small>
                </div>
                <div>
                  <span>Aktif</span>
                  <strong>{selectedOrderContainerProgress.active || 0}</strong>
                  <small>Berjalan atau belum jalan</small>
                </div>
                <div>
                  <span>Selesai</span>
                  <strong>{selectedOrderContainerProgress.completed || 0}</strong>
                  <small>Masuk closing/recap</small>
                </div>
                <div className={selectedOrderContainerProgress.cancelled ? 'has-cancelled' : ''}>
                  <span>Batal</span>
                  <strong>{selectedOrderContainerProgress.cancelled || 0}</strong>
                  <small>Tidak dijalankan</small>
                </div>
              </div>

              {selectedOrderLockedByFinanceForSales ? (
                <div className="sales-order-cancelled-note">
                  <Clock3 size={16} />
                  <span>SO terkunci karena Finance sudah menerbitkan nomor SO. Revisi dan pembatalan hanya dapat dilakukan oleh Admin.</span>
                </div>
              ) : selectedOrderLockedByRpujForSales ? (
                <div className="sales-order-cancelled-note">
                  <Clock3 size={16} />
                  <span>SO terkunci karena RPUJ sudah dikirim. Revisi dan pembatalan hanya dapat dilakukan oleh Admin.</span>
                </div>
              ) : null}

              {canModifySelectedOrder ? (
                <div className="order-management-actions">
                  {selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'completed' ? (
                    <button className="secondary-button" type="button" onClick={() => { setEditingOrder(selectedOrder); setFormOpen(true); setSelectedOrder(null); }}>
                      <Edit3 size={16} /> Edit Sales Order
                    </button>
                  ) : null}
                  {canCancelSelectedOrder ? (
                    <button className="danger-button" type="button" onClick={cancelSelectedSalesOrder}>
                      <Trash2 size={16} /> Hapus Sales Order
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="container-grid">
                {selectedOrderContainers.length ? (
                  selectedOrderContainers.map((container) => (
                    <ContainerDetail key={container.id} container={container} canRequestCancel={canRequestCancelContainer} onRequestCancel={openRequestCancelContainer} />
                  ))
                ) : (
                  <div className="archive-inline-state">
                    <p>Detail container belum tersedia untuk Sales Order ini.</p>
                  </div>
                )}
              </div>

              {canViewCommercial && selectedOrder.referenceDocuments?.length ? (
                <div className="sales-reference-summary">
                  <h3>Dokumen Referensi Customer</h3>
                  {selectedOrder.referenceDocuments.map((document, index) => (
                    <div key={`${document.documentType}-${index}`}>
                      <FileText size={16} />
                      <span><strong>{document.documentType}</strong><small>{document.referenceNumber || '-'}</small><DocumentLink file={document.file} /></span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <footer>
              <button className="secondary-button" type="button" onClick={() => setSelectedOrder(null)}>Tutup</button>
            </footer>
          </section>
        </div>
      ) : null}

      {cancelContainerTarget ? (
        <div className="master-modal-backdrop" role="presentation" onMouseDown={() => !cancelContainerSaving && setCancelContainerTarget(null)}>
          <section className="container-cancel-modal" role="dialog" aria-modal="true" aria-labelledby="sales-container-cancel-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <span><Ban size={18} /></span>
              <div>
                <h2 id="sales-container-cancel-title">Ajukan Batal Container</h2>
                <p>{cancelContainerTarget.containerNumber || 'Container belum diisi'} - {selectedOrder?.soNumber || '-'} - {selectedOrder?.customer || '-'}</p>
              </div>
              <button className="modal-close-button" type="button" aria-label="Tutup pengajuan batal" disabled={cancelContainerSaving} onClick={() => setCancelContainerTarget(null)}><X size={18} /></button>
            </header>
            <form onSubmit={requestCancelContainer}>
              <label>
                Alasan Pembatalan
                <textarea
                  rows={4}
                  value={cancelContainerReason}
                  onChange={(event) => setCancelContainerReason(event.target.value)}
                  placeholder="Contoh: Customer hanya menjalankan 2 dari 3 container"
                />
              </label>
              <div className="container-cancel-warning">
                <Clock3 size={16} />
                <span>Pengajuan ini masuk ke approval Operational sebelum container ditandai batal.</span>
              </div>
              <footer>
                <button className="secondary-button" type="button" disabled={cancelContainerSaving} onClick={() => setCancelContainerTarget(null)}>Batal</button>
                <button className="danger-button" type="submit" disabled={!cancelContainerReasonValid || cancelContainerSaving}>
                  <Ban size={16} /> {cancelContainerSaving ? 'Mengajukan...' : 'Ajukan Batal'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {formOpen ? (
        <SalesOrderForm
          order={editingOrder}
          existingOrders={archive.orders}
          customers={archive.masters.customers}
          depots={archive.masters.depots}
          terminals={archive.masters.terminals}
          destinations={archive.masters.destinations}
          onClose={() => { setFormOpen(false); setEditingOrder(null); }}
          onSubmit={saveOrder}
        />
      ) : null}
    </div>
  );
}

export default SalesOrdersPage;
