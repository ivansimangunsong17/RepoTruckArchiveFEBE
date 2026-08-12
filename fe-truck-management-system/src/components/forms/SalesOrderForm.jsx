import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { fallbackCustomers } from '../../data/masterData';
import AttachmentUploadField from '../common/AttachmentUploadField';
import { formatDate } from '../../utils/formatDate';

const REFERENCE_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png';

const SERVICE_OPTIONS = [
  'Jasa Angkut D20',
  'Jasa Angkut D40',
  'Bon Muat/Bongkar',
  'Tila/Gatepass',
  'Stevedoring and Port Service',
  'Jasa Lainnya',
];
const SERVICE_ALIASES = {
  'Jasa Handling': 'Stevedoring and Port Service',
};

const CONTAINER_TYPE_OPTIONS = ['Dry', 'Reefer', 'Special'];
const DEFAULT_LINE_ITEM_SERVICE = 'Jasa Angkut D20';

const EMPTY_DOCUMENT = {
  documentType: 'Delivery Order',
  referenceNumber: '',
  documentDate: '',
  file: null,
  notes: '',
};

function toLocalDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function normalizeDateOnly(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toLocalDateKey(value);
  }
  const raw = String(value).trim();
  if (!raw) return '';
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return toLocalDateKey(parsed);
}

function createDocumentDraft(document = {}) {
  return {
    ...EMPTY_DOCUMENT,
    ...document,
    file: document.file
      ? {
          name: document.file.name || '',
          size: document.file.size || 0,
          type: document.file.type || '',
          path: document.file.path || '',
          storagePath: document.file.storagePath || '',
          rawFile: document.file.rawFile instanceof File ? document.file.rawFile : null,
        }
      : null,
  };
}

function isContainerService(serviceName) {
  return serviceName === 'Jasa Angkut D20' || serviceName === 'Jasa Angkut D40';
}

function isOtherService(serviceName) {
  return serviceName === 'Jasa Lainnya';
}

function normalizeServiceName(value) {
  const serviceName = String(value || '').trim();
  const canonical = SERVICE_ALIASES[serviceName] || serviceName;
  return SERVICE_OPTIONS.includes(canonical) ? canonical : '';
}

function createLineItemDraft(item = {}) {
  const serviceName = normalizeServiceName(item.serviceName) || DEFAULT_LINE_ITEM_SERVICE;
  return {
    id: item.id || `line-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    serviceName,
    containerType: item.containerType || '',
    qty: item.qty == null ? '1' : String(item.qty),
    price: item.price == null ? '0' : String(item.price),
    notes: item.notes || '',
  };
}

function normalizeLineItems(order) {
  if (Array.isArray(order?.lineItems) && order.lineItems.length) {
    return order.lineItems.map(createLineItemDraft);
  }

  const legacyItems = [];
  const serviceName = normalizeServiceName(order?.serviceName);
  if (serviceName) {
    legacyItems.push(createLineItemDraft({
      serviceName,
      containerType: order?.cargoType || order?.container || '',
      qty: order?.quantity == null ? 1 : order.quantity,
      price: order?.price == null ? 0 : order.price,
    }));
  } else {
    const d20Qty = Number(order?.container20Qty || 0);
    const d40Qty = Number(order?.container40Qty || 0);
    if (d20Qty) {
      legacyItems.push(createLineItemDraft({
        serviceName: 'Jasa Angkut D20',
        containerType: order?.cargoType || order?.container || '',
        qty: d20Qty,
        price: order?.price == null ? 0 : order.price,
      }));
    }
    if (d40Qty) {
      legacyItems.push(createLineItemDraft({
        serviceName: 'Jasa Angkut D40',
        containerType: order?.cargoType || order?.container || '',
        qty: d40Qty,
        price: order?.price == null ? 0 : order.price,
      }));
    }
    if (!d20Qty && !d40Qty && order?.serviceName) {
      legacyItems.push(createLineItemDraft({
        serviceName: 'Bon Muat/Bongkar',
        qty: order?.quantity == null ? 1 : order.quantity,
        price: order?.price == null ? 0 : order.price,
      }));
    }
  }

  return legacyItems.length ? legacyItems : [createLineItemDraft()];
}

function formatLineItemLabel(item) {
  const typeLabel = item.containerType ? ` - ${item.containerType}` : '';
  const notesLabel = isOtherService(item.serviceName) && item.notes ? ` (${item.notes})` : '';
  return `${item.serviceName}${typeLabel}${notesLabel} x${item.qty}`;
}

function calculateLineItemTotal(item) {
  return Number(item.qty || 0) * Number(item.price || 0);
}

function summarizeLineItems(items) {
  const uniqueServices = [...new Set(items.map((item) => item.serviceName).filter(Boolean))];
  if (!uniqueServices.length) return 'Campuran';
  if (uniqueServices.length === 1) return uniqueServices[0];
  return 'Campuran';
}

function summarizeContainerType(items) {
  const types = [...new Set(items
    .filter((item) => isContainerService(item.serviceName))
    .map((item) => item.containerType)
    .filter(Boolean))];
  return types.length === 1 ? types[0] : '';
}

function normalizeContainerSize(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase() === '40FT' ? '40FT' : '20FT';
}

function findExistingContainer(plannedContainer, existingContainers, usedIndexes) {
  const availableContainers = existingContainers
    .map((container, index) => ({ container, index }))
    .filter(({ index }) => !usedIndexes.has(index));
  const desiredSize = normalizeContainerSize(plannedContainer.size);

  return availableContainers.find(({ container }) => (
    container.status !== 'cancelled' && normalizeContainerSize(container.size || container.containerSize) === desiredSize
  ))
    || availableContainers.find(({ container }) => container.status === 'received')
    || availableContainers.find(({ container }) => (
      container.status === 'cancelled' && normalizeContainerSize(container.size || container.containerSize) === desiredSize
    ))
    || null;
}

function buildContainersFromLineItems(lineItems, receivedAt, existingContainers = []) {
  const containers = [];

  lineItems.forEach((item) => {
    if (!isContainerService(item.serviceName)) return;
    const size = item.serviceName === 'Jasa Angkut D40' ? '40FT' : '20FT';
    const qty = Math.max(0, Number(item.qty || 0));
    for (let index = 0; index < qty; index += 1) {
      containers.push({
        containerNumber: '',
        size,
        type: item.containerType || 'Dry',
        notes: item.serviceName,
        rpujStatus: 'pending',
        status: 'received',
        receivedAt: receivedAt || new Date().toISOString(),
      });
    }
  });

  const usedIndexes = new Set();
  return containers.map((plannedContainer) => {
    const existingMatch = findExistingContainer(plannedContainer, existingContainers, usedIndexes);
    if (!existingMatch) return plannedContainer;

    usedIndexes.add(existingMatch.index);
    return {
      ...existingMatch.container,
      size: plannedContainer.size,
      type: plannedContainer.type,
      notes: plannedContainer.notes,
    };
  });
}

function createInitialForm(order) {
  const lineItems = normalizeLineItems(order);
  const serviceName = summarizeLineItems(lineItems);
  const totalQuantity = lineItems.reduce((total, item) => total + Number(item.qty || 0), 0);
  const totalAmount = lineItems.reduce((total, item) => total + calculateLineItemTotal(item), 0);
  const containerType = summarizeContainerType(lineItems);

  return {
    soNumber: order?.soNumber || '',
    doNumber: order?.doNumber || '',
    soDate: normalizeDateOnly(order?.soDate) || new Date().toISOString().slice(0, 10),
    tripDate: normalizeDateOnly(order?.tripDate || order?.plannedDate || order?.soDate) || new Date().toISOString().slice(0, 10),
    receivedAt: order?.receivedAt || '',
    customer: order?.customer || '',
    customerPic: order?.customerPic || '',
    customerPhone: order?.customerPhone || '',
    customerAddress: order?.customerAddress || '',
    salesName: order?.salesName || '',
    shipment: order?.shipment || 'import',
    jobType: order?.jobType || 'Trucking Container',
    vesselName: order?.vesselName || order?.shipName || order?.namaKapal || '',
    invoiceNumber: order?.invoiceNumber || '',
    paymentType: order?.paymentType || 'cash',
    paymentTermDays: order?.paymentTermDays == null ? '30' : String(order.paymentTermDays || 30),
    origin: order?.origin || '',
    destination: order?.destination || '',
    terminal: order?.terminal || '',
    jobDescription: order?.jobDescription || order?.notes || '',
    price: order?.price ? String(order.price) : '',
    unit: order?.unit || 'Container',
    serviceName,
    cargoType: containerType,
    quantity: order?.quantity == null ? String(totalQuantity || '') : String(order.quantity),
    totalAmount: order?.totalAmount == null ? String(totalAmount || '') : String(order.totalAmount),
    lineItems,
    referenceDocuments: order?.referenceDocuments?.length
      ? order.referenceDocuments.map(createDocumentDraft)
      : [createDocumentDraft()],
  };
}

function normalizeMasterOptions(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => !row.status || row.status === 'Aktif')
    .map((row) => row.name || row.label || '')
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'id'));
}

function SearchableInput({
  name,
  value,
  onChange,
  options,
  placeholder,
  required = false,
}) {
  const datalistId = `sales-order-${name}-options`;
  const normalizedOptions = [...new Set([
    ...(value && !options.includes(value) ? [value] : []),
    ...options,
  ])];
  return (
    <>
      <input
        name={name}
        value={value}
        onChange={onChange}
        list={datalistId}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
      />
      <datalist id={datalistId}>
        {normalizedOptions.map((option) => <option key={option} value={option} />)}
      </datalist>
    </>
  );
}

function preventNumberWheelChange(event) {
  event.preventDefault();
  event.currentTarget.blur();
}

function preventEnterSubmit(event) {
  if (event.key !== 'Enter') return;
  const tagName = String(event.target?.tagName || '').toLowerCase();
  const inputType = String(event.target?.type || '').toLowerCase();
  if (tagName === 'textarea' || inputType === 'button' || inputType === 'submit') return;
  event.preventDefault();
}

function validateSalesOrderDraft({
  form,
  lineItems,
  selectedCustomer,
  existingOrders,
  order,
}) {
  const soNumber = form.soNumber.trim();
  const duplicates = soNumber && existingOrders.some((item) =>
    item.id !== order?.id &&
    String(item.soNumber || '').toLowerCase() === soNumber.toLowerCase(),
  );

  if (duplicates) return 'Nomor Sales Order sudah digunakan.';
  if (!selectedCustomer) return 'Pilih customer dari Master Customer.';
  if (!form.soDate) return 'Tanggal Sales Order wajib diisi.';
  if (!form.tripDate) return 'Tanggal Jalan wajib diisi.';
  if (!form.origin.trim()) return 'Depo wajib diisi.';
  if (!form.destination.trim()) return 'Lokasi tujuan wajib diisi.';
  if (!lineItems.length) return 'Tambahkan minimal 1 rincian.';
  const invalidLineItem = lineItems.find((item) => !item.serviceName || Number(item.qty || 0) < 1 || Number(item.price || 0) < 0);
  if (invalidLineItem) return 'Setiap rincian wajib memiliki layanan, qty minimal 1, dan price tidak boleh negatif.';
  const missingContainerPrice = lineItems.find((item) => isContainerService(item.serviceName) && Number(item.price || 0) <= 0);
  if (missingContainerPrice) return 'Harga container D20/D40 wajib diisi lebih dari 0.';
  const requiresContainerType = lineItems.find((item) => isContainerService(item.serviceName) && !item.containerType);
  if (requiresContainerType) return 'Pilih jenis container untuk rincian D20 atau D40.';
  const requiresOtherNotes = lineItems.find((item) => isOtherService(item.serviceName) && !item.notes.trim());
  if (requiresOtherNotes) return 'Isi catatan untuk rincian Jasa Lainnya.';
  if (form.paymentType === 'tempo' && Number(form.paymentTermDays || 0) < 1) {
    return 'Termin pembayaran wajib diisi minimal 1 hari untuk pembayaran Tempo.';
  }
  return '';
}

function SalesOrderForm({
  onClose,
  onSubmit,
  order,
  existingOrders = [],
  customers: providedCustomers,
  depots: providedDepots = [],
  terminals: providedTerminals = [],
  destinations: providedDestinations = [],
  historicalMode = false,
}) {
  const customers = useMemo(() => (
    (Array.isArray(providedCustomers) ? providedCustomers : fallbackCustomers)
      .filter((customer) => customer.contract === 'Aktif')
  ), [providedCustomers]);
  const depotOptions = useMemo(() => normalizeMasterOptions(
    (Array.isArray(providedDepots) ? providedDepots : [])
      .filter((depot) => (depot.depotType || 'destination') === 'destination'),
  ), [providedDepots]);
  const terminalOptions = useMemo(() => normalizeMasterOptions(providedTerminals), [providedTerminals]);
  const destinationOptions = useMemo(() => normalizeMasterOptions(providedDestinations), [providedDestinations]);

  const createFormDraft = useCallback(() => {
    const draft = createInitialForm(order);
    if (historicalMode && !order) {
      return {
        ...draft,
        soDate: '',
        tripDate: '',
      };
    }
    return draft;
  }, [historicalMode, order]);

  const [form, setForm] = useState(createFormDraft);
  const [error, setError] = useState('');
  const [reviewPayload, setReviewPayload] = useState(null);
  const editing = Boolean(order);

  useEffect(() => {
    setForm(createFormDraft());
    setError('');
    setReviewPayload(null);
  }, [createFormDraft]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => String(customer.name || '').toLowerCase() === String(form.customer || '').toLowerCase()),
    [customers, form.customer],
  );

  const lineItems = form.lineItems;
  const totalQuantity = lineItems.reduce((total, item) => total + Number(item.qty || 0), 0);
  const totalAmount = lineItems.reduce((total, item) => total + calculateLineItemTotal(item), 0);
  const containerType = summarizeContainerType(lineItems);
  const container20Qty = lineItems
    .filter((item) => item.serviceName === 'Jasa Angkut D20')
    .reduce((total, item) => total + Number(item.qty || 0), 0);
  const container40Qty = lineItems
    .filter((item) => item.serviceName === 'Jasa Angkut D40')
    .reduce((total, item) => total + Number(item.qty || 0), 0);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose();
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === 'paymentType' && value === 'cash' ? { paymentTermDays: '0' } : {}),
      ...(name === 'paymentType' && value === 'tempo' && Number(current.paymentTermDays || 0) < 1 ? { paymentTermDays: '30' } : {}),
    }));
  }

  function updateLineItem(index, field, value) {
    setForm((current) => ({
      ...current,
      lineItems: current.lineItems.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
              ...(field === 'serviceName' && !isContainerService(value) ? { containerType: '' } : {}),
              ...(field === 'serviceName' && isContainerService(value) ? { containerType: item.containerType || 'Dry' } : {}),
              ...(field === 'serviceName' && !isOtherService(value) ? { notes: '' } : {}),
            }
          : item,
      ),
    }));
  }

  function addLineItem() {
    setForm((current) => ({
      ...current,
      lineItems: [...current.lineItems, createLineItemDraft()],
    }));
  }

  function removeLineItem(index) {
    setForm((current) => ({
      ...current,
      lineItems: current.lineItems.length === 1
        ? current.lineItems
        : current.lineItems.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function updateCustomer(event) {
    const value = event.target.value;
    const customer = customers.find((item) => String(item.name || '').toLowerCase() === String(value || '').toLowerCase());

    setForm((current) => ({
      ...current,
      customer: customer?.name || value,
      customerPic: customer?.pic || '',
      customerPhone: customer?.phone || '',
      customerAddress: customer?.address || '',
      salesName: customer?.salesName || '',
    }));
  }

  function updateDocument(index, field, value) {
    setForm((current) => ({
      ...current,
      referenceDocuments: current.referenceDocuments.map((document, itemIndex) =>
        itemIndex === index ? { ...document, [field]: value } : document,
      ),
    }));
  }

  function addDocument() {
    setForm((current) => ({
      ...current,
      referenceDocuments: [...current.referenceDocuments, createDocumentDraft()],
    }));
  }

  function removeDocument(index) {
    setForm((current) => ({
      ...current,
      referenceDocuments: current.referenceDocuments.length === 1
        ? current.referenceDocuments
        : current.referenceDocuments.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function handleFile(index, file, validationError) {
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!file) return;

    setError('');
    updateDocument(index, 'file', {
      name: file.name,
      size: file.size,
      type: file.type,
      rawFile: file,
    });
  }

  function handleSubmit(event) {
    event.preventDefault();

    const soNumber = form.soNumber.trim();
    const validationError = validateSalesOrderDraft({
      form,
      lineItems,
      selectedCustomer,
      existingOrders,
      order,
    });
    if (validationError) {
      setReviewPayload(null);
      return setError(validationError);
    }

    setError('');
    const normalizedLineItems = lineItems.map((item) => ({
      ...item,
      qty: Number(item.qty || 0),
      price: Number(item.price || 0),
      total: calculateLineItemTotal(item),
      notes: isOtherService(item.serviceName) ? item.notes.trim() : '',
    }));
    const price = normalizedLineItems.length === 1 ? Number(normalizedLineItems[0].price || 0) : 0;
    const serviceSummary = summarizeLineItems(normalizedLineItems);
    const containerSummary = normalizedLineItems.map(formatLineItemLabel).join(' + ');
    const containers = buildContainersFromLineItems(normalizedLineItems, form.receivedAt, order?.containers || []);
    setReviewPayload({
      ...form,
      soNumber,
      financeVerificationStatus: historicalMode && soNumber ? 'verified' : form.financeVerificationStatus,
      origin: form.origin.trim(),
      destination: form.destination.trim(),
      salesName: selectedCustomer?.salesName || form.salesName || '',
      invoiceNumber: form.invoiceNumber.trim(),
      paymentType: form.paymentType === 'tempo' ? 'tempo' : 'cash',
      paymentTermDays: form.paymentType === 'tempo' ? Number(form.paymentTermDays || 0) : 0,
      container: containerSummary,
      terminal: form.terminal.trim(),
      vesselName: form.vesselName.trim(),
      serviceName: serviceSummary,
      lineItems: normalizedLineItems,
      container20Qty,
      container40Qty,
      cargoType: containerType,
      price,
      quantity: totalQuantity,
      totalAmount,
      unit: form.unit || 'Container',
      containers,
      referenceDocuments: form.referenceDocuments,
    });
  }

  function confirmSubmit() {
    if (!reviewPayload) return;
    onSubmit(reviewPayload);
    setReviewPayload(null);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="order-modal sales-order-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sales-order-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">{editing ? 'Edit Sales' : 'Input Sales'}</p>
            <h2 id="sales-order-title">{editing ? `Edit ${order.soNumber || 'Order Menunggu SO'}` : 'Sales Order Baru'}</h2>
            <span>Lengkapi customer, rincian order, dan dokumen referensi.</span>
          </div>

          <button type="button" onClick={onClose} aria-label="Tutup form">
            <X size={20} />
          </button>
        </header>

        <form onSubmit={handleSubmit} onKeyDown={preventEnterSubmit} noValidate>
          <div className="sales-order-form-content">
          {error ? <div className="alert error sales-order-error">{error}</div> : null}

          <div className="form-section">
            <h3>Informasi Customer</h3>

            <div className="order-form-grid">
              <label>
                Customer
                <SearchableInput
                  name="customer"
                  value={form.customer}
                  onChange={updateCustomer}
                  options={customers.map((customer) => customer.name).filter(Boolean)}
                  placeholder="Ketik nama customer"
                  required
                />
              </label>

              <label>
                PIC Customer
                <input value={form.customerPic} readOnly />
              </label>

              <label>
                Kontak PIC
                <input value={form.customerPhone} readOnly />
              </label>

              <label>
                Alamat Customer
                <textarea value={form.customerAddress} readOnly rows="2" />
              </label>
            </div>
          </div>

          <div className="form-section">
            <h3>Informasi Order</h3>
            <p className="section-helper-text">
              {historicalMode
                ? 'Nomor SO lama boleh langsung diisi Admin sesuai data arsip.'
                : 'No. Invoice diisi setelah pekerjaan selesai dan invoice dibuat.'}
            </p>

            <div className="order-form-grid">
              {editing || historicalMode ? (
                <label>
                  No. Sales Order
                  <input
                    name="soNumber"
                    value={historicalMode ? form.soNumber : form.soNumber || 'Menunggu Finance'}
                    onChange={historicalMode ? updateField : undefined}
                    placeholder={historicalMode ? 'SO-ARM-000' : undefined}
                    readOnly={!historicalMode}
                  />
                </label>
              ) : null}

              <label>
                No. DO Customer
                <input
                  name="doNumber"
                  value={form.doNumber}
                  onChange={updateField}
                  placeholder="DO-CUST-0001"
                />
              </label>

              <label>
                Tanggal Sales Order
                <input
                  name="soDate"
                  type="date"
                  value={form.soDate}
                  onChange={updateField}
                  required
                />
              </label>

              <label>
                Tanggal Jalan
                <input
                  name="tripDate"
                  type="date"
                  value={form.tripDate}
                  onChange={updateField}
                  required
                />
              </label>

              <label>
                Shipment
                <select name="shipment" value={form.shipment} onChange={updateField}>
                  <option value="import">Import</option>
                  <option value="export">Export</option>
                  <option value="domestik inward">Domestik Inward</option>
                  <option value="domestik outward">Domestik Outward</option>
                  <option value="repo_empty">Repo Empty</option>
                  <option value="repo_full">Repo Full</option>
                </select>
              </label>

              <label>
                Jenis Pembayaran
                <select name="paymentType" value={form.paymentType} onChange={updateField}>
                  <option value="cash">Cash</option>
                  <option value="tempo">Tempo</option>
                </select>
              </label>

              {form.paymentType === 'tempo' ? (
                <label>
                  Termin Pembayaran (Hari)
                  <input
                    name="paymentTermDays"
                    type="number"
                    min="1"
                    value={form.paymentTermDays}
                    onChange={updateField}
                    onWheel={preventNumberWheelChange}
                    placeholder="30"
                  />
                </label>
              ) : null}

              <label>
                Nama Kapal
                <input
                  name="vesselName"
                  value={form.vesselName}
                  onChange={updateField}
                  placeholder="MV ..."
                />
              </label>

              <label>
                Depo
                <SearchableInput
                  name="origin"
                  value={form.origin}
                  onChange={updateField}
                  options={depotOptions}
                  placeholder="Pilih Depo"
                  required
                />
              </label>

              <label>
                Lokasi Tujuan
                <SearchableInput
                  name="destination"
                  value={form.destination}
                  onChange={updateField}
                  options={destinationOptions}
                  placeholder="Pilih Lokasi Tujuan"
                  required
                />
              </label>

              <label>
                Terminal
                <SearchableInput
                  name="terminal"
                  value={form.terminal}
                  onChange={updateField}
                  options={terminalOptions}
                  placeholder="Pilih Terminal"
                />
              </label>

              <label className="span-two">
                Job Description
                <textarea
                  name="jobDescription"
                  value={form.jobDescription}
                  onChange={updateField}
                  rows="2"
                />
              </label>
            </div>
          </div>

          <div className="form-section information-section">
            <h3>Rincian</h3>

            <div className="line-item-toolbar">
              <p>Tambahkan rincian jasa per baris. Satu SO bisa berisi campuran D20, D40, Bon Muat/Bongkar, dan Tila/Gatepass.</p>
              <button className="secondary-button" type="button" onClick={addLineItem}>
                <Plus size={16} /> Tambah Rincian
              </button>
            </div>

            <div className="line-item-table-head" aria-hidden="true">
              <span>No</span>
              <span>Jenis Rincian</span>
              <span>Jenis Container</span>
              <span>Qty</span>
              <span>Price</span>
              <span>Total</span>
              <span />
            </div>

            <div className="line-item-list">
              {lineItems.map((item, index) => {
                const itemTotal = calculateLineItemTotal(item);
                const showContainerType = isContainerService(item.serviceName);
                const showNotes = isOtherService(item.serviceName);
                return (
                  <div className="line-item-card" key={item.id}>
                    <div className="line-item-row">
                      <div className="line-item-no">{index + 1}</div>

                      <div className="line-item-field">
                        <select
                          aria-label="Jenis Rincian"
                          value={item.serviceName}
                          onChange={(event) => updateLineItem(index, 'serviceName', event.target.value)}
                        >
                          {SERVICE_OPTIONS.map((service) => (
                            <option key={service} value={service}>{service}</option>
                          ))}
                        </select>
                      </div>

                      <div className="line-item-field">
                        {showContainerType ? (
                          <select
                            aria-label="Jenis Container"
                            value={item.containerType}
                            onChange={(event) => updateLineItem(index, 'containerType', event.target.value)}
                          >
                            <option value="">Pilih jenis container</option>
                            {CONTAINER_TYPE_OPTIONS.map((type) => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        ) : (
                          <input aria-label="Jenis Container" value="-" readOnly />
                        )}
                      </div>

                      <div className="line-item-field">
                        <input
                          aria-label="Qty"
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(event) => updateLineItem(index, 'qty', event.target.value)}
                          onWheel={preventNumberWheelChange}
                          placeholder="0"
                        />
                      </div>

                      <div className="line-item-field">
                        <input
                          aria-label="Price"
                          type="number"
                          min="0"
                          value={item.price}
                          onChange={(event) => updateLineItem(index, 'price', event.target.value)}
                          onWheel={preventNumberWheelChange}
                          placeholder="0"
                        />
                      </div>

                      <div className="line-item-field">
                        <input aria-label="Total" value={itemTotal.toLocaleString('id-ID')} readOnly />
                      </div>

                      <button type="button" className="line-item-delete" onClick={() => removeLineItem(index)} aria-label={`Hapus rincian ${index + 1}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {showNotes ? (
                      <label className="line-item-note-field">
                        Catatan Jasa Lainnya
                        <input
                          aria-label="Catatan Jasa Lainnya"
                          value={item.notes}
                          onChange={(event) => updateLineItem(index, 'notes', event.target.value)}
                          placeholder="Contoh: biaya admin, LOLO, seal, atau catatan lain"
                        />
                      </label>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="rincian-summary">
              <div>
                <span>Total</span>
                <strong>{totalAmount.toLocaleString('id-ID')}</strong>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-heading">
              <div>
                <h3>Dokumen Referensi Customer</h3>
                <p>Tambahkan DO, SPK, email, WhatsApp instruction, atau dokumen pendukung lainnya.</p>
              </div>

              <button className="secondary-button" type="button" onClick={addDocument}>
                <Plus size={16} /> Tambah Dokumen
              </button>
            </div>

            <div className="reference-document-list">
              {form.referenceDocuments.map((document, index) => (
                <div className="reference-document-card" key={`document-${index}`}>
                  <label>
                    Jenis
                    <select
                      value={document.documentType}
                      onChange={(event) => updateDocument(index, 'documentType', event.target.value)}
                    >
                      <option>Delivery Order</option>
                      <option>Customer SPK</option>
                      <option>Email Instruction</option>
                      <option>WhatsApp Instruction</option>
                      <option>Other Document</option>
                    </select>
                  </label>

                  <label>
                    Tanggal Dokumen
                    <input
                      type="date"
                      value={document.documentDate}
                      onChange={(event) => updateDocument(index, 'documentDate', event.target.value)}
                    />
                  </label>

                  <div className="document-file-button">
                    <AttachmentUploadField
                      id={`reference-document-${index}`}
                      label="Upload Dokumen"
                      value={document.file}
                      title={document.file?.name ? 'Ubah File' : 'Pilih File'}
                      helper="PDF, JPG, PNG"
                      compact
                      accept={REFERENCE_FILE_ACCEPT}
                      validationOptions={{
                        label: 'Dokumen referensi',
                      }}
                      onSelect={(file, validationError) => handleFile(index, file, validationError)}
                      onClear={() => updateDocument(index, 'file', null)}
                    />
                  </div>

                  <label className="document-notes">
                    Catatan
                    <input
                      value={document.notes}
                      onChange={(event) => updateDocument(index, 'notes', event.target.value)}
                      placeholder="Catatan dokumen"
                    />
                  </label>

                  <button type="button" onClick={() => removeDocument(index)} aria-label="Hapus dokumen">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          </div>

          <footer>
            <button className="secondary-button" type="button" onClick={onClose}>
              Batal
            </button>

            <button className="primary-button" type="submit">
              {editing ? 'Cek Perubahan' : 'Cek Sales Order'}
            </button>
          </footer>
        </form>

        {reviewPayload ? (
          <div className="sales-order-review-backdrop" role="presentation" onMouseDown={() => setReviewPayload(null)}>
            <section className="sales-order-review-modal" role="dialog" aria-modal="true" aria-labelledby="sales-order-review-title" onMouseDown={(event) => event.stopPropagation()}>
              <header>
                <div>
                  <span>Validasi Sales Order</span>
                  <h3 id="sales-order-review-title">Cek data sebelum disimpan</h3>
                </div>
                <button type="button" aria-label="Tutup validasi" onClick={() => setReviewPayload(null)}>
                  <X size={18} />
                </button>
              </header>

              <div className="sales-order-review-body">
                <div className="sales-order-review-grid">
                  <div><span>Customer</span><strong>{reviewPayload.customer || '-'}</strong></div>
                  <div><span>No. SO</span><strong>{reviewPayload.soNumber || 'Menunggu Finance'}</strong></div>
                  <div><span>Tanggal SO</span><strong>{formatDate(reviewPayload.soDate)}</strong></div>
                  <div><span>Tanggal Jalan</span><strong>{formatDate(reviewPayload.tripDate)}</strong></div>
                  <div><span>Depo</span><strong>{reviewPayload.origin || '-'}</strong></div>
                  <div><span>Tujuan</span><strong>{reviewPayload.destination || '-'}</strong></div>
                  <div><span>Shipment</span><strong>{reviewPayload.shipment || '-'}</strong></div>
                  <div><span>Pembayaran</span><strong>{reviewPayload.paymentType === 'tempo' ? `Tempo ${reviewPayload.paymentTermDays} hari` : 'Cash'}</strong></div>
                </div>

                <div className="sales-order-review-lines">
                  <span>Rincian Order</span>
                  {reviewPayload.lineItems.map((item, index) => (
                    <div key={item.id || `${item.serviceName}-${index}`}>
                      <strong>{formatLineItemLabel(item)}</strong>
                      <span>{Number(item.total || 0).toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                </div>

                <div className="sales-order-review-total">
                  <span>{reviewPayload.containers.length} container job akan dibuat</span>
                  <strong>Rp {Number(reviewPayload.totalAmount || 0).toLocaleString('id-ID')}</strong>
                </div>
              </div>

              <footer>
                <button className="secondary-button" type="button" onClick={() => setReviewPayload(null)}>
                  Kembali Edit
                </button>
                <button className="primary-button" type="button" onClick={confirmSubmit}>
                  {editing ? 'Simpan Update' : 'Simpan Sales Order'}
                </button>
              </footer>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default SalesOrderForm;
