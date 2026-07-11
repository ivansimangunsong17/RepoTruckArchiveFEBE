import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { fallbackTruckUnits } from '../../data/truckData';
import AttachmentUploadField from '../common/AttachmentUploadField';
import { validateArchiveFile } from '../../utils/fileValidation';

const documentFields = [
  ['spkDocument', 'Lampiran RPUJ'],
  ['eirDocument', 'Lampiran EIR'],
  ['loadingVoucherDocument', 'No. Bon Muat / Bon Bongkar'],
  ['unloadingVoucherDocument', 'No. TILA / Delivery Card'],
  ['travelDocumentFile', 'No. Surat Jalan'],
  ['weighingDocumentFile', 'No. Gatepass / SP2'],
];

const operationalDocumentFields = [
  { valueField: 'loadingVoucher', fileField: 'loadingVoucherDocument', label: 'No. Bon Muat / Bon Bongkar' },
  { valueField: 'unloadingVoucher', fileField: 'unloadingVoucherDocument', label: 'No. TILA / Delivery Card' },
  { valueField: 'travelDocument', fileField: 'travelDocumentFile', label: 'No. Surat Jalan' },
  { valueField: 'weighingDocument', fileField: 'weighingDocumentFile', label: 'No. Gatepass / SP2' },
];

const OPERATIONAL_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png';

function getMasterData(storageKey, fallback) {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || fallback;
  } catch {
    return fallback;
  }
}

function fileMetadata(file) {
  return file ? { name: file.name, size: file.size, type: file.type, rawFile: file } : null;
}

function getTruckDefaultDriver(truck, fallbackRows = []) {
  if (!truck) return '';
  const fallbackTruck = fallbackRows.find((item) => item.plateNumber === truck.plateNumber);
  return truck.defaultDriver || truck.default_driver_name || truck.defaultDriverName || fallbackTruck?.defaultDriver || fallbackTruck?.default_driver_name || '';
}

function normalizeSize(value) {
  return String(value || '').toUpperCase().replace(/\s/g, '');
}

function getTruckCapacity(truck = {}) {
  return normalizeSize(truck.capacity || truck.containerSize || truck.container_size || truck.size || truck.defaultSize);
}

function normalizeTruck(truck, fallbackRows = []) {
  return {
    ...truck,
    defaultDriver: getTruckDefaultDriver(truck, fallbackRows),
    capacity: getTruckCapacity(truck),
  };
}

function isTruckCompatibleWithContainer(truck, containerSize) {
  const truckCapacity = getTruckCapacity(truck);
  return !containerSize || !truckCapacity || truckCapacity === containerSize;
}

function nowForDateTimeInput() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function generateSpkNumber() {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const suffix = String(now.getTime()).slice(-4);
  return `SPK-${yearMonth}-${suffix}`;
}

function OperationalForm({ container, onClose, onSubmit, onGenerateSpk, masterTrucks }) {
  const [fallbackTruckRows] = useState(() => getMasterData('tms-master-trucks-v2', fallbackTruckUnits));
  const fileInputRefs = useRef({});
  const trucks = (Array.isArray(masterTrucks) ? masterTrucks : fallbackTruckRows)
    .map((truck) => normalizeTruck(truck, fallbackTruckRows));
  const containerSize = normalizeSize(container.size || container.containerSize);
  const [form, setForm] = useState({
    containerNumber: container.containerNumber || '',
    rpujStatus: container.rpujStatus || 'pending',
    rpujNotes: container.rpujNotes || '',
    spkNumber: container.spkNumber || '',
    spkGeneratedAt: container.spkGeneratedAt || container.spk_generated_at || '',
    spkFilePath: container.spkFilePath || container.spk_file_path || '',
    spkDocument: container.spkDocument || null,
    eirNumber: container.eirNumber || '',
    eirDocument: container.eirDocument || null,
    loadingVoucher: container.loadingVoucher || '',
    loadingVoucherDocument: container.loadingVoucherDocument || null,
    unloadingVoucher: container.unloadingVoucher || '',
    unloadingVoucherDocument: container.unloadingVoucherDocument || null,
    driver: container.driver || '',
    chassis: container.chassis || '',
    plateNumber: container.plateNumber || '',
    travelDocument: container.travelDocument || '',
    travelDocumentFile: container.travelDocumentFile || null,
    weighingDocument: container.weighingDocument || '',
    weighingDocumentFile: container.weighingDocumentFile || null,
    otherDocuments: container.otherDocuments || [],
    status: container.status || 'received',
    runningAt: container.runningAt?.slice(0, 16) || '',
    completedAt: container.completedAt?.slice(0, 16) || '',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose();
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateStatus(event) {
    const status = event.target.value;
    const now = nowForDateTimeInput();
    setForm((current) => ({
      ...current,
      status,
      runningAt: status === 'received' ? '' : ['running', 'completed'].includes(status) && !current.runningAt ? now : current.runningAt,
      completedAt: status === 'completed' ? (current.completedAt || now) : '',
    }));
  }

  function updateTruck(event) {
    const plateNumber = event.target.value;
    const truck = trucks.find((item) => item.plateNumber === plateNumber);
    if (truck && !isTruckCompatibleWithContainer(truck, containerSize)) {
      setError(`Truck ${truck.plateNumber} kapasitas ${truck.capacity || '-'} tidak sesuai untuk container ${containerSize || '-'}.`);
      return;
    }
    const now = nowForDateTimeInput();
    setError('');
    setForm((current) => ({
      ...current,
      plateNumber,
      driver: getTruckDefaultDriver(truck, fallbackTruckRows),
      chassis: truck ? `${truck.unitCode} - ${truck.brand} ${truck.type}` : '',
      status: plateNumber && current.status === 'received'
        ? 'running'
        : !plateNumber && current.status === 'running'
          ? 'received'
          : current.status,
      runningAt: plateNumber && current.status === 'received' && !current.runningAt
        ? now
        : !plateNumber && current.status === 'running'
          ? ''
          : current.runningAt,
      completedAt: !plateNumber && current.status === 'running' ? '' : current.completedAt,
    }));
  }

  function updateFile(key, file) {
    if (!file) return;
    const label = documentFields.find(([field]) => field === key)?.[1] || 'Dokumen';
    const validationError = validateArchiveFile(file, {
      label,
    });
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setForm((current) => ({ ...current, [key]: fileMetadata(file) }));
  }

  function openOperationalFilePicker(fileField) {
    fileInputRefs.current[fileField]?.click();
  }

  async function handleGenerateSpk() {
    if (form.spkNumber) return;

    try {
      const generated = onGenerateSpk
        ? await onGenerateSpk(form)
        : { spkNumber: generateSpkNumber() };
      setError('');
      setForm((current) => ({
        ...current,
        spkNumber: generated?.spkNumber || current.spkNumber || generateSpkNumber(),
        spkGeneratedAt: generated?.spkGeneratedAt || new Date().toISOString(),
      }));
    } catch (requestError) {
      setError(requestError.message || 'SPK gagal digenerate.');
    }
  }

  function buildSpkPreviewContent() {
    return [
      'SURAT PERINTAH KERJA',
      `No. SPK: ${form.spkNumber || '-'}`,
      `Sales Order: ${container.soNumber || '-'}`,
      `Customer: ${container.customer || '-'}`,
      `No. DO: ${container.doNumber || '-'}`,
      `Jenis Order: ${container.shipment || container.jobType || '-'}`,
      `Nama Jasa: ${container.serviceName || '-'}`,
      `Truck / Plat: ${form.chassis || container.chassis || form.plateNumber || container.plateNumber || '-'}`,
      `Driver: ${form.driver || container.driver || '-'}`,
      `No HP Driver: ${container.driverPhone || container.driverPhoneNumber || '-'}`,
      `Origin: ${container.origin || '-'}`,
      `Destination: ${container.destination || '-'}`,
      `Container: ${container.containerNumber || '-'}`,
      `Size: ${container.size || '-'}`,
      `Tanggal Jalan: ${container.tripDate || '-'}`,
    ].join('\n');
  }

  function previewSpk() {
    const previewWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=760');
    if (!previewWindow) return;
    const content = buildSpkPreviewContent().replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br/>');
    previewWindow.document.write(`
      <html>
        <head>
          <title>Preview SPK ${form.spkNumber || ''}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #1f2937; }
            h1 { margin: 0 0 12px; font-size: 20px; }
            .sheet { padding: 20px; border: 1px solid #d8dde4; border-radius: 12px; background: #fff; }
          </style>
        </head>
        <body>
          <div class="sheet">
            <h1>SPK Preview</h1>
            <div>${content}</div>
          </div>
        </body>
      </html>
    `);
    previewWindow.document.close();
  }

  function downloadSpk() {
    const blob = new Blob([buildSpkPreviewContent()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${form.spkNumber || 'SPK'}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function handleOperationalFileChange(fileField, label, file, validationError) {
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!file) return;
    setError('');
    updateFile(fileField, file);
  }

  function handleSubmit(event) {
    event.preventDefault();
    const submitForm = { ...form };
    if (submitForm.plateNumber && submitForm.driver && submitForm.status === 'received') {
      submitForm.status = 'running';
      submitForm.runningAt = submitForm.runningAt || nowForDateTimeInput();
    }
    const selectedTruck = trucks.find((truck) => truck.plateNumber === submitForm.plateNumber);
    if (selectedTruck && !isTruckCompatibleWithContainer(selectedTruck, containerSize)) {
      setError(`Truck ${selectedTruck.plateNumber} kapasitas ${selectedTruck.capacity || '-'} tidak sesuai untuk container ${containerSize || '-'}.`);
      return;
    }
    if (submitForm.status === 'running' && (!submitForm.driver || !submitForm.plateNumber || !submitForm.runningAt)) {
      setError('Truck, driver otomatis, dan waktu mulai wajib diisi untuk status Sedang Jalan.');
      return;
    }
    if (submitForm.status === 'completed') {
      const missing = [
        !submitForm.driver && 'driver',
        !submitForm.plateNumber && 'truck',
        !submitForm.containerNumber && 'nomor container',
        !submitForm.runningAt && 'waktu mulai',
        !submitForm.completedAt && 'waktu selesai',
        !submitForm.spkNumber && 'nomor SPK',
        !submitForm.spkDocument && 'lampiran RPUJ',
        !submitForm.loadingVoucher && 'No. Bon Muat / Bon Bongkar',
        !submitForm.loadingVoucherDocument && 'dokumen No. Bon Muat / Bon Bongkar',
        !submitForm.unloadingVoucher && 'No. TILA / Delivery Card',
        !submitForm.unloadingVoucherDocument && 'dokumen No. TILA / Delivery Card',
        !submitForm.travelDocument && 'No. Surat Jalan',
        !submitForm.travelDocumentFile && 'dokumen surat jalan',
        !submitForm.weighingDocument && 'No. Gatepass / SP2',
        !submitForm.weighingDocumentFile && 'dokumen No. Gatepass / SP2',
      ].filter(Boolean);
      if (missing.length) {
        setError(`Pekerjaan belum dapat diselesaikan. Lengkapi: ${missing.join(', ')}.`);
        return;
      }
      if (new Date(submitForm.completedAt) < new Date(submitForm.runningAt)) {
        setError('Waktu selesai tidak boleh lebih awal dari waktu mulai.');
        return;
      }
    }
    setError('');
    onSubmit({
      ...submitForm,
    });
  }

  const availableTrucks = trucks.filter((truck) => (
    (['Aktif', 'Bertugas', 'Siap'].includes(truck.status) || truck.plateNumber === form.plateNumber)
    && isTruckCompatibleWithContainer(truck, containerSize)
  ));
  const currentTruckExists = availableTrucks.some((truck) => truck.plateNumber === form.plateNumber);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="order-modal operational-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><p className="eyebrow">Container Job</p><h2>{form.containerNumber || container.containerNumber}</h2><span>{container.soNumber} - {container.customer} - {container.origin} - {container.destination}</span></div>
          <button type="button" onClick={onClose} aria-label="Tutup form"><X size={20} /></button>
        </header>
        <form onSubmit={handleSubmit}>
          {error ? <div className="alert error operational-form-error">{error}</div> : null}

          <div className="form-section">
            <h3>Assignment</h3>
            <div className="order-form-grid">
              <label>Truck<select name="plateNumber" value={form.plateNumber} onChange={updateTruck}><option value="">Pilih truck {containerSize ? `${containerSize}` : ''}</option>{form.plateNumber && !currentTruckExists ? <option value={form.plateNumber}>{form.plateNumber}</option> : null}{availableTrucks.map((truck) => <option key={truck.id} value={truck.plateNumber}>{truck.plateNumber} - {truck.unitCode} - {truck.capacity || '-'} - {truck.defaultDriver || 'Driver belum diset'}</option>)}</select></label>
              <label>No. Container<input name="containerNumber" value={form.containerNumber} onChange={updateField} placeholder="TCLU1234567" /></label>
              <label>Driver Otomatis<input name="driver" value={form.driver || 'Pilih truck terlebih dahulu'} readOnly /></label>
              <label>Detail Truck<input value={form.chassis} readOnly /></label>
            </div>
          </div>

          <div className="form-section">
            <h3>RPUJ & SPK</h3>
            <div className="operational-rpuj-spk-grid">
              <div className="operational-document-card operational-rpuj-card">
                <span>RPUJ</span>
                <label className="operational-inline-label">
                  Status RPUJ
                  <select name="rpujStatus" value={form.rpujStatus} onChange={updateField}>
                    <option value="pending">Belum Diproses</option>
                    <option value="submitted">Diajukan</option>
                    <option value="approved">Disetujui</option>
                    <option value="paid">Cair</option>
                    <option value="rejected">Ditolak</option>
                  </select>
                </label>
                <AttachmentUploadField
                  id="operational-spk-document"
                  label="Lampiran RPUJ"
                  value={form.spkDocument}
                  title={form.spkDocument?.name ? 'Ubah File' : 'Pilih File'}
                  helper="PDF, JPG, PNG - Maks. 5 MB"
                  accept={OPERATIONAL_FILE_ACCEPT}
                  compact
                  validationOptions={{
                    label: 'Lampiran RPUJ',
                  }}
                  onSelect={(file, validationError) => {
                    if (validationError) return setError(validationError);
                    setError('');
                    updateFile('spkDocument', file);
                  }}
                  onClear={() => setForm((current) => ({ ...current, spkDocument: null }))}
                />
              </div>

              <div className="operational-document-card operational-spk-card">
                <span>SPK</span>
                <div className="operational-spk-head">
                  <strong>{form.spkNumber || 'SPK belum dibuat'}</strong>
                </div>
                <div className="operational-spk-actions">
                  {!form.spkNumber ? (
                    <button type="button" className="secondary-button operational-spk-button" onClick={handleGenerateSpk}>
                      Generate SPK
                    </button>
                  ) : (
                    <>
                      <button type="button" className="secondary-button operational-spk-button" onClick={previewSpk}>
                        Preview SPK
                      </button>
                      <button type="button" className="secondary-button operational-spk-button" onClick={downloadSpk}>
                        Download SPK
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="operational-document-card operational-eir-card">
                <span>EIR</span>
                <p className="operational-eir-note">Dokumen EIR wajib diisi untuk serah terima container.</p>
                <label className="operational-inline-label">
                  No. EIR
                  <input
                    name="eirNumber"
                    value={form.eirNumber}
                    onChange={updateField}
                    placeholder="EIR-2026-001"
                  />
                </label>
                <AttachmentUploadField
                  id="operational-eir-document"
                  label="Lampiran EIR"
                  value={form.eirDocument}
                  title={form.eirDocument?.name ? 'Ubah File' : 'Pilih File'}
                  helper="PDF, JPG, PNG - Maks. 5 MB"
                  accept={OPERATIONAL_FILE_ACCEPT}
                  compact
                  validationOptions={{
                    label: 'Lampiran EIR',
                  }}
                  onSelect={(file, validationError) => {
                    if (validationError) return setError(validationError);
                    setError('');
                    updateFile('eirDocument', file);
                  }}
                  onClear={() => setForm((current) => ({ ...current, eirDocument: null }))}
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Dokumen Operational</h3>
            <div className="order-form-grid">
              {operationalDocumentFields.map((field) => (
                <div className="operational-document-card" key={field.valueField}>
                  <span>{field.label}</span>
                  <input
                    className="operational-document-input"
                    name={field.valueField}
                    value={form[field.valueField]}
                    onChange={updateField}
                  />
                  <div className="operational-document-upload-row">
                    <input
                      ref={(node) => {
                        if (node) {
                          fileInputRefs.current[field.fileField] = node;
                        }
                      }}
                      className="operational-document-hidden-input"
                      id={`operational-${field.fileField}`}
                      type="file"
                      accept={OPERATIONAL_FILE_ACCEPT}
                      onChange={(event) => {
                        const nextFile = event.target.files?.[0];
                        if (!nextFile) return;
                        const validationError = validateArchiveFile(nextFile, { label: field.label });
                        if (validationError) {
                          event.target.value = '';
                          handleOperationalFileChange(field.fileField, field.label, null, validationError);
                          return;
                        }
                        handleOperationalFileChange(field.fileField, field.label, nextFile, '');
                        event.target.value = '';
                      }}
                    />
                    <button type="button" className="secondary-button operational-upload-button" onClick={() => openOperationalFilePicker(field.fileField)}>
                      Pilih File
                    </button>
                    <span className="operational-file-name">
                      {form[field.fileField]?.name || 'Belum ada file'}
                    </span>
                  </div>
                  <small className="operational-document-helper">PDF, JPG, PNG - Maks. 5 MB</small>
                </div>
              ))}
            </div>
            <div className="other-document-section">
              <div className="form-section-heading">
                <div><h3>Other Documents</h3><p>Dokumen tambahan bersifat opsional.</p></div>
                <button className="secondary-button" type="button" onClick={() => setForm((current) => ({ ...current, otherDocuments: [...current.otherDocuments, { name: '', file: null }] }))}><Plus size={15} /> Tambah</button>
              </div>
              {form.otherDocuments.map((document, index) => (
                <div className="other-document-row" key={`other-${index}`}>
                  <input value={document.name} onChange={(event) => setForm((current) => ({ ...current, otherDocuments: current.otherDocuments.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} placeholder="Nama dokumen" />
                  <AttachmentUploadField
                    id={`other-document-${index}`}
                    label="Dokumen tambahan"
                    value={document.file}
                      title={document.file?.name ? 'Ubah File' : 'Pilih File'}
                    helper="PDF, JPG, atau PNG - Maksimal 5 MB"
                    accept={OPERATIONAL_FILE_ACCEPT}
                    validationOptions={{
                      label: 'Dokumen tambahan',
                    }}
                    onSelect={(file, validationError) => {
                      if (validationError) return setError(validationError);
                      setError('');
                      setForm((current) => ({
                        ...current,
                        otherDocuments: current.otherDocuments.map((item, itemIndex) => (
                          itemIndex === index ? { ...item, file: fileMetadata(file) } : item
                        )),
                      }));
                      return undefined;
                    }}
                    onClear={() => setForm((current) => ({
                      ...current,
                      otherDocuments: current.otherDocuments.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, file: null } : item
                      )),
                    }))}
                  />
                  <button type="button" onClick={() => setForm((current) => ({ ...current, otherDocuments: current.otherDocuments.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="form-section">
            <h3>Status & Timeline</h3>
            <div className="order-form-grid">
              <label>Status Pekerjaan<select name="status" value={form.status} onChange={updateStatus}><option value="received">Belum Jalan</option><option value="running">Sedang Jalan</option><option value="completed">Selesai</option></select></label>
              <label>Waktu Mulai<input name="runningAt" type="datetime-local" value={form.runningAt} onChange={updateField} /></label>
              <label>Waktu Selesai<input name="completedAt" type="datetime-local" value={form.completedAt} onChange={updateField} /></label>
            </div>
          </div>

          <footer><button className="secondary-button" type="button" onClick={onClose}>Batal</button><button className="primary-button" type="submit">Simpan Container Job</button></footer>
        </form>
      </section>
    </div>
  );
}

export default OperationalForm;
