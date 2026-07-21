import { Download, Eye } from 'lucide-react';
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

function DocumentLink({ file, className = 'document-link', download = false, label = '' }) {
  if (!file) return <span>Belum ada dokumen</span>;
  const ActionIcon = download ? Download : Eye;
  const fileName = file.name || 'Dokumen';
  const accessibleLabel = label ? `${label} ${fileName}` : fileName;

  async function openDocument() {
    const rawFile = file instanceof File ? file : file.rawFile instanceof File ? file.rawFile : null;
    if (rawFile) {
      const objectUrl = URL.createObjectURL(rawFile);
      if (download) {
        triggerDownload(objectUrl, rawFile.name || fileName);
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      } else {
        window.open(objectUrl, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    if (file.path) {
      if (download) {
        await downloadAttachmentFile(file.path, fileName);
        return;
      }
      const url = await createAttachmentDownloadUrl(file.path);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (file.dataUrl) {
      if (download) {
        triggerDownload(file.dataUrl, fileName);
      } else {
        window.open(file.dataUrl, '_blank', 'noopener,noreferrer');
      }
    }
  }

  return (
    <button aria-label={accessibleLabel} className={className} type="button" onClick={openDocument} disabled={!file.path && !file.dataUrl && !file.rawFile && !(file instanceof File)} title={accessibleLabel}>
      <ActionIcon size={14} /> {label || fileName}
    </button>
  );
}

export default DocumentLink;
