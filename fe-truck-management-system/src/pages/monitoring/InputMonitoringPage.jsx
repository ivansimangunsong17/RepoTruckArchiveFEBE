import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  ClipboardCheck,
  ClipboardList,
  FileWarning,
  ReceiptText,
  RefreshCw,
} from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import { fetchInputMonitoringReport } from '../../services/reports/reportService';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate, formatDateTime } from '../../utils/formatDate';

const CATEGORY_CONFIG = [
  {
    id: 'missingSoNumber',
    label: 'Belum Nomor SO',
    helper: 'Order yang masih menunggu nomor SO Finance',
    icon: ClipboardList,
    tone: 'sky',
    columns: ['orderDate', 'internalSoNumber', 'customer', 'salesName', 'quantity', 'team', 'ageDays'],
  },
  {
    id: 'missingAssignment',
    label: 'Belum Assignment',
    helper: 'Job yang belum lengkap sopir, truck, atau container',
    icon: ClipboardCheck,
    tone: 'amber',
    columns: ['tripDate', 'accurateSoNumber', 'customer', 'container', 'missingItems', 'team', 'ageDays'],
  },
  {
    id: 'missingCost',
    label: 'Belum Biaya',
    helper: 'UJ/biaya lapangan yang belum beres dicatat atau dicek',
    icon: Banknote,
    tone: 'emerald',
    columns: ['tripDate', 'accurateSoNumber', 'customer', 'container', 'rpujStatus', 'team', 'ageDays'],
  },
  {
    id: 'missingInvoice',
    label: 'Belum Invoice',
    helper: 'Order selesai yang belum punya nomor invoice',
    icon: ReceiptText,
    tone: 'rose',
    columns: ['completedAt', 'accurateSoNumber', 'customer', 'amount', 'quantity', 'team', 'ageDays'],
  },
  {
    id: 'missingDocuments',
    label: 'Dokumen Kurang',
    helper: 'Job selesai dengan dokumen ritasi belum lengkap',
    icon: FileWarning,
    tone: 'slate',
    columns: ['completedAt', 'accurateSoNumber', 'customer', 'container', 'missingItems', 'team', 'ageDays'],
  },
];

const toneClasses = {
  sky: {
    button: 'border-sky-200 bg-sky-50 text-sky-900 hover:border-sky-300',
    active: 'border-sky-500 bg-sky-100 shadow-sm ring-2 ring-sky-100',
    icon: 'bg-sky-100 text-sky-700',
  },
  amber: {
    button: 'border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-300',
    active: 'border-amber-500 bg-amber-100 shadow-sm ring-2 ring-amber-100',
    icon: 'bg-amber-100 text-amber-700',
  },
  emerald: {
    button: 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-300',
    active: 'border-emerald-500 bg-emerald-100 shadow-sm ring-2 ring-emerald-100',
    icon: 'bg-emerald-100 text-emerald-700',
  },
  rose: {
    button: 'border-rose-200 bg-rose-50 text-rose-900 hover:border-rose-300',
    active: 'border-rose-500 bg-rose-100 shadow-sm ring-2 ring-rose-100',
    icon: 'bg-rose-100 text-rose-700',
  },
  slate: {
    button: 'border-slate-200 bg-white text-slate-900 hover:border-slate-300',
    active: 'border-slate-500 bg-slate-50 shadow-sm ring-2 ring-slate-100',
    icon: 'bg-slate-100 text-slate-700',
  },
};

const rpujLabels = {
  pending: 'Belum Diajukan',
  submitted: 'Menunggu Finance',
  approved: 'Disetujui',
  paid: 'Sudah Dibayar',
  rejected: 'Perlu Revisi',
};

function MonitoringBadge({ children, tone = 'slate' }) {
  const classes = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    sky: 'border-sky-200 bg-sky-50 text-sky-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
  }[tone];

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black ${classes}`}>
      {children}
    </span>
  );
}

function formatAge(days) {
  const value = Number(days || 0);
  if (value <= 0) return 'Hari ini';
  return `${value} hari`;
}

function ContainerInfo({ row }) {
  const label = [row.containerNumber, row.containerSize].filter(Boolean).join(' / ');
  if (!label) return <span className="text-slate-400">-</span>;
  return (
    <div>
      <strong className="block text-xs text-slate-950">{label}</strong>
      <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">
        {[row.plateNumber, row.driverName].filter(Boolean).join(' - ') || '-'}
      </span>
    </div>
  );
}

function MissingItems({ row }) {
  const items = row.missingItems || [];
  if (!items.length) return <span className="text-slate-400">-</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.slice(0, 4).map((item) => (
        <MonitoringBadge key={item} tone="amber">{item}</MonitoringBadge>
      ))}
      {items.length > 4 ? <MonitoringBadge>+{items.length - 4}</MonitoringBadge> : null}
    </div>
  );
}

function cellValue(column, row) {
  if (column === 'orderDate') return formatDate(row.orderDate);
  if (column === 'tripDate') return formatDate(row.tripDate);
  if (column === 'completedAt') return formatDateTime(row.completedAt);
  if (column === 'internalSoNumber') return row.internalSoNumber || '-';
  if (column === 'accurateSoNumber') return row.accurateSoNumber || row.internalSoNumber || '-';
  if (column === 'customer') return row.customer || '-';
  if (column === 'salesName') return row.salesName || '-';
  if (column === 'quantity') return row.quantity ? `${row.quantity} container` : '-';
  if (column === 'amount') return formatCurrency(row.amount || 0);
  if (column === 'team') return <MonitoringBadge tone={row.team === 'Finance' ? 'sky' : 'emerald'}>{row.team || '-'}</MonitoringBadge>;
  if (column === 'ageDays') return <span className="font-black text-slate-800">{formatAge(row.ageDays)}</span>;
  if (column === 'container') return <ContainerInfo row={row} />;
  if (column === 'missingItems') return <MissingItems row={row} />;
  if (column === 'rpujStatus') return <MonitoringBadge tone={row.rpujStatus === 'submitted' ? 'sky' : 'amber'}>{rpujLabels[row.rpujStatus] || row.rpujStatus || '-'}</MonitoringBadge>;
  return '-';
}

const columnLabels = {
  orderDate: 'Tanggal Order',
  tripDate: 'Tanggal Jalan',
  completedAt: 'Tanggal Selesai',
  internalSoNumber: 'Nomor Order',
  accurateSoNumber: 'Nomor SO',
  customer: 'Customer',
  salesName: 'Sales',
  quantity: 'Jumlah',
  amount: 'Nilai',
  team: 'PIC',
  ageDays: 'Umur',
  container: 'Container / Unit',
  missingItems: 'Yang Pending',
  rpujStatus: 'Status Biaya',
};

function CategoryButton({ category, active, count, onClick }) {
  const Icon = category.icon;
  const tone = toneClasses[category.tone] || toneClasses.slate;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-4 text-left transition duration-200 ${tone.button} ${active ? tone.active : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="block text-[11px] font-black uppercase text-slate-500">{category.label}</span>
          <strong className="mt-1 block text-2xl font-black text-slate-950">{count}</strong>
        </div>
        <span className={`rounded-lg p-2 ${tone.icon}`}>
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-2 min-h-[34px] text-xs font-semibold leading-relaxed text-slate-600">{category.helper}</p>
    </button>
  );
}

function InputMonitoringPage() {
  const [activeCategoryId, setActiveCategoryId] = useState(CATEGORY_CONFIG[0].id);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const result = await fetchInputMonitoringReport({ limit: 100 });
      setPayload(result);
    } catch (err) {
      setError(err.message || 'Monitoring input gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const activeCategory = useMemo(
    () => CATEGORY_CONFIG.find((item) => item.id === activeCategoryId) || CATEGORY_CONFIG[0],
    [activeCategoryId],
  );
  const rows = payload?.categories?.[activeCategory.id] || [];
  const summary = payload?.summary || {};

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Monitoring"
        title="Monitoring Progress Input"
        description="Pantau pekerjaan yang masih pending tanpa mengubah data operasional atau finance."
        actions={(
          <button
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
            onClick={loadData}
            type="button"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        )}
      />

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          <AlertCircle size={17} />
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {CATEGORY_CONFIG.map((category) => (
          <CategoryButton
            key={category.id}
            category={category}
            active={category.id === activeCategory.id}
            count={summary[category.id] || 0}
            onClick={() => setActiveCategoryId(category.id)}
          />
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-base font-black text-slate-950">{activeCategory.label}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {activeCategory.helper}. Menampilkan {rows.length} dari {summary[activeCategory.id] || 0} data.
            </p>
          </div>
          {payload?.generatedAt ? (
            <span className="text-[11px] font-bold text-slate-400">Update {formatDateTime(payload.generatedAt)}</span>
          ) : null}
        </div>

        <div className="table-wrap overflow-x-auto">
          <table className="responsive-data-table min-w-[1040px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500">
                <th className="w-14 px-4 py-3 font-black">No</th>
                {activeCategory.columns.map((column) => (
                  <th key={column} className="px-4 py-3 font-black">{columnLabels[column]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="responsive-empty-row">
                  <td className="px-4 py-10 text-center text-sm font-semibold text-slate-500" colSpan={activeCategory.columns.length + 1}>
                    Memuat data monitoring...
                  </td>
                </tr>
              ) : rows.length ? rows.map((row, index) => (
                <tr key={`${activeCategory.id}-${row.id}-${row.containerJobId || index}`} className="border-b border-slate-100 transition-colors duration-200 hover:bg-sky-50/60">
                  <td className="px-4 py-3 text-center font-black text-slate-700" data-label="No">{index + 1}</td>
                  {activeCategory.columns.map((column) => (
                    <td key={column} className="px-4 py-3 font-semibold text-slate-700" data-label={columnLabels[column]}>
                      {cellValue(column, row)}
                    </td>
                  ))}
                </tr>
              )) : (
                <tr className="responsive-empty-row">
                  <td className="px-4 py-10 text-center text-sm font-semibold text-slate-500" colSpan={activeCategory.columns.length + 1}>
                    Tidak ada data pending pada kategori ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default InputMonitoringPage;
