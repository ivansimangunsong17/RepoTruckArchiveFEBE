import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';
import { calculateUjRecommendation } from '../../utils/ujRecommendation';

function UjRecommendationCard({ job, destinations = [] }) {
  const recommendation = calculateUjRecommendation(job, destinations);

  if (!recommendation.hasConfiguredTariff) {
    const sizeLabel = recommendation.currentSize ? ` ${recommendation.currentSize}` : '';
    const destinationLabel = recommendation.destinationName ? ` untuk ${recommendation.destinationName}` : '';

    return (
      <div className="uj-recommendation-card uj-recommendation-card-warning !block rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <div className="uj-recommendation-warning-layout flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong className="block font-semibold">Tarif UJ{sizeLabel}{destinationLabel} belum diatur.</strong>
            <span className="text-amber-800">Lengkapi UJ 20FT/40FT di Master Lokasi Tujuan.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="uj-recommendation-card !block rounded-md border border-emerald-200 bg-emerald-50/70 px-4 py-3 shadow-sm">
      <div className="uj-recommendation-layout flex flex-col gap-3 md:flex-row md:items-stretch">
        <div className="uj-recommendation-info min-w-0 md:w-56">
          <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Acuan Uang Jalan</span>
          <strong className="mt-0.5 block truncate text-sm font-bold text-slate-950">Tujuan: {recommendation.destinationName || '-'}</strong>
          <span className="mt-1 inline-flex rounded-md border border-emerald-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            Info operational
          </span>
        </div>

        <div className="uj-recommendation-amount-card min-w-0 flex-1 rounded-md border border-emerald-200 bg-white px-3 py-2">
          <div className="uj-recommendation-amount-row flex h-full flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold uppercase text-slate-500">UJ Container Ini</span>
              <strong className="block text-sm font-bold text-slate-950">{recommendation.currentSize || job.size || '-'}</strong>
            </div>
            <strong className="whitespace-nowrap text-xl font-black text-emerald-700">{formatCurrency(recommendation.currentContainerUj)}</strong>
            <div className="w-full border-t border-emerald-100 pt-2">
              <span className="text-[11px] font-bold uppercase text-slate-500">Komisi Sopir</span>
              <strong className="ml-2 text-sm font-black text-slate-900">
                {recommendation.driverCommissionAmount > 0 ? formatCurrency(recommendation.driverCommissionAmount) : '-'}
              </strong>
            </div>
          </div>
        </div>
      </div>
      {recommendation.destination?.ujNotes ? (
        <p className="mt-2 border-t border-emerald-100 pt-2 text-xs text-slate-600">{recommendation.destination.ujNotes}</p>
      ) : null}
    </div>
  );
}

export default UjRecommendationCard;
