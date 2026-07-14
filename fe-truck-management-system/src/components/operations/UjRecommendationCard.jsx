import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';
import { calculateUjRecommendation } from '../../utils/ujRecommendation';

function UjLine({ label, qty, rate, total }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-slate-700">
      <span className="font-medium">{label}</span>
      <span className="text-right tabular-nums">{qty} x {formatCurrency(rate)} = {formatCurrency(total)}</span>
    </div>
  );
}

function UjRecommendationCard({ job, destinations = [] }) {
  const recommendation = calculateUjRecommendation(job, destinations);

  if (!recommendation.hasConfiguredTariff) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong className="block font-semibold">Tarif UJ tujuan belum diatur.</strong>
            <span className="text-amber-800">Lengkapi UJ 20FT/40FT di Master Lokasi Tujuan.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rekomendasi UJ</span>
          <strong className="block text-sm font-semibold text-slate-900">Tujuan: {recommendation.destinationName || '-'}</strong>
        </div>
        <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Bisa dikoreksi manual</span>
      </div>
      <div className="space-y-1.5">
        <UjLine label="20FT" qty={recommendation.qty20ft} rate={recommendation.uj20ft} total={recommendation.totalUj20ft} />
        <UjLine label="40FT" qty={recommendation.qty40ft} rate={recommendation.uj40ft} total={recommendation.totalUj40ft} />
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
        <span className="font-semibold text-slate-600">Total Rekomendasi UJ</span>
        <strong className="text-base font-bold text-slate-950">{formatCurrency(recommendation.totalRecommendedUj)}</strong>
      </div>
      {recommendation.destination?.ujNotes ? (
        <p className="mt-2 text-xs text-slate-500">{recommendation.destination.ujNotes}</p>
      ) : null}
    </div>
  );
}

export default UjRecommendationCard;

