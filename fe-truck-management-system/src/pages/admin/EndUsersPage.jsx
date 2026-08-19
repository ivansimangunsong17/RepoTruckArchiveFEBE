import { LocationMasterPage, TextCell } from './LocationMasterPage';

function CodeCell({ value }) {
  return (
    <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold tracking-wide text-slate-700">
      {value || '-'}
    </span>
  );
}

function EndUsersPage({ readOnly = false }) {
  return (
    <LocationMasterPage
      title="Master End User"
      singular="End User"
      description="Kelola daftar end user yang digunakan sebagai referensi customer akhir."
      resource="end-users"
      storageKey="tms-master-end-users-v1"
      pageClassName="driver-data-page customer-data-page"
      fields={[
        { key: 'name', section: 'Identitas End User', label: 'Nama End User', placeholder: 'Contoh: PT Customer Akhir Indonesia', required: true },
        { key: 'code', section: 'Identitas End User', label: 'Kode End User', placeholder: 'Contoh: EUI-001' },
        { key: 'address', section: 'Identitas End User', label: 'Alamat End User', type: 'textarea', placeholder: 'Masukkan alamat lengkap end user', full: true },
        { key: 'pic', section: 'PIC & Kontak', label: 'Nama PIC', placeholder: 'Nama penanggung jawab' },
        { key: 'phone', section: 'PIC & Kontak', label: 'Nomor Kontak', placeholder: '021 / 08xx' },
        { key: 'email', section: 'PIC & Kontak', label: 'Email PIC', type: 'email', placeholder: 'pic@enduser.com' },
      ]}
      columns={[
        {
          key: 'name',
          label: 'End User',
          headerClassName: '!text-left',
          cellClassName: '!text-left',
          render: (value) => <TextCell value={value} strong />,
        },
        {
          key: 'code',
          label: 'Kode',
          headerClassName: '!w-36 !text-center',
          cellClassName: '!w-36 !text-center',
          render: (value) => <CodeCell value={value} />,
        },
        {
          key: 'pic',
          label: 'PIC',
          headerClassName: '!text-left',
          cellClassName: '!text-left',
          render: (value) => <TextCell value={value} />,
        },
        {
          key: 'phone',
          label: 'Kontak',
          headerClassName: '!text-left',
          cellClassName: '!text-left',
          render: (value) => <TextCell value={value} />,
        },
      ]}
      statsOverride={(data) => [
        { label: 'Total End User', value: data.length, detail: 'Data terdaftar' },
        { label: 'Aktif', value: data.filter((item) => item.status === 'Aktif').length, detail: 'Bisa dipilih' },
        { label: 'Tidak Aktif', value: data.filter((item) => item.status === 'Tidak Aktif').length, detail: 'Disembunyikan' },
        { label: 'Kontak Ada', value: data.filter((item) => item.pic || item.phone || item.email).length, detail: 'PIC/kontak terisi' },
      ]}
      toolbarDescription="Cari nama end user, kode, PIC, kontak, email, dan status."
      readOnly={readOnly}
    />
  );
}

export default EndUsersPage;
