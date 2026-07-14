function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeSize(value) {
  return String(value || '').toUpperCase().replace(/\s/g, '');
}

function readNumber(...values) {
  const value = values.find((item) => item !== undefined && item !== null && item !== '');
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

export function findDestinationMaster(destinations = [], destinationName = '') {
  const normalizedName = normalizeText(destinationName);
  if (!normalizedName) return null;
  return destinations.find((destination) => normalizeText(destination.name) === normalizedName) || null;
}

export function calculateUjRecommendation(job = {}, destinations = []) {
  const destination = findDestinationMaster(destinations, job.destination);
  const currentSize = normalizeSize(job.size || job.containerSize);
  const fallbackQty20ft = currentSize === '20FT' ? 1 : 0;
  const fallbackQty40ft = currentSize === '40FT' ? 1 : 0;
  const qty20ft = readNumber(job.qty20ft, job.qty20FT, job.qty20, job.orderQty20ft, fallbackQty20ft);
  const qty40ft = readNumber(job.qty40ft, job.qty40FT, job.qty40, job.orderQty40ft, fallbackQty40ft);
  const uj20ft = readNumber(destination?.uj20ft, destination?.uj_20ft);
  const uj40ft = readNumber(destination?.uj40ft, destination?.uj_40ft);
  const totalUj20ft = qty20ft * uj20ft;
  const totalUj40ft = qty40ft * uj40ft;
  const currentContainerUj = currentSize === '40FT' ? uj40ft : uj20ft;

  return {
    destination,
    destinationName: job.destination || destination?.name || '',
    currentSize: currentSize || '',
    currentContainerUj,
    uj20ft,
    uj40ft,
    qty20ft,
    qty40ft,
    totalUj20ft,
    totalUj40ft,
    totalRecommendedUj: totalUj20ft + totalUj40ft,
    hasConfiguredTariff: Boolean(destination && (uj20ft || uj40ft)),
  };
}
