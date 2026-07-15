import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { fallbackTruckUnits } from '../../data/truckData';
import AttachmentUploadField from '../common/AttachmentUploadField';
import UjRecommendationCard from '../operations/UjRecommendationCard';
import { calculateUjRecommendation } from '../../utils/ujRecommendation';
import { formatCurrency } from '../../utils/formatCurrency';
import { validateArchiveFile } from '../../utils/fileValidation';
import { parseOtherCost, serializeOtherCost } from '../../utils/otherCost';

const documentFields = [
  ['spkDocument', 'Lampiran Biaya Lainnya'],
  ['eirDocument', 'Lampiran EIR'],
  ['loadingVoucherDocument', 'No. Bon Muat / Bon Bongkar'],
  ['tilaGatepassDocumentFile', 'No. TILA / Delivery Card / Gatepass / SP2'],
  ['travelDocumentFile', 'No. Surat Jalan'],
];

const operationalDocumentFields = [
  { valueField: 'loadingVoucher', fileField: 'loadingVoucherDocument', label: 'No. Bon Muat / Bon Bongkar' },
  { valueField: 'tilaGatepassDocument', fileField: 'tilaGatepassDocumentFile', label: 'No. TILA / Delivery Card / Gatepass / SP2' },
  { valueField: 'travelDocument', fileField: 'travelDocumentFile', label: 'No. Surat Jalan' },
];

const statusOptions = [
  {
    value: 'received',
    label: 'Belum Jalan',
    description: 'Pekerjaan belum mulai diproses.',
    tone: 'border-slate-300 bg-slate-100 text-slate-600',
    selectStyle: { borderColor: '#cbd5e1', backgroundColor: '#f8fafc', color: '#334155' },
  },
  {
    value: 'running',
    label: 'Sedang Jalan',
    description: 'Truck/container sedang dalam proses.',
    tone: 'border-amber-300 bg-amber-50 text-amber-700',
    selectStyle: { borderColor: '#f59e0b', backgroundColor: '#fffbeb', color: '#92400e' },
  },
  {
    value: 'completed',
    label: 'Selesai',
    description: 'Pekerjaan selesai, data masih bisa diedit.',
    tone: 'border-emerald-300 bg-emerald-50 text-emerald-700',
    selectStyle: { borderColor: '#10b981', backgroundColor: '#ecfdf5', color: '#047857' },
  },
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
  return !containerSize || !truckCapacity || truckCapacity === 'COMBO' || truckCapacity === containerSize;
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

function spkValue(value) {
  const normalized = String(value ?? '').trim();
  return normalized || '-';
}

function formatTruckUnitCode(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return normalized.replace(/^TRK-?/i, '').replace(/^0+(\d)/, '$1') || normalized;
}

function OperationalForm({ container, onClose, onSubmit, onGenerateSpk, masterTrucks, masterDestinations }) {
  const [fallbackTruckRows] = useState(() => getMasterData('tms-master-trucks-v2', fallbackTruckUnits));
  const fileInputRefs = useRef({});
  const trucks = (Array.isArray(masterTrucks) ? masterTrucks : fallbackTruckRows)
    .map((truck) => normalizeTruck(truck, fallbackTruckRows));
  const containerSize = normalizeSize(container.size || container.containerSize);
  const initialOtherCost = parseOtherCost(container.rpujNotes);
  const [form, setForm] = useState({
    containerNumber: container.containerNumber || '',
    rpujStatus: container.rpujStatus || 'pending',
    rpujNotes: container.rpujNotes || '',
    otherCostAmount: initialOtherCost.amount ? String(initialOtherCost.amount) : '',
    otherCostNotes: initialOtherCost.notes || '',
    spkNumber: container.spkNumber || '',
    spkGeneratedAt: container.spkGeneratedAt || container.spk_generated_at || '',
    spkFilePath: container.spkFilePath || container.spk_file_path || '',
    spkDocument: container.spkDocument || null,
    eirNumber: container.eirNumber || '',
    eirDocument: container.eirDocument || null,
    loadingVoucher: container.loadingVoucher || '',
    loadingVoucherDocument: container.loadingVoucherDocument || null,
    tilaGatepassDocument: container.tilaGatepassDocument || container.unloadingVoucher || container.weighingDocument || '',
    tilaGatepassDocumentFile: container.tilaGatepassDocumentFile || container.unloadingVoucherDocument || container.weighingDocumentFile || null,
    driver: container.driver || '',
    chassis: container.chassis || '',
    plateNumber: container.plateNumber || '',
    travelDocument: container.travelDocument || '',
    travelDocumentFile: container.travelDocumentFile || null,
    otherDocuments: container.otherDocuments || [],
    status: container.status || 'received',
    runningAt: container.runningAt?.slice(0, 16) || '',
    completedAt: container.completedAt?.slice(0, 16) || '',
  });
  const [error, setError] = useState('');
  const ujRecommendation = calculateUjRecommendation(container, masterDestinations);
  const ujAmount = Number(ujRecommendation.currentContainerUj || 0);
  const otherCostAmountValue = Number(form.otherCostAmount || 0);
  const totalJourneyCost = ujAmount + otherCostAmountValue;

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

  function updateStatusValue(status) {
    const now = nowForDateTimeInput();
    setForm((current) => ({
      ...current,
      status,
      runningAt: status === 'received' ? '' : ['running', 'completed'].includes(status) && !current.runningAt ? now : current.runningAt,
      completedAt: status === 'completed' ? (current.completedAt || now) : '',
    }));
  }

  function updateStatus(event) {
    updateStatusValue(event.target.value);
  }

  const activeStatusOption = statusOptions.find((option) => option.value === form.status) || statusOptions[0];

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
    const selectedTruck = trucks.find((truck) => truck.plateNumber === form.plateNumber || truck.plateNumber === container.plateNumber);
    const truckCode = formatTruckUnitCode(selectedTruck?.unitCode || container.unitCode || container.truckCode);
    const plateNumber = form.plateNumber || container.plateNumber || '';
    const truckPlate = truckCode && plateNumber ? `${truckCode} - ${plateNumber}` : truckCode || plateNumber || '-';
    const rpujLabel = ujAmount > 0 ? formatCurrency(ujAmount) : '-';

    return [
      'SURAT PERINTAH KERJA',
      `No. SPK: ${form.spkNumber || '-'}`,
      `Customer: ${spkValue(container.customer)}`,
      `Jenis Order: ${spkValue(container.shipment || container.jobType)}`,
      `Truck / Plat: ${truckPlate}`,
      `Driver: ${spkValue(form.driver || container.driver)}`,
      `Nama Kapal : ${spkValue(container.vesselName || container.shipName || container.namaKapal)}`,
      `Terminal : ${spkValue(container.terminal)}`,
      `Depo : ${spkValue(container.origin)}`,
      `Destination: ${spkValue(container.destination)}`,
      `Container Size: ${spkValue(container.size || container.containerSize)}`,
      `Tanggal Jalan: ${spkValue(container.tripDate)}`,
      `RPUJ ${rpujLabel}`,
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
    const otherCostAmount = Number(form.otherCostAmount || 0);
    if (otherCostAmount < 0) {
      setError('Nominal biaya lainnya tidak boleh negatif.');
      return;
    }
    const submitForm = {
      ...form,
      rpujStatus: otherCostAmount || form.otherCostNotes ? 'submitted' : 'pending',
      rpujNotes: serializeOtherCost({
        amount: otherCostAmount,
        notes: form.otherCostNotes,
      }),
    };
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
      if (submitForm.completedAt && submitForm.runningAt && new Date(submitForm.completedAt) < new Date(submitForm.runningAt)) {
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
            <h3>Biaya Lainnya & SPK</h3>
            <div className="mb-4">
              <UjRecommendationCard job={container} destinations={masterDestinations} />
            </div>
            <div className="operational-rpuj-spk-grid">
              <div className="operational-document-card operational-rpuj-card">
                <span>Biaya Lainnya</span>
                <label className="operational-inline-label">
                  Nominal Biaya
                  <input
                    name="otherCostAmount"
                    type="number"
                    min="0"
                    step="1000"
                    value={form.otherCostAmount}
                    onChange={updateField}
                    placeholder="Contoh: 150000"
                  />
                </label>
                <label className="operational-inline-label">
                  Catatan Biaya
                  <input
                    name="otherCostNotes"
                    value={form.otherCostNotes}
                    onChange={updateField}
                    placeholder="Contoh: tol, parkir, bongkar"
                  />
                </label>
                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">Subtotal Perjalanan</span>
                      <small className="block text-[11px] text-slate-400">UJ + biaya lainnya</small>
                    </div>
                    <strong className="text-base font-semibold text-slate-900">{formatCurrency(totalJourneyCost)}</strong>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600">
                      <span className="text-slate-400">UJ</span>
                      <strong className="font-semibold text-slate-800">{formatCurrency(ujAmount)}</strong>
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600">
                      <span className="text-slate-400">Lainnya</span>
                      <strong className="font-semibold text-slate-800">{formatCurrency(otherCostAmountValue)}</strong>
                    </span>
                  </div>
                </div>
                <AttachmentUploadField
                  id="operational-spk-document"
                  label="Lampiran Biaya Lainnya"
                  value={form.spkDocument}
                  title={form.spkDocument?.name ? 'Ubah File' : 'Pilih File'}
                  helper="PDF, JPG, PNG - Maks. 5 MB"
                  accept={OPERATIONAL_FILE_ACCEPT}
                  compact
                  validationOptions={{
                    label: 'Lampiran Biaya Lainnya',
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
            <h3>Dokumen Operasional</h3>
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
              <label>
                Status Pekerjaan
                <select name="status" value={form.status} onChange={updateStatus} style={activeStatusOption.selectStyle}>
                  {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <span className={`mt-1 inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${activeStatusOption.tone}`}>
                  {activeStatusOption.label}
                </span>
                <small className="text-[11px] font-semibold leading-snug text-slate-500">{activeStatusOption.description}</small>
              </label>
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
