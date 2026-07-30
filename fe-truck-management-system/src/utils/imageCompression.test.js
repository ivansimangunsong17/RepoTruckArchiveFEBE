import { afterEach, describe, expect, it, vi } from 'vitest';
import { compressImageFile, isCompressibleImageFile, jpegFileName } from './imageCompression';

describe('imageCompression', () => {
  const originalCreateElement = document.createElement.bind(document);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mengembalikan file asli untuk non-image', async () => {
    const file = new File(['pdf'], 'dokumen.pdf', { type: 'application/pdf' });

    await expect(compressImageFile(file)).resolves.toBe(file);
    expect(isCompressibleImageFile(file)).toBe(false);
  });

  it('menghasilkan JPEG tanpa upscale dan menurunkan quality bila masih besar', async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        fillStyle: '',
        fillRect: vi.fn(),
        drawImage: vi.fn(),
      })),
      toBlob: vi.fn((callback, mimeType, quality) => {
        const size = quality > 0.78 ? 1_500_000 : 800_000;
        callback(new Blob([new Uint8Array(size)], { type: mimeType }));
      }),
    };

    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'canvas') return canvas;
      return originalCreateElement(tagName);
    });

    vi.stubGlobal('FileReader', class {
      readAsDataURL() {
        this.result = 'data:image/png;base64,test';
        this.onload();
      }
    });

    vi.stubGlobal('Image', class {
      set src(value) {
        this._src = value;
        this.naturalWidth = 3200;
        this.naturalHeight = 1600;
        this.onload();
      }
    });

    const file = new File([new Uint8Array(3_000_000)], 'ktp.png', { type: 'image/png' });
    const compressed = await compressImageFile(file);

    expect(compressed).not.toBe(file);
    expect(compressed.name).toBe('ktp.jpg');
    expect(compressed.type).toBe('image/jpeg');
    expect(compressed.size).toBeLessThanOrEqual(1024 * 1024);
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(800);
    expect(canvas.toBlob).toHaveBeenCalledTimes(2);
  });

  it('menjaga nama file aman saat output menjadi JPEG', () => {
    expect(jpegFileName('ktp.png')).toBe('ktp.jpg');
    expect(jpegFileName('')).toBe('image.jpg');
  });
});
