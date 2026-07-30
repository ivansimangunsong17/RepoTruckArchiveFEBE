const COMPRESSIBLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_TARGET_BYTES = 1024 * 1024;
const DEFAULT_QUALITY = 0.82;
const MIN_QUALITY = 0.7;

function fileExtension(name = '') {
  const match = String(name).match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

export function isCompressibleImageFile(file) {
  if (typeof File === 'undefined') return false;
  if (!(file instanceof File)) return false;
  const extension = fileExtension(file.name);
  return COMPRESSIBLE_IMAGE_TYPES.has(file.type) || ['jpg', 'jpeg', 'png', 'webp'].includes(extension);
}

export function jpegFileName(name = 'image') {
  const baseName = String(name || 'image').replace(/\.[^.]+$/, '') || 'image';
  return `${baseName}.jpg`;
}

function readImageSource(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Gambar gagal dibaca.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Gambar gagal dimuat.'));
    image.src = source;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

function scaledSize(width, height, maxWidth, maxHeight) {
  if (!width || !height) return { width, height };
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function compressImageFile(file, {
  maxWidth = DEFAULT_MAX_DIMENSION,
  maxHeight = DEFAULT_MAX_DIMENSION,
  targetBytes = DEFAULT_TARGET_BYTES,
  initialQuality = DEFAULT_QUALITY,
  minQuality = MIN_QUALITY,
} = {}) {
  if (!isCompressibleImageFile(file)) return file;

  try {
    const source = await readImageSource(file);
    const image = await loadImage(source);
    const nextSize = scaledSize(
      image.naturalWidth || image.width,
      image.naturalHeight || image.height,
      maxWidth,
      maxHeight,
    );
    const canvas = document.createElement('canvas');
    canvas.width = nextSize.width;
    canvas.height = nextSize.height;

    const context = canvas.getContext('2d');
    if (!context) return file;

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let quality = initialQuality;
    let blob = await canvasToBlob(canvas, quality);
    while (blob && blob.size > targetBytes && quality > minQuality) {
      quality = Math.max(minQuality, Number((quality - 0.04).toFixed(2)));
      blob = await canvasToBlob(canvas, quality);
      if (quality === minQuality) break;
    }

    if (!blob) return file;
    if (blob.size >= file.size) return file;

    return new File([blob], jpegFileName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified || Date.now(),
    });
  } catch {
    return file;
  }
}
