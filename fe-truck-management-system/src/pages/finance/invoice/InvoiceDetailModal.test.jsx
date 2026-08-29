import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import InvoiceDetailModal from './InvoiceDetailModal';

function baseInvoice(overrides = {}) {
  return {
    id: 'order-1',
    soNumber: 'SO-001',
    invoiceStatus: 'Menunggu Update Status',
    invoiceNumber: 'INV-001',
    destination: 'Cikarang',
    customer: 'PT Contoh',
    documents: [],
    documentChecklist: [],
    billingItems: [],
    activityLogs: [],
    ...overrides,
  };
}

function renderModal(invoice, extraProps = {}) {
  return render(
    <InvoiceDetailModal
      invoice={invoice}
      onClose={vi.fn()}
      onOpenCorrection={vi.fn()}
      onUploadInvoiceDocument={vi.fn()}
      onSaveDebitNoteNumber={vi.fn()}
      onLoadDebitNotePayments={vi.fn()}
      onConfirmDebitNotePayment={vi.fn()}
      onVoidDebitNotePayment={vi.fn()}
      {...extraProps}
    />,
  );
}

describe('InvoiceDetailModal destinations', () => {
  it('menampilkan badge Multi-tujuan di header saat container invoice punya lebih dari satu tujuan', () => {
    renderModal(baseInvoice({ destinations: ['Cikarang', 'Karawang'] }));
    expect(screen.getByText('Multi-tujuan (2)')).toBeInTheDocument();
  });

  it('tidak menampilkan badge Multi-tujuan saat semua container satu tujuan', () => {
    renderModal(baseInvoice({ destinations: ['Cikarang'] }));
    expect(screen.queryByText(/Multi-tujuan/)).not.toBeInTheDocument();
  });

  it('tidak lagi menampilkan tab Per Container - rincian per container konsolidasi ke tab Debit Note', () => {
    renderModal(baseInvoice({ destinations: ['Cikarang', 'Karawang'] }));
    expect(screen.queryByRole('tab', { name: 'Per Container' })).not.toBeInTheDocument();
  });
});

describe('InvoiceDetailModal rincian reimbursement per container (tab Debit Note)', () => {
  it('mengelompokkan biaya reimbursement per container di tab Debit Note', async () => {
    const user = userEvent.setup();
    renderModal(baseInvoice({
      debitNoteAmount: 250000,
      debitNoteItems: [
        { id: 'exp-1', containerNumber: 'CNTR001', category: 'bongkar', amount: 150000, description: 'Bongkar CNTR001', paymentStatus: 'sudah_dibayar' },
        { id: 'exp-2', containerNumber: 'CNTR002', category: 'tunggu', amount: 100000, description: 'Tunggu CNTR002', paymentStatus: 'belum_dibayar' },
      ],
    }));

    await user.click(screen.getByRole('tab', { name: /Debit Note/i }));

    expect(screen.getByText('CNTR001')).toBeInTheDocument();
    expect(screen.getByText('CNTR002')).toBeInTheDocument();
    expect(screen.getByText('Bongkar')).toBeInTheDocument();
    expect(screen.getByText('Tunggu')).toBeInTheDocument();
    expect(screen.getByText(/Bongkar CNTR001/)).toBeInTheDocument();
    expect(screen.getByText(/Tunggu CNTR002/)).toBeInTheDocument();
  });
});

describe('InvoiceDetailModal input nomor invoice', () => {
  it('tidak menampilkan panel input saat nomor invoice sudah tersimpan', () => {
    renderModal(baseInvoice({ invoiceNumber: 'INV-001' }));
    expect(screen.queryByLabelText('Nomor Invoice')).not.toBeInTheDocument();
  });

  it('menampilkan panel input (kuning) saat nomor invoice belum ada, dan tetap terbuka meski sudah mulai mengetik', async () => {
    const user = userEvent.setup();
    renderModal(baseInvoice({ invoiceNumber: '', invoiceStatus: 'Butuh Nomor Invoice' }));

    const input = screen.getByLabelText('Nomor Invoice');
    expect(screen.getByText('Input Nomor Invoice')).toBeInTheDocument();

    await user.type(input, 'INV-2026-001');

    // Bug yang pernah terjadi: panel/inputnya hilang begitu karakter pertama diketik.
    // Sekarang draft-nya lokal, jadi harus tetap terbuka dan nilainya tetap utuh.
    expect(screen.getByLabelText('Nomor Invoice')).toHaveValue('INV-2026-001');
    expect(screen.getByText('Nomor Invoice (belum dikirim)')).toBeInTheDocument();
  });

  it('menutup panel input setelah nomor invoice benar-benar tersimpan di server (invoice.invoiceNumber terisi)', () => {
    const { rerender } = renderModal(baseInvoice({ invoiceNumber: '', invoiceStatus: 'Butuh Nomor Invoice' }));
    expect(screen.getByLabelText('Nomor Invoice')).toBeInTheDocument();

    rerender(
      <InvoiceDetailModal
        invoice={baseInvoice({ invoiceNumber: 'INV-2026-001', invoiceStatus: 'Butuh Nomor Invoice' })}
        onClose={vi.fn()}
        onOpenCorrection={vi.fn()}
        onUploadInvoiceDocument={vi.fn()}
        onSaveDebitNoteNumber={vi.fn()}
        onLoadDebitNotePayments={vi.fn()}
        onConfirmDebitNotePayment={vi.fn()}
        onVoidDebitNotePayment={vi.fn()}
      />,
    );

    // invoiceStatus bisa saja masih 'Butuh Nomor Invoice' (dokumen belum lengkap), tapi karena
    // invoiceNumber-nya sudah terisi, panel input TIDAK boleh muncul lagi -- itu bug yang dilaporkan.
    expect(screen.queryByLabelText('Nomor Invoice')).not.toBeInTheDocument();
    expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
  });

  it('memanggil onSaveInvoiceNumber dengan draft yang diketik saat tombol Simpan diklik', async () => {
    const user = userEvent.setup();
    const onSaveInvoiceNumber = vi.fn();
    renderModal(baseInvoice({ invoiceNumber: '', invoiceStatus: 'Butuh Nomor Invoice' }), { onSaveInvoiceNumber });

    await user.type(screen.getByLabelText('Nomor Invoice'), 'INV-2026-001');
    await user.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(onSaveInvoiceNumber).toHaveBeenCalledWith('order-1', 'INV-2026-001');
  });
});
