import { Download } from 'lucide-react';
import { createAttachmentDownloadUrl } from '../../services/files/fileService';

function DocumentLink({ file, className = 'document-link' }) {
  if (!file) return <span>Belum ada dokumen</span>;

  async function openDocument() {
    const rawFile = file instanceof File ? file : file.rawFile instanceof File ? file.rawFile : null;
    if (rawFile) {
      window.open(URL.createObjectURL(rawFile), '_blank', 'noopener,noreferrer');
      return;
    }
    if (file.path) {
      const url = await createAttachmentDownloadUrl(file.path);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <button className={className} type="button" onClick={openDocument} disabled={!file.path && !file.rawFile && !(file instanceof File)}>
      <Download size={14} /> {file.name}
    </button>
  );
}

export default DocumentLink;
