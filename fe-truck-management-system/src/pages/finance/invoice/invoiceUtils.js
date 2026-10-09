import { FINANCE_DOCUMENT_MAX_SIZE, validateArchiveFile } from '../../../utils/fileValidation';

const INVOICE_TABLE_PAGE_SIZE = 20;

const defaultInvoiceSummary = {
  needNumber: 0,
  inProgress: 0,
  paid: 0,
  missingInvoiceDocuments: 0,
  missingInvoiceDocument: 0,
  missingTaxInvoiceDocument: 0,
  completeInvoiceDocuments: 0,
  sentInvoiceDocuments: 0,
  allInvoices: 0,
  sjIncomplete: 0,
  sjComplete: 0,
  notSentToCustomer: 0,
  sentToCustomer: 0,
  dueSoon: 0,
  overdue: 0,
};

const financeInvoiceUploadSlots = [
  {
    type: 'invoice',
    category: 'invoicePdf',
    label: 'Invoice',
    uploadedAtKey: 'invoiceDocumentUploadedAt',
    uploadedByKey: 'invoiceDocumentUploadedBy',
  },
  {
    type: 'taxInvoice',
    category: 'taxInvoicePdf',
    label: 'Faktur Pajak',
    uploadedAtKey: 'taxInvoiceDocumentUploadedAt',
    uploadedByKey: 'taxInvoiceDocumentUploadedBy',
  },
  {
    type: 'debitNote',
    category: 'debitNotePdf',
    label: 'Dokumen Debit Note',
    uploadedAtKey: 'debitNoteDocumentUploadedAt',
    uploadedByKey: 'debitNoteDocumentUploadedByName',
  },
];

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

function normalizeFinanceInvoiceRow(row = {}) {
  return {
    id: row.id,
    soNumber: row.soNumber || '-',
    customer: row.customer || '-',
    destination: row.destination || '-',
    completedAt: formatDisplayDate(row.completedAt),
    documentStatus: row.documentStatus || '-',
    billingAmount: Number(row.billingAmount || 0),
    plannedJobsCount: Number(row.plannedJobsCount || 0),
    billedJobsCount: Number(row.billedJobsCount || 0),
    sjUploadedCount: Number(row.sjUploadedCount || 0),
    sjTotalCount: Number(row.sjTotalCount || row.billedJobsCount || row.containerCount || 0),
    inapJobsCount: Number(row.inapJobsCount || 0),
    cancelledJobsCount: Number(row.cancelledJobsCount || 0),
    repoStoredJobsCount: Number(row.repoStoredJobsCount || 0),
    cancellationNote: row.cancellationNote || '',
    repoStoredNote: row.repoStoredNote || '',
    paymentTerms: row.paymentTerms || '-',
    invoiceDate: formatDisplayDate(row.invoiceDate),
    dueDate: formatDisplayDate(row.dueDate),
    billingItems: Array.isArray(row.billingItems) && row.billingItems.length ? row.billingItems : ['Rincian tagihan belum tersedia'],
    documentChecklist: Array.isArray(row.documentChecklist) ? row.documentChecklist : [],
    documents: Array.isArray(row.documents) ? row.documents : [],
    invoiceDocumentStatus: row.invoiceDocumentStatus || 'belum_upload',
    invoiceDocumentStatusLabel: row.invoiceDocumentStatusLabel || 'Belum Upload',
    invoiceDocumentUploadedAt: row.invoiceDocumentUploadedAt || '',
    invoiceDocumentUploadedBy: row.invoiceDocumentUploadedBy || '',
    taxInvoiceDocumentUploadedAt: row.taxInvoiceDocumentUploadedAt || '',
    taxInvoiceDocumentUploadedBy: row.taxInvoiceDocumentUploadedBy || '',
    invoiceDocumentSentAt: row.invoiceDocumentSentAt || '',
    invoiceDocumentSentBy: row.invoiceDocumentSentBy || '',
    invoiceDocumentDeliveryMethod: row.invoiceDocumentDeliveryMethod || '',
    invoiceDocumentDeliveryNotes: row.invoiceDocumentDeliveryNotes || '',
    invoiceAging: row.invoiceAging || {
      currentStage: '-',
      currentDays: null,
      completionToInvoiceDays: null,
      invoiceToDocumentsDays: null,
      documentsToSentDays: null,
      sentToPaidDays: null,
    },
    activityLogs: Array.isArray(row.activityLogs) ? row.activityLogs.map((log) => {
      const [timestamp, ...rest] = String(log).split(' - ');
      return `${formatDisplayDate(timestamp)} - ${rest.join(' - ') || timestamp}`;
    }) : [],
    invoiceNumber: row.invoiceNumber || '',
    invoiceStatus: row.invoiceStatus || (row.invoiceNumber ? 'Menunggu Update Status' : 'Butuh Nomor Invoice'),
    paymentStatus: row.paymentStatus || '-',
    billingStatus: row.billingStatus || 'belum_invoice',
    debitNoteAmount: Number(row.debitNoteAmount || 0),
    debitNoteItems: Array.isArray(row.debitNoteItems) ? row.debitNoteItems : [],
    containerCount: Number(row.containerCount || 0),
    debitNoteNumber: row.debitNoteNumber || '',
    debitNoteIssuedAt: row.debitNoteIssuedAt || '',
    debitNoteDueDate: row.debitNoteDueDate || '',
    debitNoteItemCount: Number(row.debitNoteItemCount || 0),
    debitNoteTotalPaid: Number(row.debitNoteTotalPaid || 0),
    debitNoteOutstandingAmount: Number(row.debitNoteOutstandingAmount || 0),
    debitNoteAgingBucket: row.debitNoteAgingBucket || '',
    debitNoteDocumentUploadedAt: row.debitNoteDocumentUploadedAt || '',
    debitNoteDocumentUploadedByName: row.debitNoteDocumentUploadedByName || '',
    containerNumbers: Array.isArray(row.containerNumbers) ? row.containerNumbers.filter(Boolean) : [],
    containerBreakdown: Array.isArray(row.containerBreakdown) ? row.containerBreakdown : [],
    manualRevenueAmount: Number(row.manualRevenueAmount || 0),
    manualRevenueLines: Array.isArray(row.manualRevenueLines) ? row.manualRevenueLines : [],
    internalCost: row.internalCost || {
      journeyMoney: 0,
      journeyMoneySource: 'snapshot',
      journeyMoneyNeedsReview: false,
      additionalCost: 0,
      driverCommissionCost: 0,
      operationalExpenseTotal: 0,
      total: 0,
    },
  };
}

function formatAgingDays(days) {
  if (days === null || days === undefined || days === '') return '-';
  return `${Number(days || 0)} hari`;
}

function agingToneClass(days) {
  if (days === null || days === undefined || days === '') return 'border-slate-200 bg-slate-50 text-slate-500';
  const value = Number(days || 0);
  if (value >= 7) return 'border-red-200 bg-red-50 text-red-700';
  if (value >= 3) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function findInvoiceFinanceDocument(documents, category) {
  return documents.find((document) => (
    document.category === category
    && document.ready !== false
    && Boolean(document.file?.path)
  ));
}

function mapUploadedInvoiceDocument(uploadedDocument, documentType) {
  if (!uploadedDocument) return null;
  const category = uploadedDocument.category || (
    documentType === 'taxInvoice' ? 'taxInvoicePdf' : documentType === 'debitNote' ? 'debitNotePdf' : 'invoicePdf'
  );
  const label = category === 'taxInvoicePdf' ? 'Faktur Pajak' : category === 'debitNotePdf' ? 'Dokumen Debit Note' : 'Invoice';
  return {
    id: uploadedDocument.id || uploadedDocument.path || `${category}-${Date.now()}`,
    category,
    label,
    source: 'Finance',
    ready: true,
    uploadedAt: uploadedDocument.uploadedAt || uploadedDocument.createdAt || '',
    uploadedBy: uploadedDocument.uploadedByName || uploadedDocument.uploadedBy || '',
    file: {
      name: uploadedDocument.fileName || uploadedDocument.fileNameOriginal || uploadedDocument.name || label,
      path: uploadedDocument.path || uploadedDocument.id || uploadedDocument.storagePath || '',
      type: uploadedDocument.mimeType || uploadedDocument.type || 'application/pdf',
      size: Number(uploadedDocument.fileSize ?? uploadedDocument.sizeBytes ?? uploadedDocument.size ?? 0),
    },
  };
}

function mergeInvoiceDocument(documents = [], nextDocument) {
  if (!nextDocument) return documents;
  const withoutSameCategory = documents.filter((document) => document.category !== nextDocument.category);
  return [nextDocument, ...withoutSameCategory];
}

const INVOICE_DOCUMENT_UPLOAD_HINT = 'PDF, maksimal 20 MB';

function validateInvoicePdfFile(file, label) {
  return validateArchiveFile(file, {
    label,
    allowedTypes: ['application/pdf'],
    allowedExtensions: ['pdf'],
    allowedLabel: 'PDF',
    maxSize: FINANCE_DOCUMENT_MAX_SIZE,
  });
}

export {
  INVOICE_DOCUMENT_UPLOAD_HINT,
  INVOICE_TABLE_PAGE_SIZE,
  agingToneClass,
  defaultInvoiceSummary,
  financeInvoiceUploadSlots,
  findInvoiceFinanceDocument,
  formatAgingDays,
  mapUploadedInvoiceDocument,
  mergeInvoiceDocument,
  normalizeFinanceInvoiceRow,
  validateInvoicePdfFile,
};
