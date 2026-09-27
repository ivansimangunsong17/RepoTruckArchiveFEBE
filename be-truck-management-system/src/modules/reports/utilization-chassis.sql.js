// A history row with a null chassis represents a detach, not a missing history row.
const hasSnapshot = `(nullif(cj.assignment_snapshot->>'chassisSize', '') is not null
  or nullif(cj.assignment_snapshot->>'chassisId', '') is not null
  or (cj.assignment_snapshot ?& array['chassisId', 'chassisCode', 'chassisSize']))`;

export const utilizationChassisSizeSql = `case
  when ${hasSnapshot} then coalesce(nullif(cj.assignment_snapshot->>'chassisSize', ''), snapshot_assignment_chassis.container_size)
  when history_before.id is not null then chassis_before.container_size
  when history_after.id is not null then chassis_after.container_size
  else current_chassis.container_size
end`;

export const utilizationChassisSourceSql = `case
  when ${hasSnapshot} then 'snapshot'
  when history_before.id is not null then 'history_before'
  when history_after.id is not null then 'history_after'
  else 'current'
end`;

export const utilizationChassisJoinsSql = `
  left join vehicles v on v.id = cj.vehicle_id
  left join lateral (
    select candidate.* from vehicles candidate
    where cj.vehicle_id is null
      and trim(candidate.plate_number) = trim(nullif(cj.assignment_snapshot->>'plateNumber', ''))
    order by (candidate.archived_at is null) desc, candidate.created_at desc, candidate.id
    limit 1
  ) snapshot_vehicle on true
  left join kir_chassis snapshot_assignment_chassis
    on snapshot_assignment_chassis.id::text = nullif(cj.assignment_snapshot->>'chassisId', '')
  left join kir_chassis current_chassis
    on current_chassis.id = coalesce(v.current_chassis_id, snapshot_vehicle.current_chassis_id)
  left join lateral (
    -- A date-only legacy trip uses the start of that day in WIB.
    select coalesce(cj.completed_at, so.trip_date::timestamp at time zone 'Asia/Jakarta') as effective_at
  ) report_time on true
  left join lateral (
    select h.id, h.next_chassis_id
    from vehicle_assignment_history h
    where h.vehicle_id = coalesce(cj.vehicle_id, snapshot_vehicle.id)
      and h.change_type = 'chassis'
      and h.created_at <= report_time.effective_at
    order by h.created_at desc, h.id desc
    limit 1
  ) history_before on true
  left join kir_chassis chassis_before on chassis_before.id = history_before.next_chassis_id
  left join lateral (
    select h.id, h.previous_chassis_id
    from vehicle_assignment_history h
    where history_before.id is null
      and h.vehicle_id = coalesce(cj.vehicle_id, snapshot_vehicle.id)
      and h.change_type = 'chassis'
      and h.created_at > report_time.effective_at
    order by h.created_at asc, h.id asc
    limit 1
  ) history_after on true
  left join kir_chassis chassis_after on chassis_after.id = history_after.previous_chassis_id
`;
