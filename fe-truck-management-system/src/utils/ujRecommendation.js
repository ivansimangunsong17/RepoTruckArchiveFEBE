function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeSize(value) {
  return String(value || '').toUpperCase().replace(/\s/g, '');
}

function readNumber(...values) {
  const value = values.find((item) => item !== undefined && item !== null && item !== '');
  const normalizedValue = typeof value === 'string' ? value.replace(/[^\d-]/g, '') : value;
  const number = Number(normalizedValue || 0);
  return Number.isFinite(number) ? number : 0;
}

function compactText(value) {
  return normalizeText(value).replace(/\s/g, '');
}

function destinationSearchTerms(destination = {}) {
  return [
    destination.name,
    destination.area,
    destination.address,
    destination.city,
    destination.location,
    destination.destinationName,
    destination.label,
    destination.code,
  ].filter(Boolean);
}

function hasAnyTariff(destination = {}) {
  return Boolean(
    readNumber(destination.uj20ft, destination.uj20Ft, destination.uj20, destination.uj_20ft, destination.uj_20_ft)
      || readNumber(destination.uj40ft, destination.uj40Ft, destination.uj40, destination.uj_40ft, destination.uj_40_ft)
  );
}

function isActiveDestination(destination = {}) {
  return !destination.status || ['aktif', 'active'].includes(normalizeText(destination.status));
}

function isDestinationMatch(destination, destinationName) {
  const normalizedTarget = normalizeText(destinationName);
  const compactTarget = compactText(destinationName);
  if (!normalizedTarget) return false;

  return destinationSearchTerms(destination).some((term) => {
    const normalizedTerm = normalizeText(term);
    const compactTerm = compactText(term);
    if (!normalizedTerm) return false;
    if (normalizedTerm === normalizedTarget || compactTerm === compactTarget) return true;
    return normalizedTerm.includes(normalizedTarget) || normalizedTarget.includes(normalizedTerm);
  });
}

export function findDestinationMaster(destinations = [], destinationName = '') {
  if (!normalizeText(destinationName)) return null;
  const matches = destinations.filter((destination) => isDestinationMatch(destination, destinationName));
  return matches.find((destination) => isActiveDestination(destination) && hasAnyTariff(destination))
    || matches.find(isActiveDestination)
    || matches[0]
    || null;
}

export function calculateUjRecommendation(job = {}, destinations = []) {
  const destination = findDestinationMaster(destinations, job.destination);
  const currentSize = normalizeSize(job.size || job.containerSize);
  const fallbackQty20ft = currentSize === '20FT' ? 1 : 0;
  const fallbackQty40ft = currentSize === '40FT' ? 1 : 0;
  const qty20ft = readNumber(job.qty20ft, job.qty20FT, job.qty20, job.orderQty20ft, fallbackQty20ft);
  const qty40ft = readNumber(job.qty40ft, job.qty40FT, job.qty40, job.orderQty40ft, fallbackQty40ft);
  const uj20ft = readNumber(destination?.uj20ft, destination?.uj20Ft, destination?.uj20, destination?.uj_20ft, destination?.uj_20_ft);
  const uj40ft = readNumber(destination?.uj40ft, destination?.uj40Ft, destination?.uj40, destination?.uj_40ft, destination?.uj_40_ft);
  const totalUj20ft = qty20ft * uj20ft;
  const totalUj40ft = qty40ft * uj40ft;
  const currentContainerUj = currentSize === '40FT' ? uj40ft : uj20ft;
  const hasCurrentContainerTariff = currentSize === '40FT'
    ? uj40ft > 0
    : currentSize === '20FT'
      ? uj20ft > 0
      : Boolean(uj20ft || uj40ft);

  return {
    destination,
    destinationName: destination?.name || job.destination || '',
    currentSize: currentSize || '',
    currentContainerUj,
    uj20ft,
    uj40ft,
    qty20ft,
    qty40ft,
    totalUj20ft,
    totalUj40ft,
    totalRecommendedUj: totalUj20ft + totalUj40ft,
    hasConfiguredTariff: Boolean(destination && hasCurrentContainerTariff),
  };
}
