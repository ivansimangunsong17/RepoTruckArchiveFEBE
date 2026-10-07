import { query } from '../../db/client.js';

// Revenue Repo operasional: satu baris per container yang diambil dari depo titip
// (manual_revenue_lines charge_type 'repo', satu per container_pickup_item).
// - draft dan active dihitung (pickup fisik sudah terjadi; billing adalah konsep terpisah),
//   void tidak dihitung;
// - tanggal = container_pickup_movements.started_at (WIB), bukan tanggal invoice/aktivasi;
// - atribusi ke job, Sales Order, dan customer milik container itu sendiri.
// Baris ini bukan bagian dari tarif transport, jadi tidak ikut calculateCompletedJobRevenue.
export async function getRepoRevenueRows(options = {}, db = { query }) {
  const params = [];
  const clauses = [
    "mrl.charge_type = 'repo'",
    "mrl.status in ('draft', 'active')",
    'cpm.started_at is not null',
    "so.status <> 'cancelled'",
  ];
  if (options.dateFrom) clauses.push(`(cpm.started_at at time zone 'Asia/Jakarta')::date >= $${params.push(options.dateFrom)}::date`);
  if (options.dateToExclusive) clauses.push(`(cpm.started_at at time zone 'Asia/Jakarta')::date < $${params.push(options.dateToExclusive)}::date`);
  if (['realtime', 'historical'].includes(options.entrySource)) {
    clauses.push(`coalesce(cj.entry_source, 'realtime') = $${params.push(options.entrySource)}`);
  }
  if (options.historicalPeriod) {
    clauses.push(`cj.historical_period = $${params.push(String(options.historicalPeriod).trim())}`);
  }

  const result = await db.query(
    `
      select
        mrl.id, mrl.status, mrl.total_amount,
        cpm.id as movement_id, cpm.pickup_type,
        (cpm.started_at at time zone 'Asia/Jakarta')::date as revenue_date,
        cj.id as job_id, cj.container_number, cj.container_size,
        so.id as sales_order_id, so.so_number, so.customer_name,
        coalesce(nullif(cpm.assignment_snapshot->>'plateNumber', ''), v.plate_number) as plate_number,
        coalesce(nullif(cpm.assignment_snapshot->>'driver', ''), d.name) as driver
      from manual_revenue_lines mrl
      join container_pickup_items cpi on cpi.id = mrl.container_pickup_item_id
      join container_pickup_movements cpm on cpm.id = cpi.movement_id
      join container_jobs cj on cj.id = cpi.container_job_id
      join sales_orders so on so.id = cj.sales_order_id
      left join vehicles v on v.id = cpm.vehicle_id
      left join drivers d on d.id = cpm.driver_id
      where ${clauses.join(' and ')}
      order by cpm.started_at desc, cpi.sequence_no asc, mrl.id
    `,
    params,
  );

  return result.rows.map((row) => ({
    id: row.id,
    status: row.status,
    amount: Number(row.total_amount || 0),
    movementId: row.movement_id,
    pickupType: row.pickup_type,
    revenueDate: row.revenue_date,
    jobId: row.job_id,
    containerNumber: row.container_number || '',
    size: row.container_size || '',
    salesOrderId: row.sales_order_id,
    soNumber: row.so_number || '',
    customer: row.customer_name || '',
    plateNumber: row.plate_number || '',
    driver: row.driver || '',
  }));
}
