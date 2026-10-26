import { useEffect, useMemo, useState } from 'react';
import { useArchiveData } from './useArchiveData';
import { fetchActiveOperationalSalesOrders } from '../services/archive/salesOrderService';

// Gabungan 100 SO pertama (archive.orders) dan seluruh SO yang masih punya job aktif, untuk perhitungan
// job aktif di dashboard dan status armada. Versi di archive.orders diutamakan karena state lokalnya
// sudah ter-update setelah aksi user (updateJob dsb).
export function mergeOperationalOrders(recentOrders = [], activeOrders = []) {
  const merged = new Map();
  (activeOrders || []).forEach((order) => {
    if (order?.id) merged.set(order.id, order);
  });
  (recentOrders || []).forEach((order) => {
    if (order?.id) merged.set(order.id, order);
  });
  const recentWithoutId = (recentOrders || []).filter((order) => order && !order.id);
  return [...merged.values(), ...recentWithoutId];
}

// orders: data gabungan; truncated: backend memotong daftar SO aktif di batas maksimum sehingga
// angka job aktif/status armada mungkin belum lengkap dan WAJIB ditandai di UI.
export function useOperationalOrders() {
  const archive = useArchiveData();
  const databaseMode = Boolean(archive.isDatabaseMode);
  const recentOrders = archive.orders;
  const [activeResult, setActiveResult] = useState({ rows: [], truncated: false });

  useEffect(() => {
    if (!databaseMode) return undefined;
    let cancelled = false;
    // Dimuat ulang setiap archive.orders berubah (refresh/updateJob) supaya status armada tidak basi.
    fetchActiveOperationalSalesOrders()
      .then((result) => { if (!cancelled) setActiveResult({ rows: result?.rows || [], truncated: Boolean(result?.truncated) }); })
      .catch(() => { if (!cancelled) setActiveResult({ rows: [], truncated: false }); });
    return () => { cancelled = true; };
  }, [databaseMode, recentOrders]);

  return useMemo(() => ({
    orders: databaseMode ? mergeOperationalOrders(recentOrders, activeResult.rows) : recentOrders || [],
    truncated: databaseMode && activeResult.truncated,
  }), [activeResult, databaseMode, recentOrders]);
}
