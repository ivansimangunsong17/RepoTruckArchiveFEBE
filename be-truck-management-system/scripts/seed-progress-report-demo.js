import { closePool, withTransaction } from '../src/db/client.js';

const orders = [
  {
    soNumber: 'DEMO-REPORT-001',
    customer: 'PT CONTOH LOGISTIK CIKARANG',
    shipment: 'import',
    destination: 'Cikarang',
    size: '20FT',
    jobs: ['completed', 'completed', 'completed', 'completed', 'running', 'running', 'repo_stored', 'received'],
  },
  {
    soNumber: 'DEMO-REPORT-002',
    customer: 'PT CONTOH INDUSTRI KARAWANG',
    shipment: 'export',
    destination: 'Karawang',
    size: '40FT',
    jobs: ['completed', 'completed', 'completed', 'running', 'running'],
  },
  {
    soNumber: 'DEMO-REPORT-003',
    customer: 'PT CONTOH DISTRIBUSI BEKASI',
    shipment: 'domestik outward',
    destination: 'Bekasi',
    size: '20FT',
    jobs: ['running', 'received', 'received'],
  },
];

const assignments = [
  { driver: 'ANDI', plateNumber: 'B 9101 DEM' },
  { driver: 'BUDI', plateNumber: 'B 9102 DEM' },
  { driver: 'CANDRA', plateNumber: 'B 9103 DEM' },
  { driver: 'DANI', plateNumber: 'B 9104 DEM' },
  { driver: 'ENDANG', plateNumber: 'B 9105 DEM' },
  { driver: 'FIRMAN', plateNumber: 'B 9106 DEM' },
];

await withTransaction(async (client) => {
  await client.query(`delete from sales_orders where so_number like 'DEMO-REPORT-%'`);

  let assignmentIndex = 0;
  for (const order of orders) {
    const quantity = order.jobs.length;
    const insertedOrder = await client.query(
      `insert into sales_orders (
         so_number, do_number, so_date, trip_date, customer_name, shipment_type,
         job_type, container_summary, line_items, service_name, do20_quantity,
         do40_quantity, cargo_type, quantity, origin, destination, status,
         sales_name, created_by_name, updated_by_name
       ) values (
         $1, $2, current_date, current_date, $3, $4,
         'Trucking Container', $5, $6::jsonb, 'Trucking Container', $7,
         $8, 'Dry', $9, 'Jakarta', $10, 'running',
         'Demo Report', 'Demo Report', 'Demo Report'
       ) returning id`,
      [
        order.soNumber,
        `DO-${order.soNumber}`,
        order.customer,
        order.shipment,
        `${quantity}x${order.size.replace('FT', '')}`,
        JSON.stringify([{ serviceName: 'Trucking Container', size: order.size, qty: quantity, price: 0, total: 0 }]),
        order.size === '20FT' ? quantity : 0,
        order.size === '40FT' ? quantity : 0,
        quantity,
        order.destination,
      ],
    );

    for (let index = 0; index < order.jobs.length; index += 1) {
      const status = order.jobs[index];
      const hasUnit = !(status === 'received' && index >= order.jobs.length - 2);
      const assignment = hasUnit ? assignments[assignmentIndex % assignments.length] : null;
      if (assignment) assignmentIndex += 1;
      await client.query(
        `insert into container_jobs (
           sales_order_id, container_number, container_size, container_type,
           assignment_snapshot, status, running_at, completed_at,
           repo_location, repo_stored_at, created_by_name, updated_by_name
         ) values (
           $1, $2, $3, 'Dry', $4::jsonb, $5,
           case when $5 in ('running', 'completed', 'repo_stored') then now() - interval '2 hours' else null end,
           case when $5 = 'completed' then now() - interval '30 minutes' else null end,
           case when $5 = 'repo_stored' then 'Pool Demo' else null end,
           case when $5 = 'repo_stored' then now() - interval '20 minutes' else null end,
           'Demo Report', 'Demo Report'
         )`,
        [
          insertedOrder.rows[0].id,
          `DEMO-${order.soNumber.slice(-3)}-${String(index + 1).padStart(2, '0')}`,
          order.size,
          JSON.stringify(assignment || {}),
          status,
        ],
      );
    }
  }
});

console.log('Data dummy report dibuat: 3 DO dan 16 ritasi.');
await closePool();
