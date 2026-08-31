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

describe('InvoiceDetailModal status pengiriman invoice (kontrol milik Finance)', () => {
  it('menampilkan kontrol status pengiriman saat nomor invoice sudah ada dan belum lunas', () => {
    renderModal(baseInvoice({ invoiceNumber: 'INV-001', billingStatus: 'belum_dikirim' }));
    expect(screen.getByText('Status Pengiriman Invoice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Simpan Status/i })).toBeInTheDocument();
  });

  it('tidak menampilkan kontrol status pengiriman saat invoice sudah lunas -- lunas cuma boleh berubah otomatis lewat payment', () => {
    renderModal(baseInvoice({ invoiceNumber: 'INV-001', billingStatus: 'lunas' }));
    expect(screen.queryByText('Status Pengiriman Invoice')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Simpan Status/i })).not.toBeInTheDocument();
  });

  it('tidak pernah menawarkan opsi Lunas di dropdown status pengiriman', () => {
    renderModal(baseInvoice({ invoiceNumber: 'INV-001', billingStatus: 'belum_dikirim' }));
    const select = screen.getByRole('combobox', { name: 'Status' });
    const optionLabels = Array.from(select.options).map((option) => option.value);
    expect(optionLabels).not.toContain('lunas');
  });

  it('memanggil onSaveInvoiceDeliveryStatus dengan status yang dipilih saat tombol Simpan Status diklik', async () => {
    const user = userEvent.setup();
    const onSaveInvoiceDeliveryStatus = vi.fn().mockResolvedValue();
    renderModal(baseInvoice({ invoiceNumber: 'INV-001', billingStatus: 'belum_dikirim' }), { onSaveInvoiceDeliveryStatus });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'menunggu_pembayaran');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Metode' }), 'email');
    await user.click(screen.getByRole('button', { name: 'Simpan Status' }));

    expect(onSaveInvoiceDeliveryStatus).toHaveBeenCalledWith('order-1', expect.objectContaining({
      billingStatus: 'menunggu_pembayaran',
      deliveryMethod: 'email',
    }));
  });
});

describe('InvoiceDetailModal biaya inap / revenue manual (milik Finance, masuk Invoice bukan Debit Note)', () => {
  it('menampilkan rincian manual revenue line dengan nominal di kartu Invoice / Revenue', () => {
    renderModal(baseInvoice({
      billingAmount: 2000000,
      manualRevenueLines: [
        { id: 'line-1', chargeType: 'inap', description: 'Inap 1 malam', quantity: 1, unit: 'malam', unitPrice: 500000, totalAmount: 500000, note: '', status: 'active' },
      ],
    }));

    expect(screen.getByText('Invoice / Revenue')).toBeInTheDocument();
    expect(screen.getByText('Biaya Inap / Revenue Manual')).toBeInTheDocument();
    expect(screen.getByText(/Inap - Inap 1 malam/)).toBeInTheDocument();
    expect(screen.getByText(/1 malam x/)).toBeInTheDocument();
  });

  it('menampilkan kartu Internal Cost terpisah dari Invoice dan Debit Note', () => {
    renderModal(baseInvoice({
      internalCost: { journeyMoney: 300000, additionalCost: 50000, driverCommissionCost: 100000, operationalExpenseTotal: 75000, total: 525000 },
    }));

    expect(screen.getByText('Internal Cost')).toBeInTheDocument();
    expect(screen.getByText('Debit Note / Reimbursement')).toBeInTheDocument();
  });

  it('menampilkan badge Snapshot pada UJ ketika nilai sudah dibekukan', () => {
    renderModal(baseInvoice({
      internalCost: {
        journeyMoney: 300000,
        journeyMoneySource: 'snapshot',
        journeyMoneyNeedsReview: false,
        additionalCost: 0,
        driverCommissionCost: 0,
        operationalExpenseTotal: 0,
        total: 300000,
      },
    }));

    expect(screen.getByText('Snapshot')).toBeInTheDocument();
    expect(screen.queryByText('Perlu Review')).not.toBeInTheDocument();
  });

  it('menampilkan badge Perlu Review pada UJ ketika belum pernah punya snapshot', () => {
    renderModal(baseInvoice({
      internalCost: {
        journeyMoney: 300000,
        journeyMoneySource: 'master_current',
        journeyMoneyNeedsReview: true,
        additionalCost: 0,
        driverCommissionCost: 0,
        operationalExpenseTotal: 0,
        total: 300000,
      },
    }));

    expect(screen.getByText('Perlu Review')).toBeInTheDocument();
    expect(screen.queryByText('Snapshot')).not.toBeInTheDocument();
  });

  it('tombol Tambah Biaya Inap membuka form dengan jenis inap terpilih, dan submit memanggil onSaveRevenueLine ke Invoice bukan Debit Note', async () => {
    const user = userEvent.setup();
    const onSaveRevenueLine = vi.fn().mockResolvedValue();
    renderModal(baseInvoice({}), { onSaveRevenueLine });

    await user.click(screen.getByRole('button', { name: 'Tambah Biaya Inap' }));
    expect(screen.getByRole('combobox', { name: 'Jenis' })).toHaveValue('inap');

    await user.type(screen.getByPlaceholderText(/Inap 1 malam/i), 'Inap 1 malam di rest area KM 57');
    await user.clear(screen.getByRole('spinbutton', { name: 'Harga Satuan' }));
    await user.type(screen.getByRole('spinbutton', { name: 'Harga Satuan' }), '500000');
    await user.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(onSaveRevenueLine).toHaveBeenCalledWith('order-1', expect.objectContaining({
      chargeType: 'inap',
      description: 'Inap 1 malam di rest area KM 57',
      quantity: 1,
      unit: 'malam',
      unitPrice: 500000,
    }));
  });

  it('tombol Batalkan pada revenue line meminta alasan lalu memanggil onVoidRevenueLine', async () => {
    const user = userEvent.setup();
    const onVoidRevenueLine = vi.fn().mockResolvedValue();
    renderModal(baseInvoice({
      manualRevenueLines: [
        { id: 'line-1', chargeType: 'inap', description: 'Inap 1 malam', quantity: 1, unit: 'malam', unitPrice: 500000, totalAmount: 500000, note: '', status: 'active' },
      ],
    }), { onVoidRevenueLine });

    await user.click(screen.getByRole('button', { name: 'Batalkan' }));
    await user.type(screen.getByPlaceholderText(/Alasan pembatalan/i), 'Salah input, harusnya bukan inap');
    await user.click(screen.getByRole('button', { name: 'Konfirmasi Batalkan' }));

    expect(onVoidRevenueLine).toHaveBeenCalledWith('order-1', 'line-1', 'Salah input, harusnya bukan inap');
  });
});
