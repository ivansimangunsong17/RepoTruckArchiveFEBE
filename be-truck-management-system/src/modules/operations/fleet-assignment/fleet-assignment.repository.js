import { query } from '../../../db/client.js';

function mapFleetAssignmentRow(row) {
  return {
    id: row.id,
    unitCode: row.unit_code,
    plateNumber: row.plate_number,
    containerSize: row.current_chassis_size || '',
    status: row.operational_status || 'Aktif',
    defaultDriverId: row.default_driver_id,
    defaultDriverName: row.default_driver_name || '',
    defaultDriverStatus: row.default_driver_status || '',
    currentChassisId: row.current_chassis_id,
    currentChassisCode: row.current_chassis_code || '',
    currentChassisStatus: row.current_chassis_status || '',
  };
}

function mapAssignmentHistoryRow(row) {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    changeType: row.change_type,
    source: row.source || 'fleet_assignment',
    previousDriverId: row.previous_driver_id,
    previousDriverName: row.previous_driver_name || '',
    nextDriverId: row.next_driver_id,
    nextDriverName: row.next_driver_name || '',
    previousChassisId: row.previous_chassis_id,
    previousChassisCode: row.previous_chassis_code || '',
    nextChassisId: row.next_chassis_id,
    nextChassisCode: row.next_chassis_code || '',
    reason: row.reason || '',
    note: row.note || '',
    changedByName: row.changed_by_name || '',
    changedByRole: row.changed_by_role || '',
    createdAt: row.created_at,
  };
}

export async function listFleetAssignments(options = {}) {
  const clauses = ["v.archived_at is null", "coalesce(v.unit_kind, 'TRUCK') in ('TRUCK', 'HEAD')"];
  const params = [];

  const keyword = String(options.query || '').trim();
  if (keyword) {
    params.push(`%${keyword}%`);
    clauses.push(`(v.unit_code ilike $${params.length} or v.plate_number ilike $${params.length} or v.default_driver_name ilike $${params.length} or v.current_chassis_code ilike $${params.length})`);
  }

  if (options.status) {
    params.push(options.status);
    clauses.push(`v.operational_status = $${params.length}`);
  }

  if (options.size) {
    params.push(options.size);
    clauses.push(`kc.container_size = $${params.length}`);
  }

  if (options.condition === 'complete') {
    clauses.push('v.default_driver_id is not null and v.current_chassis_id is not null');
  } else if (options.condition === 'no_driver') {
    clauses.push('v.default_driver_id is null');
  } else if (options.condition === 'no_chassis') {
    clauses.push('v.current_chassis_id is null');
  }

  const [rowsResult, activeDriversResult] = await Promise.all([
    query(
      `
        select
          v.id, v.unit_code, v.plate_number, v.container_size, v.operational_status,
          v.default_driver_id, v.default_driver_name, v.current_chassis_id, v.current_chassis_code,
          d.operational_status as default_driver_status,
          kc.operational_status as current_chassis_status,
          kc.container_size as current_chassis_size
        from vehicles v
        left join drivers d on d.id = v.default_driver_id
        left join kir_chassis kc on kc.id = v.current_chassis_id
        where ${clauses.join(' and ')}
        order by v.unit_code asc, v.plate_number asc
      `,
      params,
    ),
    query("select distinct driver_id from container_jobs where status = 'running' and driver_id is not null"),
  ]);

  return {
    rows: rowsResult.rows.map(mapFleetAssignmentRow),
    driversOnActiveTrip: activeDriversResult.rows.map((row) => row.driver_id),
  };
}

export async function getVehicleAssignmentHistory(vehicleId) {
  const vehicleResult = await query('select id from vehicles where id = $1', [vehicleId]);
  if (!vehicleResult.rows[0]) {
    const error = new Error('Unit tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'FLEET_ASSIGNMENT_VEHICLE_NOT_FOUND';
    throw error;
  }

  const historyResult = await query(
    `
      select id, vehicle_id, change_type, source,
             previous_driver_id, previous_driver_name, next_driver_id, next_driver_name,
             previous_chassis_id, previous_chassis_code, next_chassis_id, next_chassis_code,
             reason, note, changed_by_name, changed_by_role, created_at
      from vehicle_assignment_history
      where vehicle_id = $1
      order by created_at desc
    `,
    [vehicleId],
  );
  return historyResult.rows.map(mapAssignmentHistoryRow);
}

export async function recordVehicleAssignmentHistory({
  vehicleId,
  changeType,
  source = 'fleet_assignment',
  previousDriverId = null,
  previousDriverName = null,
  nextDriverId = null,
  nextDriverName = null,
  previousChassisId = null,
  previousChassisCode = null,
  nextChassisId = null,
  nextChassisCode = null,
  reason = null,
  note = null,
  actorName = null,
  actorRole = null,
}, client = null) {
  const execute = client ? client.query.bind(client) : query;
  await execute(
    `
      insert into vehicle_assignment_history (
        vehicle_id, change_type, source,
        previous_driver_id, previous_driver_name, next_driver_id, next_driver_name,
        previous_chassis_id, previous_chassis_code, next_chassis_id, next_chassis_code,
        reason, note, changed_by_name, changed_by_role
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `,
    [
      vehicleId, changeType, source,
      previousDriverId, previousDriverName, nextDriverId, nextDriverName,
      previousChassisId, previousChassisCode, nextChassisId, nextChassisCode,
      reason, note, actorName, actorRole,
    ],
  );
}
