import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FinanceWorkflowPage from './FinanceWorkflowPage';
import {
  approveFinanceRpuj,
  fetchFinanceInvoiceCorrections,
  fetchFinanceInvoiceDetail,
  fetchFinanceInvoices,
  fetchFinanceOrderCorrections,
  fetchFinanceOrderVerifications,
  fetchFinanceRpujRequests,
  rejectFinanceRpuj,
  requestFinanceInvoiceCorrection,
  requestFinanceOrderSoCorrection,
  updateFinanceInvoiceNumber,
  updateFinanceOrderSoNumber,
  uploadFinanceInvoiceDocument,
  uploadFinanceRpujTransferProof,
} from '../../services/finance/financeService';
import { getCurrentFinancePeriod, getFinancePeriodRange } from '../../utils/financePeriod';

vi.mock('../../services/finance/financeService', () => ({
  approveFinanceRpuj: vi.fn(),
  fetchFinanceInvoiceCorrections: vi.fn(),
  fetchFinanceInvoiceDetail: vi.fn(),
  fetchFinanceInvoices: vi.fn().mockResolvedValue({ rows: [] }),
  fetchFinanceOrderCorrections: vi.fn(),
  fetchFinanceOrderVerifications: vi.fn(),
  fetchFinanceRpujRequests: vi.fn(),
  rejectFinanceRpuj: vi.fn(),
  requestFinanceInvoiceCorrection: vi.fn(),
  requestFinanceOrderSoCorrection: vi.fn(),
  updateFinanceInvoiceNumber: vi.fn(),
  updateFinanceOrderSoNumber: vi.fn(),
  uploadFinanceInvoiceDocument: vi.fn(),
  uploadFinanceRpujTransferProof: vi.fn(),
}));

const orderRow = {
  id: 'order-1',
  orderDate: '2026-07-19',
  salesName: 'Sales Test',
  customer: 'PT Customer Test',
  destination: 'Cikarang',
  runningDate: '2026-07-20',
  verificationStatus: 'pending_so',
  soNumber: '',
};

const cancelledOrderRow = {
  id: 'order-cancelled-1',
  orderDate: '2026-07-18',
  salesName: 'Sales Test',
  customer: 'PT Customer Batal',
  destination: 'Bekasi',
  runningDate: '2026-07-21',
  status: 'SO Batal',
  verificationStatus: 'cancelled',
  operationalStatus: 'cancelled',
  soNumber: 'SO-CANCEL-001',
  cancelReason: 'Customer membatalkan pengiriman setelah nomor SO terbit.',
  cancelledAt: '2026-07-19T08:30:00.000Z',
  cancelledByName: 'Admin Test',
};

const rpujRow = {
  id: 'job-1',
  soNumber: 'SO-TEST-001',
  jobNumber: 'JOB-TEST-001',
  containerNumber: 'CONT-TEST-001',
  containerSize: '20FT',
  customer: 'PT Customer Test',
  destination: 'Cikarang',
  driver: 'Driver Test',
  driverBankAccount: 'BCA 123456',
  truck: 'B 1000 AA',
  totalUj: 600000,
  additionalCost: 100000,
  status: 'Menunggu Approval Finance',
  rpujStatus: 'submitted',
};

const invoiceRow = {
  id: 'invoice-1',
  soNumber: 'SO-TEST-001',
  customer: 'PT Customer Test',
  destination: 'Cikarang',
  invoiceStatus: 'Menunggu Update Status',
  invoiceNumber: 'INV-TEST-001',
};

const invoiceSummary = {
  needNumber: 0,
  inProgress: 1,
  paid: 2,
  missingInvoiceDocuments: 1,
  missingInvoiceDocument: 1,
  missingTaxInvoiceDocument: 1,
  completeInvoiceDocuments: 1,
  sentInvoiceDocuments: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchFinanceOrderVerifications.mockResolvedValue({ rows: [orderRow, cancelledOrderRow] });
  fetchFinanceRpujRequests.mockResolvedValue({ rows: [rpujRow] });
  fetchFinanceInvoices.mockResolvedValue({ rows: [invoiceRow], summary: invoiceSummary });
  fetchFinanceOrderCorrections.mockResolvedValue([]);
  fetchFinanceInvoiceCorrections.mockResolvedValue([]);
  requestFinanceOrderSoCorrection.mockResolvedValue({ status: 'pending' });
  requestFinanceInvoiceCorrection.mockResolvedValue({ status: 'pending' });
  uploadFinanceInvoiceDocument.mockResolvedValue({
    ...invoiceRow,
    invoiceDocumentStatus: 'belum_upload',
    invoiceDocumentStatusLabel: 'Belum Upload',
  });
  fetchFinanceInvoiceDetail.mockResolvedValue({
    ...invoiceRow,
    billingItems: ['Jasa Angkut D20 - 1 ritase', 'Bon Muat/Bongkar - 1 item'],
    plannedJobsCount: 2,
    billedJobsCount: 1,
    cancelledJobsCount: 1,
    cancellationNote: '1 container dibatalkan; tagihan hanya menghitung container yang selesai.',
    documents: [
      {
        id: 'attachment-1',
        label: 'Surat Jalan',
        source: 'Operational',
        jobId: 'job-1',
        containerNumber: 'CONT-TEST-001',
        referenceNumber: 'SJ-001',
        ready: true,
        file: { name: 'surat-jalan.pdf', path: 'attachment-1', type: 'application/pdf', size: 100 },
      },
      {
        id: 'attachment-other-1',
        category: 'otherDocument',
        label: 'Foto segel',
        source: 'Operational',
        jobId: 'job-1',
        containerNumber: 'CONT-TEST-001',
        referenceNumber: '',
        ready: true,
        file: { name: 'foto-segel.pdf', path: 'attachment-other-1', type: 'application/pdf', size: 100 },
      },
      ...[
        ['eirDocument', 'EIR'],
        ['loadingVoucherDocument', 'Bon Muat / Bon Bongkar'],
        ['tilaGatepassDocumentFile', 'TILA / Delivery Card / Gatepass / SP2'],
      ].map(([category, label]) => ({
        id: `job-1-${category}`,
        category,
        label,
        source: 'Operational',
        jobId: 'job-1',
        containerNumber: 'CONT-TEST-001',
        ready: false,
        file: null,
      })),
      {
        id: 'attachment-3',
        label: 'EIR',
        source: 'Operational',
        jobId: 'job-2',
        containerNumber: 'CONT-TEST-002',
        referenceNumber: 'EIR-002',
        ready: true,
        file: { name: 'eir-container-2.pdf', path: 'attachment-3', type: 'application/pdf', size: 100 },
      },
      ...[
        ['travelDocumentFile', 'Surat Jalan'],
        ['loadingVoucherDocument', 'Bon Muat / Bon Bongkar'],
        ['tilaGatepassDocumentFile', 'TILA / Delivery Card / Gatepass / SP2'],
      ].map(([category, label]) => ({
        id: `job-2-${category}`,
        category,
        label,
        source: 'Operational',
        jobId: 'job-2',
        containerNumber: 'CONT-TEST-002',
        ready: false,
        file: null,
      })),
      {
        id: 'attachment-2',
        label: 'Delivery Order',
        source: 'Sales',
        referenceNumber: 'DO-001',
        ready: true,
        file: { name: 'delivery-order.pdf', path: 'attachment-2', type: 'application/pdf', size: 100 },
      },
    ],
  });
});

describe('FinanceWorkflowPage validation modals', () => {
  it('memuat pencatatan sesuai bulan dan tahun yang dipilih', async () => {
    const user = userEvent.setup();
    const currentPeriod = getCurrentFinancePeriod();
    const currentRange = getFinancePeriodRange(currentPeriod.month, currentPeriod.year);
    render(<FinanceWorkflowPage initialTabId="rpuj-approval" />);

    expect(screen.queryByLabelText('Bulan pencatatan Finance')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('tab', { name: /UJ Dikirim/i }));

    await waitFor(() => {
      expect(fetchFinanceRpujRequests).toHaveBeenLastCalledWith(expect.objectContaining(currentRange));
    });

    const nextMonth = currentPeriod.month === '2' ? '3' : '2';
    await user.selectOptions(screen.getByLabelText('Bulan pencatatan Finance'), nextMonth);
    const nextRange = getFinancePeriodRange(nextMonth, currentPeriod.year);

    await waitFor(() => {
      expect(fetchFinanceRpujRequests).toHaveBeenLastCalledWith(expect.objectContaining(nextRange));
    });
  });

  it('menampilkan periode invoice hanya pada Menunggu Sales dan Lunas', async () => {
    const user = userEvent.setup();
    render(<FinanceWorkflowPage initialTabId="invoice-number" />);

    expect(screen.queryByLabelText('Bulan pencatatan Finance')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('tab', { name: /Menunggu Sales/i }));
    expect(screen.getByLabelText('Bulan pencatatan Finance')).toBeInTheDocument();

    const currentPeriod = getCurrentFinancePeriod();
    const currentRange = getFinancePeriodRange(currentPeriod.month, currentPeriod.year);
    await waitFor(() => {
      expect(fetchFinanceInvoices).toHaveBeenLastCalledWith(expect.objectContaining(currentRange));
    });

    await user.click(screen.getByRole('tab', { name: /Lunas/i }));
    expect(screen.getByLabelText('Bulan pencatatan Finance')).toBeInTheDocument();
  });

  it('menampilkan jumlah tab invoice dari summary backend saat pindah menu', async () => {
    const user = userEvent.setup();
    render(<FinanceWorkflowPage initialTabId="invoice-number" />);

    await screen.findByRole('tab', { name: /Menunggu Sales/i });
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Menunggu Sales/i })).toHaveTextContent('1');
      expect(screen.getByRole('tab', { name: /Lunas/i })).toHaveTextContent('2');
    });

    await user.click(screen.getByRole('tab', { name: /Lunas/i }));

    await waitFor(() => {
      expect(fetchFinanceInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'paid' }));
    });
    expect(screen.getByRole('tab', { name: /Menunggu Sales/i })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: /Lunas/i })).toHaveTextContent('2');
  });

  it('mengirim filter dokumen invoice ke backend finance', async () => {
    const user = userEvent.setup();
    render(<FinanceWorkflowPage initialTabId="invoice-number" />);

    await screen.findByRole('tab', { name: /Belum Nomor \/ Dokumen/i });
    await user.click(await screen.findByRole('button', { name: /Belum Upload Invoice & Faktur Pajak/i }));

    await waitFor(() => {
      expect(fetchFinanceInvoices).toHaveBeenLastCalledWith(expect.objectContaining({
        status: 'need-number',
        invoiceDocumentFilter: 'missing-documents',
      }));
    });
  });

  it('menampilkan aksi view dan download untuk dokumen Sales dan Operational', async () => {
    const user = userEvent.setup();
    render(<FinanceWorkflowPage initialTabId="invoice-number" />);

    await user.click(await screen.findByRole('tab', { name: /Menunggu Sales/i }));
    await user.click(await screen.findByRole('button', { name: /Lihat detail invoice SO-TEST-001/i }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('CONT-TEST-001');
    expect(dialog).toHaveTextContent('CONT-TEST-002');
    expect(dialog).toHaveTextContent('1 container dibatalkan; tagihan hanya menghitung container yang selesai.');
    expect(dialog).toHaveTextContent('Jasa Angkut D20 - 1 ritase');
    expect(dialog).toHaveTextContent('Dokumen Sales / SO');
    expect(dialog).toHaveTextContent('2/5 lengkap');
    expect(dialog).toHaveTextContent('Foto segel');
    expect(screen.getAllByText('Belum dilengkapi oleh Operational.')).toHaveLength(6);
    expect(await screen.findByRole('button', { name: /View surat-jalan.pdf/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Download surat-jalan.pdf/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /View foto-segel.pdf/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Download foto-segel.pdf/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /View eir-container-2.pdf/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Download eir-container-2.pdf/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /View delivery-order.pdf/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Download delivery-order.pdf/i })).toBeEnabled();
    expect(fetchFinanceInvoiceDetail).toHaveBeenCalledWith('invoice-1');
  });

  it('mengupload PDF Invoice Accurate dari detail invoice', async () => {
    const user = userEvent.setup();
    const detailWithoutFinanceFile = {
      ...invoiceRow,
      invoiceDocumentStatus: 'belum_upload',
      invoiceDocumentStatusLabel: 'Belum Upload',
      documents: [],
    };
    const detailWithInvoiceFile = {
      ...invoiceRow,
      invoiceDocumentStatus: 'belum_upload',
      invoiceDocumentStatusLabel: 'Belum Upload',
      invoiceDocumentUploadedAt: '2026-08-02T08:00:00.000Z',
      invoiceDocumentUploadedBy: 'Finance Test',
      documents: [{
        id: 'finance-invoice-1',
        category: 'invoicePdf',
        label: 'Invoice',
        source: 'Finance',
        ready: true,
        file: { name: 'invoice-accurate.pdf', path: 'finance-invoice-1', type: 'application/pdf', size: 128 },
      }],
    };
    fetchFinanceInvoiceDetail
      .mockResolvedValueOnce(detailWithoutFinanceFile)
      .mockResolvedValueOnce(detailWithInvoiceFile);
    uploadFinanceInvoiceDocument.mockResolvedValue({
      ...invoiceRow,
      invoiceDocumentStatus: 'belum_upload',
      invoiceDocumentStatusLabel: 'Belum Upload',
      invoiceDocumentUploadedAt: '2026-08-02T08:00:00.000Z',
      invoiceDocumentUploadedBy: 'Finance Test',
      uploadedDocument: {
        id: 'finance-invoice-1',
        category: 'invoicePdf',
        fileName: 'invoice-accurate.pdf',
        mimeType: 'application/pdf',
        fileSize: 128,
        path: 'finance-invoice-1',
        uploadedByName: 'Finance Test',
        uploadedAt: '2026-08-02T08:00:00.000Z',
      },
    });
    render(<FinanceWorkflowPage initialTabId="invoice-number" />);

    await user.click(await screen.findByRole('tab', { name: /Menunggu Sales/i }));
    await user.click(await screen.findByRole('button', { name: /Lihat detail invoice SO-TEST-001/i }));
    const file = new File(['%PDF-1.4'], 'invoice-accurate.pdf', { type: 'application/pdf' });
    await user.upload(await screen.findByLabelText('Upload Invoice PDF'), file);

    expect(uploadFinanceInvoiceDocument).not.toHaveBeenCalled();
    expect(await screen.findByText('Siap disimpan: invoice-accurate.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Simpan Dokumen/i }));

    await waitFor(() => {
      expect(uploadFinanceInvoiceDocument).toHaveBeenCalledWith('invoice-1', 'invoice', file);
    });
    expect(await screen.findByText('Dokumen berhasil disimpan')).toBeInTheDocument();
    expect(await screen.findByText('invoice-accurate.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View invoice-accurate.pdf/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Download invoice-accurate.pdf/i })).toBeEnabled();
  });

  it('menampilkan modal gagal ketika upload dokumen invoice gagal dikirim', async () => {
    const user = userEvent.setup();
    fetchFinanceInvoiceDetail.mockResolvedValueOnce({
      ...invoiceRow,
      invoiceDocumentStatus: 'belum_upload',
      invoiceDocumentStatusLabel: 'Belum Upload',
      documents: [],
    });
    uploadFinanceInvoiceDocument.mockRejectedValueOnce(new Error('Upload PDF gagal.'));
    render(<FinanceWorkflowPage initialTabId="invoice-number" />);

    await user.click(await screen.findByRole('tab', { name: /Menunggu Sales/i }));
    await user.click(await screen.findByRole('button', { name: /Lihat detail invoice SO-TEST-001/i }));
    const file = new File(['%PDF-1.4'], 'invoice-error.pdf', { type: 'application/pdf' });
    await user.upload(await screen.findByLabelText('Upload Invoice PDF'), file);
    await user.click(screen.getByRole('button', { name: /Simpan Dokumen/i }));

    expect(await screen.findByText('Sebagian dokumen gagal disimpan')).toBeInTheDocument();
    expect(screen.getByText('Invoice: Upload PDF gagal.')).toBeInTheDocument();
  });

  it('mengajukan koreksi nomor invoice dari detail invoice', async () => {
    const user = userEvent.setup();
    render(<FinanceWorkflowPage initialTabId="invoice-number" />);

    await user.click(await screen.findByRole('tab', { name: /Menunggu Sales/i }));
    await user.click(await screen.findByRole('button', { name: /Lihat detail invoice SO-TEST-001/i }));
    await user.click(await screen.findByRole('button', { name: /Ajukan Koreksi/i }));
    await user.clear(screen.getByLabelText(/Nomor Invoice Baru/i));
    await user.type(screen.getByLabelText(/Nomor Invoice Baru/i), 'INV-TEST-002');
    await user.type(screen.getByLabelText(/Alasan Koreksi/i), 'Nomor invoice sebelumnya salah ketik.');
    await user.click(screen.getAllByRole('button', { name: 'Ajukan Koreksi' }).at(-1));

    await waitFor(() => {
      expect(requestFinanceInvoiceCorrection).toHaveBeenCalledWith('invoice-1', {
        requestedValue: 'INV-TEST-002',
        reason: 'Nomor invoice sebelumnya salah ketik.',
      });
    });
  });

  it('menampilkan aksi view dan download untuk bukti transfer UJ', async () => {
    const user = userEvent.setup();
    fetchFinanceRpujRequests.mockResolvedValue({
      rows: [{
        ...rpujRow,
        rpujStatus: 'paid',
        status: 'Bukti Transfer Diupload',
        transferProof: 'bukti-transfer.pdf',
        transferProofFile: {
          id: 'transfer-proof-1',
          name: 'bukti-transfer.pdf',
          path: 'transfer-proof-1',
          type: 'application/pdf',
          size: 100,
        },
      }],
    });
    render(<FinanceWorkflowPage initialTabId="rpuj-approval" />);

    await user.click(await screen.findByRole('tab', { name: /UJ Dikirim/i }));
    expect(await screen.findByRole('button', { name: /View bukti-transfer.pdf/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Download bukti-transfer.pdf/i })).toBeEnabled();
  });

  it('menginput nomor SO melalui modal', async () => {
    const user = userEvent.setup();
    updateFinanceOrderSoNumber.mockResolvedValue({ ...orderRow, soNumber: 'SO-202607-019', verificationStatus: 'verified' });
    render(<FinanceWorkflowPage initialTabId="order-verification" />);

    await user.click(await screen.findByRole('button', { name: 'Input Nomor SO' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Input Nomor SO Accurate');
    await user.type(screen.getByLabelText('Nomor SO Accurate'), 'so-202607-019');
    await user.click(screen.getByRole('button', { name: 'Simpan Nomor SO' }));

    expect(updateFinanceOrderSoNumber).toHaveBeenCalledWith('order-1', 'SO-202607-019');
  });

  it('menampilkan status dan alasan SO batal di finance', async () => {
    const user = userEvent.setup();
    render(<FinanceWorkflowPage initialTabId="order-verification" />);

    await user.click(await screen.findByRole('tab', { name: /SO Batal/i }));
    expect(screen.getByText('Bekasi')).toBeInTheDocument();
    expect(screen.getAllByText('SO Batal').length).toBeGreaterThan(0);
    expect(screen.getByText('Customer membatalkan pengiriman setelah nomor SO terbit.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Input Nomor SO' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Detail' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Alasan Batal');
    expect(dialog).toHaveTextContent('Customer membatalkan pengiriman setelah nomor SO terbit.');
    expect(dialog).toHaveTextContent('Admin Test');
  });

  it('meminta validasi sebelum approve RPUJ', async () => {
    const user = userEvent.setup();
    approveFinanceRpuj.mockResolvedValue({ ...rpujRow, rpujStatus: 'approved', status: 'Disetujui Finance' });
    render(<FinanceWorkflowPage initialTabId="rpuj-approval" />);

    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Validasi Approval RPUJ');
    await user.click(screen.getByRole('button', { name: 'Ya, Approve RPUJ' }));

    expect(approveFinanceRpuj).toHaveBeenCalledWith('job-1');
  });

  it('menyusun detail RPUJ dengan customer, tujuan, dan nomor container sebagai informasi utama', async () => {
    const user = userEvent.setup();
    render(<FinanceWorkflowPage initialTabId="rpuj-approval" />);

    await user.click(await screen.findByRole('button', { name: 'Detail' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('SO-TEST-001');
    expect(dialog).toHaveTextContent('PT Customer Test');
    expect(dialog).toHaveTextContent('Tujuan');
    expect(dialog).toHaveTextContent('Cikarang');
    expect(dialog).toHaveTextContent('Nomor Container');
    expect(dialog).toHaveTextContent('CONT-TEST-001');
    expect(dialog).not.toHaveTextContent('No. Job');
  });

  it('mewajibkan catatan ketika reject RPUJ', async () => {
    const user = userEvent.setup();
    rejectFinanceRpuj.mockResolvedValue({ ...rpujRow, rpujStatus: 'rejected', status: 'Ditolak Finance', rejectionNote: 'Nominal biaya perlu diperbaiki.' });
    render(<FinanceWorkflowPage initialTabId="rpuj-approval" />);

    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    await user.click(screen.getByRole('button', { name: 'Ya, Reject RPUJ' }));
    expect(screen.getByText(/Catatan reject wajib diisi/i)).toBeInTheDocument();
    expect(rejectFinanceRpuj).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Catatan Reject/i), 'Nominal biaya perlu diperbaiki.');
    await user.click(screen.getByRole('button', { name: 'Ya, Reject RPUJ' }));
    expect(rejectFinanceRpuj).toHaveBeenCalledWith('job-1', 'Nominal biaya perlu diperbaiki.');
  });

  it('memeriksa file dalam modal sebelum upload bukti transfer', async () => {
    const user = userEvent.setup();
    const approvedRow = { ...rpujRow, rpujStatus: 'approved', status: 'Disetujui Finance' };
    fetchFinanceRpujRequests.mockResolvedValue({ rows: [approvedRow] });
    uploadFinanceRpujTransferProof.mockResolvedValue({
      ...approvedRow,
      rpujStatus: 'paid',
      status: 'Bukti Transfer Diupload',
      transferProof: 'bukti-transfer.pdf',
    });
    render(<FinanceWorkflowPage initialTabId="rpuj-approval" />);

    await user.click(await screen.findByRole('tab', { name: /Siap Transfer/i }));
    await user.click(screen.getByRole('button', { name: 'Upload Bukti' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Validasi Bukti Transfer UJ');
    expect(uploadFinanceRpujTransferProof).not.toHaveBeenCalled();

    const file = new File(['transfer'], 'bukti-transfer.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('File bukti transfer UJ'), file);
    expect(screen.getByText('bukti-transfer.pdf')).toBeInTheDocument();
    expect(uploadFinanceRpujTransferProof).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Konfirmasi & Upload' }));
    expect(uploadFinanceRpujTransferProof).toHaveBeenCalledWith('job-1', file);
  });

  it('meminta validasi sebelum mengirim nomor invoice', async () => {
    const user = userEvent.setup();
    fetchFinanceInvoices.mockResolvedValue({
      rows: [{
        ...invoiceRow,
        invoiceStatus: 'Butuh Nomor Invoice',
        invoiceNumber: '',
      }],
    });
    updateFinanceInvoiceNumber.mockResolvedValue({
      ...invoiceRow,
      invoiceStatus: 'Menunggu Update Status',
      invoiceNumber: 'INV-202607-001',
    });
    render(<FinanceWorkflowPage initialTabId="invoice-number" />);

    await user.type(await screen.findByPlaceholderText('INV-...'), 'inv-202607-001');
    await user.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Validasi Nomor Invoice');
    expect(screen.getByRole('dialog')).toHaveTextContent('INV-202607-001');
    expect(updateFinanceInvoiceNumber).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Ya, Kirim Nomor Invoice' }));
    expect(updateFinanceInvoiceNumber).toHaveBeenCalledWith('invoice-1', 'INV-202607-001');
  });
});
