import { httpClient } from '../api/httpClient';
import { uploadAttachmentFile } from '../files/fileService';

const SERVICE_OPTIONS = [
  'Jasa Angkut D20',
  'Jasa Angkut D40',
  'Bon Muat/Bongkar',
  'Tila/Gatepass',
];

function isContainerService(serviceName) {
  return serviceName === 'Jasa Angkut D20' || serviceName === 'Jasa Angkut D40';
}

function normalizeLineItem(item = {}) {
  const serviceName = SERVICE_OPTIONS.includes(item.serviceName) ? item.serviceName : 'Jasa Angkut D20';
  const qty = Math.max(1, Number(item.qty || 0));
  const price = Math.max(0, Number(item.price || 0));
  return {
    id: item.id || `line-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    serviceName,
    containerType: isContainerService(serviceName) ? (item.containerType || item.cargoType || '') : '',
    qty,
    price,
    total: Number(item.total || qty * price),
  };
}

function normalizeLineItems(payload) {
  if (Array.isArray(payload.lineItems) && payload.lineItems.length) {
    return payload.lineItems.map(normalizeLineItem);
  }

  const legacyItems = [];
  const serviceName = payload.serviceName || '';
  const price = Number(payload.price || 0);
  const d20Qty = Math.max(0, Number(payload.container20Qty || 0));
  const d40Qty = Math.max(0, Number(payload.container40Qty || 0));

  if (serviceName && serviceName !== 'Campuran') {
    legacyItems.push(normalizeLineItem({
      serviceName,
      containerType: payload.cargoType || payload.container || '',
      qty: Math.max(1, Number(payload.quantity || d20Qty || d40Qty || 1)),
      price,
    }));
  } else if (d20Qty || d40Qty) {
    if (d20Qty) {
      legacyItems.push(normalizeLineItem({
        serviceName: 'Jasa Angkut D20',
        containerType: payload.cargoType || payload.container || '',
        qty: d20Qty,
        price,
      }));
    }
    if (d40Qty) {
      legacyItems.push(normalizeLineItem({
        serviceName: 'Jasa Angkut D40',
        containerType: payload.cargoType || payload.container || '',
        qty: d40Qty,
        price,
      }));
    }
  } else if (price || payload.quantity) {
    legacyItems.push(normalizeLineItem({
      serviceName: serviceName || 'Bon Muat/Bongkar',
      containerType: payload.cargoType || payload.container || '',
      qty: Math.max(1, Number(payload.quantity || 1)),
      price,
    }));
  }

  return legacyItems;
}

function withActor(form, user, existing) {
  return {
    ...form,
    createdBy: existing?.createdBy || user?.fullName || user?.name || 'Sales',
    updatedBy: user?.fullName || user?.name || 'Sales',
  };
}

function normalizeContainerSize(size) {
  return String(size || '20FT').toUpperCase().replace(/\s/g, '') === '40FT' ? '40FT' : '20FT';
}

function normalizeReferenceDocuments(referenceDocuments = []) {
  return referenceDocuments
    .filter((document) => document && (document.documentType || document.referenceNumber || document.documentDate || document.file || document.notes))
    .map((document) => ({
      documentType: document.documentType || 'Delivery Order',
      referenceNumber: document.referenceNumber || '',
      documentDate: document.documentDate || '',
      file: document.file
        ? {
            name: document.file.name || '',
            size: document.file.size || 0,
            type: document.file.type || '',
            path: document.file.path || '',
            storagePath: document.file.storagePath || '',
          }
        : null,
      notes: document.notes || '',
    }));
}

function getRawFile(file) {
  if (!file) return null;
  if (file instanceof File) return file;
  if (file.rawFile instanceof File) return file.rawFile;
  return null;
}

async function uploadReferenceDocuments(orderId, referenceDocuments = [], user) {
  const uploadedDocuments = [];

  for (const document of referenceDocuments) {
    if (!document || (!document.documentType && !document.referenceNumber && !document.documentDate && !document.file && !document.notes)) {
      continue;
    }

    const rawFile = getRawFile(document.file);
    const existingPath = document.file?.path || '';
    if (!rawFile) {
      if (existingPath) {
        const updated = await uploadAttachmentFile({
          path: existingPath,
          entityType: 'sales_order',
          entityId: orderId,
          category: document.documentType || 'Delivery Order',
          referenceNumber: document.referenceNumber || '',
          documentDate: document.documentDate || '',
          notes: document.notes || '',
          uploadedByName: user?.fullName || user?.name || 'Sales',
        });
        uploadedDocuments.push({
          ...document,
          file: updated
            ? {
                name: updated.fileName || document.file.name || '',
                size: updated.fileSize || document.file.size || 0,
                type: updated.mimeType || document.file.type || '',
                path: updated.path || updated.id || existingPath,
                storagePath: updated.storagePath || document.file.storagePath || '',
              }
            : {
                name: document.file.name || '',
                size: document.file.size || 0,
                type: document.file.type || '',
                path: existingPath,
                storagePath: document.file.storagePath || '',
              },
        });
        continue;
      }

      uploadedDocuments.push({
        ...document,
        file: document.file
          ? {
              name: document.file.name || '',
              size: document.file.size || 0,
              type: document.file.type || '',
              path: document.file.path || '',
              storagePath: document.file.storagePath || '',
            }
          : null,
      });
      continue;
    }

    const uploaded = await uploadAttachmentFile({
      path: existingPath,
      entityType: 'sales_order',
      entityId: orderId,
      category: document.documentType || 'Delivery Order',
      file: rawFile,
      referenceNumber: document.referenceNumber || '',
      documentDate: document.documentDate || '',
      notes: document.notes || '',
      uploadedByName: user?.fullName || user?.name || 'Sales',
    });

    uploadedDocuments.push({
      ...document,
      file: uploaded
        ? {
            name: uploaded.fileName || rawFile.name || '',
            size: uploaded.fileSize || rawFile.size || 0,
            type: uploaded.mimeType || rawFile.type || '',
            path: uploaded.path || uploaded.id || '',
            storagePath: uploaded.storagePath || '',
          }
        : {
            name: rawFile.name || '',
            size: rawFile.size || 0,
            type: rawFile.type || '',
            path: '',
            storagePath: '',
          },
    });
  }

  return uploadedDocuments;
}

function normalizeContainers(form) {
  const source = Array.isArray(form.containers) ? form.containers : [];
  if (source.length) {
    return source.map((container) => ({
      id: container.id,
      containerNumber: String(container.containerNumber || '').trim().toUpperCase(),
      size: normalizeContainerSize(container.size),
      type: container.type || 'Dry',
      notes: container.notes || '',
      rpujStatus: container.rpujStatus || 'pending',
      status: container.status || 'received',
      receivedAt: container.receivedAt || form.receivedAt || new Date().toISOString(),
      runningAt: container.runningAt || null,
      completedAt: container.completedAt || null,
      updatedBy: container.updatedBy || null,
      updatedAt: container.updatedAt || null,
    }));
  }

  const lineItems = normalizeLineItems(form);
  if (lineItems.length) {
    const containers = [];
    lineItems.forEach((item) => {
      if (!isContainerService(item.serviceName)) return;
      const size = item.serviceName === 'Jasa Angkut D40' ? '40FT' : '20FT';
      for (let index = 0; index < Math.max(0, Number(item.qty || 0)); index += 1) {
        containers.push({
          containerNumber: '',
          size,
          type: item.containerType || 'Dry',
          notes: item.serviceName,
          rpujStatus: 'pending',
          status: 'received',
        });
      }
    });
    return containers;
  }

  const container20Qty = Math.max(0, Number(form.container20Qty || 0));
  const container40Qty = Math.max(0, Number(form.container40Qty || 0));
  const containers = [];

  for (let index = 0; index < container20Qty; index += 1) {
    containers.push({
      containerNumber: '',
      size: '20FT',
      type: 'Dry',
      notes: '',
      rpujStatus: 'pending',
      status: 'received',
    });
  }

  for (let index = 0; index < container40Qty; index += 1) {
    containers.push({
      containerNumber: '',
      size: '40FT',
      type: 'Dry',
      notes: '',
      rpujStatus: 'pending',
      status: 'received',
    });
  }

  return containers;
}

function prepareSalesOrderPayload(form, user, existing) {
  const payload = withActor(form, user, existing);
  const lineItems = normalizeLineItems(payload);
  const containers = normalizeContainers({ ...payload, lineItems });
  const price = Number(payload.price || 0);
  const quantity = Number(payload.quantity || lineItems.reduce((total, item) => total + Number(item.qty || 0), 0) || containers.length || 0);
  const totalAmount = Number(
    payload.totalAmount
    || lineItems.reduce((total, item) => total + Number(item.total || Number(item.qty || 0) * Number(item.price || 0)), 0)
    || price * (quantity || containers.length)
    || 0,
  );
  const uniqueServices = [...new Set(lineItems.map((item) => item.serviceName).filter(Boolean))];
  const summaryName = uniqueServices.length === 1 ? uniqueServices[0] : uniqueServices.length > 1 ? 'Campuran' : payload.serviceName || null;
  const uniqueContainerTypes = [...new Set(lineItems.map((item) => item.containerType).filter(Boolean))];
  return {
    ...payload,
    shipment: payload.shipment || 'import',
    jobType: payload.jobType || 'Trucking Container',
    lineItems,
    serviceName: summaryName,
    price,
    quantity: quantity || containers.length,
    totalAmount,
    unit: payload.unit || 'Container',
    container: payload.container || lineItems.map((item) => {
      const typeLabel = item.containerType ? ` - ${item.containerType}` : '';
      return `${item.serviceName}${typeLabel} x${item.qty}`;
    }).join(' + ') || null,
    cargoType: uniqueContainerTypes.length === 1 ? uniqueContainerTypes[0] : payload.cargoType || null,
    containers,
    referenceDocuments: normalizeReferenceDocuments(payload.referenceDocuments),
  };
}

export async function fetchSalesOrders() {
  const result = await httpClient.get('/sales-orders?page=1&pageSize=100');
  return result.rows || [];
}

export async function fetchSalesOrdersPage({
  page = 1,
  pageSize = 8,
  query = '',
  status = '',
  invoiced = false,
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    query,
  });
  if (status) params.set('status', status);
  if (invoiced) params.set('invoiced', 'true');
  return httpClient.get(`/sales-orders?${params.toString()}`);
}

export function saveSalesOrder(form, user, existing) {
  const payload = prepareSalesOrderPayload(form, user, existing);
  const request = existing?.id
    ? httpClient.patch(`/sales-orders/${existing.id}`, payload)
    : httpClient.post('/sales-orders', payload);

  return request.then(async (saved) => ({
    ...saved,
    referenceDocuments: await uploadReferenceDocuments(saved.id, form.referenceDocuments || [], user),
  }));
}

export function cancelSalesOrder(id) {
  return httpClient.patch(`/sales-orders/${id}/cancel`, {});
}
