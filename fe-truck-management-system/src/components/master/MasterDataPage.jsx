import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Database,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  FileText,
  Plus,
  RotateCcw,
  Save,
  Search,
  UploadCloud,
  X,
} from 'lucide-react';
import { useFeedback } from '../../hooks/useFeedback';
import { useArchiveData } from '../../hooks/useArchiveData';
import PageHeader from '../common/PageHeader';
import DocumentLink from '../common/DocumentLink';
import FilterStatus from '../common/FilterStatus';
import { fetchMasterPage } from '../../services/master-data/masterDataService';
import { createAttachmentDownloadUrl } from '../../services/files/fileService';
import { validateArchiveFile } from '../../utils/fileValidation';

const FILE_TYPE_BY_EXTENSION = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

const EMPTY_ROWS = [];

function normalizeRows(value) {
  return Array.isArray(value) ? value : EMPTY_ROWS;
}

function createEmptyForm(fields) {
  return fields.reduce((form, field) => ({ ...form, [field.key]: field.defaultValue ?? '' }), {});
}

function createFileMetadata(file) {
  if (!file) return null;
  return {
    name: file.name,
    size: file.size,
    type: file.type || 'Dokumen',
    lastModified: file.lastModified,
    rawFile: file,
  };
}

function formatFileSize(size = 0) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(name = '') {
  return String(name).split('.').pop()?.toLowerCase() || '';
}

function isImageFile(file) {
  if (!file) return false;
  return String(file.type || '').startsWith('image/')
    || ['jpg', 'jpeg', 'png'].includes(getFileExtension(file.name || file.path));
}

function getAcceptedFileConfig(field) {
  const acceptedExtensions = String(field.accept || '.pdf,.jpg,.jpeg,.png')
    .split(',')
    .map((item) => item.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean);
  const allowedExtensions = acceptedExtensions.length ? acceptedExtensions : ['pdf', 'jpg', 'jpeg', 'png'];
  const allowedTypes = [...new Set(allowedExtensions.map((extension) => FILE_TYPE_BY_EXTENSION[extension]).filter(Boolean))];
  const imageOnly = allowedExtensions.every((extension) => ['jpg', 'jpeg', 'png'].includes(extension));

  return {
    allowedExtensions,
    allowedTypes,
    imageOnly,
    title: imageOnly ? 'Pilih gambar' : 'Pilih dokumen',
    helper: imageOnly ? 'JPG atau PNG - Maksimal 5 MB' : 'PDF, JPG, atau PNG - Maksimal 5 MB',
    errorLabel: imageOnly ? 'JPG atau PNG' : 'PDF, JPG, atau PNG',
  };
}

function AttachmentThumbnail({ file }) {
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (!isImageFile(file)) {
      setPreviewUrl('');
      return undefined;
    }

    let active = true;

    const rawFile = file instanceof File ? file : file.rawFile instanceof File ? file.rawFile : null;

    if (rawFile) {
      const objectUrl = URL.createObjectURL(rawFile);
      setPreviewUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }

    if (file.path) {
      createAttachmentDownloadUrl(file.path).then((url) => {
        if (active) setPreviewUrl(url || '');
      });
      return () => {
        active = false;
      };
    }

    setPreviewUrl('');
    return undefined;
  }, [file]);

  if (!isImageFile(file)) return <FileText size={18} />;
  if (!previewUrl) return <span className="attachment-image-placeholder">IMG</span>;

  return <img className="attachment-thumbnail" src={previewUrl} alt={file.name || 'Preview gambar'} />;
}

function MasterDataPage({
  eyebrow,
  title,
  description,
  singular,
  fields,
  columns,
  initialRows,
  storageKey,
  stats,
  filters = [],
  uniqueKeys = [],
  detailFields = fields,
  pageSize = 5,
  resource,
  pageClassName = '',
  showModeChip = true,
  toolbarTitle,
  toolbarDescription,
  sortRows,
  beforeSave,
}) {
  const { confirmAction, notify } = useFeedback();
  const { isDatabaseMode, isMasterDatabaseMode, masters, upsertMaster, removeMaster } = useArchiveData();
  const masterDatabaseMode = isMasterDatabaseMode ?? isDatabaseMode;
  const [rows, setRows] = useState(() => {
    try {
      const storedRows = JSON.parse(localStorage.getItem(storageKey));
      return normalizeRows(storedRows).length ? normalizeRows(storedRows) : normalizeRows(initialRows);
    } catch {
      return normalizeRows(initialRows);
    }
  });
  const [form, setForm] = useState(() => createEmptyForm(fields));
  const [editingId, setEditingId] = useState(null);
  const [editingRow, setEditingRow] = useState(null);
  const [query, setQuery] = useState('');
  const [formError, setFormError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [activeFilters, setActiveFilters] = useState({});
  const [page, setPage] = useState(1);
  const [serverRows, setServerRows] = useState([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [listVersion, setListVersion] = useState(0);
  const safeRows = normalizeRows(rows);
  const databaseRows = resource ? normalizeRows(masters?.[resource]) : null;

  useEffect(() => {
    if (masterDatabaseMode && resource) setRows(databaseRows);
  }, [databaseRows, masterDatabaseMode, resource]);

  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const result = safeRows.filter((row) => {
      const matchesQuery = !keyword || fields.some((field) => {
        const value = row[field.key];
        return typeof value !== 'object' && String(value ?? '').toLowerCase().includes(keyword);
      });
      const matchesFilters = filters.every((filter) =>
        !activeFilters[filter.key] || row[filter.key] === activeFilters[filter.key],
      );
      return matchesQuery && matchesFilters;
    });
    return sortRows ? sortRows(result) : result;
  }, [activeFilters, fields, filters, query, safeRows, sortRows]);

  const useClientSortedRows = Boolean(masterDatabaseMode && sortRows);
  const totalItems = useClientSortedRows || !masterDatabaseMode ? filteredRows.length : serverTotal;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedRows = useClientSortedRows || !masterDatabaseMode
    ? filteredRows.slice((page - 1) * pageSize, page * pageSize)
    : masterDatabaseMode
    ? serverRows
    : filteredRows.slice((page - 1) * pageSize, page * pageSize);
  const hasActiveFilters = Boolean(query.trim()) || Object.values(activeFilters).some(Boolean);

  const fieldSections = useMemo(
    () => fields.reduce((sections, field) => {
      const section = field.section || 'Informasi Utama';
      const existing = sections.find((item) => item.name === section);
      if (existing) existing.fields.push(field);
      else sections.push({ name: section, fields: [field] });
      return sections;
    }, []),
    [fields],
  );

  useEffect(() => {
    if (!formOpen) return undefined;

    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setFormOpen(false);
        setEditingId(null);
        setForm(createEmptyForm(fields));
      }
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [fields, formOpen]);

  useEffect(() => {
    if (!detailRow) return undefined;

    function closeDetailOnEscape(event) {
      if (event.key === 'Escape') setDetailRow(null);
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeDetailOnEscape);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', closeDetailOnEscape);
    };
  }, [detailRow]);

  useEffect(() => {
    setPage(1);
  }, [query, activeFilters]);

  useEffect(() => {
    if (!masterDatabaseMode || !resource || useClientSortedRows) return undefined;
    let active = true;
    const timer = window.setTimeout(async () => {
      setListLoading(true);
      setListError('');
      try {
        const result = await fetchMasterPage(resource, {
          page,
          pageSize,
          query,
          filters: activeFilters,
        });
        if (!active) return;
        setServerRows(normalizeRows(result?.rows));
        setServerTotal(Number(result?.total) || 0);
      } catch (requestError) {
        if (!active) return;
        setServerRows([]);
        setServerTotal(0);
        setListError(requestError.message || 'Daftar master gagal dimuat.');
      } finally {
        if (active) setListLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [activeFilters, masterDatabaseMode, listVersion, page, pageSize, query, resource, useClientSortedRows]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function persist(nextRows) {
    const normalizedRows = normalizeRows(nextRows);
    setRows(normalizedRows);
    localStorage.setItem(storageKey, JSON.stringify(normalizedRows));
  }

  const statCards = useMemo(() => {
    if (typeof stats !== 'function') return [];
    try {
      const nextStats = stats(safeRows);
      return Array.isArray(nextStats) ? nextStats : [];
    } catch (error) {
      console.error('ATMS master stats error:', error);
      return [];
    }
  }, [safeRows, stats]);

  function resetForm() {
    setForm(createEmptyForm(fields));
    setEditingId(null);
    setEditingRow(null);
    setFormError('');
  }

  function openCreateForm() {
    resetForm();
    setFormOpen(true);
  }

  function closeForm() {
    setForm(createEmptyForm(fields));
    setEditingId(null);
    setEditingRow(null);
    setFormError('');
    setFormOpen(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const validationError = fields
      .map((field) => field.validate?.(form, { editing: Boolean(editingId) }))
      .find(Boolean);

    if (validationError) {
      setFormError(validationError);
      return;
    }

    const duplicateField = uniqueKeys.find((key) => {
      const value = String(form[key] ?? '').trim().toLowerCase();
      const originalValue = String(editingRow?.[key] ?? '').trim().toLowerCase();
      if (editingRow && value === originalValue) return false;
      return value && safeRows.some((row) =>
        String(row.id) !== String(editingId) && String(row[key] ?? '').trim().toLowerCase() === value,
      );
    });

    if (duplicateField) {
      const field = fields.find((item) => item.key === duplicateField);
      setFormError(`${field?.label || duplicateField} sudah digunakan oleh data lain.`);
      return;
    }

    const payload = fields.reduce((result, field) => {
      const rawValue = form[field.key];
      const value = field.normalize ? field.normalize(rawValue, form) : rawValue;
      if (field.persist === false) {
        return result;
      }
      if (field.type === 'file') {
        result[field.key] = value instanceof File ? createFileMetadata(value) : value || null;
      } else if (field.sensitive) {
        if (value) result[field.key] = '••••••••';
        else if (editingId) result[field.key] = safeRows.find((row) => row.id === editingId)?.[field.key] || null;
        else result[field.key] = null;
      } else {
        result[field.key] = typeof value === 'string' ? value.trim() : value;
      }
      return result;
    }, {});

    let savePayload = payload;
    let relatedRows = [];
    if (beforeSave) {
      const prepared = await beforeSave({
        payload,
        editingId,
        rows: safeRows,
        form,
        confirmAction,
      });
      if (!prepared) return;
      savePayload = prepared.payload || prepared;
      relatedRows = prepared.relatedRows || [];
    }

    try {
      if (masterDatabaseMode && resource) {
        await upsertMaster(resource, savePayload, editingId);
        for (const related of relatedRows) {
          await upsertMaster(resource, related.row, related.id);
        }
        setListVersion((value) => value + 1);
      } else if (editingId) {
        const saved = { ...safeRows.find((row) => row.id === editingId), ...savePayload, id: editingId };
        const nextRows = safeRows.map((row) => {
          if (row.id === editingId) return saved;
          const related = relatedRows.find((item) => item.id === row.id);
          return related ? { ...row, ...related.row, id: row.id } : row;
        });
        persist(nextRows);
        if (resource) {
          await upsertMaster(resource, saved, editingId);
          for (const related of relatedRows) {
            await upsertMaster(resource, related.row, related.id);
          }
        }
      } else {
        const saved = { id: `${storageKey}-${Date.now()}`, ...savePayload };
        const nextRows = safeRows.map((row) => {
          const related = relatedRows.find((item) => item.id === row.id);
          return related ? { ...row, ...related.row, id: row.id } : row;
        });
        persist([saved, ...nextRows]);
        if (resource) {
          await upsertMaster(resource, saved, saved.id);
          for (const related of relatedRows) {
            await upsertMaster(resource, related.row, related.id);
          }
        }
      }
      notify({
        title: `${singular} berhasil ${editingId ? 'diperbarui' : 'ditambahkan'}`,
        message: masterDatabaseMode ? 'Data sudah tersimpan di database PostgreSQL.' : 'Data tersimpan dalam mode demo.',
      });
    } catch (requestError) {
      setFormError(requestError.message || `Data ${singular.toLowerCase()} gagal disimpan.`);
      return;
    }
    setForm(createEmptyForm(fields));
    setEditingId(null);
    setEditingRow(null);
    setFormError('');
    setFormOpen(false);
  }

  function handleEdit(row) {
    setEditingId(row.id);
    setEditingRow(row);
    setForm(fields.reduce(
      (next, field) => {
        const value = row[field.key] ?? '';
        return { ...next, [field.key]: field.sensitive ? '' : field.normalize ? field.normalize(value, row) : value };
      },
      {},
    ));
    setFormError('');
    setFormOpen(true);
  }

  async function handleDelete(id) {
    const approved = await confirmAction({
      title: `Arsipkan ${singular}?`,
      message: `Data ${singular.toLowerCase()} tidak akan tampil lagi pada daftar master aktif. Jika sudah dipakai transaksi, data akan dinonaktifkan agar histori tetap aman.`,
      confirmLabel: 'Arsipkan Data',
    });
    if (!approved) return;

    try {
      if (masterDatabaseMode && resource) {
        await removeMaster(resource, id);
        setListVersion((value) => value + 1);
      } else {
        persist(safeRows.filter((row) => row.id !== id));
        if (resource) await removeMaster(resource, id);
      }
    } catch (requestError) {
      notify({
        type: 'error',
        title: `${singular} gagal diarsipkan`,
        message: requestError.message || 'Terjadi kendala saat mengarsipkan data.',
      });
      return;
    }
    if (editingId === id) resetForm();
    notify({ title: `${singular} berhasil diarsipkan`, message: masterDatabaseMode ? 'Data tidak lagi tampil pada master aktif.' : 'Data telah dihapus dari mode demo.' });
  }

  return (
    <div className={`page ${pageClassName}`.trim()}>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          <div className="page-action-group">
            {showModeChip ? <span className="dummy-chip"><Database size={14} /> {masterDatabaseMode ? 'Terhubung PostgreSQL' : 'Mode Data Dummy'}</span> : null}
            <button className="primary-button" type="button" onClick={openCreateForm}>
              <Plus size={17} /> Input {singular} Baru
            </button>
          </div>
        }
      />

      <div className="master-stats">
        {statCards.map((stat) => (
          <div key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.detail}</small>
          </div>
        ))}
      </div>

      <div className="master-layout">
        <section className="panel master-table-panel">
          <div className="master-toolbar">
            <div className="step-heading">
              <div>
                <span>Data master</span>
                <h2>{toolbarTitle || `Daftar ${title.replace('Master ', '')}`}</h2>
                <p>{toolbarDescription || 'Temukan, periksa, dan kelola data yang telah tersimpan.'}</p>
              </div>
            </div>
            <label className="search-field">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari data..." />
            </label>
            {filters.map((filter) => (
              <select
                key={filter.key}
                className="master-filter-select"
                value={activeFilters[filter.key] || ''}
                onChange={(event) => setActiveFilters((current) => ({ ...current, [filter.key]: event.target.value }))}
              >
                <option value="">{filter.label}</option>
                {filter.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ))}
          </div>
          <div className="table-wrap">
            <table className="data-table master-table responsive-data-table">
              <thead>
                <tr>
                  {columns.map((column) => <th key={column.key}>{column.label}</th>)}
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {listLoading ? (
                  <tr className="responsive-empty-row"><td colSpan={columns.length + 1}><div className="empty-state">Memuat data...</div></td></tr>
                ) : null}
                {!listLoading && listError ? (
                  <tr className="responsive-empty-row"><td colSpan={columns.length + 1}><div className="empty-state">{listError}</div></td></tr>
                ) : null}
                {!listLoading && !listError ? paginatedRows.map((row, rowIndex) => (
                  <tr key={row.id}>
                    {columns.map((column, columnIndex) => (
                      <td key={column.key} data-label={column.label}>
                        {column.render
                          ? column.render(row[column.key], row, {
                            rowNumber: (page - 1) * pageSize + rowIndex + 1,
                            rowIndex,
                            columnIndex,
                          })
                          : row[column.key] || '-'}
                      </td>
                    ))}
                    <td data-label="Aksi">
                      <div className="table-actions">
                        <button type="button" onClick={() => setDetailRow(row)} aria-label={`Lihat ${singular}`}>
                          <Eye size={15} />
                        </button>
                        <button type="button" onClick={() => handleEdit(row)} aria-label={`Edit ${singular}`}>
                          <Edit3 size={15} />
                        </button>
                        <button className="danger" type="button" onClick={() => handleDelete(row.id)} aria-label={`Arsipkan ${singular}`}>
                          <Archive size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : null}
                {!listLoading && !listError && !totalItems ? (
                  <tr className="responsive-empty-row"><td colSpan={columns.length + 1}><div className="empty-state">Data tidak ditemukan.</div></td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <FilterStatus
            total={safeRows.length}
            filtered={totalItems}
            active={hasActiveFilters}
            label="data"
            onReset={() => {
              setQuery('');
              setActiveFilters({});
            }}
          />
          <div className="master-pagination">
            <span>
              Menampilkan {totalItems ? (page - 1) * pageSize + 1 : 0}–
              {Math.min(page * pageSize, totalItems)} dari {totalItems} data
            </span>
            <div>
              <button type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)} aria-label="Halaman sebelumnya"><ChevronLeft size={15} /></button>
              <strong>{page} / {totalPages}</strong>
              <button type="button" disabled={page === totalPages} onClick={() => setPage((current) => current + 1)} aria-label="Halaman berikutnya"><ChevronRight size={15} /></button>
            </div>
          </div>
        </section>
      </div>

      {detailRow ? (
        <div className="master-modal-backdrop" role="presentation" onMouseDown={() => setDetailRow(null)}>
          <section className="master-detail-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><span>Detail Data</span><h2>{detailRow.name || detailRow.plateNumber || detailRow.unitCode}</h2></div>
              <button className="modal-close-button" type="button" aria-label="Tutup detail data" onClick={() => setDetailRow(null)}><X size={19} /></button>
            </header>
            <div className="master-detail-grid">
              {detailFields.filter((field) => field.persist !== false && !field.sensitive).map((field) => {
                const value = detailRow[field.key];
                return (
                  <div key={field.key} className={field.full ? 'span-full' : ''}>
                    <span>{field.label}</span>
                    {field.type === 'file' ? <DocumentLink file={value} /> : <strong>{value || '-'}</strong>}
                  </div>
                );
              })}
            </div>
            <footer>
              <button className="secondary-button" type="button" onClick={() => setDetailRow(null)}>Tutup</button>
              <button className="primary-button" type="button" onClick={() => { setDetailRow(null); handleEdit(detailRow); }}><Edit3 size={16} /> Edit Data</button>
            </footer>
          </section>
        </div>
      ) : null}

      {formOpen ? (
        <div className="master-modal-backdrop" role="presentation" onMouseDown={closeForm}>
          <section
            className="master-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="master-form-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <form className="master-form" onSubmit={handleSubmit}>
              <div className="master-form-heading">
                <div className="step-heading">
                  <span className="step-number">{editingId ? 'E' : '2'}</span>
                  <div>
                    <span>{editingId ? 'Mode penyuntingan' : 'Input data baru'}</span>
                    <h2 id="master-form-title">{editingId ? `Edit Data ${singular}` : `Input Data ${singular}`}</h2>
                    <p>Lengkapi informasi berikut. Kolom bertanda * wajib diisi.</p>
                  </div>
                </div>
                <button className="modal-close-button" type="button" onClick={closeForm} aria-label="Tutup modal">
                  <X size={20} />
                </button>
              </div>

              <div className="master-form-sections">
                {formError ? <div className="alert error master-form-error">{formError}</div> : null}
                {fieldSections.map((section) => (
                  <fieldset className="master-fieldset" key={section.name}>
                    <legend>{section.name}</legend>
                    <div className="master-form-grid">
                      {section.fields.map((field) => (
                        <div key={field.key} className={`master-field ${field.full ? 'span-full' : ''}`}>
                          <span>{field.label}{field.required ? <em>*</em> : null}</span>
                          {field.type === 'select' ? (
                            <select
                              value={form[field.key]}
                              onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                              required={field.required}
                            >
                              {field.options.map((option) => (
                                <option key={option.value} value={option.value} disabled={option.disabled} style={option.style}>{option.label}</option>
                              ))}
                            </select>
                          ) : field.type === 'file' ? (
                            <div className="document-upload">
                              <input
                                id={`${storageKey}-${field.key}`}
                                type="file"
                                accept={field.accept || '.pdf,.jpg,.jpeg,.png'}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  const acceptedFile = getAcceptedFileConfig(field);
                                  const validationError = validateArchiveFile(file, {
                                    label: field.label,
                                    allowedTypes: acceptedFile.allowedTypes,
                                    allowedExtensions: acceptedFile.allowedExtensions,
                                    allowedLabel: acceptedFile.errorLabel,
                                  });
                                  if (validationError) {
                                    setFormError(validationError);
                                    event.target.value = '';
                                    return;
                                  }
                                  setFormError('');
                                  setForm({ ...form, [field.key]: file || form[field.key] });
                                }}
                              />
                              <label className="document-upload-dropzone" htmlFor={`${storageKey}-${field.key}`}>
                                <UploadCloud size={21} />
                                <span>
                                  <strong>{getAcceptedFileConfig(field).title}</strong>
                                  <small>{getAcceptedFileConfig(field).helper}</small>
                                </span>
                              </label>
                              {form[field.key] ? (
                                <div className="selected-document">
                                  <AttachmentThumbnail file={form[field.key]} />
                                  <span>
                                    <strong>{form[field.key].name}</strong>
                                    <small>
                                      {form[field.key].size ? formatFileSize(form[field.key].size) : isImageFile(form[field.key]) ? 'Gambar tersimpan' : 'Dokumen tersimpan'}
                                    </small>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setForm({ ...form, [field.key]: null })}
                                    aria-label={`Hapus ${field.label}`}
                                  >
                                    <X size={15} />
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : field.type === 'textarea' ? (
                            <textarea
                              value={form[field.key]}
                              onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                              placeholder={field.placeholder}
                              required={field.required}
                              rows="3"
                            />
                          ) : (
                            <input
                              type={field.type || 'text'}
                              value={form[field.key]}
                              onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                              placeholder={field.placeholder}
                              required={field.required && (!field.requiredOnCreate || !editingId)}
                              minLength={field.minLength}
                            />
                          )}
                          {field.hint ? <small>{field.hint}</small> : null}
                        </div>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
              <div className="master-form-actions">
                <button className="secondary-button" type="button" onClick={editingId ? closeForm : resetForm}>
                  {editingId ? <X size={16} /> : <RotateCcw size={16} />}
                  {editingId ? 'Batal' : 'Kosongkan Form'}
                </button>
                <button className="primary-button" type="submit">
                  <Save size={17} /> {editingId ? 'Simpan Perubahan' : `Simpan ${singular}`}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default MasterDataPage;
