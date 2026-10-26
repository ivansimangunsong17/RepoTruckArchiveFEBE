import { AlertTriangle } from 'lucide-react';

// Ditampilkan bila daftar SO aktif dari backend terpotong di batas maksimum, supaya angka job aktif
// dan status armada tidak dibaca sebagai data lengkap.
function OperationalDataTruncatedNotice({ truncated }) {
  if (!truncated) return null;
  return (
    <div className="sales-order-cancelled-note" role="alert">
      <AlertTriangle size={16} />
      <span>
        Data job aktif melebihi batas 1.000 Sales Order sehingga sebagian tidak dimuat. Angka dashboard dan
        status Bertugas truck/sopir mungkin belum lengkap. Hubungi Admin untuk menindaklanjuti.
      </span>
    </div>
  );
}

export default OperationalDataTruncatedNotice;
