const labels = {
  standby: 'Standby',
  on_trip: 'Sedang Jalan',
  maintenance: 'Maintenance',
  inactive: 'Nonaktif',
  completed: 'Selesai',
  loading: 'Muat Barang',
  scheduled: 'Terjadwal',
  active: 'Aktif',
  pending: 'Belum Diproses',
  import: 'Import',
  export: 'Export',
  valid: 'Valid',
  expiring_soon: 'Segera Expired',
  expired: 'Kedaluwarsa',
  received: 'Belum Jalan',
  waiting_operational: 'Belum Jalan',
  running: 'Sedang Jalan',
  repo_stored: 'Container Titip',
  partial_complete: 'Sebagian Selesai',
  approved: 'Disetujui',
  submitted: 'Diajukan',
  rejected: 'Ditolak',
  cancelled: 'Batal',
};

function StatusBadge({ status, label }) {
  return <span className={`status-badge ${status}`}><i aria-hidden="true" />{label || labels[status] || status}</span>;
}

export default StatusBadge;

