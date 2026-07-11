import { query, withTransaction } from '../../db/client.js';
import { mapContainerJob, mapSalesOrder, toContainerJobDb, toSalesOrderDb } from './sales-orders.mapper.js';

const salesOrderColumnCandidates = [
  'id',
  'customer_id',
  'so_number',
  'do_number',
  'so_date',
  'trip_date',
  'received_at',
  'customer_name',
  'customer_pic',
  'customer_phone',
  'customer_address',
  'shipment_type',
  'job_type',
  'job_description',
  'invoice_number',
  'billing_status',
  'container_summary',
  'line_items',
  'terminal',
  'service_name',
  'do20_quantity',
  'do40_quantity',
  'cargo_type',
  'price',
  'quantity',
  'unit',
  'total_amount',
  'origin',
  'destination',
  'status',
  'sales_name',
  'created_by_name',
  'updated_by_name',
  'created_at',
  'updated_at',
  'cancelled_at',
  'notes',
  'reference_documents',
];

let salesOrderColumnSetPromise = null;

async function getSalesOrderColumnSet(executor = query) {
  if (!salesOrderColumnSetPromise) {
    salesOrderColumnSetPromise = (async () => {
      try {
        const result = await executor(`
          select column_name
          from information_schema.columns
          where table_schema = current_schema()
            and table_name = 'sales_orders'
        `);
        return new Set(result.rows.map((row) => row.column_name));
      } catch (error) {
        salesOrderColumnSetPromise = null;
        throw error;
      }
    })();
  }
  return salesOrderColumnSetPromise;
}

async function getSalesOrderColumns(executor = query) {
  const columnSet = await getSalesOrderColumnSet(executor);
  return salesOrderColumnCandidates.filter((column) => columnSet.has(column)).join(', ');
}

async function filterSalesOrderPayload(payload, executor = query) {
  const columnSet = await getSalesOrderColumnSet(executor);
  return Object.fromEntries(
    Object.entries(payload).filter(([column]) => columnSet.has(column)),
  );
}

const jobColumns = `
  id, sales_order_id, container_number, container_size, container_type, container_notes,
  rpuj_status, rpuj_notes, spk_number, loading_voucher_number, unloading_voucher_number,
  travel_document_number, weighing_document_number, driver_id, vehicle_id, assignment_snapshot,
  status, received_at, running_at, completed_at, created_by_name, updated_by_name,
  created_at, updated_at
`;

const attachmentColumns = `
  id, entity_id, category, reference_number, document_date, file_name, storage_path,
  mime_type, file_size, notes, uploaded_by_name, created_at
`;

function parsePage(options = {}) {
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 20)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function isTruthyFilter(value) {
  return value === true || value === 'true' || value === '1';
}

function buildOrderWhere({ query: keyword = '', status = '', invoiced = false } = {}) {
  const clauses = [];
  const params = [];
  const cleanKeyword = keyword.trim();

  if (cleanKeyword) {
    params.push(`%${cleanKeyword}%`);
    clauses.push(`(so_number ilike $${params.length} or do_number ilike $${params.length} or invoice_number ilike $${params.length} or customer_name ilike $${params.length})`);
  }

  if (status === 'waiting_operational') {
    clauses.push("status in ('received', 'waiting_operational')");
  } else if (status) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }

  if (isTruthyFilter(invoiced)) {
    clauses.push("nullif(btrim(invoice_number), '') is not null");
  }

  return {
    whereSql: clauses.length ? `where ${clauses.join(' and ')}` : '',
    params,
  };
}

async function findCustomer(client, form) {
  if (form.customerId) {
    const result = await client.query('select * from customers where id = $1 and archived_at is null', [form.customerId]);
    return result.rows[0] || null;
  }
  if (!form.customer) return null;
  const result = await client.query('select * from customers where name = $1 and archived_at is null', [form.customer]);
  return result.rows[0] || null;
}

async function fetchOrderAttachments(orderIds) {
  if (!orderIds.length) return {};

  const result = await query(
    `
      select ${attachmentColumns}
      from attachments
      where entity_type = 'sales_order' and entity_id = any($1::uuid[])
      order by created_at asc
    `,
    [orderIds],
  );

  return result.rows.reduce((groups, attachment) => {
    groups[attachment.entity_id] = groups[attachment.entity_id] || [];
    groups[attachment.entity_id].push(attachment);
    return groups;
  }, {});
}

async function fetchOrdersWithJobs(rows) {
  if (!rows.length) return [];
  const [jobs, orderAttachments] = await Promise.all([
    query(
      `
        select ${jobColumns}
        from container_jobs
        where sales_order_id = any($1::uuid[])
        order by created_at asc
      `,
      [rows.map((row) => row.id)],
    ),
    fetchOrderAttachments(rows.map((row) => row.id)),
  ]);

  const jobAttachments = jobs.rows.length
    ? await query(
        `
          select ${attachmentColumns}
          from attachments
          where entity_type = 'container_job' and entity_id = any($1::uuid[])
          order by created_at asc
        `,
        [jobs.rows.map((job) => job.id)],
      )
    : { rows: [] };
  const groupedJobAttachments = jobAttachments.rows.reduce((groups, attachment) => {
    groups[attachment.entity_id] = groups[attachment.entity_id] || [];
    groups[attachment.entity_id].push(attachment);
    return groups;
  }, {});

  const groupedJobs = jobs.rows.reduce((groups, job) => {
    groups[job.sales_order_id] = groups[job.sales_order_id] || [];
    groups[job.sales_order_id].push(job);
    return groups;
  }, {});
  return rows.map((order) => mapSalesOrder(
    order,
    (groupedJobs[order.id] || []).map((job) => mapContainerJob(job, groupedJobAttachments[job.id] || [])),
    orderAttachments[order.id] || [],
  ));
}

async function refreshOrderStatus(client, salesOrderId) {
  const result = await client.query(
    `
      select status, count(*)::int as total
      from container_jobs
      where sales_order_id = $1
      group by status
    `,
    [salesOrderId],
  );
  const counts = Object.fromEntries(result.rows.map((row) => [row.status, row.total]));
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const nextStatus = total > 0 && counts.completed === total
    ? 'completed'
    : counts.running || counts.completed
      ? 'running'
      : 'waiting_operational';

  await client.query(
    'update sales_orders set status = $1, updated_at = now() where id = $2',
    [nextStatus, salesOrderId],
  );
}

export async function findSalesOrdersPage(options = {}) {
  const { pageSize, offset } = parsePage(options);
  const { whereSql, params } = buildOrderWhere(options);
  const { whereSql: summaryWhereSql, params: summaryParams } = buildOrderWhere({ query: options.query });
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;
  const orderColumns = await getSalesOrderColumns();

  const [rowsResult, countResult, summaryResult] = await Promise.all([
    query(
      `
        select ${orderColumns}
        from sales_orders
        ${whereSql}
        order by trip_date asc, created_at desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(`select count(*)::int as total from sales_orders ${whereSql}`, params),
    query(
      `
        with filtered as (
          select id, quantity, status, invoice_number
          from sales_orders
          ${summaryWhereSql}
        )
        select
          (select count(*)::int from filtered) as orders,
          (select count(*)::int from filtered where status in ('received', 'waiting_operational')) as waiting_orders,
          (select count(*)::int from filtered where status = 'running') as running_orders,
          (select count(*)::int from filtered where status = 'completed') as completed_orders,
          (select count(*)::int from filtered where status = 'completed' and nullif(btrim(invoice_number), '') is not null) as invoiced_orders,
          (select count(*)::int from filtered where status = 'cancelled') as cancelled_orders,
          (select coalesce(sum(quantity), 0)::int from filtered) as containers,
          coalesce(count(cj.id) filter (where cj.status = 'completed'), 0)::int as completed_containers,
          coalesce(count(cj.id) filter (where cj.status <> 'completed'), 0)::int as active_containers
        from filtered
        left join container_jobs cj on cj.sales_order_id = filtered.id
      `,
      summaryParams,
    ),
  ]);

  const summary = summaryResult.rows[0] || {};
  const rows = await fetchOrdersWithJobs(rowsResult.rows);
  return {
    rows,
    total: countResult.rows[0]?.total || 0,
    summary: {
      orders: Number(summary.orders || 0),
      containers: Number(summary.containers || 0),
      activeContainers: Number(summary.active_containers || 0),
      completedContainers: Number(summary.completed_containers || 0),
      waitingOrders: Number(summary.waiting_orders || 0),
      runningOrders: Number(summary.running_orders || 0),
      completedOrders: Number(summary.completed_orders || 0),
      invoicedOrders: Number(summary.invoiced_orders || 0),
      cancelledOrders: Number(summary.cancelled_orders || 0),
    },
  };
}

export async function findSalesOrderById(id) {
  const orderColumns = await getSalesOrderColumns();
  const result = await query(`select ${orderColumns} from sales_orders where id = $1`, [id]);
  const rows = await fetchOrdersWithJobs(result.rows);
  return rows[0] || null;
}

export async function createSalesOrder(form) {
  return withTransaction(async (client) => {
    const customer = await findCustomer(client, form);
    const payload = toSalesOrderDb(form, customer);
    const filteredPayload = await filterSalesOrderPayload(payload, client.query.bind(client));
    const entries = Object.entries(filteredPayload);
    const orderColumns = await getSalesOrderColumns(client.query.bind(client));
    const orderResult = await client.query(
      `
        insert into sales_orders (${entries.map(([key]) => key).join(', ')})
        values (${entries.map((_, index) => `$${index + 1}`).join(', ')})
        returning ${orderColumns}
      `,
      entries.map(([, value]) => value),
    );
    const order = orderResult.rows[0];

    for (const container of form.containers || []) {
      const jobPayload = toContainerJobDb(container, order, payload.created_by_name);
      const jobEntries = Object.entries(jobPayload);
      await client.query(
        `
          insert into container_jobs (${jobEntries.map(([key]) => key).join(', ')})
          values (${jobEntries.map((_, index) => `$${index + 1}`).join(', ')})
        `,
        jobEntries.map(([, value]) => value),
      );
    }

    await refreshOrderStatus(client, order.id);
    const finalOrder = await client.query(`select ${orderColumns} from sales_orders where id = $1`, [order.id]);
    const jobs = await client.query(`select ${jobColumns} from container_jobs where sales_order_id = $1 order by created_at asc`, [order.id]);
    const jobAttachments = jobs.rows.length
      ? await client.query(
          `
            select ${attachmentColumns}
            from attachments
            where entity_type = 'container_job' and entity_id = any($1::uuid[])
            order by created_at asc
          `,
          [jobs.rows.map((job) => job.id)],
        )
      : { rows: [] };
    const groupedJobAttachments = jobAttachments.rows.reduce((groups, attachment) => {
      groups[attachment.entity_id] = groups[attachment.entity_id] || [];
      groups[attachment.entity_id].push(attachment);
      return groups;
    }, {});
    const attachments = await client.query(
      `
        select ${attachmentColumns}
        from attachments
        where entity_type = 'sales_order' and entity_id = $1
        order by created_at asc
      `,
      [order.id],
    );
    return mapSalesOrder(
      finalOrder.rows[0],
      jobs.rows.map((job) => mapContainerJob(job, groupedJobAttachments[job.id] || [])),
      attachments.rows,
    );
  });
}

export async function updateSalesOrder(id, form) {
  return withTransaction(async (client) => {
    const orderColumns = await getSalesOrderColumns(client.query.bind(client));
    const existing = await client.query(`select ${orderColumns} from sales_orders where id = $1`, [id]);
    if (!existing.rows[0]) {
      const error = new Error('Sales Order tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'SALES_ORDER_NOT_FOUND';
      throw error;
    }

    const customer = await findCustomer(client, form);
    const payload = toSalesOrderDb(form, customer);
    const filteredPayload = await filterSalesOrderPayload(payload, client.query.bind(client));
    const entries = Object.entries(filteredPayload);
    await client.query(
      `
        update sales_orders
        set ${entries.map(([key], index) => `${key} = $${index + 1}`).join(', ')},
            updated_at = now()
        where id = $${entries.length + 1}
      `,
      [...entries.map(([, value]) => value), id],
    );

    const currentJobs = await client.query('select id, status from container_jobs where sales_order_id = $1', [id]);
    const retainedIds = (form.containers || []).map((container) => container.id).filter(Boolean);
    const removableIds = currentJobs.rows
      .filter((job) => !retainedIds.includes(job.id) && job.status === 'received')
      .map((job) => job.id);
    if (removableIds.length) {
      await client.query('delete from container_jobs where id = any($1::uuid[])', [removableIds]);
    }

    for (const container of form.containers || []) {
      const jobPayload = toContainerJobDb(container, { ...payload, id }, payload.updated_by_name);
      const jobEntries = Object.entries(jobPayload);
      if (container.id && currentJobs.rows.some((job) => job.id === container.id)) {
        await client.query(
          `
            update container_jobs
            set ${jobEntries.map(([key], index) => `${key} = $${index + 1}`).join(', ')},
                updated_at = now()
            where id = $${jobEntries.length + 1}
          `,
          [...jobEntries.map(([, value]) => value), container.id],
        );
      } else {
        await client.query(
          `
            insert into container_jobs (${jobEntries.map(([key]) => key).join(', ')})
            values (${jobEntries.map((_, index) => `$${index + 1}`).join(', ')})
          `,
          jobEntries.map(([, value]) => value),
        );
      }
    }

    await refreshOrderStatus(client, id);
    const finalOrder = await client.query(`select ${orderColumns} from sales_orders where id = $1`, [id]);
    const jobs = await client.query(`select ${jobColumns} from container_jobs where sales_order_id = $1 order by created_at asc`, [id]);
    const jobAttachments = jobs.rows.length
      ? await client.query(
          `
            select ${attachmentColumns}
            from attachments
            where entity_type = 'container_job' and entity_id = any($1::uuid[])
            order by created_at asc
          `,
          [jobs.rows.map((job) => job.id)],
        )
      : { rows: [] };
    const groupedJobAttachments = jobAttachments.rows.reduce((groups, attachment) => {
      groups[attachment.entity_id] = groups[attachment.entity_id] || [];
      groups[attachment.entity_id].push(attachment);
      return groups;
    }, {});
    const attachments = await client.query(
      `
        select ${attachmentColumns}
        from attachments
        where entity_type = 'sales_order' and entity_id = $1
        order by created_at asc
      `,
      [id],
    );
    return mapSalesOrder(
      finalOrder.rows[0],
      jobs.rows.map((job) => mapContainerJob(job, groupedJobAttachments[job.id] || [])),
      attachments.rows,
    );
  });
}

export async function cancelSalesOrder(id) {
  return withTransaction(async (client) => {
    const jobs = await client.query('select status from container_jobs where sales_order_id = $1', [id]);
    if (jobs.rows.some((job) => job.status !== 'received')) {
      const error = new Error('Sales Order tidak bisa dibatalkan karena sudah ada container yang diproses Operational.');
      error.statusCode = 409;
      error.code = 'SALES_ORDER_LOCKED';
      throw error;
    }

    const result = await client.query(
      `
        update sales_orders
        set status = 'cancelled',
            cancelled_at = now(),
            updated_at = now()
        where id = $1
        returning id
      `,
      [id],
    );
    if (!result.rows[0]) {
      const error = new Error('Sales Order tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'SALES_ORDER_NOT_FOUND';
      throw error;
    }
    return result.rows[0];
  });
}
