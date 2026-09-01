import { formatCurrency } from '../../../utils/formatCurrency';
import CorrectionHistoryList from '../shared/CorrectionHistoryList';
import DetailField from '../shared/DetailField';
import { isCancelledFinanceOrder } from './orderVerificationUtils';

function OrderDetailModal({ order, corrections = [], correctionsLoading = false, correctionsError = '', onClose, onOpenCorrection }) {
  if (!order) return null;

  const isCancelled = isCancelledFinanceOrder(order);
  const priceItems = Array.isArray(order.lineItems) ? order.lineItems.filter((item) => item.serviceName || item.price || item.total) : [];
  const priceTotal = Number(order.totalAmount || priceItems.reduce((sum, item) => sum + Number(item.total || 0), 0) || order.price || 0);

  return (
    <div className="finance-order-detail-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" role="presentation" onMouseDown={onClose}>
      <section className="finance-order-detail-modal flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex flex-none flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Detail Request Order</p>
            <h3 className="mt-0.5 text-lg font-black text-slate-950">{order.customer}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{order.destination} - {order.salesName} - {order.orderDate}</p>
          </div>
          <button className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50" onClick={onClose} type="button">
            Tutup
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <DetailField label="Nama Sales" value={order.salesName} />
            <DetailField label="Order Dibuat" value={order.orderDate} />
            <DetailField label="Tanggal Jalan" value={order.runningDate} />
            <DetailField label="Payment Terms" value={order.paymentTerms} />
            <DetailField label="PIC Customer" value={order.customerPic} />
            <DetailField label="Kontak" value={order.customerPhone} />
            <DetailField label="Tujuan" value={order.destination} />
            <DetailField label="Container" value={order.container} />
            <DetailField label="Nama Kapal" value={order.vesselName} />
            <DetailField label="Terminal" value={order.terminal} />
            <DetailField label="Depo" value={order.depo} />
            <DetailField label="Dokumen Awal" value={order.document} />
            <DetailField label="Status SO" value={order.status} />
          </div>

          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Detail Harga</p>
                <h4 className="mt-1 text-lg font-black text-slate-950">{formatCurrency(priceTotal)}</h4>
              </div>
              <div className="grid min-w-[180px] gap-1 text-right">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Harga Dasar</span>
                <strong className="text-sm font-black text-slate-900">{formatCurrency(order.price)}</strong>
              </div>
            </div>
            {priceItems.length ? (
              <div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-[10px] font-black uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Layanan</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Harga</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceItems.map((item, index) => (
                      <tr className="border-t border-slate-100" key={`${item.serviceName}-${index}`}>
                        <td className="px-3 py-2 font-semibold text-slate-900">
                          <span className="block break-words">{item.serviceName || '-'}</span>
                          {item.containerType ? <span className="mt-0.5 block text-[10px] font-semibold text-slate-500">{item.containerType}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-700">{item.qty || '-'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatCurrency(item.price)}</td>
                        <td className="px-3 py-2 text-right font-black text-slate-950">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-xs font-semibold text-slate-500">Rincian harga belum tersedia.</p>
            )}
          </div>

          <div className="mt-2 grid gap-2 xl:grid-cols-[1fr_240px]">
            <DetailField label="Catatan Order" value={order.notes} />
            <div className="grid gap-2">
              <DetailField label="Nomor SO Internal" value={order.internalSoNumber || '-'} />
              <DetailField label="Nomor SO Accurate" value={order.soNumber || '-'} />
            </div>
          </div>
          {!isCancelled && order.soNumber ? (
            <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-black text-slate-950">Koreksi Nomor SO</h4>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">Gunakan alur koreksi jika nomor SO sudah pernah diinput.</p>
                </div>
                <button className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800" onClick={() => onOpenCorrection(order, 'so_number')} type="button">
                  Ajukan Koreksi
                </button>
              </div>
              <div className="mt-2">
                <CorrectionHistoryList corrections={corrections} error={correctionsError} loading={correctionsLoading} />
              </div>
            </div>
          ) : null}
          {isCancelled ? (
            <div className="mt-2 grid gap-2 xl:grid-cols-[1fr_240px_240px]">
              <DetailField label="Alasan Batal" value={order.cancelReason || '-'} />
              <DetailField label="Dibatalkan Oleh" value={order.cancelledByName || '-'} />
              <DetailField label="Tanggal Batal" value={order.cancelledAt || '-'} />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default OrderDetailModal;
