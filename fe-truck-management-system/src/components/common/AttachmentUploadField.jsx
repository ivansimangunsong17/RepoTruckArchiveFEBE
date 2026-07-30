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
  validationOptions = {},
  disabled = false,
  onSelect,
  onClear,
}) {
  const [previewUrl, setPreviewUrl] = useState('');
  const inputRef = useRef(null);

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

  function handleChange(event) {
    if (disabled) return;
    const file = event.target.files?.[0];
    if (!file) return;

    const validationError = validateArchiveFile(file, validationOptions);
    if (validationError) {
      event.target.value = '';
      onSelect?.(null, validationError);
      return;
    }

    onSelect?.(file, '');
  }

  function handleClear() {
    if (disabled) return;
    if (inputRef.current) inputRef.current.value = '';
    onClear?.();
  }

  const file = getFileSource(value);
  const fileName = value?.name || file?.name || 'Belum ada file';
  const fileSize = value?.size || file?.size || 0;
  const isImage = isImageFile(file);

  return (
    <div className={`document-upload${compact ? ' compact' : ''}`}>
      <input ref={inputRef} id={id} type="file" accept={accept} onChange={handleChange} disabled={disabled} />
      <label className="document-upload-dropzone" htmlFor={disabled ? undefined : id} aria-disabled={disabled}>
        <UploadCloud size={21} />
        <span>
          <strong>{title}</strong>
          <small>{helper}</small>
        </span>
      </label>

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
          <button type="button" onClick={handleClear} aria-label={`${label} dihapus`} disabled={disabled}>
            <X size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default AttachmentUploadField;
