import MasterDataPage from '../../components/master/MasterDataPage';
import { ROLE_LABELS, USER_ROLES } from '../../constants/roles';
import { fallbackUsers } from '../../data/masterData';

const fields = [
  { key: 'name', section: 'Identitas User', label: 'Nama User', placeholder: 'Nama lengkap user', required: true },
  { key: 'email', section: 'Identitas User', label: 'Email User', type: 'email', placeholder: 'user@perusahaan.com', required: true, hint: 'Email digunakan untuk login.' },
  { key: 'password', section: 'Identitas User', label: 'Password', type: 'password', placeholder: 'Minimal 8 karakter', required: true, requiredOnCreate: true, sensitive: true, minLength: 8, hint: 'Saat edit, kosongkan jika password tidak ingin diubah.' },
  {
    key: 'passwordConfirmation',
    section: 'Identitas User',
    label: 'Konfirmasi Password',
    type: 'password',
    placeholder: 'Ketik ulang password',
    required: true,
    requiredOnCreate: true,
    minLength: 8,
    persist: false,
    hint: 'Harus sama dengan password di atas.',
    validate: (form, { editing }) => {
      if (editing && !form.password && !form.passwordConfirmation) return '';
      if (form.password !== form.passwordConfirmation) return 'Password dan konfirmasi password tidak sama.';
      return '';
    },
  },
  { key: 'role', section: 'Hak Akses', label: 'Role User', type: 'select', defaultValue: USER_ROLES.SALES, options: Object.values(USER_ROLES).map((role) => ({ value: role, label: ROLE_LABELS[role] })) },
  { key: 'status', section: 'Hak Akses', label: 'Status Akun', type: 'select', defaultValue: 'Aktif', options: [
    { value: 'Aktif', label: 'Aktif' }, { value: 'Nonaktif', label: 'Nonaktif' },
  ] },
];

function UserIdentity({ row }) {
  return (
    <div className="user-name-cell">
      <strong>{row.name}</strong>
    </div>
  );
}

function UserStatus({ value }) {
  const statusClass = value === 'Aktif' ? 'available' : 'maintenance';
  return <span className={`master-status-dot ${statusClass}`}><i />{value || '-'}</span>;
}

async function prepareUserSave({ payload, form, editingId, confirmAction }) {
  const passwordChanged = Boolean(form.password) && form.password !== '********';
  if (passwordChanged) {
    const approved = await confirmAction({
      title: editingId ? 'Simpan perubahan password?' : 'Simpan user baru?',
      message: editingId
        ? 'Password user akan diperbarui ke nilai baru yang Anda isi.'
        : 'User baru akan dibuat beserta password yang Anda isi.',
      confirmLabel: 'Lanjut Simpan',
      cancelLabel: 'Batal',
      tone: 'danger',
    });
    if (!approved) return null;
  }

  return {
    payload: {
      ...payload,
      password: form.password || (editingId ? undefined : form.password),
    },
  };
}

function UsersPage() {
  return (
    <MasterDataPage
      eyebrow="Access Control"
      title="User Management"
      singular="User"
      description="Kelola data user, role, dan status akun."
      fields={fields}
      columns={[
        { key: 'name', label: 'User', render: (_, row) => <UserIdentity row={row} /> },
        { key: 'email', label: 'Email', render: (value) => <span className="master-plain-cell">{value || '-'}</span> },
        { key: 'role', label: 'Role', render: (value) => <span className="master-plain-cell strong">{ROLE_LABELS[value]}</span> },
        { key: 'status', label: 'Status', render: (value) => <UserStatus value={value} /> },
      ]}
      initialRows={fallbackUsers}
      resource="users"
      storageKey="tms-master-users-v2"
      uniqueKeys={['email']}
      filters={[
        { key: 'role', label: 'Semua Role', options: Object.values(USER_ROLES) },
        { key: 'status', label: 'Semua Status Akun', options: ['Aktif', 'Nonaktif'] },
      ]}
      pageClassName="driver-data-page user-data-page"
      pageSize={20}
      showModeChip={false}
      toolbarTitle="Daftar User"
      toolbarDescription="Cari user, email, role, dan status akun."
      beforeSave={prepareUserSave}
      stats={(data) => [
        { label: 'Total User', value: data.length, detail: 'Akun terdaftar' },
        { label: 'Aktif', value: data.filter((item) => item.status === 'Aktif').length, detail: 'Bisa akses' },
        { label: 'Nonaktif', value: data.filter((item) => item.status === 'Nonaktif').length, detail: 'Tidak akses' },
        { label: 'Role', value: new Set(data.map((item) => item.role)).size, detail: 'Dipakai' },
      ]}
    />
  );
}

export default UsersPage;
