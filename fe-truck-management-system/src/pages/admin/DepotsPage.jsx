import { LocationMasterPage } from './LocationMasterPage';

function splitDepotName(value = '') {
  const match = String(value).match(/^(.*?)\s*\((.*?)\)\s*$/);
  if (!match) return { main: value, detail: '' };
  return {
    main: match[1].trim(),
    detail: match[2].trim(),
  };
}

function DepotNameCell({ value, row }) {
  const depot = splitDepotName(value);
  const companyName = row?.companyName || depot.detail;
  return (
    <div className="min-w-0 text-left leading-tight">
      <strong className="block truncate text-sm font-semibold normal-case tracking-normal text-slate-950" title={depot.main || '-'}>
        {depot.main || '-'}
      </strong>
      {companyName ? (
        <span className="mt-1 block truncate text-xs font-medium normal-case tracking-normal text-slate-500" title={companyName}>
          {companyName}
        </span>
      ) : null}
    </div>
  );
}

function NumberCell({ value }) {
  return (
    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-slate-100 px-2 text-xs font-bold text-slate-600">
      {value}
    </span>
  );
}

function CodeCell({ value }) {
  return (
    <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold tracking-wide text-slate-700">
      {value || '-'}
    </span>
  );
}

function DepotsPage() {
  return (
    <LocationMasterPage
      title="Master Depo"
      singular="Depo"
      description="Kelola daftar depo yang dipakai pada input Sales Order."
      resource="depots"
      storageKey="tms-master-depots-v1"
      pageClassName="driver-data-page depot-data-page"
      fields={[
        { key: 'name', section: 'Identitas Depo', label: 'Nama Depo', placeholder: 'Contoh: Depo Marunda', required: true },
        { key: 'companyName', section: 'Identitas Depo', label: 'Nama PT', placeholder: 'Opsional, contoh: PT Depo Lautan Nusantara' },
        { key: 'code', section: 'Identitas Depo', label: 'Kode Depo', placeholder: 'Contoh: DPMRD' },
        { key: 'address', section: 'Alamat', label: 'Alamat / Area', placeholder: 'Contoh: Marunda, Jakarta Utara', full: true },
      ]}
      columns={[
        {
          key: 'number',
          label: 'No',
          headerClassName: '!w-16 !text-center',
          cellClassName: '!w-16 !text-center',
          render: (_value, _row, meta) => <NumberCell value={meta.rowNumber} />,
        },
        {
          key: 'name',
          label: 'Nama Depo',
          headerClassName: '!text-left',
          cellClassName: '!text-left',
          render: (value, row) => <DepotNameCell value={value} row={row} />,
        },
        {
          key: 'code',
          label: 'Kode',
          headerClassName: '!w-36 !text-center',
          cellClassName: '!w-36 !text-center',
          render: (value) => <CodeCell value={value} />,
        },
      ]}
      toolbarDescription="Cari nama depo, kode, dan status."
    />
  );
}

export default DepotsPage;
