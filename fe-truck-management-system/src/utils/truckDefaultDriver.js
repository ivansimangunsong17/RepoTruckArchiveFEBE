// Satu sumber aturan pasangan sopir default <-> truck untuk Master Truck dan Master Sopir.
// defaultDriverId adalah identitas utama; teks defaultDriver hanya fallback untuk unit legacy yang
// belum punya ID (dan tidak pernah dipakai bila truck sudah punya ID).

export const CLEAR_LEGACY_DEFAULT_DRIVER = '__clear_legacy_default_driver__';

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeId(value) {
  return String(value || '').trim();
}

export function isLegacyDefaultDriver(truck = {}) {
  return !normalizeId(truck?.defaultDriverId) && Boolean(String(truck?.defaultDriver || '').trim());
}

export function findTruckDefaultDriver(truck = {}, drivers = []) {
  const driverId = normalizeId(truck?.defaultDriverId);
  if (!driverId) return null;
  return (drivers || []).find((driver) => normalizeId(driver?.id) === driverId) || null;
}

export function getTruckDefaultDriverName(truck = {}, drivers = []) {
  const driver = findTruckDefaultDriver(truck, drivers);
  if (driver) return driver.name || '';
  return String(truck?.defaultDriver || '').trim();
}

function driverIdentityNames(driver = {}) {
  return [driver?.name, driver?.nickname].map(normalizeName).filter(Boolean);
}

function holdsDriver(truck, driver) {
  const driverId = normalizeId(driver?.id);
  const truckDriverId = normalizeId(truck?.defaultDriverId);
  if (truckDriverId) return Boolean(driverId) && truckDriverId === driverId;
  return driverIdentityNames(driver).includes(normalizeName(truck?.defaultDriver));
}

export function findDriverDefaultTruck(driver = {}, trucks = []) {
  const driverId = normalizeId(driver?.id);
  if (driverId) {
    const truckById = (trucks || []).find((truck) => normalizeId(truck?.defaultDriverId) === driverId);
    if (truckById) return truckById;
  }
  return (trucks || []).find((truck) => !normalizeId(truck?.defaultDriverId) && holdsDriver(truck, driver)) || null;
}

export function findTrucksHoldingDriver(trucks = [], driver = {}, excludeTruckId = null) {
  return (trucks || []).filter((truck) => truck?.id !== excludeTruckId && holdsDriver(truck, driver));
}

// Menerjemahkan pilihan form Master Truck menjadi payload yang konsisten untuk backend:
// - id sopir      -> defaultDriverId + nama sopir dari data Master Sopir
// - kosong        -> lepas sopir (atau pertahankan unit legacy bila memang belum disentuh)
// - CLEAR_LEGACY  -> lepas sopir legacy yang belum punya ID
export function resolveTruckDefaultDriverPayload(payload = {}, { drivers = [], legacyDefaultDriver = '' } = {}) {
  const selected = normalizeId(payload.defaultDriverId);
  if (selected === CLEAR_LEGACY_DEFAULT_DRIVER) {
    return { ...payload, defaultDriverId: '', defaultDriver: '' };
  }
  if (!selected) {
    if (legacyDefaultDriver) return { ...payload, defaultDriverId: null, defaultDriver: legacyDefaultDriver };
    return { ...payload, defaultDriverId: '', defaultDriver: '' };
  }
  const driver = (drivers || []).find((item) => normalizeId(item?.id) === selected);
  return { ...payload, defaultDriverId: selected, defaultDriver: driver?.name || '' };
}
