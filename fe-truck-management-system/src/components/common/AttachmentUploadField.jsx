import { useEffect, useRef, useState } from 'react';
import { FileText, UploadCloud, X } from 'lucide-react';
import { validateArchiveFile } from '../../utils/fileValidation';
import { createAttachmentDownloadUrl } from '../../services/files/fileService';

function getFileExtension(name = '') {
  return String(name).split('.').pop()?.toLowerCase() || '';
}

function isImageFile(file) {
  if (!file) return false;
  const fileType = String(file.type || '');
  const fileName = file.name || file.path || '';
  return fileType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(getFileExtension(fileName));
}

function getFileSource(value) {
  if (!value) return null;
  if (value instanceof File) return value;
  if (value.rawFile instanceof File) return value.rawFile;
  return value;
}

function formatFileSize(size = 0) {
  if (!size) return 'Ukuran tidak tersedia';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentUploadField({
  id,
  value,
  label = 'Upload Dokumen',
  title = 'Pilih File',
  helper = 'PDF maks. 5 MB, JPG/PNG maks. 10 MB',
  accept = '.pdf,.jpg,.jpeg,.png',
  compact = false,
  dragAndDrop = false,
  dropTitle = 'Tarik file ke sini',
  validationOptions = {},
  disabled = false,
  onSelect,
  onClear,
}) {
  const [previewUrl, setPreviewUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const dragDepthRef = useRef(0);

  // Reset input native setelah value dikosongkan dari luar (mis. form di-reset setelah simpan),
  // supaya file yang sama bisa dipilih lagi untuk bukti berikutnya.
  useEffect(() => {
    if (!value && inputRef.current) inputRef.current.value = '';
  }, [value]);

  // File yang dilepas sedikit di luar dropzone jangan sampai dibuka browser dan menutup halaman.
  useEffect(() => {
    if (!dragAndDrop) return undefined;
    function blockFileDrop(event) {
      if (event.defaultPrevented || !Array.from(event.dataTransfer?.types || []).includes('Files')) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
    }
    window.addEventListener('dragover', blockFileDrop);
    window.addEventListener('drop', blockFileDrop);
    return () => {
      window.removeEventListener('dragover', blockFileDrop);
      window.removeEventListener('drop', blockFileDrop);
    };
  }, [dragAndDrop]);

  useEffect(() => {
    const file = getFileSource(value);

    if (!isImageFile(file)) {
      setPreviewUrl('');
      return undefined;
    }

    let active = true;

    if (file instanceof File) {
      const objectUrl = URL.createObjectURL(file);      
      setPreviewUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }

    if (file?.path) {
      createAttachmentDownloadUrl(file.path).then((url) => {
        if (active) setPreviewUrl(url || '');
      });
      return () => {
        active = false;
      };
    }

    setPreviewUrl('');
    return undefined;
  }, [value]);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      

  function selectFile(file) {
    const validationError = validateArchiveFile(file, validationOptions);
    if (validationError) {
      onSelect?.(null, validationError);
      return false;
    }
    onSelect?.(file, '');
    return true;
  }

  function handleChange(event) {
    if (disabled) return;
    const file = event.target.files?.[0];
    if (!file) return;
    if (!selectFile(file)) event.target.value = '';
  }

  function handleClear() {
    if (disabled) return;
    if (inputRef.current) inputRef.current.value = '';
    onClear?.();
  }

  function isFileDrag(event) {
    return Array.from(event.dataTransfer?.types || []).includes('Files');
  }

  function handleDragEnter(event) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    if (disabled) return;
    dragDepthRef.current += 1;
    setDragging(true);
  }

  function handleDragOver(event) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
  }

  function handleDragLeave(event) {
    if (!isFileDrag(event)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) return;
    if (files.length > 1) {
      onSelect?.(null, 'Pilih satu file saja untuk setiap bukti.');
      return;
    }
    selectFile(files[0]);
  }

  const dropHandlers = dragAndDrop
    ? { onDragEnter: handleDragEnter, onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop }
    : {};

  const file = getFileSource(value);
  // Attachment dari backend kadang cuma punya `path`/`storagePath` tanpa `name` eksplisit
  // -- jangan tampilkan "Belum ada file" di sini kalau filenya sebenarnya sudah ada.
  const fileName = value?.name || file?.name || (value?.path || file?.path ? 'Dokumen tersimpan' : 'Belum ada file');
  const fileSize = value?.size || file?.size || 0;
  const isImage = isImageFile(file);

  const showDropzone = !dragAndDrop || !value;
  const rootClassName = [
    'document-upload',
    compact && !dragAndDrop ? 'compact' : '',
    dragAndDrop ? 'drag-drop' : '',
    dragging ? 'is-dragging' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClassName} data-testid={dragAndDrop ? `${id}-dropzone` : undefined} {...dropHandlers}>
      <input ref={inputRef} id={id} type="file" accept={accept} onChange={handleChange} disabled={disabled} />
      {showDropzone ? (
        <label className="document-upload-dropzone" htmlFor={disabled ? undefined : id} aria-disabled={disabled}>
          <UploadCloud size={dragAndDrop ? 22 : 21} />
          {dragAndDrop ? (
            <span>
              <strong>{dragging ? 'Lepaskan file di sini' : dropTitle}</strong>
              <span className="document-upload-browse">atau <u>{title}</u></span>
              <small>{helper}</small>
            </span>
          ) : (
            <span>
              <strong>{title}</strong>
              <small>{helper}</small>
            </span>
          )}
        </label>
      ) : null}

      {value ? (
        <div className="selected-document">
          {isImage ? (
            previewUrl ? <img className="attachment-thumbnail" src={previewUrl} alt={fileName} /> : <span className="attachment-image-placeholder">IMG</span>
          ) : (
            <span className="attachment-image-placeholder"><FileText size={18} /></span>
          )}
          <span>
            <strong>{fileName}</strong>
            <small>{fileSize ? formatFileSize(fileSize) : isImage ? 'Gambar siap diunggah' : 'Dokumen siap diunggah'}</small>
          </span>
          {dragAndDrop ? (
            <span className="selected-document-actions">
              <button className="selected-document-change" type="button" onClick={() => inputRef.current?.click()} disabled={disabled}>
                Ganti
              </button>
              <button type="button" onClick={handleClear} aria-label={`${label} dihapus`} disabled={disabled}>
                <X size={15} />
              </button>
            </span>
          ) : (
            <button type="button" onClick={handleClear} aria-label={`${label} dihapus`} disabled={disabled}>
              <X size={15} />
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default AttachmentUploadField;
