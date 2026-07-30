const DEFAULT_ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const DEFAULT_ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];
const DEFAULT_MAX_SIZE = 5 * 1024 * 1024;
const DEFAULT_IMAGE_MAX_SIZE = 10 * 1024 * 1024;

function fileExtension(name = '') {
  return String(name).split('.').pop()?.toLowerCase() || '';
}

function isImageFile(file) {
  const extension = fileExtension(file?.name);
  return String(file?.type || '').startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp'].includes(extension);
}

function formatSizeMb(size) {
  return `${Math.round(size / (1024 * 1024))} MB`;
}

export function validateArchiveFile(file, options = {}) {
  const {
    label = 'Dokumen',
    maxSize = DEFAULT_MAX_SIZE,
    allowedTypes = DEFAULT_ALLOWED_TYPES,
    allowedExtensions = DEFAULT_ALLOWED_EXTENSIONS,
    allowedLabel = 'PDF, JPG, atau PNG',
  } = options;
  const imageMaxSize = options.imageMaxSize ?? (options.maxSize == null ? DEFAULT_IMAGE_MAX_SIZE : maxSize);

  if (!file) return '';

  const extension = fileExtension(file.name);
  const hasValidType = allowedTypes.includes(file.type);
  const hasValidExtension = allowedExtensions.includes(extension);

  if (!hasValidType && !hasValidExtension) {
    return `${label} hanya boleh berupa ${allowedLabel}.`;
  }

  const sizeLimit = isImageFile(file) ? imageMaxSize : maxSize;
  if (file.size > sizeLimit) {
    return `${label} melebihi batas maksimal ${formatSizeMb(sizeLimit)}.`;
  }

  return '';
}

export function validateFinalUploadFile(file, { label = 'Dokumen', maxSize = DEFAULT_MAX_SIZE } = {}) {
  if (!file) return '';
  if (file.size > maxSize) {
    return `${label} melebihi batas maksimal ${formatSizeMb(maxSize)}.`;
  }
  return '';
}
