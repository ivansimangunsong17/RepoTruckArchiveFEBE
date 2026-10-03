import 'dotenv/config';
import { pool } from '../src/db/client.js';

const applyChanges = process.argv.includes('--apply');

function buildPlannedSizes(order) {
  const size20 = Math.max(0, Number(order.do20_quantity || 0));
  const size40 = Math.max(0, Number(order.do40_quantity || 0));
  const explicit = [...Array(size20).fill('20FT'), ...Array(size40).fill('40FT')];
  const quantity = Math.max(0, Number(order.quantity || 0));
  if (explicit.length >= quantity) return explicit.slice(0, quantity);

  const fallbackSize = String(order.container_summary || '').toUpperCase().includes('40') ? '40FT' : '20FT';
  return [...explicit, ...Array(quantity - explicit.length).fill(fallbackSize)];
}

async function loadAudit(client) {
  const result = await client.query(`
    select so.id,
      coalesce(so.accurate_so_number, so.so_number, so.do_number, so.id::text) as order_number,
      so.customer_name, so.status, so.quantity, so.do20_quantity, so.do40_quantity,
      so.container_summary, so.cargo_type, so.destination, so.destination_id,
      so.warehouse_location_id, so.warehouse_location_name_snapshot,
      so.warehouse_location_address_snapshot, so.received_at, so.created_at, so.updated_at,
      so.created_by_name, so.updated_by_name,
      count(distinct cj.id)::int as existing_jobs,
      count(distinct oft.id)::int as transaction_count,
      (nullif(trim(coalesce(so.invoice_number, '')), '') is not null
        or so.invoice_issued_at is not null
        or so.invoice_document_uploaded_at is not null
        or so.tax_invoice_document_uploaded_at is not null) as has_invoice
    from sales_orders so
    left join container_jobs cj on cj.sales_order_id = so.id
    left join operational_fund_transactions oft on oft.container_job_id = cj.id
    where so.is_vendor_order
    group by so.id
    order by so.created_at
  `);
  return result.rows.map((order) => {
    const plannedSizes = buildPlannedSizes(order);
    return {
      ...order,
      plannedSizes,
      missingSlots: Math.max(0, plannedSizes.length - Number(order.existing_jobs || 0)),
    };
  });
}

async function convertOrder(client, order) {
  const existing = await client.query(
    'select id, container_size from container_jobs where sales_order_id = $1 order by created_at, id for update',
    [order.id],
  );
  const availableBySize = existing.rows.reduce((counts, job) => {
    counts[job.container_size] = (counts[job.container_size] || 0) + 1;
    return counts;
  }, {});
  const missingSizes = order.plannedSizes.filter((size) => {
    if (availableBySize[size] > 0) {
      availableBySize[size] -= 1;
      return false;
    }
    return true;
  });

  for (const size of missingSizes) {
    await client.query(
      `
        insert into container_jobs (
          sales_order_id, execution_source, container_number, container_size,
          container_type, destination, destination_id, warehouse_location_id,
          warehouse_location_name_snapshot, warehouse_location_address_snapshot,
          rpuj_status, assignment_snapshot, status, received_at, completed_at,
          created_by_name, updated_by_name
        ) values (
          $1, 'vendor', null, $2, $3, $4, $5, $6, $7, $8,
          'pending', '{"plateNumber":"VENDOR","driverName":"VENDOR"}'::jsonb,
          $9, $10, $11, $12, $13
        )
      `,
      [
        order.id,
        size,
        order.cargo_type || 'Dry',
        order.destination || '',
        order.destination_id || null,
        order.warehouse_location_id || null,
        order.warehouse_location_name_snapshot || null,
        order.warehouse_location_address_snapshot || null,
        order.status === 'completed' ? 'completed' : 'received',
        order.received_at || order.created_at,
        order.status === 'completed' ? order.updated_at : null,
        order.created_by_name || 'Migration Vendor Lama',
        order.updated_by_name || order.created_by_name || 'Migration Vendor Lama',
      ],
    );
  }

  await client.query(
    `update container_jobs set execution_source = 'vendor', vehicle_id = null, driver_id = null
     where sales_order_id = $1`,
    [order.id],
  );
  await client.query(
    `update sales_orders set is_vendor_order = false, updated_at = updated_at where id = $1`,
    [order.id],
  );
}

async function main() {
  if (!pool) throw new Error('DATABASE_URL belum dikonfigurasi.');
  const client = await pool.connect();
  try {
    const orders = await loadAudit(client);
    console.table(orders.map((order) => ({
      order: order.order_number,
      customer: order.customer_name,
      status: order.status,
      quantity: order.quantity,
      existingJobs: order.existing_jobs,
      missingSlots: order.missingSlots,
      invoice: order.has_invoice,
      transactions: order.transaction_count,
    })));
    console.log(`${orders.length} SO vendor lama ditemukan. Mode: ${applyChanges ? 'APPLY' : 'AUDIT SAJA'}.`);
    if (!applyChanges || orders.length === 0) return;

    await client.query('begin');
    for (const order of orders) await convertOrder(client, order);
    await client.query('commit');
    console.log(`${orders.length} SO berhasil dikonversi ke ritasi vendor.`);
  } catch (error) {
    if (applyChanges) await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
