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

export const env = {
  nodeEnv,
  port: Number(process.env.PORT || 3000),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
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
};
