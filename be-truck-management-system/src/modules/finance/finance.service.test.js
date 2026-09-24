import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_TOKEN_SECRET ||= 'test-auth-token-secret-minimum-32-characters';

const {
  addContainerJobExpenseTransferProof,
  approveFinanceCorrection,
  createOperationalFundRequest,
  depositOperationalFund,
  editContainerJobExpenseTransferProof,
  reconcileContainerJobExpense,
  removeContainerJobExpenseTransferProof,
  rejectFinanceCorrection,
  rejectOperationalFundRequest,
  rejectRpuj,
  recordCustomerInvoicePaymentAllocations,
  saveInvoiceNumber,
  uploadInvoiceDocument,
} = await import('./finance.service.js');
const { mapInvoiceDocuments } = await import('./finance.repository.js');
const {
  financeCorrectionTypes,
  isFinanceCorrectionAdminApprovalRequired,
  normalizeFinanceCorrectionType,
  validateFinanceCorrectionInput,
} = await import('./finance-corrections.js');

test('reject RPUJ mewajibkan catatan penolakan', () => {
  assert.throws(
    () => rejectRpuj('job-1', { rejectionNote: '   ' }, { name: 'Finance Test' }),
    (error) => error.code === 'RPUJ_REJECTION_NOTE_REQUIRED' && error.statusCode === 400,
  );
});

test('reject RPUJ membatasi catatan maksimal 500 karakter', () => {
  assert.throws(
    () => rejectRpuj('job-1', { rejectionNote: 'a'.repeat(501) }, { name: 'Finance Test' }),
    (error) => error.code === 'RPUJ_REJECTION_NOTE_TOO_LONG' && error.statusCode === 400,
  );
});

test('pengajuan saldo operasional mewajibkan tanggal valid dan nominal positif', () => {
  assert.throws(
    () => createOperationalFundRequest({ requestDate: '20-08-2026', amount: 1000000 }, { name: 'Operational Test' }),
    (error) => error.code === 'OPERATIONAL_FUND_DATE_INVALID' && error.statusCode === 400,
  );
  assert.throws(
    () => createOperationalFundRequest({ requestDate: '2026-08-20', amount: 0 }, { name: 'Operational Test' }),
    (error) => error.code === 'OPERATIONAL_FUND_AMOUNT_INVALID' && error.statusCode === 400,
  );
});

test('deposit saldo operasional langsung memakai validasi tanggal, nominal, dan bukti transfer', async () => {
  await assert.rejects(
    () => depositOperationalFund({ requestDate: '20-08-2026', amount: 1000000 }, { name: 'Finance Test' }),
    (error) => error.code === 'OPERATIONAL_FUND_DATE_INVALID' && error.statusCode === 400,
  );
  await assert.rejects(
    () => depositOperationalFund({ requestDate: '2026-08-20', amount: 0 }, { name: 'Finance Test' }),
    (error) => error.code === 'OPERATIONAL_FUND_AMOUNT_INVALID' && error.statusCode === 400,
  );
  await assert.rejects(
    () => depositOperationalFund({ requestDate: '2026-08-20', amount: 1000000 }, { name: 'Finance Test' }),
    (error) => error.code === 'OPERATIONAL_FUND_DEPOSIT_PROOF_REQUIRED' && error.statusCode === 400,
  );
});

test('alokasi pembayaran customer multi-invoice memvalidasi role, total, dan alokasi sebelum upload bukti', async () => {
  await assert.rejects(
    () => recordCustomerInvoicePaymentAllocations(
      { totalAmount: 1000000, allocations: [{ salesOrderId: 'so-1', amount: 1000000 }] },
      { role: 'sales', name: 'Sales Test' },
    ),
    (error) => error.code === 'FINANCE_INVOICE_PAYMENT_FORBIDDEN' && error.statusCode === 403,
  );
  await assert.rejects(
    () => recordCustomerInvoicePaymentAllocations(
      { totalAmount: 0, allocations: [{ salesOrderId: 'so-1', amount: 1000000 }] },
      { role: 'finance', name: 'Finance Test' },
    ),
    (error) => error.code === 'CUSTOMER_PAYMENT_TOTAL_AMOUNT_INVALID' && error.statusCode === 400,
  );
  await assert.rejects(
    () => recordCustomerInvoicePaymentAllocations(
      { totalAmount: 1000000, allocations: [{ salesOrderId: 'so-1', amount: 0 }] },
      { role: 'finance', name: 'Finance Test' },
    ),
    (error) => error.code === 'CUSTOMER_PAYMENT_ALLOCATION_AMOUNT_INVALID' && error.statusCode === 400,
  );
  await assert.rejects(
    () => recordCustomerInvoicePaymentAllocations(
      { totalAmount: 1000000, allocations: [{ salesOrderId: 'so-1', amount: 1200000 }] },
      { role: 'finance', name: 'Finance Test' },
    ),
    (error) => error.code === 'CUSTOMER_PAYMENT_ALLOCATION_EXCEEDS_TRANSFER' && error.statusCode === 409,
  );
});

test('pengajuan saldo operasional membatasi keterangan dan catatan reject', () => {
  assert.throws(
    () => createOperationalFundRequest({ requestDate: '2026-08-20', amount: 1000000, purpose: 'a'.repeat(501) }, { name: 'Operational Test' }),
    (error) => error.code === 'OPERATIONAL_FUND_PURPOSE_TOO_LONG' && error.statusCode === 400,
  );
  assert.throws(
    () => rejectOperationalFundRequest('fund-1', { rejectionNote: '   ' }, { name: 'Finance Test' }),
    (error) => error.code === 'OPERATIONAL_FUND_REJECTION_NOTE_REQUIRED' && error.statusCode === 400,
  );
  assert.throws(
    () => rejectOperationalFundRequest('fund-1', { rejectionNote: 'a'.repeat(501) }, { name: 'Finance Test' }),
    (error) => error.code === 'OPERATIONAL_FUND_REJECTION_NOTE_TOO_LONG' && error.statusCode === 400,
  );
});

test('rekonsiliasi biaya container job memvalidasi status dan catatan klarifikasi', async () => {
  await assert.rejects(
    () => reconcileContainerJobExpense('expense-1', { financeCheckStatus: 'selesai' }, { name: 'Finance Test' }),
    (error) => error.code === 'CONTAINER_JOB_EXPENSE_FINANCE_STATUS_INVALID' && error.statusCode === 400,
  );
  await assert.rejects(
    () => reconcileContainerJobExpense('expense-1', { financeCheckStatus: 'perlu_klarifikasi', financeNote: '   ' }, { name: 'Finance Test' }),
    (error) => error.code === 'CONTAINER_JOB_EXPENSE_FINANCE_NOTE_REQUIRED' && error.statusCode === 400,
  );
  await assert.rejects(
    () => reconcileContainerJobExpense('expense-1', { financeCheckStatus: 'sudah_dicek', financeNote: 'a'.repeat(501) }, { name: 'Finance Test' }),
    (error) => error.code === 'CONTAINER_JOB_EXPENSE_FINANCE_NOTE_TOO_LONG' && error.statusCode === 400,
  );
  await assert.rejects(
    () => reconcileContainerJobExpense('expense-1', { financeCheckStatus: 'sudah_dicek', adminFeeAmount: -1 }, { name: 'Finance Test' }),
    (error) => error.code === 'CONTAINER_JOB_EXPENSE_ADMIN_FEE_INVALID' && error.statusCode === 400,
  );
  await assert.rejects(
    () => reconcileContainerJobExpense('expense-1', { financeCheckStatus: 'sudah_dicek', adminFeeNote: 'a'.repeat(501) }, { name: 'Finance Test' }),
    (error) => error.code === 'CONTAINER_JOB_EXPENSE_ADMIN_FEE_NOTE_TOO_LONG' && error.statusCode === 400,
  );
});

test('rekonsiliasi gagal membersihkan attachment bukti yang baru dibuat', async () => {
  const deleted = [];
  const balanceError = new Error('Saldo rekening dropping tidak cukup.');
  balanceError.code = 'OPERATIONAL_FUND_BALANCE_INSUFFICIENT';
  balanceError.statusCode = 409;

  await assert.rejects(
    () => reconcileContainerJobExpense('expense-1', {
      financeCheckStatus: 'sudah_dicek',
      adminFeeAmount: 2500,
      fileName: 'bukti.pdf',
      mimeType: 'application/pdf',
      fileSize: 5,
      fileBase64: 'data:application/pdf;base64,cHJvb2Y=',
    }, { name: 'Finance Test' }, {
      createAttachment: async () => ({ id: 'attachment-new' }),
      reconcileRecord: async () => { throw balanceError; },
      deleteAttachment: async (id, actor, reason) => { deleted.push({ id, actor, reason }); },
    }),
    (error) => error === balanceError,
  );

  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].id, 'attachment-new');
  assert.equal(deleted[0].actor.name, 'Finance Test');
  assert.match(deleted[0].reason, /Rollback bukti pembayaran/);
});

test('rekonsiliasi biaya admin nol dengan bukti valid tidak menjalankan cleanup', async () => {
  let cleanupCalled = false;
  let reconciledPayload;
  const result = await reconcileContainerJobExpense('expense-1', {
    financeCheckStatus: 'sudah_dicek',
    adminFeeAmount: 0,
    fileName: 'bukti.pdf',
    mimeType: 'application/pdf',
    fileSize: 5,
    fileBase64: 'data:application/pdf;base64,cHJvb2Y=',
  }, { name: 'Finance Test' }, {
    createAttachment: async () => ({ id: 'attachment-new' }),
    reconcileRecord: async (_id, payload) => {
      reconciledPayload = payload;
      return { id: 'expense-1', financeCheckStatus: 'sudah_dicek' };
    },
    deleteAttachment: async () => { cleanupCalled = true; },
  });

  assert.equal(result.financeCheckStatus, 'sudah_dicek');
  assert.equal(reconciledPayload.adminFeeAmount, 0);
  assert.equal(reconciledPayload.proofAttachmentId, 'attachment-new');
  assert.equal(cleanupCalled, false);
});

test('bukti transfer UJ memvalidasi file, nominal, tanggal, dan panjang catatan', async () => {
  await assert.rejects(
    () => addContainerJobExpenseTransferProof('expense-1', { amount: 1000, transferDate: '2026-09-24' }, { name: 'Finance Test' }),
    (error) => error.code === 'CONTAINER_JOB_EXPENSE_TRANSFER_PROOF_FILE_REQUIRED',
  );
  await assert.rejects(
    () => addContainerJobExpenseTransferProof('expense-1', { amount: 0, transferDate: '2026-09-24' }, { name: 'Finance Test' }),
    (error) => error.code === 'CONTAINER_JOB_EXPENSE_TRANSFER_PROOF_AMOUNT_INVALID',
  );
  await assert.rejects(
    () => editContainerJobExpenseTransferProof('expense-1', 'proof-1', { amount: 1000, transferDate: '24-09-2026' }, { name: 'Finance Test' }),
    (error) => error.code === 'CONTAINER_JOB_EXPENSE_TRANSFER_PROOF_DATE_INVALID',
  );
  await assert.rejects(
    () => editContainerJobExpenseTransferProof('expense-1', 'proof-1', {
      amount: 1000,
      transferDate: '2026-09-24',
      note: 'a'.repeat(501),
    }, { name: 'Finance Test' }),
    (error) => error.code === 'CONTAINER_JOB_EXPENSE_TRANSFER_PROOF_NOTE_TOO_LONG',
  );
});

test('tambah bukti transfer UJ membersihkan attachment jika detail gagal disimpan', async () => {
  const deleted = [];
  const databaseError = new Error('Batch sudah ditutup.');
  await assert.rejects(
    () => addContainerJobExpenseTransferProof('expense-1', {
      amount: 250000,
      transferDate: '2026-09-24',
      fileName: 'transfer.pdf',
      fileBase64: 'data:application/pdf;base64,cHJvb2Y=',
    }, { name: 'Finance Test' }, {
      createAttachment: async () => ({ id: 'attachment-1' }),
      createRecord: async () => { throw databaseError; },
      deleteAttachment: async (id) => { deleted.push(id); },
    }),
    (error) => error === databaseError,
  );
  assert.deepEqual(deleted, ['attachment-1']);
});

test('edit bukti dapat mengganti file dan hapus bukti meneruskan attachment terkait', async () => {
  let updatedAttachmentId;
  const edited = await editContainerJobExpenseTransferProof('expense-1', 'proof-1', {
    amount: 300000,
    transferDate: '2026-09-24',
    note: 'Transfer susulan',
    fileName: 'susulan.pdf',
    fileBase64: 'data:application/pdf;base64,cHJvb2Y=',
  }, { name: 'Finance Test' }, {
    updateRecord: async () => ({ id: 'proof-1', attachmentId: 'attachment-1', amount: 300000 }),
    updateAttachment: async (id) => {
      updatedAttachmentId = id;
      return { id, name: 'susulan.pdf' };
    },
  });
  assert.equal(updatedAttachmentId, 'attachment-1');
  assert.equal(edited.attachment.name, 'susulan.pdf');

  let deletedAttachmentId;
  const deleted = await removeContainerJobExpenseTransferProof('expense-1', 'proof-1', { name: 'Finance Test' }, {
    deleteRecord: async () => ({ id: 'proof-1', attachmentId: 'attachment-1', amount: 300000 }),
    deleteAttachment: async (id) => { deletedAttachmentId = id; },
  });
  assert.equal(deleted.id, 'proof-1');
  assert.equal(deletedAttachmentId, 'attachment-1');
});

test('setiap container memiliki empat slot dokumen tanpa menggabungkan file yang sama', () => {
  const base = {
    id: 'attachment-1',
    source: 'Operational',
    job_id: 'job-1',
    container_number: null,
    file_name: 'dokumen.png',
    file_size: 100,
    mime_type: 'image/png',
  };
  const documents = mapInvoiceDocuments([
    { ...base, category: 'travelDocumentFile' },
    { ...base, id: 'attachment-2', category: 'loadingVoucherDocument' },
    { ...base, id: 'attachment-3', job_id: 'job-2', category: 'eirDocument' },
  ]);

  assert.equal(documents.length, 8);
  assert.deepEqual(documents.slice(0, 4).map((document) => document.label), [
    'EIR',
    'Surat Jalan',
    'Bon Muat / Bon Bongkar',
    'TILA / Delivery Card / Gatepass / SP2',
  ]);
  assert.equal(documents[0].ready, false);
  assert.equal(documents[1].ready, true);
  assert.equal(documents[2].ready, true);
  assert.equal(documents[1].file.path, 'attachment-1');
  assert.equal(documents[2].file.path, 'attachment-2');
  assert.equal(documents[0].jobReference, 'Container 1 (nomor belum diisi)');
  assert.equal(documents[4].jobReference, 'Container 2 (nomor belum diisi)');
});

test('dokumen tambahan operational ikut tampil di detail invoice finance', () => {
  const base = {
    source: 'Operational',
    job_id: 'job-1',
    container_number: 'CSGU23338220',
    file_size: 100,
    mime_type: 'application/pdf',
  };
  const documents = mapInvoiceDocuments([
    {
      ...base,
      id: 'attachment-sj',
      category: 'travelDocumentFile',
      reference_number: 'SJ-001',
      file_name: 'surat-jalan.pdf',
    },
    {
      ...base,
      id: 'attachment-other-1',
      category: 'otherDocument',
      notes: 'Foto segel',
      file_name: 'foto-segel.pdf',
    },
    {
      ...base,
      id: 'attachment-other-2',
      category: 'otherDocument',
      notes: 'Berita acara',
      file_name: 'berita-acara.pdf',
    },
  ]);

  const otherDocuments = documents.filter((document) => document.category === 'otherDocument');

  assert.equal(documents.length, 6);
  assert.deepEqual(otherDocuments.map((document) => document.label), ['Foto segel', 'Berita acara']);
  assert.deepEqual(otherDocuments.map((document) => document.file.name), ['foto-segel.pdf', 'berita-acara.pdf']);
  assert.equal(otherDocuments.every((document) => document.ready), true);
});

test('dokumen Invoice dan Faktur Pajak dari Finance ikut tampil di detail invoice finance', () => {
  const documents = mapInvoiceDocuments([
    {
      id: 'attachment-invoice',
      source: 'Finance',
      category: 'invoicePdf',
      file_name: 'invoice-accurate.pdf',
      file_size: 100,
      mime_type: 'application/pdf',
      uploaded_by_name: 'Finance Test',
    },
    {
      id: 'attachment-tax',
      source: 'Finance',
      category: 'taxInvoicePdf',
      file_name: 'faktur-pajak.pdf',
      file_size: 120,
      mime_type: 'application/pdf',
      uploaded_by_name: 'Finance Test',
    },
  ]);

  assert.equal(documents.length, 2);
  assert.deepEqual(documents.map((document) => document.label), ['Invoice', 'Faktur Pajak']);
  assert.deepEqual(documents.map((document) => document.file.path), ['attachment-invoice', 'attachment-tax']);
  assert.equal(documents.every((document) => document.source === 'Finance' && document.ready), true);
});

test('validasi koreksi Finance mewajibkan tipe, nomor baru, dan alasan', () => {
  assert.equal(normalizeFinanceCorrectionType('soNumber'), financeCorrectionTypes.soNumber);
  assert.equal(normalizeFinanceCorrectionType('invoice_number'), financeCorrectionTypes.invoiceNumber);

  assert.throws(
    () => validateFinanceCorrectionInput({ correctionType: 'so_number', requestedValue: 'SO-001', reason: '' }),
    (error) => error.code === 'FINANCE_CORRECTION_REASON_REQUIRED' && error.statusCode === 400,
  );
  assert.throws(
    () => validateFinanceCorrectionInput({ correctionType: 'invoice_number', requestedValue: '', reason: 'Salah input' }),
    (error) => error.code === 'FINANCE_CORRECTION_VALUE_REQUIRED' && error.statusCode === 400,
  );
});

test('koreksi Finance menentukan kebutuhan approval Admin dari status order', () => {
  assert.equal(
    isFinanceCorrectionAdminApprovalRequired({ status: 'draft', active_jobs_count: 0, billing_status: 'belum_invoice' }, 'so_number'),
    false,
  );
  assert.equal(
    isFinanceCorrectionAdminApprovalRequired({ status: 'confirmed', active_jobs_count: 1, billing_status: 'belum_invoice' }, 'so_number'),
    true,
  );
  assert.equal(
    isFinanceCorrectionAdminApprovalRequired({ status: 'completed', active_jobs_count: 0, billing_status: 'belum_dikirim' }, 'invoice_number'),
    true,
  );
});

test('reject koreksi Finance mewajibkan catatan Admin', async () => {
  await assert.rejects(
    () => rejectFinanceCorrection('correction-1', { reviewNote: '   ' }, { name: 'Admin Test', role: 'admin' }),
    (error) => error.code === 'FINANCE_CORRECTION_REJECT_NOTE_REQUIRED' && error.statusCode === 400,
  );
});

test('approval koreksi Finance membatasi catatan Admin maksimal 500 karakter', async () => {
  await assert.rejects(
    () => approveFinanceCorrection('correction-1', { reviewNote: 'a'.repeat(501) }, { name: 'Admin Test', role: 'admin' }),
    (error) => error.code === 'FINANCE_CORRECTION_REVIEW_NOTE_TOO_LONG' && error.statusCode === 400,
  );
});

test('nomor invoice dan upload dokumen invoice ditolak untuk role Sales', async () => {
  assert.throws(
    () => saveInvoiceNumber('order-1', { invoiceNumber: 'INV-001' }, { name: 'Sales Test', role: 'sales' }),
    (error) => error.code === 'FINANCE_INVOICE_NUMBER_FORBIDDEN' && error.statusCode === 403,
  );
  await assert.rejects(
    () => uploadInvoiceDocument('order-1', { documentType: 'invoice', mimeType: 'application/pdf' }, { name: 'Sales Test', role: 'sales' }),
    (error) => error.code === 'FINANCE_INVOICE_UPLOAD_FORBIDDEN' && error.statusCode === 403,
  );
});
