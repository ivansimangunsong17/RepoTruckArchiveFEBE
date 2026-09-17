import 'dotenv/config';
import { query } from '../src/db/client.js';

const targetContainers = ['IAAU2879845', 'CSNU8335510'];

async function tableColumns(tableName) {
  const result = await query(
    `select column_name
     from information_schema.columns
     where table_schema = current_schema() and table_name = $1
     order by ordinal_position`,
    [tableName],
  );
  return new Set(result.rows.map((row) => row.column_name));
}

function firstExisting(columns, candidates, fallback = 'null') {
  return candidates.find((column) => columns.has(column)) || fallback;
}

const destinationTable = 'destination_locations';
const destinationColumns = await tableColumns(destinationTable);
const activityColumns = await tableColumns('activity_logs');
const destinationNameColumn = firstExisting(destinationColumns, ['name', 'destination_name']);
const commission20Column = firstExisting(destinationColumns, ['driver_commission_20ft_amount', 'driver_commission_amount']);
const commission40Column = firstExisting(destinationColumns, ['driver_commission_40ft_amount', 'driver_commission_amount']);
const activityMetadataColumn = firstExisting(activityColumns, ['metadata', 'details'], `'{}'::jsonb`);

if (destinationNameColumn === 'null') {
  throw new Error('Kolom nama tujuan tidak ditemukan. Audit dihentikan tanpa perubahan data.');
}

const auditResult = await query(
  `
    with commission_audit as (
      select
        cj.id,
        so.so_number,
        cj.container_number,
        cj.completed_at,
        coalesce(cj.commission_driver_name, cj.assignment_snapshot->>'driver', driver.name, '-') as driver_name,
        cj.destination,
        case
          when upper(replace(cj.container_size, ' ', '')) = '40FT' then coalesce(destination.${commission40Column}, 0)
          else coalesce(destination.${commission20Column}, 0)
        end::numeric as master_commission_amount,
        coalesce(cj.has_driver_commission, false) as has_driver_commission,
        coalesce(cj.driver_commission_amount, 0)::numeric as stored_commission_amount,
        coalesce(cj.commission_status, '') as commission_status,
        exists (
          select 1 from driver_commission_items item
          where item.container_job_id = cj.id and item.voided_at is null
        ) as has_active_commission_item
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      left join drivers driver on driver.id = cj.driver_id
      left join ${destinationTable} destination
        on lower(trim(destination.${destinationNameColumn})) = lower(trim(cj.destination))
      where cj.status = 'completed'
    )
    select *
    from commission_audit
    where master_commission_amount > 0
      and (not has_driver_commission or stored_commission_amount <= 0 or commission_status = 'without_commission')
    order by completed_at desc nulls last, so_number, container_number
  `,
);

const targetResult = await query(
  `
    select cj.id, so.so_number, cj.container_number, cj.completed_at,
           coalesce(cj.commission_driver_name, cj.assignment_snapshot->>'driver', driver.name, '-') as driver_name,
           cj.destination, cj.container_size, cj.has_driver_commission,
           cj.driver_commission_amount, cj.commission_status, cj.updated_by_name, cj.updated_at
    from container_jobs cj
    join sales_orders so on so.id = cj.sales_order_id
    left join drivers driver on driver.id = cj.driver_id
    where upper(replace(cj.container_number, ' ', '')) = any($1::text[])
    order by cj.completed_at desc nulls last
  `,
  [targetContainers],
);

const allRows = [...auditResult.rows, ...targetResult.rows];
let historyRows = [];
if (allRows.length && activityMetadataColumn !== `'{}'::jsonb`) {
  const patterns = [...new Set(allRows.flatMap((row) => [row.id, row.container_number]).filter(Boolean))]
    .map((value) => `%${value}%`);
  const historyResult = await query(
    `select * from activity_logs
     where ${activityMetadataColumn}::text ilike any($1::text[])
     order by created_at asc`,
    [patterns],
  );
  historyRows = historyResult.rows;
}

function historyForJob(job) {
  return historyRows.filter((row) => {
    const searchable = JSON.stringify(row);
    return searchable.includes(String(job.id)) || searchable.includes(String(job.container_number));
  });
}

function classifyHistory(history) {
  const resetEvidence = history.find((row) => {
    const value = JSON.stringify(row).toLowerCase();
    return (value.includes('hasdrivercommission') || value.includes('komisi'))
      && (value.includes('false') || value.includes('without_commission'))
      && (value.includes('100000') || value.includes('true'));
  });
  return resetEvidence ? 'LIKELY_RESET_AFTER_ACTIVE' : 'NO_RESET_EVIDENCE';
}

const withHistory = (rows) => rows.map((row) => {
  const history = historyForJob(row);
  return { ...row, classification: classifyHistory(history), history };
});

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  mode: 'read-only',
  targetContainers: withHistory(targetResult.rows),
  suspiciousCompletedJobs: withHistory(auditResult.rows),
}, null, 2));

process.exit(0);
