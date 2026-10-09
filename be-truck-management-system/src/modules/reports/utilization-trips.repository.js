import { query } from '../../db/client.js';

// One row is one FINALLY completed internal Container Job. Repo storage does not yet count
// as a ritasi. Keep attribution on the original assignment released at Repo storage.
// Repo pickup movements (single or combo 2x20) deliberately add NO truck/driver utilization;
// their truck/driver stay on container_pickup_movements for history, Repo UJ, Repo revenue
// and lifecycle.
export async function getUtilizationTripRows(options = {}, db = { query }) {
  const params = [];
  const dateClauses = [];
  if (options.dateFrom) dateClauses.push(`trip_date >= $${params.push(options.dateFrom)}::date`);
  if (options.dateTo) dateClauses.push(`trip_date <= $${params.push(options.dateTo)}::date`);
  const sourceClauses = [];
  if (['realtime', 'historical'].includes(options.entrySource)) {
    sourceClauses.push(`coalesce(cj.entry_source, 'realtime') = $${params.push(options.entrySource)}`);
  }
  if (options.historicalPeriod) {
    sourceClauses.push(`cj.historical_period = $${params.push(options.historicalPeriod)}`);
  }
  const sourceSql = sourceClauses.length ? `and ${sourceClauses.join(' and ')}` : '';
  const dateSql = dateClauses.length ? `where ${dateClauses.join(' and ')}` : '';
  const result = await db.query(`
    with physical_trips as (
      select
        'job:' || cj.id::text as id, cj.id as job_id, 'container_job'::text as trip_source,
        null::uuid as movement_id, cj.status,
        cj.completed_at as trip_at,
        (cj.completed_at at time zone 'Asia/Jakarta')::date as trip_date,
        coalesce(cj.repo_released_vehicle_id, history.previous_vehicle_id, cj.vehicle_id) as vehicle_id,
        coalesce(cj.repo_released_driver_id, history.previous_driver_id, cj.driver_id) as driver_id,
        coalesce(nullif(history.previous_plate_number, ''),
          case when cj.repo_stored_at is null or cj.repo_picked_up_at is null then cj.assignment_snapshot->>'plateNumber' end,
          original_vehicle.plate_number) as plate_number,
        coalesce(nullif(history.previous_driver_name, ''),
          case when cj.repo_stored_at is null or cj.repo_picked_up_at is null then cj.assignment_snapshot->>'driver' end,
          original_driver.name) as driver,
        original_vehicle.unit_code, original_vehicle.chassis_size,
        cj.container_number, cj.container_size, cj.destination,
        cj.running_at, cj.inap_started_at, cj.inap_ended_at, cj.inap_reason,
        so.customer_name as customer, so.so_number, so.origin,
        coalesce(cj.entry_source, 'realtime') as entry_source
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      left join lateral (
        select h.previous_vehicle_id, h.previous_driver_id,
          h.previous_plate_number, h.previous_driver_name
        from container_job_assignment_history h
        where h.container_job_id = cj.id
          and h.change_source in ('repo_pickup', 'repo_combo_pickup')
        order by h.created_at asc, h.id asc limit 1
      ) history on true
      left join vehicles original_vehicle on original_vehicle.id = coalesce(cj.repo_released_vehicle_id, history.previous_vehicle_id, cj.vehicle_id)
      left join drivers original_driver on original_driver.id = coalesce(cj.repo_released_driver_id, history.previous_driver_id, cj.driver_id)
      where cj.status = 'completed'
        and cj.completed_at is not null
        and coalesce(cj.execution_source, 'internal') = 'internal'
        and so.status <> 'cancelled' ${sourceSql}
    )
    select * from physical_trips ${dateSql}
    order by trip_at desc, id
  `, params);
  return result.rows.map((row) => ({
    id: row.id, jobId: row.job_id, movementId: row.movement_id,
    tripSource: row.trip_source, status: row.status,
    completedDate: row.trip_date, completedAt: row.trip_at,
    vehicleId: row.vehicle_id, driverId: row.driver_id,
    plateNumber: row.plate_number || '', driver: row.driver || '',
    unitCode: row.unit_code || '', chassisSize: row.chassis_size || '',
    containerNumber: row.container_number || '', size: row.container_size || '',
    runningAt: row.running_at, inapStartedAt: row.inap_started_at,
    inapEndedAt: row.inap_ended_at, inapReason: row.inap_reason || '',
    destination: row.destination || '', customer: row.customer || '',
    soNumber: row.so_number || '', origin: row.origin || '',
    entrySource: row.entry_source,
  }));
}
