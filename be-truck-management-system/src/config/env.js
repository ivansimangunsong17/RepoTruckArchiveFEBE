import 'dotenv/config';

const nodeEnv = process.env.NODE_ENV || 'development';
const defaultAuthTokenSecret = 'development-auth-token-secret';

function readAuthTokenSecret() {
  const value = process.env.AUTH_TOKEN_SECRET || '';
  if (!value) {
    throw new Error('AUTH_TOKEN_SECRET wajib dikonfigurasi.');
  }
  if (value.length < 32) {
    throw new Error('AUTH_TOKEN_SECRET minimal 32 karakter.');
  }
  if (
    nodeEnv === 'production'
    && (value === defaultAuthTokenSecret || /ganti-dengan|isi-dengan|placeholder/i.test(value))
  ) {
    throw new Error('AUTH_TOKEN_SECRET production tidak boleh memakai secret default/placeholder.');
  }
  return value;
}

function readPasswordHashCost() {
  const cost = Number(process.env.PASSWORD_HASH_COST || 12);
  if (!Number.isInteger(cost) || cost < 4 || cost > 14) {
    throw new Error('PASSWORD_HASH_COST harus berupa integer antara 4 sampai 14.');
  }
  return cost;
}

function readMaxUploadBytes() {
  const bytes = process.env.MAX_UPLOAD_SIZE_MB
    ? Number(process.env.MAX_UPLOAD_SIZE_MB) * 1024 * 1024
    : Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    throw new Error('MAX_UPLOAD_SIZE_MB atau MAX_UPLOAD_BYTES harus berupa angka positif.');
  }
  return bytes;
}

function readPositiveInteger(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} harus berupa integer positif.`);
  }
  return value;
}

function readBoolean(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function readCorsOrigins() {
  const rawValue = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:5173';
  return rawValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function readOptionalJson(name, fallback = {}) {
  const value = process.env[name];
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${name} harus berupa JSON valid.`);
  }
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  corsOrigins: readCorsOrigins(),
  databaseUrl: process.env.DATABASE_URL || '',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  authTokenSecret: readAuthTokenSecret(),
  passwordHashCost: readPasswordHashCost(),
  maxUploadBytes: readMaxUploadBytes(),
  fileTrashRetentionDays: readPositiveInteger('FILE_TRASH_RETENTION_DAYS', 30),
  storageTemporaryMaxHours: readPositiveInteger('STORAGE_TEMP_MAX_HOURS', 24),
  allowedUploadMimeTypes: (process.env.ALLOWED_UPLOAD_MIME_TYPES || 'application/pdf,image/jpeg,image/png')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  allowedUploadExtensions: (process.env.ALLOWED_UPLOAD_EXTENSIONS || 'pdf,jpg,jpeg,png')
    .split(',')
    .map((value) => value.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean),
  hino: {
    tokenUrl: process.env.HINO_TOKEN_URL || 'https://api-dev.hino.co.id/hmsi/hmsi-std-api/v4/token',
    vehiclesUrl: process.env.HINO_VEHICLES_URL || 'https://api-dev.hino.co.id/hmsi/hmsi-std-api/v4/vehicles',
    vehiclePositionsUrl: process.env.HINO_VEHICLE_POSITIONS_URL || 'https://api-dev.hino.co.id/hmsi/hmsi-std-api/v4/vehiclepositions',
    clientId: process.env.HINO_CLIENT_ID || '',
    clientSecret: process.env.HINO_CLIENT_SECRET || '',
    username: process.env.HINO_USERNAME || '',
    password: process.env.HINO_PASSWORD || '',
    ibmClientId: process.env.HINO_IBM_CLIENT_ID || '',
    tokenContentType: process.env.HINO_TOKEN_CONTENT_TYPE || 'application/x-www-form-urlencoded',
    tokenGrantType: process.env.HINO_TOKEN_GRANT_TYPE || 'client_credentials',
    tokenBasicUsername: process.env.HINO_TOKEN_BASIC_USERNAME || process.env.HINO_USERNAME || '',
    tokenBasicPassword: process.env.HINO_TOKEN_BASIC_PASSWORD || process.env.HINO_PASSWORD || '',
    tokenPayloadJson: readOptionalJson('HINO_TOKEN_PAYLOAD_JSON', null),
    tokenHeadersJson: readOptionalJson('HINO_TOKEN_HEADERS_JSON', {}),
    vehiclesMethod: (process.env.HINO_VEHICLES_METHOD || 'POST').trim().toUpperCase(),
    vehiclesPayloadJson: readOptionalJson('HINO_VEHICLES_PAYLOAD_JSON', null),
    vehiclesHeadersJson: readOptionalJson('HINO_VEHICLES_HEADERS_JSON', {}),
    vehiclePositionsMethod: (process.env.HINO_VEHICLE_POSITIONS_METHOD || 'POST').trim().toUpperCase(),
    vehiclePositionsPayloadJson: readOptionalJson('HINO_VEHICLE_POSITIONS_PAYLOAD_JSON', null),
    vehiclePositionsHeadersJson: readOptionalJson('HINO_VEHICLE_POSITIONS_HEADERS_JSON', {}),
    // Katalog kendaraan (/v4/vehicles) cuma untuk master/mapping -- disegarkan jarang (default
    // harian). Posisi (/v4/vehiclepositions) adalah sumber peta live -- disegarkan sering (default
    // tiap 5 menit), jadi keduanya sengaja punya interval minimum dan cadence scheduler terpisah.
    vehiclesSyncMinIntervalSeconds: readPositiveInteger('HINO_VEHICLES_SYNC_MIN_INTERVAL_SECONDS', 86400),
    positionsSyncMinIntervalSeconds: readPositiveInteger('HINO_POSITIONS_SYNC_MIN_INTERVAL_SECONDS', 300),
    positionsSyncIntervalMinutes: readPositiveInteger('HINO_POSITIONS_SYNC_INTERVAL_MINUTES', 5),
    autoSyncEnabled: readBoolean('HINO_AUTO_SYNC_ENABLED', false),
    autoSyncVehiclesEnabled: readBoolean('HINO_AUTO_SYNC_VEHICLES_ENABLED', false),
    autoSyncTime: process.env.HINO_AUTO_SYNC_TIME || '05:00',
  },
};
