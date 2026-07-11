const DEFAULT_ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const DEFAULT_ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];
const DEFAULT_MAX_SIZE = 5 * 1024 * 1024;

export function validateArchiveFile(file, {
  label = 'Dokumen',
  maxSize = DEFAULT_MAX_SIZE,
  allowedTypes = DEFAULT_ALLOWED_TYPES,
  allowedExtensions = DEFAULT_ALLOWED_EXTENSIONS,
  allowedLabel = 'PDF, JPG, atau PNG',
} = {}) {
  if (!file) return '';

  const extension = file.name?.split('.').pop()?.toLowerCase();
  const hasValidType = allowedTypes.includes(file.type);
  const hasValidExtension = allowedExtensions.includes(extension);

  if (!hasValidType && !hasValidExtension) {
    return `${label} hanya boleh berupa ${allowedLabel}.`;
  }

  if (file.size > maxSize) {
    return `${label} melebihi batas maksimal 5 MB.`;
  }

  return '';
}
