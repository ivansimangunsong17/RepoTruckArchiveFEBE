import { Download, Eye } from 'lucide-react';
import { createAttachmentDownloadUrl } from '../../services/files/fileService';

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
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = rawFile.name || fileName;
        anchor.click();
        URL.revokeObjectURL(objectUrl);
      } else {
        window.open(objectUrl, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    if (file.path) {
      const url = await createAttachmentDownloadUrl(file.path, { download });
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (file.dataUrl) {
      if (download) {
        const anchor = document.createElement('a');
        anchor.href = file.dataUrl;
        anchor.download = fileName;
        anchor.click();
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
