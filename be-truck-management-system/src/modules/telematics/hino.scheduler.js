import { env } from '../../config/env.js';
import { syncHinoVehicleCatalog, syncHinoVehiclePositions } from './hino.service.js';

let catalogTimer = null;
let positionsTimer = null;

function parseScheduleTime(value = '05:00') {
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hour: 5, minute: 0 };

  const hour = Math.max(0, Math.min(23, Number(match[1])));
  const minute = Math.max(0, Math.min(59, Number(match[2])));
  return { hour, minute };
}

function getNextCatalogDelayMs() {
  const { hour, minute } = parseScheduleTime(env.hino.autoSyncTime);
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

async function runScheduledVehicleCatalogSync() {
  try {
    await syncHinoVehicleCatalog();
    console.log('HINO scheduled vehicle catalog sync completed.');
  } catch (error) {
    console.error(`HINO scheduled vehicle catalog sync failed: ${error.message}`);
  }
}

function scheduleNextCatalogRun() {
  const delayMs = getNextCatalogDelayMs();
  catalogTimer = setTimeout(async () => {
    await runScheduledVehicleCatalogSync();
    scheduleNextCatalogRun();
  }, delayMs);
  catalogTimer.unref?.();
}

async function runScheduledPositionsSync() {
  try {
    await syncHinoVehiclePositions();
  } catch (error) {
    console.error(`HINO scheduled vehicle position sync failed: ${error.message}`);
  }
}

function startPositionsInterval() {
  const intervalMs = Math.max(1, env.hino.positionsSyncIntervalMinutes) * 60_000;
  positionsTimer = setInterval(runScheduledPositionsSync, intervalMs);
  positionsTimer.unref?.();
}

// Katalog kendaraan (/v4/vehicles, mapping/master) dan posisi (/v4/vehiclepositions, sumber map
// live) sengaja punya cadence terpisah -- katalog jarang berubah jadi cukup disegarkan sekali sehari
// (env.hino.autoSyncTime), sedangkan posisi perlu sering disegarkan supaya map "live" (env.hino.
// positionsSyncIntervalMinutes, default 5 menit) tanpa menunggu jadwal harian.
export function startHinoAutoSyncScheduler() {
  if (!env.hino.autoSyncEnabled) return null;

  if (env.hino.autoSyncVehiclesEnabled && !catalogTimer) {
    scheduleNextCatalogRun();
    console.log(`HINO scheduled vehicle catalog sync enabled at ${env.hino.autoSyncTime} WIB.`);
  }

  if (!positionsTimer) {
    startPositionsInterval();
    console.log(`HINO scheduled vehicle position sync enabled every ${env.hino.positionsSyncIntervalMinutes} minute(s).`);
  }

  return { catalogTimer, positionsTimer };
}
