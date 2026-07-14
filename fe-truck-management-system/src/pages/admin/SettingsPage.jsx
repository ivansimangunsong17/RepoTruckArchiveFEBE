import { useEffect, useState } from 'react';
import {
  Bell,
  Boxes,
  CheckCircle2,
  Database,
  FileText,
  GitBranch,
  KeyRound,
  Network,
  Save,
  Server,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import { useFeedback } from '../../hooks/useFeedback';
import { fetchSystemSettings, isSettingsDatabaseEnabled, saveSystemSettings } from '../../services/settings/settingsService';

const storageKey = 'tms-admin-settings';

const defaultSettings = {
  companyName: 'PT Citra Prima Logistik',
  timezone: 'Asia/Jakarta',
  environment: 'Development',
  unitPrefix: 'TRK',
  clientPrefix: 'CL',
  orderPrefix: 'SO',
  jobPrefix: 'JOB',
  sessionTimeout: '60',
  passwordPolicy: 'standard',
  frontendHost: 'React.js / Vite',
  backendHost: 'Node.js API',
  databaseHost: 'PostgreSQL',
  storageMode: 'backend',
  migrationStatus: 'ui_mapping',
  documentReminder: true,
  contractReminder: true,
  loginNotification: false,
  modules: {
    salesOrders: true,
    operations: true,
    reports: true,
    masterData: true,
    userManagement: true,
  },
  documents: {
    salesOrder: true,
    spk: true,
    loadingVoucher: true,
    unloadingVoucher: true,
    travelDocument: true,
    weighingDocument: true,
    driverLicense: true,
    vehicleRegistration: true,
  },
};

const moduleOptions = [
  ['salesOrders', 'Sales Order', 'Input DO/SO, customer, rute, tarif, dan container.'],
  ['operations', 'Operational Job', 'Assignment driver dan truck, status pekerjaan, dokumen jalan.'],
  ['reports', 'Laporan', 'Ringkasan sales order, operational job, dan arsip perjalanan.'],
  ['masterData', 'Master Data', 'Customer, supir, truck, dan referensi utama aplikasi.'],
  ['userManagement', 'User Management', 'Role, akses, sesi, dan audit aktivitas pengguna.'],
];

const documentOptions = [
  ['salesOrder', 'Sales Order / DO'],
  ['spk', 'SPK'],
  ['loadingVoucher', 'Bon Muat'],
  ['unloadingVoucher', 'Bon Bongkar'],
  ['travelDocument', 'Surat Jalan'],
  ['weighingDocument', 'Surat Timbang'],
  ['driverLicense', 'SIM Supir'],
  ['vehicleRegistration', 'STNK / KIR'],
];

const roleMatrix = [
  ['Admin', 'Semua modul, user, settings, audit log'],
  ['Sales', 'Sales Order dan arsip order'],
  ['Operational', 'Operational Job dan dokumen perjalanan'],
  ['Observer', 'Dashboard, laporan, dan monitoring'],
];

function mergeSettings(saved) {
  return {
    ...defaultSettings,
    ...saved,
    modules: { ...defaultSettings.modules, ...(saved?.modules || {}) },
    documents: { ...defaultSettings.documents, ...(saved?.documents || {}) },
  };
}

function SettingsPage() {
  const { notify } = useFeedback();
  const databaseMode = isSettingsDatabaseEnabled();
  const [loading, setLoading] = useState(databaseMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(() => {
    try {
      return mergeSettings(JSON.parse(localStorage.getItem(storageKey)));
    } catch {
      return defaultSettings;
    }
  });

  useEffect(() => {
    let active = true;
    fetchSystemSettings()
      .then((saved) => {
        if (active && saved) setSettings(mergeSettings(saved));
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Pengaturan gagal dimuat.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  }, [settings]);

  function update(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function updateNested(group, key, value) {
    setSettings((current) => ({
      ...current,
      [group]: { ...current[group], [key]: value },
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await saveSystemSettings(settings);
      notify({
        title: 'Kebutuhan sistem berhasil disimpan',
        message: databaseMode
          ? 'Konfigurasi tersimpan di backend Node.js/PostgreSQL.'
          : 'Konfigurasi tersimpan untuk mode demo frontend.',
      });
    } catch (requestError) {
      setError(requestError.message || 'Pengaturan gagal disimpan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="System Administration"
        title="Kebutuhan Sistem"
        description="Atur rancangan modul, role, dokumen, integrasi, dan target arsitektur Frontend React, Backend Node.js, serta Database PostgreSQL."
      />

      <form className="settings-layout" onSubmit={handleSubmit}>
        {error ? <div className="alert error settings-message">{error}</div> : null}
        {loading ? <div className="settings-message page-loading">Memuat kebutuhan sistem...</div> : null}

        <section className="settings-architecture panel">
          <div>
            <span><Network size={20} /></span>
            <p>Frontend</p>
            <strong>{settings.frontendHost}</strong>
          </div>
          <i />
          <div>
            <span><Server size={20} /></span>
            <p>Backend</p>
            <strong>{settings.backendHost}</strong>
          </div>
          <i />
          <div>
            <span><Database size={20} /></span>
            <p>Database</p>
            <strong>{settings.databaseHost}</strong>
          </div>
        </section>

        <section className="panel settings-card">
          <div className="settings-title"><Settings2 size={19} /><div><h2>Identitas Aplikasi</h2><p>Nama perusahaan, zona waktu, dan mode environment.</p></div></div>
          <label>Nama Perusahaan<input value={settings.companyName} onChange={(event) => update('companyName', event.target.value)} required /></label>
          <label>Zona Waktu<select value={settings.timezone} onChange={(event) => update('timezone', event.target.value)}><option value="Asia/Jakarta">Asia/Jakarta (WIB)</option><option value="Asia/Makassar">Asia/Makassar (WITA)</option><option value="Asia/Jayapura">Asia/Jayapura (WIT)</option></select></label>
          <label>Environment<select value={settings.environment} onChange={(event) => update('environment', event.target.value)}><option>Development</option><option>Staging</option><option>Production</option></select></label>
        </section>

        <section className="panel settings-card">
          <div className="settings-title"><SlidersHorizontal size={19} /><div><h2>Penomoran Dokumen</h2><p>Prefix awal untuk kode transaksi dan master data.</p></div></div>
          <label>Prefix Sales Order<input value={settings.orderPrefix} onChange={(event) => update('orderPrefix', event.target.value.toUpperCase())} /></label>
          <label>Prefix Container Job<input value={settings.jobPrefix} onChange={(event) => update('jobPrefix', event.target.value.toUpperCase())} /></label>
          <label>Prefix Kode Truck<input value={settings.unitPrefix} onChange={(event) => update('unitPrefix', event.target.value.toUpperCase())} /></label>
          <label>Prefix Kode Client<input value={settings.clientPrefix} onChange={(event) => update('clientPrefix', event.target.value.toUpperCase())} /></label>
        </section>

        <section className="panel settings-card settings-wide">
          <div className="settings-title"><Boxes size={19} /><div><h2>Modul Aktif</h2><p>Pilih modul yang menjadi cakupan UI dan API tahap awal.</p></div></div>
          <div className="settings-option-grid">
            {moduleOptions.map(([key, label, description]) => (
              <label className="settings-check-card" key={key}>
                <input type="checkbox" checked={settings.modules[key]} onChange={(event) => updateNested('modules', key, event.target.checked)} />
                <span><strong>{label}</strong><small>{description}</small></span>
              </label>
            ))}
          </div>
        </section>

        <section className="panel settings-card">
          <div className="settings-title"><ShieldCheck size={19} /><div><h2>Role & Akses</h2><p>Kontrol dasar akses pengguna untuk archive perjalanan.</p></div></div>
          <label>Durasi Sesi (menit)<input type="number" min="15" value={settings.sessionTimeout} onChange={(event) => update('sessionTimeout', event.target.value)} /></label>
          <label>Kebijakan Password<select value={settings.passwordPolicy} onChange={(event) => update('passwordPolicy', event.target.value)}><option value="standard">Standard</option><option value="strict">Strict</option><option value="sso_ready">SSO Ready</option></select></label>
          <div className="settings-role-list">
            {roleMatrix.map(([role, access]) => <p key={role}><strong>{role}</strong><span>{access}</span></p>)}
          </div>
        </section>

        <section className="panel settings-card">
          <div className="settings-title"><FileText size={19} /><div><h2>Kebutuhan Dokumen</h2><p>Checklist dokumen yang perlu tersedia di upload API.</p></div></div>
          <div className="settings-compact-checks">
            {documentOptions.map(([key, label]) => (
              <label className="toggle-row" key={key}><span>{label}</span><input type="checkbox" checked={settings.documents[key]} onChange={(event) => updateNested('documents', key, event.target.checked)} /></label>
            ))}
          </div>
        </section>

        <section className="panel settings-card settings-wide">
          <div className="settings-title"><GitBranch size={19} /><div><h2>Konfigurasi Backend</h2><p>Catatan integrasi aplikasi dengan API Node.js dan database PostgreSQL.</p></div></div>
          <div className="settings-backend-grid">
            <label>Frontend<input value={settings.frontendHost} onChange={(event) => update('frontendHost', event.target.value)} /></label>
            <label>Backend<input value={settings.backendHost} onChange={(event) => update('backendHost', event.target.value)} /></label>
            <label>Database<input value={settings.databaseHost} onChange={(event) => update('databaseHost', event.target.value)} /></label>
            <label>File Storage<select value={settings.storageMode} onChange={(event) => update('storageMode', event.target.value)}><option value="backend">Backend Managed</option><option value="object_storage">Object Storage</option><option value="local">Local Development</option></select></label>
            <label>Status Migrasi<select value={settings.migrationStatus} onChange={(event) => update('migrationStatus', event.target.value)}><option value="ui_mapping">UI Mapping</option><option value="api_design">API Design</option><option value="schema_design">Schema Design</option><option value="implementation">Implementation</option></select></label>
          </div>
          <div className="settings-readiness">
            {[
              ['Mapping UI selesai', settings.migrationStatus !== 'ui_mapping'],
              ['Endpoint Node.js disiapkan', ['api_design', 'schema_design', 'implementation'].includes(settings.migrationStatus)],
              ['Schema Postgres dirancang', ['schema_design', 'implementation'].includes(settings.migrationStatus)],
              ['Integrasi file upload diputuskan', settings.storageMode !== 'local'],
            ].map(([label, done]) => (
              <span className={done ? 'ready' : ''} key={label}><CheckCircle2 size={15} />{label}</span>
            ))}
          </div>
        </section>

        <section className="panel settings-card settings-notifications">
          <div className="settings-title"><Bell size={19} /><div><h2>Notifikasi Admin</h2><p>Pilih peringatan yang tampil pada dashboard.</p></div></div>
          {[
            ['documentReminder', 'Dokumen dan SIM akan kedaluwarsa'],
            ['contractReminder', 'Umbrella contract perlu direview'],
            ['loginNotification', 'Login baru dari perangkat berbeda'],
          ].map(([key, label]) => (
            <label className="toggle-row" key={key}><span>{label}</span><input type="checkbox" checked={settings[key]} onChange={(event) => update(key, event.target.checked)} /></label>
          ))}
        </section>

        <div className="settings-actions">
          <span><KeyRound size={16} /> {databaseMode ? 'Konfigurasi tersimpan di backend Node.js/PostgreSQL.' : 'Konfigurasi tersimpan di mode demo frontend.'}</span>
          <button className="primary-button" type="submit" disabled={loading || saving}>
            <Save size={17} /> {saving ? 'Menyimpan...' : 'Simpan Kebutuhan Sistem'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default SettingsPage;
