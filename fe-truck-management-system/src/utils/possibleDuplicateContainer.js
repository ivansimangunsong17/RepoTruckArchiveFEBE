// Nomor container yang masih aktif/dititip di job lain ditolak backend tanpa opsi konfirmasi
// (CONTAINER_NUMBER_IN_ACTIVE_JOB, tampil sebagai error biasa). Yang bisa dikonfirmasi hanya
// pemakaian ulang setelah job lain selesai (baru selesai, atau di SO yang sama):
// CONTAINER_NUMBER_POSSIBLE_DUPLICATE, dikirim ulang dengan confirmPossibleDuplicateContainer.
export const POSSIBLE_DUPLICATE_CONTAINER_CODE = 'CONTAINER_NUMBER_POSSIBLE_DUPLICATE';

const STATUS_LABELS = {
  received: 'Belum Jalan',
  running: 'Sedang Jalan',
  inap: 'Inap',
  repo_stored: 'Dititip',
  completed: 'Selesai',
};

export function getPossibleDuplicateContainer(error) {
  const payloadError = error?.payload?.error;
  if (payloadError?.code !== POSSIBLE_DUPLICATE_CONTAINER_CODE) return null;
  const details = payloadError.details && typeof payloadError.details === 'object' ? payloadError.details : {};
  return {
    message: payloadError.message || error.message || '',
    containerNumber: details.containerNumber || '',
    matches: Array.isArray(details.matches) ? details.matches : [],
  };
}

export function describeDuplicateContainerMatch(match = {}) {
  return [
    match.soNumber || 'SO -',
    match.customerName,
    STATUS_LABELS[match.status] || match.status,
    match.driverName ? `Sopir ${match.driverName}` : '',
  ].filter(Boolean).join(' · ');
}
