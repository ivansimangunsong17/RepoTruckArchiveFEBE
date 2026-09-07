import { env } from '../../config/env.js';
import {
  getCachedHinoToken,
  getLatestHinoApiLog,
  linkHinoVehicleToTruck,
  listCachedHinoVehicles,
  listLiveHinoVehiclePositions,
  recordHinoApiUsage,
  saveHinoToken,
  saveHinoVehicles,
  saveHinoVehiclePositions,
  summarizeHinoApiUsageToday,
  unlinkHinoVehicleFromTruck,
} from './hino.repository.js';

const TOKEN_ENDPOINT = 'hino.token';
const VEHICLES_ENDPOINT = 'hino.vehicles';
const VEHICLE_POSITIONS_ENDPOINT = 'hino.vehiclepositions';
const TOKEN_EXPIRY_BUFFER_MS = 120_000;

function validationError(message, code = 'HINO_CONFIG_REQUIRED') {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
}

function normalizeRequiredText(value, message, code = 'VALIDATION_ERROR') {
  const normalized = String(value || '').trim();
  if (!normalized) throw validationError(message, code);
  return normalized;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pickFirst(source = {}, keys = []) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  }
  return null;
}

function nested(source = {}, path = '') {
  return path.split('.').reduce((value, key) => (value && value[key] !== undefined ? value[key] : undefined), source);
}

function pickNested(source = {}, paths = []) {
  for (const path of paths) {
    const value = nested(source, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function buildTokenPayload() {
  if (env.hino.tokenPayloadJson) return env.hino.tokenPayloadJson;

  const hasBasicAuth = Boolean(env.hino.tokenBasicUsername && env.hino.tokenBasicPassword);
  const hasClientCredential = Boolean(env.hino.clientId && env.hino.clientSecret);
  const hasPasswordCredential = Boolean(env.hino.username && env.hino.password);

  if (!hasBasicAuth && !hasClientCredential && !hasPasswordCredential) {
    throw validationError(
      'Credential HINO belum dikonfigurasi. Isi HINO_TOKEN_BASIC_USERNAME/HINO_TOKEN_BASIC_PASSWORD atau credential HINO lain di .env.',
    );
  }

  const payload = {
    grant_type: env.hino.tokenGrantType || (hasClientCredential ? 'client_credentials' : 'password'),
  };

  if (!hasBasicAuth && hasClientCredential) {
    payload.client_id = env.hino.clientId;
    payload.client_secret = env.hino.clientSecret;
  }

  if (!hasBasicAuth && hasPasswordCredential && payload.grant_type === 'password') {
    payload.username = env.hino.username;
    payload.password = env.hino.password;
  }

  return payload;
}

function buildBasicAuthorizationHeader() {
  if (!env.hino.tokenBasicUsername || !env.hino.tokenBasicPassword) return {};
  const encoded = Buffer.from(`${env.hino.tokenBasicUsername}:${env.hino.tokenBasicPassword}`).toString('base64');
  return { Authorization: `Basic ${encoded}` };
}

function buildTokenHeaders() {
  return {
    'Content-Type': env.hino.tokenContentType,
    Accept: 'application/json',
    ...(env.hino.ibmClientId ? { 'X-IBM-Client-Id': env.hino.ibmClientId } : {}),
    ...buildBasicAuthorizationHeader(),
    ...env.hino.tokenHeadersJson,
  };
}

function encodeTokenBody(payload = {}) {
  if (/x-www-form-urlencoded/i.test(env.hino.tokenContentType)) {
    const params = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    });
    return params.toString();
  }
  return JSON.stringify(payload);
}

function maskToken(token = '') {
  if (!token) return '';
  if (token.length <= 20) return `${token.slice(0, 4)}...`;
  return `${token.slice(0, 12)}...${token.slice(-8)}`;
}

function getSyncMinIntervalSeconds(endpoint) {
  return endpoint === VEHICLE_POSITIONS_ENDPOINT
    ? env.hino.positionsSyncMinIntervalSeconds
    : env.hino.vehiclesSyncMinIntervalSeconds;
}

function buildSyncAvailability(latest, endpoint) {
  if (!latest?.created_at || latest.status !== 'success') {
    return { allowed: true, nextAllowedAt: null, secondsRemaining: 0 };
  }

  const nextAllowedAtMs = new Date(latest.created_at).getTime() + getSyncMinIntervalSeconds(endpoint) * 1000;
  const secondsRemaining = Math.max(0, Math.ceil((nextAllowedAtMs - Date.now()) / 1000));
  return {
    allowed: secondsRemaining <= 0,
    nextAllowedAt: new Date(nextAllowedAtMs).toISOString(),
    secondsRemaining,
  };
}

function parseAccessToken(payload = {}) {
  return pickNested(payload, [
    'access_token',
    'token',
    'data.access_token',
    'data.token',
    'result.access_token',
    'result.token',
  ]);
}

function parseTokenType(payload = {}) {
  return pickNested(payload, ['token_type', 'data.token_type', 'result.token_type']) || 'Bearer';
}

function parseExpiresAt(payload = {}) {
  const expiresIn = toNumber(pickNested(payload, ['expires_in', 'data.expires_in', 'result.expires_in']));
  if (expiresIn) return new Date(Date.now() + expiresIn * 1000).toISOString();

  const expiresAt = pickNested(payload, ['expires_at', 'expired_at', 'data.expires_at', 'data.expired_at', 'result.expires_at']);
  if (!expiresAt) return null;
  const parsed = new Date(expiresAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }
    }
    if (!response.ok) {
      const providerMessage = payload?.message
        || payload?.error?.message
        || payload?.moreInformation
        || payload?.httpMessage
        || `HINO API gagal dengan status ${response.status}.`;
      const error = new Error(providerMessage);
      error.statusCode = response.status === 429 ? 429 : 502;
      error.code = 'HINO_API_ERROR';
      error.httpStatus = response.status;
      error.payload = payload;
      throw error;
    }
    return { payload, status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

async function requestHinoToken() {
  const payload = buildTokenPayload();
  const { payload: tokenPayload, status } = await fetchJson(env.hino.tokenUrl, {
    method: 'POST',
    headers: buildTokenHeaders(),
    body: encodeTokenBody(payload),
  });

  const accessToken = parseAccessToken(tokenPayload);
  if (!accessToken) {
    const error = new Error('Response token HINO tidak berisi access_token/token.');
    error.statusCode = 502;
    error.code = 'HINO_TOKEN_INVALID_RESPONSE';
    throw error;
  }

  const tokenType = parseTokenType(tokenPayload);
  const expiresAt = parseExpiresAt(tokenPayload);
  await saveHinoToken({ accessToken, tokenType, expiresAt, rawPayload: tokenPayload });
  await recordHinoApiUsage({ endpoint: TOKEN_ENDPOINT, status: 'success', httpStatus: status });

  return { accessToken, tokenType, expiresAt };
}

async function getUsableHinoToken({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = await getCachedHinoToken();
    if (cached?.access_token) {
      if (!cached.expires_at || new Date(cached.expires_at).getTime() > Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
        return {
          accessToken: cached.access_token,
          tokenType: cached.token_type || 'Bearer',
          expiresAt: cached.expires_at,
          source: 'cache',
        };
      }
    }
  }

  const token = await requestHinoToken();
  return { ...token, source: 'api' };
}

function extractVehicleRows(payload = {}) {
  const candidates = [
    payload.data?.vehicles,
    payload.data?.vehicle,
    payload.data,
    payload.vehicles,
    payload.vehicle,
    payload.result?.vehicles,
    payload.result,
    payload.results,
    payload,
  ];

  const rows = candidates.find((value) => Array.isArray(value));
  return rows || [];
}

function normalizeHinoVehicleCatalog(row = {}) {
  const hinoVehicleId = String(pickFirst(row, [
    'vehicleId',
    'vehicle_id',
    'hinoVehicleId',
    'id',
    'deviceId',
    'device_id',
    'vin',
  ]) || '').trim();

  const vin = String(pickFirst(row, ['vin', 'chassisNo', 'chassis_no', 'frameNo', 'frame_no']) || hinoVehicleId || '').trim();
  const plateNumber = String(pickFirst(row, [
    'plateNumber',
    'plate_number',
    'licensePlate',
    'license_plate',
    'policeNumber',
    'police_number',
    'vehicleNo',
    'vehicle_no',
    'registrationNumber',
  ]) || '').trim();
  const displayName = String(pickFirst(row, [
    'displayName',
    'display_name',
    'vehicleName',
    'vehicle_name',
    'name',
    'model',
  ]) || '').trim();

  if (!hinoVehicleId && !plateNumber && !vin) return null;

  return {
    hinoVehicleId: hinoVehicleId || vin || plateNumber,
    vin,
    plateNumber,
    displayName,
    vehicleStatus: String(pickFirst(row, ['vehicleStatus', 'vehicle_status', 'status']) || '').trim(),
    rawPayload: row,
  };
}

function normalizeHinoVehiclePosition(row = {}) {
  const position = row.position || row.gps || row.location || {};
  const hinoVehicleId = String(pickFirst(row, [
    'vehicleId',
    'vehicle_id',
    'hinoVehicleId',
    'id',
    'deviceId',
    'device_id',
    'vin',
  ]) || '').trim();

  const plateNumber = String(pickFirst(row, [
    'plateNumber',
    'plate_number',
    'licensePlate',
    'license_plate',
    'policeNumber',
    'police_number',
    'vehicleNo',
    'vehicle_no',
  ]) || '').trim();

  if (!hinoVehicleId && !plateNumber) return null;

  return {
    hinoVehicleId: hinoVehicleId || plateNumber,
    plateNumber,
    latitude: toNumber(pickFirst(position, ['latitude', 'lat']) ?? pickFirst(row, ['latitude', 'lat'])),
    longitude: toNumber(pickFirst(position, ['longitude', 'lng', 'lon']) ?? pickFirst(row, ['longitude', 'lng', 'lon'])),
    speedKph: toNumber(pickFirst(row, ['speedKph', 'speed_kph', 'speed']) ?? pickFirst(position, ['speedKph', 'speed_kph', 'speed'])),
    heading: toNumber(pickFirst(row, ['heading', 'direction', 'course']) ?? pickFirst(position, ['heading', 'direction', 'course'])),
    ignitionStatus: String(pickFirst(row, ['ignitionStatus', 'ignition_status', 'ignition', 'vehicleStatus']) || '').trim(),
    engineStatus: String(pickFirst(row, ['engineStatus', 'engine_status', 'engine', 'vehicleStatus']) || '').trim(),
    address: String(pickFirst(row, ['address', 'locationName', 'location_name']) || pickFirst(position, ['address', 'locationName']) || '').trim(),
    gpsTime: pickFirst(row, [
      'gpsTime',
      'gps_time',
      'positionDateTime',
      'position_date_time',
      'lastUpdate',
      'last_update',
      'updatedAt',
      'updated_at',
      'createdDateTime',
    ])
      || pickFirst(position, ['gpsTime', 'gps_time', 'positionDateTime', 'lastUpdate', 'last_update'])
      || null,
    rawPayload: row,
  };
}

function buildProtectedApiHeaders(token, payload, extraHeaders = {}) {
  return {
    Accept: 'application/json',
    ...(payload ? { 'Content-Type': 'application/json' } : {}),
    ...(env.hino.ibmClientId ? { 'X-IBM-Client-Id': env.hino.ibmClientId } : {}),
    Authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
    ...extraHeaders,
  };
}

async function fetchProtectedHinoJson({
  endpointUrl,
  method = 'POST',
  token,
  payload = null,
  headers = {},
}) {
  return fetchJson(endpointUrl, {
    method,
    headers: buildProtectedApiHeaders(token, payload, headers),
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
}

async function requireHinoToken(options = {}) {
  try {
    return await getUsableHinoToken({ forceRefresh: Boolean(options.forceTokenRefresh) });
  } catch (error) {
    await recordHinoApiUsage({
      endpoint: TOKEN_ENDPOINT,
      status: 'error',
      httpStatus: error.httpStatus || null,
      errorMessage: error.message,
    });
    throw error;
  }
}

// Kalau HINO balas 401 (token ditolak walau cache lokal masih dianggap valid), generate ulang token
// dan retry PERSIS SEKALI -- bukan retry loop, supaya tidak membombardir HINO saat token benar-benar
// tidak valid (mis. credential salah) atau saat HINO membalas 401 karena alasan lain.
async function fetchProtectedHinoJsonWithRetry({ endpointUrl, method, payload, headers, forceTokenRefresh = false }) {
  const token = await requireHinoToken({ forceTokenRefresh });
  try {
    const result = await fetchProtectedHinoJson({ endpointUrl, method, token, payload, headers });
    return { ...result, token };
  } catch (error) {
    if (error.httpStatus !== 401 || forceTokenRefresh) throw error;
    const refreshedToken = await requireHinoToken({ forceTokenRefresh: true });
    const result = await fetchProtectedHinoJson({ endpointUrl, method, token: refreshedToken, payload, headers });
    return { ...result, token: refreshedToken };
  }
}

async function assertSyncInterval(endpoint, { force = false } = {}) {
  if (force) return;
  const latest = await getLatestHinoApiLog(endpoint);
  if (!latest?.created_at || latest.status !== 'success') return;

  const minIntervalSeconds = getSyncMinIntervalSeconds(endpoint);
  const secondsSinceLastSync = (Date.now() - new Date(latest.created_at).getTime()) / 1000;
  if (secondsSinceLastSync >= minIntervalSeconds) return;

  await recordHinoApiUsage({
    endpoint,
    status: 'skipped',
    requestCount: 1,
    errorMessage: `Skip sync: interval minimum ${minIntervalSeconds} detik belum terpenuhi.`,
  });

  const error = new Error(`Sync HINO terlalu sering. Coba lagi sekitar ${Math.ceil(minIntervalSeconds - secondsSinceLastSync)} detik lagi.`);
  error.statusCode = 429;
  error.code = 'HINO_SYNC_TOO_FREQUENT';
  throw error;
}

export async function syncHinoVehicleCatalog(options = {}) {
  await assertSyncInterval(VEHICLES_ENDPOINT, { force: Boolean(options.force) });

  try {
    const { payload, status, token } = await fetchProtectedHinoJsonWithRetry({
      endpointUrl: env.hino.vehiclesUrl,
      method: env.hino.vehiclesMethod,
      payload: env.hino.vehiclesPayloadJson,
      headers: env.hino.vehiclesHeadersJson,
      forceTokenRefresh: Boolean(options.forceTokenRefresh),
    });
    const vehicles = extractVehicleRows(payload).map(normalizeHinoVehicleCatalog).filter(Boolean);
    const saveResult = await saveHinoVehicles(vehicles);
    await recordHinoApiUsage({
      endpoint: VEHICLES_ENDPOINT,
      status: 'success',
      httpStatus: status,
      vehicleCount: vehicles.length,
    });

    return {
      syncedAt: new Date().toISOString(),
      endpoint: VEHICLES_ENDPOINT,
      tokenSource: token.source,
      fetched: vehicles.length,
      saved: saveResult.saved,
      linked: saveResult.linked,
    };
  } catch (error) {
    await recordHinoApiUsage({
      endpoint: VEHICLES_ENDPOINT,
      status: 'error',
      httpStatus: error.httpStatus || null,
      errorMessage: error.message,
    });
    throw error;
  }
}

export async function syncHinoVehiclePositions(options = {}) {
  await assertSyncInterval(VEHICLE_POSITIONS_ENDPOINT, { force: Boolean(options.force) });

  try {
    const { payload, status, token } = await fetchProtectedHinoJsonWithRetry({
      endpointUrl: env.hino.vehiclePositionsUrl,
      method: env.hino.vehiclePositionsMethod,
      payload: env.hino.vehiclePositionsPayloadJson,
      headers: env.hino.vehiclePositionsHeadersJson,
      forceTokenRefresh: Boolean(options.forceTokenRefresh),
    });
    const vehicles = extractVehicleRows(payload).map(normalizeHinoVehiclePosition).filter(Boolean);
    const saveResult = await saveHinoVehiclePositions(vehicles);
    await recordHinoApiUsage({
      endpoint: VEHICLE_POSITIONS_ENDPOINT,
      status: 'success',
      httpStatus: status,
      vehicleCount: vehicles.length,
    });

    return {
      syncedAt: new Date().toISOString(),
      endpoint: VEHICLE_POSITIONS_ENDPOINT,
      tokenSource: token.source,
      fetched: vehicles.length,
      saved: saveResult.saved,
      linked: saveResult.linked,
    };
  } catch (error) {
    await recordHinoApiUsage({
      endpoint: VEHICLE_POSITIONS_ENDPOINT,
      status: 'error',
      httpStatus: error.httpStatus || null,
      errorMessage: error.message,
    });
    throw error;
  }
}

export async function syncHinoVehicles(options = {}) {
  return syncHinoVehiclePositions(options);
}

export async function generateHinoToken(options = {}) {
  try {
    const token = await getUsableHinoToken({ forceRefresh: Boolean(options.forceRefresh) });
    return {
      tokenType: token.tokenType || 'Bearer',
      expiresAt: token.expiresAt || null,
      source: token.source,
      accessTokenPreview: maskToken(token.accessToken),
    };
  } catch (error) {
    await recordHinoApiUsage({
      endpoint: TOKEN_ENDPOINT,
      status: 'error',
      httpStatus: error.httpStatus || null,
      errorMessage: error.message,
    });
    throw error;
  }
}

export async function getLiveHinoVehiclePositions() {
  return listLiveHinoVehiclePositions();
}

export async function getCachedHinoVehicleCatalog() {
  return listCachedHinoVehicles();
}

export async function linkHinoVehicleMapping(hinoVehicleId, payload = {}, actor = {}) {
  const normalizedHinoVehicleId = normalizeRequiredText(hinoVehicleId, 'Kendaraan HINO wajib dipilih.');
  const vehicleId = normalizeRequiredText(payload.vehicleId, 'Truck Armada wajib dipilih.');
  const actorName = actor?.name || actor?.email || 'System';
  return linkHinoVehicleToTruck({ hinoVehicleId: normalizedHinoVehicleId, vehicleId, actorName });
}

export async function unlinkHinoVehicleMapping(hinoVehicleId) {
  const normalizedHinoVehicleId = normalizeRequiredText(hinoVehicleId, 'Kendaraan HINO wajib dipilih.');
  return unlinkHinoVehicleFromTruck(normalizedHinoVehicleId);
}

export async function getHinoTelematicsStatus() {
  const [latestVehiclesSync, latestPositionsSync, usageToday, vehicles, positions] = await Promise.all([
    getLatestHinoApiLog(VEHICLES_ENDPOINT),
    getLatestHinoApiLog(VEHICLE_POSITIONS_ENDPOINT),
    summarizeHinoApiUsageToday(),
    listCachedHinoVehicles(),
    listLiveHinoVehiclePositions(),
  ]);

  return {
    configured: Boolean(
      env.hino.tokenPayloadJson
      || env.hino.clientId
      || env.hino.username
      || env.hino.tokenBasicUsername
    ),
    tokenUrl: env.hino.tokenUrl,
    vehiclesUrl: env.hino.vehiclesUrl,
    vehiclePositionsUrl: env.hino.vehiclePositionsUrl,
    vehiclesSyncMinIntervalSeconds: env.hino.vehiclesSyncMinIntervalSeconds,
    positionsSyncMinIntervalSeconds: env.hino.positionsSyncMinIntervalSeconds,
    positionsSyncIntervalMinutes: env.hino.positionsSyncIntervalMinutes,
    autoSyncEnabled: env.hino.autoSyncEnabled,
    autoSyncVehiclesEnabled: env.hino.autoSyncVehiclesEnabled,
    autoSyncTime: env.hino.autoSyncTime,
    latestVehiclesSync,
    latestPositionsSync,
    vehiclesSyncAvailability: buildSyncAvailability(latestVehiclesSync, VEHICLES_ENDPOINT),
    positionsSyncAvailability: buildSyncAvailability(latestPositionsSync, VEHICLE_POSITIONS_ENDPOINT),
    usageToday,
    cachedVehicleCatalogCount: vehicles.length,
    cachedVehicleCount: positions.length,
  };
}
