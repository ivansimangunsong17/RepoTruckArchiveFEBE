import { useEffect, useState } from 'react';
import { Download, Eye, X } from 'lucide-react';
import { createAttachmentDownloadUrl, downloadAttachmentFile } from '../../services/files/fileService';

function triggerDownload(url, fileName) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName || 'Dokumen';
  anchor.rel = 'noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function DocumentLink({ file, className = 'document-link', download = false, label = '', iconOnly = false }) {
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!preview) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape') setPreview(null);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (preview.revokeOnClose) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  if (!file) return <span>Belum ada dokumen</span>;
  const ActionIcon = download ? Download : Eye;
  const fileName = file.name || 'Dokumen';
  const textLabel = typeof label === 'string' ? label : '';
  const accessibleLabel = textLabel ? `${textLabel} ${fileName}` : fileName;
  const fileType = file.type || file.mimeType || '';
  const isImage = fileType.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(fileName);

  function showPreview(url, { revokeOnClose = false } = {}) {
    if (!url) return;
    setPreview({ fileName, isImage, revokeOnClose, url });
  }

  async function openDocument() {
    const rawFile = file instanceof File ? file : file.rawFile instanceof File ? file.rawFile : null;
    if (rawFile) {
      const objectUrl = URL.createObjectURL(rawFile);
      if (download) {
        triggerDownload(objectUrl, rawFile.name || fileName);
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      } else {
        showPreview(objectUrl, { revokeOnClose: true });
      }
      return;
    }
    if (file.path) {
      if (download) {
        await downloadAttachmentFile(file.path, fileName);
        return;
      }
      const url = await createAttachmentDownloadUrl(file.path);
      showPreview(url);
      return;
    }
    if (file.url) {
      if (download) {
        triggerDownload(file.url, fileName);
      } else {
        showPreview(file.url);
      }
      return;
    }
    if (file.dataUrl) {
      if (download) {
        triggerDownload(file.dataUrl, fileName);
      } else {
        showPreview(file.dataUrl);
      }
    }
  }

  return (
    <>
      <button aria-label={accessibleLabel} className={className} type="button" onClick={openDocument} disabled={!file.path && !file.url && !file.dataUrl && !file.rawFile && !(file instanceof File)} title={accessibleLabel}>
        <ActionIcon size={14} /> {iconOnly ? null : label || fileName}
      </button>
      {preview ? (
        <div className="document-preview-backdrop" role="presentation" onMouseDown={() => setPreview(null)}>
          <section className="document-preview-modal" role="dialog" aria-modal="true" aria-label={`Preview ${preview.fileName}`} onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Preview Dokumen</span>
                <h2>{preview.fileName}</h2>
              </div>
              <button type="button" aria-label="Tutup preview dokumen" onClick={() => setPreview(null)}>
                <X size={18} />
              </button>
            </header>
            <div className="document-preview-body">
              {preview.isImage ? (
                <div className="document-preview-image-scroll">
                  <img src={preview.url} alt={preview.fileName} />
                </div>
              ) : (
                <iframe title={preview.fileName} src={preview.url} />
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export default DocumentLink;
