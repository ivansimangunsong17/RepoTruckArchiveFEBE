import { query } from '../../db/client.js';

function parsePage(options = {}) {
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize || 20)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function buildDateWhere(column, { dateFrom = '', dateTo = '' } = {}, startIndex = 1) {
  const clauses = [];
  const params = [];
  if (dateFrom) {
    params.push(dateFrom);
    clauses.push(`${column} >= $${startIndex + params.length - 1}`);
  }
  if (dateTo) {
    params.push(dateTo);
    clauses.push(`${column} <= $${startIndex + params.length - 1}`);
  }
  return { clauses, params };
}

export async function getDashboardReport() {
  const [orders, jobs, documents, masters, trucks, activeJobs, upcomingJobs] = await Promise.all([
    query(`
      select
        count(*)::int as total_orders,
        count(*) filter (where status = 'waiting_operational')::int as waiting_orders,
        count(*) filter (where status = 'running')::int as running_orders,
        count(*) filter (where status = 'completed')::int as completed_orders,
        count(*) filter (where status = 'cancelled')::int as cancelled_orders,
        coalesce(sum(total_amount), 0)::numeric as revenue
      from sales_orders
    `),
    query(`
      select
        count(*)::int as total_jobs,
        count(*) filter (where status = 'received')::int as received_jobs,
        count(*) filter (where status = 'running')::int as running_jobs,
        count(*) filter (where status = 'completed')::int as completed_jobs,
        count(*) filter (where status = 'cancelled')::int as cancelled_jobs
      from container_jobs
    `),
    query('select count(*)::int as total_documents from attachments'),
    query(`
      select
        (select count(*)::int from customers where archived_at is null) as customers,
        (select count(*)::int from drivers where archived_at is null) as drivers,
        (select count(*)::int from vehicles where archived_at is null) as vehicles
    `),
    query(`
      select v.id, v.unit_code, v.plate_number, v.container_size, v.default_driver_name,
             v.operational_status, v.kir_chassis_number,
             kc.chassis_code, kc.container_size as chassis_size
      from vehicles v
      left join kir_chassis kc on lower(trim(v.kir_chassis_number)) in (
        lower(kc.id::text),
        lower(kc.chassis_code),
        lower(coalesce(kc.kir_number, '')),
        lower(coalesce(kc.plate_number, ''))
      )
      where v.archived_at is null
      order by v.unit_code asc, v.plate_number asc
    `),
    query(`
      select cj.id, cj.container_number, cj.container_size, cj.container_type, cj.status,
             cj.rpuj_status, cj.spk_number, cj.loading_voucher_number,
             cj.unloading_voucher_number, cj.travel_document_number,
             cj.weighing_document_number, cj.tila_gatepass_document_number,
             cj.received_at, cj.running_at,
             cj.completed_at, cj.updated_at, cj.assignment_snapshot,
             so.id as sales_order_id, so.so_number, so.customer_name,
             so.shipment_type, so.origin, so.destination, so.trip_date,
             so.sales_name, so.created_by_name
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      where so.status <> 'cancelled'
        and cj.status in ('received', 'running')
      order by so.trip_date asc, cj.created_at asc
      limit 200
    `),
    query(`
      select cj.id, cj.container_number, cj.container_size, cj.container_type, cj.status,
             cj.rpuj_status, cj.spk_number, cj.loading_voucher_number,
             cj.unloading_voucher_number, cj.travel_document_number,
             cj.weighing_document_number, cj.tila_gatepass_document_number,
             cj.received_at, cj.running_at,
             cj.completed_at, cj.updated_at, cj.assignment_snapshot,
             so.id as sales_order_id, so.so_number, so.customer_name,
             so.shipment_type, so.origin, so.destination, so.trip_date,
             so.sales_name, so.created_by_name
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      where so.status <> 'cancelled'
        and cj.status in ('received', 'running')
        and so.trip_date >= current_date
      order by so.trip_date asc, cj.created_at asc
      limit 500
    `),
  ]);

  return {
    salesOrders: {
      total: orders.rows[0]?.total_orders || 0,
      waiting: orders.rows[0]?.waiting_orders || 0,
      running: orders.rows[0]?.running_orders || 0,
      completed: orders.rows[0]?.completed_orders || 0,
      cancelled: orders.rows[0]?.cancelled_orders || 0,
      revenue: Number(orders.rows[0]?.revenue || 0),
    },
    containerJobs: {
      total: jobs.rows[0]?.total_jobs || 0,
      received: jobs.rows[0]?.received_jobs || 0,
      running: jobs.rows[0]?.running_jobs || 0,
      completed: jobs.rows[0]?.completed_jobs || 0,
      cancelled: jobs.rows[0]?.cancelled_jobs || 0,
    },
    documents: {
      total: documents.rows[0]?.total_documents || 0,
    },
    masters: masters.rows[0] || { customers: 0, drivers: 0, vehicles: 0 },
    trucks: trucks.rows.map((row) => ({
      id: row.id,
      unitCode: row.unit_code,
      plateNumber: row.plate_number,
      capacity: row.container_size || '20FT',
      kirChassisNumber: row.kir_chassis_number || '',
      chassisCode: row.chassis_code || '',
      chassisSize: row.chassis_size || '',
      defaultDriver: row.default_driver_name || '',
      status: row.operational_status || 'Aktif',
    })),
    activeJobs: activeJobs.rows.map((row) => ({
      id: row.id,
      orderId: row.sales_order_id,
      soNumber: row.so_number,
      customer: row.customer_name,
      shipment: row.shipment_type,
      origin: row.origin,
      destination: row.destination,
      salesName: row.sales_name || row.created_by_name,
      containerNumber: row.container_number,
      size: row.container_size,
      type: row.container_type,
      status: row.status,
      rpujStatus: row.rpuj_status,
      spkNumber: row.spk_number,
      loadingVoucher: row.loading_voucher_number,
      tilaGatepassDocument: row.tila_gatepass_document_number || row.unloading_voucher_number || row.weighing_document_number,
      unloadingVoucher: row.unloading_voucher_number,
      travelDocument: row.travel_document_number,
      weighingDocument: row.weighing_document_number,
      driver: row.assignment_snapshot?.driver || null,
      plateNumber: row.assignment_snapshot?.plateNumber || null,
      tripDate: row.trip_date,
      tripDateKey: row.trip_date,
      receivedAt: row.received_at,
      runningAt: row.running_at,
      completedAt: row.completed_at,
      updatedAt: row.updated_at,
    })),
    upcomingJobs: upcomingJobs.rows.map((row) => ({
      id: row.id,
      orderId: row.sales_order_id,
      soNumber: row.so_number,
      customer: row.customer_name,
      shipment: row.shipment_type,
      origin: row.origin,
      destination: row.destination,
      salesName: row.sales_name || row.created_by_name,
      containerNumber: row.container_number,
      size: row.container_size,
      type: row.container_type,
      status: row.status,
      rpujStatus: row.rpuj_status,
      spkNumber: row.spk_number,
      loadingVoucher: row.loading_voucher_number,
      tilaGatepassDocument: row.tila_gatepass_document_number || row.unloading_voucher_number || row.weighing_document_number,
      unloadingVoucher: row.unloading_voucher_number,
      travelDocument: row.travel_document_number,
      weighingDocument: row.weighing_document_number,
      driver: row.assignment_snapshot?.driver || null,
      plateNumber: row.assignment_snapshot?.plateNumber || null,
      tripDate: row.trip_date,
      tripDateKey: row.trip_date,
      receivedAt: row.received_at,
      runningAt: row.running_at,
      completedAt: row.completed_at,
      updatedAt: row.updated_at,
    })),
  };
}

export async function getSalesOrderReport(options = {}) {
  const { pageSize, offset } = parsePage(options);
  const dateFilter = buildDateWhere('trip_date', options);
  const clauses = [...dateFilter.clauses];
  const params = [...dateFilter.params];

  if (options.status) {
    params.push(options.status);
    clauses.push(`status = $${params.length}`);
  }
  if (options.customer) {
    params.push(`%${options.customer}%`);
    clauses.push(`customer_name ilike $${params.length}`);
  }
  if (options.query) {
    params.push(`%${String(options.query).trim()}%`);
    clauses.push(`(
      so_number ilike $${params.length}
      or do_number ilike $${params.length}
      or customer_name ilike $${params.length}
      or origin ilike $${params.length}
      or destination ilike $${params.length}
      or sales_name ilike $${params.length}
    )`);
  }

  const whereSql = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;
  const [rows, total, summary] = await Promise.all([
    query(
      `
        select id, so_number, do_number, so_date, trip_date, received_at,
               customer_name, customer_pic, customer_phone, shipment_type,
               job_type, origin, destination, status, quantity, price,
               unit, total_amount, sales_name, created_by_name, notes, created_at
        from sales_orders
        ${whereSql}
        order by trip_date desc, created_at desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(`select count(*)::int as total from sales_orders ${whereSql}`, params),
    query(
      `
        select count(*)::int as orders,
               coalesce(sum(quantity), 0)::int as containers,
               coalesce(sum(total_amount), 0)::numeric as revenue
        from sales_orders
        ${whereSql}
      `,
      params,
    ),
  ]);

  return {
    rows: rows.rows.map((row) => ({
      id: row.id,
      soNumber: row.so_number,
      doNumber: row.do_number,
      soDate: row.so_date,
      tripDate: row.trip_date,
      receivedAt: row.received_at,
      customer: row.customer_name,
      customerPic: row.customer_pic,
      customerPhone: row.customer_phone,
      shipment: row.shipment_type,
      jobType: row.job_type,
      origin: row.origin,
      destination: row.destination,
      status: row.status,
      quantity: Number(row.quantity || 0),
      price: Number(row.price || 0),
      unit: row.unit,
      totalAmount: Number(row.total_amount || 0),
      salesName: row.sales_name || row.created_by_name,
      createdBy: row.created_by_name,
      notes: row.notes,
      createdAt: row.created_at,
    })),
    total: total.rows[0]?.total || 0,
    summary: {
      orders: summary.rows[0]?.orders || 0,
      containers: summary.rows[0]?.containers || 0,
      revenue: Number(summary.rows[0]?.revenue || 0),
    },
  };
}

function parseRevenuePeriod(options = {}) {
  const now = new Date();
  const year = Number(options.year || now.getFullYear());
  const month = Number(options.month || now.getMonth() + 1);

  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    const error = new Error('Bulan dan tahun laporan revenue tidak valid.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const dateToExclusive = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { year, month, dateFrom, dateToExclusive };
}

export async function getMonthlyRevenueReport(options = {}) {
  const period = parseRevenuePeriod(options);
  const result = await query(
    `
      with order_job_totals as (
        select sales_order_id, count(*)::int as total_jobs
        from container_jobs
        group by sales_order_id
      ),
      completed_jobs as (
        select
          cj.id as job_id,
          so.id,
          so.so_number,
          so.customer_name,
          so.destination,
          so.total_amount,
          cj.container_number,
          cj.container_size,
          cj.completed_at::date as completed_date,
          nullif(cj.assignment_snapshot->>'driver', '') as driver,
          nullif(cj.assignment_snapshot->>'plateNumber', '') as plate_number,
          greatest(1, coalesce(nullif(so.quantity, 0), ojt.total_jobs, 1))::int as total_containers
        from sales_orders so
        join container_jobs cj on cj.sales_order_id = so.id
        left join order_job_totals ojt on ojt.sales_order_id = so.id
        where so.status <> 'cancelled'
          and cj.status = 'completed'
      )
      select *
      from completed_jobs
      where completed_date >= $1::date
        and completed_date < $2::date
      order by completed_date desc, plate_number asc nulls last, so_number asc, job_id asc
    `,
    [period.dateFrom, period.dateToExclusive],
  );

  const rows = result.rows.map((row) => ({
    id: row.id,
    jobId: row.job_id,
    completedDate: row.completed_date,
    soNumber: row.so_number,
    customer: row.customer_name,
    destination: row.destination,
    container: row.container_number || row.container_size || '-',
    size: row.container_size,
    driver: row.driver || '',
    plateNumber: row.plate_number || '',
    totalContainers: Number(row.total_containers || 0),
    revenue: Number(row.total_amount || 0) / Math.max(1, Number(row.total_containers || 0)),
  }));

  return {
    period: {
      month: period.month,
      year: period.year,
    },
    rows,
    summary: {
      totalRevenue: rows.reduce((total, row) => total + row.revenue, 0),
      totalOrders: new Set(rows.map((row) => row.id)).size,
      totalContainers: rows.length,
      totalTrucks: new Set(rows.map((row) => row.plateNumber).filter(Boolean)).size,
      totalTrips: rows.length,
    },
  };
}

export async function getOperationReport(options = {}) {
  const { pageSize, offset } = parsePage(options);
  const dateColumn = options.status === 'completed'
    ? 'coalesce(cj.completed_at, so.trip_date)::date'
    : 'so.trip_date';
  const dateFilter = buildDateWhere(dateColumn, options);
  const clauses = [...dateFilter.clauses];
  const params = [...dateFilter.params];

  if (options.status) {
    params.push(options.status);
    clauses.push(`cj.status = $${params.length}`);
  }
  if (options.query) {
    params.push(`%${String(options.query).trim()}%`);
    clauses.push(`(
      so.so_number ilike $${params.length}
      or so.do_number ilike $${params.length}
      or so.customer_name ilike $${params.length}
      or so.origin ilike $${params.length}
      or so.destination ilike $${params.length}
      or cj.container_number ilike $${params.length}
      or cj.assignment_snapshot::text ilike $${params.length}
    )`);
  }

  const whereSql = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;
  const [rows, total, summary] = await Promise.all([
    query(
      `
        select cj.id, cj.container_number, cj.container_size, cj.container_type,
               cj.status, cj.rpuj_status, cj.spk_number, cj.loading_voucher_number,
               cj.unloading_voucher_number, cj.travel_document_number,
               cj.weighing_document_number, cj.tila_gatepass_document_number,
               cj.received_at, cj.running_at,
               cj.completed_at, cj.updated_at, cj.assignment_snapshot,
               so.so_number, so.do_number, so.customer_name, so.trip_date,
               so.origin, so.destination
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        ${whereSql}
        order by so.trip_date desc, cj.created_at desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(
      `
        select count(*)::int as total
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        ${whereSql}
      `,
      params,
    ),
    query(
      `
        select count(*)::int as jobs,
               count(*) filter (where cj.status = 'completed')::int as completed,
               count(*) filter (where cj.status = 'running')::int as running,
               count(*) filter (where cj.status = 'received')::int as received
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        ${whereSql}
      `,
      params,
    ),
  ]);

  return {
    rows: rows.rows.map((row) => ({
      id: row.id,
      soNumber: row.so_number,
      doNumber: row.do_number,
      customer: row.customer_name,
      tripDate: row.trip_date,
      origin: row.origin,
      destination: row.destination,
      containerNumber: row.container_number,
      size: row.container_size,
      type: row.container_type,
      status: row.status,
      rpujStatus: row.rpuj_status,
      spkNumber: row.spk_number,
      loadingVoucher: row.loading_voucher_number,
      tilaGatepassDocument: row.tila_gatepass_document_number || row.unloading_voucher_number || row.weighing_document_number,
      unloadingVoucher: row.unloading_voucher_number,
      travelDocument: row.travel_document_number,
      weighingDocument: row.weighing_document_number,
      driver: row.assignment_snapshot?.driver || null,
      plateNumber: row.assignment_snapshot?.plateNumber || null,
      receivedAt: row.received_at,
      runningAt: row.running_at,
      completedAt: row.completed_at,
      updatedAt: row.updated_at,
    })),
    total: total.rows[0]?.total || 0,
    summary: summary.rows[0] || { jobs: 0, completed: 0, running: 0, received: 0 },
  };
}

export async function getDriverPerformanceReport(options = {}) {
  const month = String(options.month || '').trim();
  const weekFrom = String(options.weekFrom || '').trim();
  const weekTo = String(options.weekTo || '').trim();
  const params = [];
  const monthFilter = month && month !== 'all' ? month : '';

  const monthCondition = monthFilter
    ? `and to_char(completed_date, 'YYYY-MM') = $${params.push(monthFilter)}`
    : '';
  const weekFromCondition = weekFrom
    ? `and completed_date >= $${params.push(weekFrom)}`
    : '';
  const weekToCondition = weekTo
    ? `and completed_date <= $${params.push(weekTo)}`
    : '';

  const [rows, months] = await Promise.all([
    query(
      `
        with completed_jobs as (
          select cj.id,
                 nullif(cj.assignment_snapshot->>'driver', '') as driver,
                 coalesce(cj.completed_at, so.trip_date)::date as completed_date
          from container_jobs cj
          join sales_orders so on so.id = cj.sales_order_id
          where cj.status = 'completed'
            and nullif(cj.assignment_snapshot->>'driver', '') is not null
        )
        select driver,
               count(*) filter (where true ${monthCondition})::int as monthly_trips,
               count(*) filter (where true ${weekFromCondition} ${weekToCondition})::int as weekly_trips,
               count(*)::int as total_trips
        from completed_jobs cj
        group by driver
        order by monthly_trips desc, weekly_trips desc, driver asc
      `,
      params,
    ),
    query(`
      select distinct to_char(coalesce(cj.completed_at, so.trip_date)::date, 'YYYY-MM') as value
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      where cj.status = 'completed'
        and nullif(cj.assignment_snapshot->>'driver', '') is not null
      order by value desc
    `),
  ]);

  return {
    rows: rows.rows.map((row) => ({
      driver: row.driver,
      weeklyTrips: Number(row.weekly_trips || 0),
      monthlyTrips: Number(row.monthly_trips || 0),
      totalTrips: Number(row.total_trips || 0),
    })),
    total: rows.rows.length,
    months: months.rows.map((row) => ({
      value: row.value,
      label: new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' })
        .format(new Date(`${row.value}-01T00:00:00`)),
    })),
  };
}

export async function getDocumentReport(options = {}) {
  const { pageSize, offset } = parsePage(options);
  const dateFilter = buildDateWhere('created_at::date', options);
  const clauses = [...dateFilter.clauses];
  const params = [...dateFilter.params];

  if (options.entityType) {
    params.push(options.entityType);
    clauses.push(`entity_type = $${params.length}`);
  }

  const whereSql = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;
  const [rows, total, summary] = await Promise.all([
    query(
      `
        select id, entity_type, entity_id, category, reference_number,
               document_date, file_name, mime_type, file_size, uploaded_by_name, created_at
        from attachments
        ${whereSql}
        order by created_at desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      [...params, pageSize, offset],
    ),
    query(`select count(*)::int as total from attachments ${whereSql}`, params),
    query(
      `
        select count(*)::int as documents,
               coalesce(sum(file_size), 0)::bigint as total_size
        from attachments
        ${whereSql}
      `,
      params,
    ),
  ]);

  return {
    rows: rows.rows.map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      category: row.category,
      referenceNumber: row.reference_number,
      documentDate: row.document_date,
      fileName: row.file_name,
      mimeType: row.mime_type,
      fileSize: row.file_size == null ? 0 : Number(row.file_size),
      uploadedByName: row.uploaded_by_name,
      createdAt: row.created_at,
    })),
    total: total.rows[0]?.total || 0,
    summary: {
      documents: summary.rows[0]?.documents || 0,
      totalSize: Number(summary.rows[0]?.total_size || 0),
    },
  };
}
