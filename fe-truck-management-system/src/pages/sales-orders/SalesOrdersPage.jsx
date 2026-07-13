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
import { formatDateTime } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';
import DocumentLink from '../../components/common/DocumentLink';
import FilterStatus from '../../components/common/FilterStatus';
import { fetchSalesOrdersPage } from '../../services/archive/salesOrderService';

const PAGE_SIZE = 8;
const LOCAL_BILLING_STATUS_KEY = 'tms-sales-order-billing-status-v2';
const BILLING_STATUS_OPTIONS = [
  { value: 'belum_invoice', label: 'Belum Invoice' },
  { value: 'belum_dikirim', label: 'Belum Dikirim' },
  { value: 'belum_diterima', label: 'Belum Diterima' },
  { value: 'belum_dikonfirmasi', label: 'Belum Dikonfirmasi' },
  { value: 'menunggu_pembayaran', label: 'Menunggu Pembayaran' },
  { value: 'lunas', label: 'Lunas' },
];
const STATUS_NAVIGATION = [
  { value: 'running', label: 'Sedang Jalan', tone: 'running' },
  { value: 'waiting_operational', label: 'Belum Jalan', tone: 'waiting' },
  { value: 'completed', label: 'Selesai', tone: 'completed' },
  { value: 'completed_invoiced', label: 'Proses Billing', tone: 'completed' },
  { value: '', label: 'Semua', tone: 'all' },
];

function valueOrDash(value) {
  return value || '-';
}

function formatShipmentLabel(value) {
  const shipmentMap = {
    import: 'Import',
    export: 'Export',
    'domestik inward': 'Domestik Inward',
    'domestik outward': 'Domestik Outward',
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

function hasProcessedContainer(order) {
  return getOrderContainers(order).some((container) => !['received', 'waiting_operational'].includes(container.status || 'received'));
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
  if (BILLING_STATUS_OPTIONS.some((option) => option.value === normalized)) return normalized;
  if (legacyMap[normalized]) return legacyMap[normalized];
  return isInvoiced({ invoiceNumber }) ? 'belum_dikirim' : 'belum_invoice';
}

function getBillingStatusValue(order, overrideValue = '') {
  return normalizeBillingStatus(overrideValue || order?.billingStatus || order?.billing_status, order?.invoiceNumber);
}

function getBillingStatusLabel(order, overrideValue = '') {
  const status = getBillingStatusValue(order, overrideValue);
  return BILLING_STATUS_OPTIONS.find((option) => option.value === status)?.label || 'Belum Invoice';
}

function getBillingStatusTone(order, overrideValue = '') {
  const status = getBillingStatusValue(order, overrideValue);
  if (status === 'lunas') return 'paid';
  return 'pending';
}

function isWaitingStatus(value) {
  return ['received', 'waiting_operational'].includes(value || 'waiting_operational');
}

function matchesOrderStatus(order, selectedStatus, invoiceNumber = order?.invoiceNumber || '') {
  if (!selectedStatus) return true;
  if (selectedStatus === 'waiting_operational') return isWaitingStatus(order.status);
  if (selectedStatus === 'completed_invoiced') return order.status === 'completed' && Boolean(String(invoiceNumber || '').trim());
  return order.status === selectedStatus;
}

function getServerFilter(selectedStatus) {
  if (selectedStatus === 'completed_invoiced') {
    return { status: 'completed', invoiced: true };
  }
  return { status: selectedStatus, invoiced: false };
}

function ContainerDetail({ container }) {
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
    </div>
  );
}

function SalesOrdersPage() {
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
    cancelledOrders: 0,
  });
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [listVersion, setListVersion] = useState(0);
  const [loading, setLoading] = useState(archive.isDatabaseMode);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [invoiceOverrides, setInvoiceOverrides] = useState({});
  const [billingStatusOverrides, setBillingStatusOverrides] = useState(() => readLocalBillingStatusOverrides());
  const [invoiceDraft, setInvoiceDraft] = useState('');
  const [invoiceEditOpen, setInvoiceEditOpen] = useState(false);
  const [billingStatusDraft, setBillingStatusDraft] = useState('belum_invoice');
  const [formOpen, setFormOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const canManage = hasPermission(user, 'orders.create');
  const canCancel = hasPermission(user, 'orders.cancel');
  const canViewCommercial = hasPermission(user, 'commercial.read');
  const canEditCommercial = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.SALES;

  useEffect(() => {
    if (user?.role === USER_ROLES.OBSERVER) {
      setStatus('completed');
    }
  }, [user?.role]);

  const visibleStatusNavigation = STATUS_NAVIGATION;

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

  const getOrderInvoiceNumber = useCallback((order) => {
    if (!order) return '';
    return invoiceOverrides[order.id] ?? order.invoiceNumber ?? '';
  }, [invoiceOverrides]);

  useEffect(() => {
    if (!selectedOrder || !canEditCommercial) setInvoiceEditOpen(false);
    setInvoiceDraft(getOrderInvoiceNumber(selectedOrder));
    setBillingStatusDraft(getBillingStatusValue(selectedOrder, billingStatusOverrides[selectedOrder?.id] || ''));
  }, [selectedOrder, getOrderInvoiceNumber, billingStatusOverrides, canEditCommercial]);

  useEffect(() => {
    persistLocalBillingStatusOverrides(billingStatusOverrides);
  }, [billingStatusOverrides]);

  const localOrders = archive.orders;
  const queryMatchedLocalOrders = useMemo(() => localOrders.filter((order) =>
    !query || [order.soNumber, order.doNumber, order.customer].some((value) =>
      value?.toLowerCase().includes(query.toLowerCase())),
  ), [localOrders, query]);
  const filteredDemoOrders = useMemo(() => localOrders.filter((order) =>
    (!query || [order.soNumber, order.doNumber, order.customer].some((value) =>
      value?.toLowerCase().includes(query.toLowerCase()))) &&
    matchesOrderStatus(order, status, invoiceOverrides[order.id] ?? order.invoiceNumber),
  ), [localOrders, query, status, invoiceOverrides]);

  const totalItems = archive.isDatabaseMode ? serverTotal : filteredDemoOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleOrders = archive.isDatabaseMode
    ? databaseOrders
    : filteredDemoOrders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedOrderContainers = getOrderContainers(selectedOrder);
  const selectedOrderLineItems = getOrderLineItems(selectedOrder);
  const statusCounts = archive.isDatabaseMode
    ? {
      waiting_operational: summary.waitingOrders || 0,
      running: summary.runningOrders || 0,
      completed: summary.completedOrders || 0,
      completed_invoiced: summary.invoicedOrders || 0,
      cancelled: summary.cancelledOrders || 0,
      all: summary.orders || 0,
    }
    : {
      waiting_operational: queryMatchedLocalOrders.filter((order) => isWaitingStatus(order.status)).length,
      running: queryMatchedLocalOrders.filter((order) => order.status === 'running').length,
      completed: queryMatchedLocalOrders.filter((order) => order.status === 'completed').length,
      completed_invoiced: queryMatchedLocalOrders.filter((order) => order.status === 'completed' && Boolean(String((invoiceOverrides[order.id] ?? order.invoiceNumber) || '').trim())).length,
      cancelled: queryMatchedLocalOrders.filter((order) => order.status === 'cancelled').length,
      all: queryMatchedLocalOrders.length,
    };

  function openOrderDetail(order) {
    setSelectedOrder(order);
    setInvoiceDraft(getOrderInvoiceNumber(order));
    setBillingStatusDraft(getBillingStatusValue(order, billingStatusOverrides[order.id] || ''));
  }

  async function saveInvoiceDraft() {
    if (!canEditCommercial || !selectedOrder) return;

      const nextValue = invoiceDraft.trim();
    if (!nextValue) {
      notify({
        type: 'error',
        title: 'No. invoice belum diisi',
        message: 'Masukkan nomor invoice sebelum disimpan.',
      });
      return;
    }

    try {
      const nextOrder = {
        ...selectedOrder,
        invoiceNumber: nextValue,
        billingStatus: billingStatusDraft === 'belum_invoice' ? 'belum_dikirim' : billingStatusDraft,
      };
      if (archive.isDatabaseMode) {
        const savedOrder = await archive.upsertOrder(nextOrder, selectedOrder);
        setSelectedOrder(savedOrder);
        setListVersion((value) => value + 1);
      } else {
        setInvoiceOverrides((current) => ({ ...current, [selectedOrder.id]: nextValue }));
        setSelectedOrder(nextOrder);
      }

      setInvoiceEditOpen(false);
      notify({
        title: 'Invoice tersimpan',
        message: `No. invoice untuk ${selectedOrder.soNumber} berhasil diperbarui.`,
      });
    } catch (requestError) {
      notify({
        type: 'error',
        title: 'Invoice gagal disimpan',
        message: requestError.message,
      });
    }
  }

  const invoiceActionLabel = getOrderInvoiceNumber(selectedOrder) ? 'Edit' : 'Simpan';

  async function saveBillingStatusDraft(nextValue = billingStatusDraft) {
    if (!canEditCommercial || !selectedOrder) return;

    const nextBillingStatus = normalizeBillingStatus(nextValue, getOrderInvoiceNumber(selectedOrder));
    if (selectedOrder.status !== 'completed') {
      notify({
        type: 'error',
        title: 'Status belum bisa diubah',
        message: 'Status billing hanya dapat diisi setelah order selesai dari operational.',
      });
      return;
    }

    if (nextBillingStatus !== 'belum_invoice' && !getOrderInvoiceNumber(selectedOrder)) {
      notify({
        type: 'error',
        title: 'Invoice belum tersedia',
        message: 'Isi nomor invoice dulu sebelum memilih status lanjutan.',
      });
      return;
    }

    setBillingStatusOverrides((current) => ({ ...current, [selectedOrder.id]: nextBillingStatus }));
    setSelectedOrder((current) => (current ? { ...current, billingStatus: nextBillingStatus } : current));

    try {
      const nextOrder = { ...selectedOrder, billingStatus: nextBillingStatus };
      if (archive.isDatabaseMode) {
        const savedOrder = await archive.upsertOrder(nextOrder, selectedOrder);
        setSelectedOrder(savedOrder);
        setBillingStatusOverrides((current) => ({ ...current, [savedOrder.id]: nextBillingStatus }));
        setListVersion((value) => value + 1);
      } else {
        setSelectedOrder(nextOrder);
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

  function openInvoiceEditModal() {
    if (!canEditCommercial) return;
    if (!selectedOrder) return;
    setInvoiceDraft(getOrderInvoiceNumber(selectedOrder));
    setInvoiceEditOpen(true);
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
        const serverFilter = getServerFilter(status);
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
  }, [archive.isDatabaseMode, listVersion, page, query, status]);

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
      notify({ title: editingOrder ? 'Sales Order diperbarui' : 'Sales Order dibuat', message: `${form.soNumber} berhasil disimpan.` });
    } catch (requestError) {
      notify({ type: 'error', title: 'Sales Order gagal disimpan', message: requestError.message });
    }
  }

  async function cancelOrder(order) {
    if (hasProcessedContainer(order)) {
      notify({
        type: 'error',
        title: 'Sales Order tidak bisa dibatalkan',
        message: 'Sudah ada container yang diproses Operational. Lakukan koreksi melalui Activity Log atau prosedur internal.',
      });
      return;
    }

    const approved = await confirmAction({
      title: `Batalkan ${order.soNumber}?`,
      message: 'Status order akan berubah menjadi Batal dan tidak akan masuk ke antrean Operational.',
      confirmLabel: 'Batalkan Order',
    });
    if (!approved) return;

    try {
      await archive.cancelOrder(order.id);
      if (archive.isDatabaseMode) setListVersion((value) => value + 1);
      notify({ title: 'Sales Order dibatalkan', message: `${order.soNumber} tidak lagi aktif.` });
    } catch (requestError) {
      notify({ type: 'error', title: 'Pembatalan gagal', message: requestError.message });
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Sales"
        title="Daftar Sales Order"
        description="Lihat dan kelola order customer dari proses awal, invoice, sampai pembayaran lunas."
        actions={canManage ? <button className="primary-button" onClick={() => { setEditingOrder(null); setFormOpen(true); }}><Plus size={18} /> Input Sales Order</button> : null}
      />

      <section className="panel">
        <div className="filter-bar">
          <label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari SO, DO, atau customer..." /></label>
        </div>
        <nav className="sales-order-status-nav" aria-label="Navigasi status Sales Order">
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
          label="sales order"
          onReset={() => {
            setQuery('');
            setStatus('');
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
          {!loading && !error ? visibleOrders.map((order, index) => {
            const shipmentLabel = formatShipmentLabel(order.shipment);
            const rowNumber = (currentPage - 1) * PAGE_SIZE + index + 1;
            return (
              <article className="order-card" key={order.id}>
                <div className="order-summary">
                  <div className="order-row-number">
                    <span>No</span>
                    <strong>{rowNumber}</strong>
                  </div>
                  <div className="order-primary">
                    <span>Nomor SO</span>
                    <strong>{order.soNumber}</strong>
                  </div>
                  <div>
                    <span>Customer</span>
                    <strong>{order.customer}</strong>
                  </div>
                  <div>
                    <span>Jenis Order</span>
                    <strong>{shipmentLabel}</strong>
                  </div>
                  <div className="order-billing-summary">
                    <span>Status</span>
                    <strong className={getBillingStatusTone(order, billingStatusOverrides[order.id] || '')}>
                      {getBillingStatusLabel(order, billingStatusOverrides[order.id] || '')}
                    </strong>
                  </div>
                  <div className="order-summary-actions">
                    <button className="secondary-button" type="button" onClick={() => openOrderDetail(order)}>
                      <Eye size={16} /> Detail
                    </button>
                  </div>
                </div>
              </article>
            );
          }) : null}

          {!loading && !error && !totalItems ? (
            <div className="archive-empty-wrapper">
              <EmptyState
                title="Belum ada Sales Order"
                description={canManage ? 'Buat Sales Order pertama untuk mulai mengelola order customer.' : 'Sales Order akan tampil setelah dibuat oleh tim Sales.'}
              />
              {canManage ? <button className="primary-button" type="button" onClick={() => setFormOpen(true)}><Plus size={16} /> Buat Sales Order</button> : null}
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
                <h2>{selectedOrder.soNumber}</h2>
                <p>{selectedOrder.customer} - {formatShipmentLabel(selectedOrder.shipment)}</p>
              </div>
              <button type="button" aria-label="Tutup detail Sales Order" onClick={() => setSelectedOrder(null)}><X size={19} /></button>
            </header>

            <div className="sales-order-detail-body">
              <div className="order-meta">
                <div><PackageCheck size={17} /><p>Rute<strong>{selectedOrder.origin} - {selectedOrder.destination}</strong></p></div>
                <div><Clock3 size={17} /><p>Waktu SO<strong>{formatDateTime(selectedOrder.receivedAt)}</strong></p></div>
                <div><Eye size={17} /><p>Sales<strong>{selectedOrder.salesName || '-'}</strong></p></div>
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
                  <small>Tanggal SO: {selectedOrder.soDate || '-'}</small>
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
                      <span>Billing</span>
                      {canEditCommercial && getOrderInvoiceNumber(selectedOrder) ? (
                        <button type="button" className="secondary-button invoice-edit-button" onClick={openInvoiceEditModal}>
                          <Edit3 size={15} /> Edit
                        </button>
                      ) : null}
                    </div>
                    {getOrderInvoiceNumber(selectedOrder) ? (
                      <div className="order-invoice-card-value">
                        <strong>{getOrderInvoiceNumber(selectedOrder)}</strong>
                      </div>
                    ) : canEditCommercial ? (
                      <div className="order-invoice-card-body">
                        <input
                          value={invoiceDraft}
                          onChange={(event) => setInvoiceDraft(event.target.value)}
                          placeholder="INV-2026-001"
                        />
                        <button type="button" className="primary-button invoice-save-button" onClick={saveInvoiceDraft}>
                          {invoiceActionLabel}
                        </button>
                      </div>
                    ) : (
                      <div className="order-invoice-card-value">
                        <strong>Belum terinvoice</strong>
                      </div>
                    )}
                    <div className="order-invoice-card-value">
                      <strong>{getBillingStatusLabel(selectedOrder, billingStatusOverrides[selectedOrder.id] || '')}</strong>
                    </div>
                    {canEditCommercial ? (
                      <div className="order-billing-controls">
                        <label className="order-billing-select">
                          Status Billing
                          <select
                            value={billingStatusDraft}
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
                                disabled={option.value !== 'belum_invoice' && !getOrderInvoiceNumber(selectedOrder)}
                              >
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="secondary-button invoice-edit-button"
                          onClick={saveBillingStatusDraft}
                        >
                          Simpan Status
                        </button>
                        {!getOrderInvoiceNumber(selectedOrder) ? (
                          <small className="order-billing-note">Status selain Belum Invoice membutuhkan nomor invoice.</small>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="line-item-detail-list">
                {selectedOrderLineItems.map((item, index) => (
                  <LineItemDetail key={item.id || `${item.serviceName}-${index}`} item={item} index={index} />
                ))}
              </div>

              {selectedOrder.status === 'cancelled' ? (
                <div className="sales-order-cancelled-note">
                  <Ban size={16} />
                  <span>Sales Order ini sudah batal dan tidak masuk antrean Operational.</span>
                </div>
              ) : null}

              {canManage ? (
                <div className="order-management-actions">
                  {selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'completed' ? (
                    <button className="secondary-button" type="button" onClick={() => { setEditingOrder(selectedOrder); setFormOpen(true); setSelectedOrder(null); }}>
                      <Edit3 size={16} /> Edit Sales Order
                    </button>
                  ) : null}
                  {canCancel && selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' ? (
                    <button className="danger-button" type="button" disabled={hasProcessedContainer(selectedOrder)} onClick={() => cancelOrder(selectedOrder)}>
                      <Ban size={16} /> Batalkan Order
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="container-grid">
                {selectedOrderContainers.length ? (
                  selectedOrderContainers.map((container) => <ContainerDetail key={container.id} container={container} />)
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

      {canEditCommercial && invoiceEditOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setInvoiceEditOpen(false)}>
          <section className="invoice-confirm-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Invoice</span>
                <h2>Ubah No. Invoice</h2>
                <p>{selectedOrder?.soNumber || '-'}</p>
              </div>
            </header>
            <div className="invoice-confirm-body">
              <p>Masukkan nomor invoice baru.</p>
              <div>
                <span>No. Invoice</span>
                <input
                  value={invoiceDraft}
                  onChange={(event) => setInvoiceDraft(event.target.value)}
                  placeholder="INV-2026-001"
                />
              </div>
            </div>
            <footer>
              <button className="secondary-button" type="button" onClick={() => setInvoiceEditOpen(false)}>Batal</button>
              <button className="primary-button" type="button" onClick={saveInvoiceDraft}>Simpan</button>
            </footer>
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
