import { query } from '../../db/client.js';
import { getCustomerOutstandingRollupPage } from '../finance/finance.repository.js';
import {
  getTransportLineItemForSize,
  splitFinancialLineItems,
} from './revenue-line-items.js';

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

function normalizeEntrySourceFilter(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'historical' || normalized === 'realtime') return normalized;
  return '';
}

function appendEntrySourceFilters(clauses, params, options = {}, alias = 'cj') {
  const entrySource = normalizeEntrySourceFilter(options.entrySource);
  if (entrySource) {
    params.push(entrySource);
    clauses.push(`coalesce(${alias}.entry_source, 'realtime') = $${params.length}`);
  }

  if (options.historicalPeriod) {
    params.push(String(options.historicalPeriod).trim());
    clauses.push(`${alias}.historical_period = $${params.length}`);
  }
}

function timestampToJakartaDateSql(expression) {
  return `(${expression} at time zone 'Asia/Jakarta')::date`;
}

export function calculateCompletedJobRevenue(row = {}) {
  const lineItems = row.line_items ?? row.lineItems;
  const financialItems = splitFinancialLineItems(lineItems);
  if (financialItems.items.length) {
    const transportItem = getTransportLineItemForSize(lineItems, row.container_size || row.containerSize || row.size);
    if (!transportItem) return 0;

    const unitPrice = Number(transportItem.price || 0);
    if (unitPrice > 0) return unitPrice;

    const qty = Math.max(1, Number(transportItem.qty || 1));
    return Number(transportItem.total || 0) / qty;
  }

  const unitPrice = Number(row.price || 0);
  if (unitPrice > 0) return unitPrice;

  const totalAmount = Number(row.total_amount || row.totalAmount || 0);
  const totalContainers = Math.max(1, Number(row.total_containers || row.totalContainers || 1));
  return totalAmount / totalContainers;
}

export function calculateDriverCommissionAmount(row = {}) {
  const hasCommission = Boolean(row.has_driver_commission ?? row.hasDriverCommission);
  if (!hasCommission) return 0;

  const amount = Number(row.driver_commission_amount ?? row.driverCommissionAmount ?? 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function splitDriverCommissionPaymentAmount(row = {}) {
  const amount = calculateDriverCommissionAmount(row);
  const paymentStatus = String(row.commission_payment_status ?? row.commissionPaymentStatus ?? '').trim();
  return {
    paid: paymentStatus === 'paid' ? amount : 0,
    unpaid: amount > 0 && paymentStatus !== 'paid' ? amount : 0,
  };
}

function normalizeSalesName(row = {}) {
  return String(row.sales_name || row.salesName || row.created_by_name || row.createdByName || 'Tanpa Sales').trim() || 'Tanpa Sales';
}

function normalizeCustomerName(row = {}) {
  return String(row.customer_name || row.customerName || row.customer || 'Tanpa Customer').trim() || 'Tanpa Customer';
}

function normalizeSalesOrderId(row = {}) {
  return String(row.id || row.sales_order_id || row.salesOrderId || row.so_number || row.soNumber || '').trim();
}

export function buildSalesPerformanceRows(rows = []) {
  const salesMap = new Map();

  rows.forEach((row) => {
    const salesName = normalizeSalesName(row);
    if (!salesMap.has(salesName)) {
      salesMap.set(salesName, {
        salesName,
        customerKeys: new Set(),
        orderKeys: new Set(),
        customerSummaries: new Map(),
        totalVolume: 0,
        totalRevenue: 0,
        container20ft: 0,
        container40ft: 0,
      });
    }

    const sales = salesMap.get(salesName);
    const customer = normalizeCustomerName(row);
    const customerKey = customer.toLowerCase();
    const orderKey = normalizeSalesOrderId(row);
    const revenue = calculateCompletedJobRevenue(row);
    const size = String(row.container_size || row.containerSize || row.size || '').trim().toUpperCase().replace(/\s/g, '');

    sales.customerKeys.add(customerKey);
    if (orderKey) sales.orderKeys.add(orderKey);
    sales.totalVolume += 1;
    sales.totalRevenue += revenue;
    if (size === '20FT') sales.container20ft += 1;
    if (size === '40FT') sales.container40ft += 1;

    if (!sales.customerSummaries.has(customerKey)) {
      sales.customerSummaries.set(customerKey, {
        customer,
        volume: 0,
        revenue: 0,
      });
    }
    const customerSummary = sales.customerSummaries.get(customerKey);
    customerSummary.volume += 1;
    customerSummary.revenue += revenue;
  });

  return Array.from(salesMap.values())
    .map((sales) => ({
      salesName: sales.salesName,
      customerCount: sales.customerKeys.size,
      completedOrders: sales.orderKeys.size,
      totalVolume: sales.totalVolume,
      totalTrips: sales.totalVolume,
      totalContainers: sales.totalVolume,
      totalRevenue: sales.totalRevenue,
      averageRevenuePerCustomer: sales.customerKeys.size ? sales.totalRevenue / sales.customerKeys.size : 0,
      averageRevenuePerVolume: sales.totalVolume ? sales.totalRevenue / sales.totalVolume : 0,
      container20ft: sales.container20ft,
      container40ft: sales.container40ft,
      customers: Array.from(sales.customerSummaries.values()).sort((left, right) => {
        if (right.revenue !== left.revenue) return right.revenue - left.revenue;
        if (right.volume !== left.volume) return right.volume - left.volume;
        return left.customer.localeCompare(right.customer);
      }),
    }))
    .sort((left, right) => {
      if (right.totalRevenue !== left.totalRevenue) return right.totalRevenue - left.totalRevenue;
      if (right.totalVolume !== left.totalVolume) return right.totalVolume - left.totalVolume;
      return left.salesName.localeCompare(right.salesName);
    });
}

export function summarizeSalesPerformanceRows(rows = []) {
  const customerKeys = new Set();

  rows.forEach((row) => {
    (row.customers || []).forEach((customer) => {
      const key = String(customer.customer || '').trim().toLowerCase();
      if (key) customerKeys.add(key);
    });
  });

  const totalRevenue = rows.reduce((total, row) => total + Number(row.totalRevenue || 0), 0);
  const totalVolume = rows.reduce((total, row) => total + Number(row.totalVolume || 0), 0);

  return {
    totalSales: rows.length,
    activeSales: rows.filter((row) => Number(row.totalVolume || 0) > 0).length,
    totalCustomers: customerKeys.size,
    totalOrders: rows.reduce((total, row) => total + Number(row.completedOrders || 0), 0),
    totalVolume,
    totalContainers: rows.reduce((total, row) => total + Number(row.totalContainers || row.totalVolume || 0), 0),
    totalRevenue,
    averageRevenuePerSales: rows.length ? totalRevenue / rows.length : 0,
    averageRevenuePerVolume: totalVolume ? totalRevenue / totalVolume : 0,
  };
}

function normalizeCustomerKey(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveCustomerPerformanceStatus(row = {}) {
  const revenue = Number(row.totalRevenue || 0);
  const volume = Number(row.totalVolume || 0);
  const outstanding = Number(row.totalOutstandingAmount || 0);
  const overdue = Number(row.overdueAmount || 0);
  const collectionRate = Number(row.collectionRate || 0);

  if (overdue > 0) return 'Perlu Ditagih';
  if (revenue <= 0 && outstanding > 0) return 'Outstanding';
  if (outstanding > 0) return 'Piutang Berjalan';
  if (volume <= 0) return 'Belum Aktif';
  if (collectionRate >= 0.95) return 'Sehat';
  return 'Perlu Dipantau';
}

function createEmptyCustomerPerformanceSummary(customer) {
  return {
    customer,
    salesKeys: new Set(),
    salesNames: new Set(),
    orderKeys: new Set(),
    totalVolume: 0,
    totalRevenue: 0,
    container20ft: 0,
    container40ft: 0,
    lastOrderDate: null,
    totalOutstandingAmount: 0,
    currentAmount: 0,
    overdueAmount: 0,
    overdue1To30Amount: 0,
    overdue31To60Amount: 0,
    overdue61To90Amount: 0,
    overdue90PlusAmount: 0,
    invoiceCount: 0,
    oldestOverdueDays: 0,
    needsReview: false,
  };
}

export function buildCustomerPerformanceRows(rows = [], outstandingRows = []) {
  const customerMap = new Map();

  rows.forEach((row) => {
    const customer = normalizeCustomerName(row);
    const customerKey = normalizeCustomerKey(customer);
    if (!customerMap.has(customerKey)) {
      customerMap.set(customerKey, createEmptyCustomerPerformanceSummary(customer));
    }

    const customerSummary = customerMap.get(customerKey);
    const salesName = normalizeSalesName(row);
    const salesKey = normalizeCustomerKey(salesName);
    const orderKey = normalizeSalesOrderId(row);
    const revenue = calculateCompletedJobRevenue(row);
    const size = String(row.container_size || row.containerSize || row.size || '').trim().toUpperCase().replace(/\s/g, '');
    const completedDate = row.completed_date || row.completedDate || row.trip_date || row.tripDate || null;

    if (salesKey) customerSummary.salesKeys.add(salesKey);
    if (salesName) customerSummary.salesNames.add(salesName);
    if (orderKey) customerSummary.orderKeys.add(orderKey);
    customerSummary.totalVolume += 1;
    customerSummary.totalRevenue += revenue;
    if (size === '20FT') customerSummary.container20ft += 1;
    if (size === '40FT') customerSummary.container40ft += 1;
    if (completedDate && (!customerSummary.lastOrderDate || new Date(completedDate) > new Date(customerSummary.lastOrderDate))) {
      customerSummary.lastOrderDate = completedDate;
    }
  });

  outstandingRows.forEach((row) => {
    const customer = normalizeCustomerName(row);
    const customerKey = normalizeCustomerKey(customer);
    if (!customerMap.has(customerKey)) {
      customerMap.set(customerKey, createEmptyCustomerPerformanceSummary(customer));
    }

    const customerSummary = customerMap.get(customerKey);
    customerSummary.totalOutstandingAmount += Number(row.totalOutstandingAmount || 0);
    customerSummary.currentAmount += Number(row.currentAmount || 0);
    customerSummary.overdueAmount += Number(row.overdueAmount || 0);
    customerSummary.overdue1To30Amount += Number(row.overdue1To30Amount || 0);
    customerSummary.overdue31To60Amount += Number(row.overdue31To60Amount || 0);
    customerSummary.overdue61To90Amount += Number(row.overdue61To90Amount || 0);
    customerSummary.overdue90PlusAmount += Number(row.overdue90PlusAmount || 0);
    customerSummary.invoiceCount += Number(row.invoiceCount || 0);
    customerSummary.oldestOverdueDays = Math.max(customerSummary.oldestOverdueDays, Number(row.oldestOverdueDays || 0));
    customerSummary.needsReview = customerSummary.needsReview || Boolean(row.needsReview);
  });

  return Array.from(customerMap.values())
    .map((customer) => {
      const paidEstimate = Math.max(Number(customer.totalRevenue || 0) - Number(customer.totalOutstandingAmount || 0), 0);
      const collectionRate = customer.totalRevenue > 0 ? paidEstimate / customer.totalRevenue : 0;
      const row = {
        customer: customer.customer,
        salesCount: customer.salesKeys.size,
        salesNames: Array.from(customer.salesNames).sort((left, right) => left.localeCompare(right)),
        completedOrders: customer.orderKeys.size,
        totalVolume: customer.totalVolume,
        totalTrips: customer.totalVolume,
        totalContainers: customer.totalVolume,
        totalRevenue: customer.totalRevenue,
        averageRevenuePerVolume: customer.totalVolume ? customer.totalRevenue / customer.totalVolume : 0,
        container20ft: customer.container20ft,
        container40ft: customer.container40ft,
        totalOutstandingAmount: customer.totalOutstandingAmount,
        currentAmount: customer.currentAmount,
        overdueAmount: customer.overdueAmount,
        overdue1To30Amount: customer.overdue1To30Amount,
        overdue31To60Amount: customer.overdue31To60Amount,
        overdue61To90Amount: customer.overdue61To90Amount,
        overdue90PlusAmount: customer.overdue90PlusAmount,
        invoiceCount: customer.invoiceCount,
        oldestOverdueDays: customer.oldestOverdueDays,
        needsReview: customer.needsReview,
        paidEstimate,
        collectionRate,
        collectionPercent: collectionRate * 100,
        lastOrderDate: customer.lastOrderDate,
      };
      return { ...row, status: resolveCustomerPerformanceStatus(row) };
    })
    .sort((left, right) => {
      if (right.totalOutstandingAmount !== left.totalOutstandingAmount) return right.totalOutstandingAmount - left.totalOutstandingAmount;
      if (right.totalRevenue !== left.totalRevenue) return right.totalRevenue - left.totalRevenue;
      if (right.totalVolume !== left.totalVolume) return right.totalVolume - left.totalVolume;
      return left.customer.localeCompare(right.customer);
    });
}

export function summarizeCustomerPerformanceRows(rows = []) {
  const totalRevenue = rows.reduce((total, row) => total + Number(row.totalRevenue || 0), 0);
  const totalVolume = rows.reduce((total, row) => total + Number(row.totalVolume || 0), 0);
  const totalOutstandingAmount = rows.reduce((total, row) => total + Number(row.totalOutstandingAmount || 0), 0);
  const overdueAmount = rows.reduce((total, row) => total + Number(row.overdueAmount || 0), 0);
  const activeCustomers = rows.filter((row) => Number(row.totalVolume || 0) > 0).length;

  return {
    totalCustomers: rows.length,
    activeCustomers,
    outstandingCustomers: rows.filter((row) => Number(row.totalOutstandingAmount || 0) > 0).length,
    overdueCustomers: rows.filter((row) => Number(row.overdueAmount || 0) > 0).length,
    healthyCustomers: rows.filter((row) => row.status === 'Sehat').length,
    totalOrders: rows.reduce((total, row) => total + Number(row.completedOrders || 0), 0),
    totalVolume,
    totalContainers: rows.reduce((total, row) => total + Number(row.totalContainers || row.totalVolume || 0), 0),
    totalRevenue,
    totalOutstandingAmount,
    overdueAmount,
    averageRevenuePerCustomer: activeCustomers ? totalRevenue / activeCustomers : 0,
    averageRevenuePerVolume: totalVolume ? totalRevenue / totalVolume : 0,
    collectionRate: totalRevenue > 0 ? Math.max(totalRevenue - totalOutstandingAmount, 0) / totalRevenue : 0,
  };
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
             cj.repo_location, cj.repo_stored_at, cj.repo_reason,
             cj.repo_notes, cj.repo_container_condition,
             so.id as sales_order_id, so.so_number, so.customer_name,
             so.shipment_type, so.origin, cj.destination, so.trip_date,
             so.sales_name, so.created_by_name
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      where so.status <> 'cancelled'
        and cj.status in ('received', 'running', 'repo_stored')
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
             so.shipment_type, so.origin, cj.destination, so.trip_date,
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
      repoLocation: row.repo_location || '',
      repoStoredAt: row.repo_stored_at,
      repoReason: row.repo_reason || '',
      repoNotes: row.repo_notes || '',
      repoContainerCondition: row.repo_container_condition || '',
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
        with filtered_orders as (
          select *
          from sales_orders
          ${whereSql}
          order by trip_date desc, created_at desc
          limit $${limitIndex} offset $${offsetIndex}
        )
        select fo.id, fo.so_number, fo.do_number, fo.so_date, fo.trip_date, fo.received_at,
               fo.customer_name, fo.customer_pic, fo.customer_phone, fo.shipment_type,
               fo.job_type, fo.origin, fo.destination, fo.status, fo.quantity, fo.price,
               fo.unit, fo.total_amount, fo.sales_name, fo.created_by_name, fo.notes, fo.created_at,
               coalesce(count(cj.id), 0)::int as planned_containers,
               coalesce(count(cj.id) filter (where cj.status not in ('cancelled')), 0)::int as active_containers,
               coalesce(count(cj.id) filter (where cj.status = 'completed'), 0)::int as completed_containers,
               coalesce(count(cj.id) filter (where cj.status = 'cancelled'), 0)::int as cancelled_containers
        from filtered_orders fo
        left join container_jobs cj on cj.sales_order_id = fo.id
        group by fo.id, fo.so_number, fo.do_number, fo.so_date, fo.trip_date, fo.received_at,
                 fo.customer_name, fo.customer_pic, fo.customer_phone, fo.shipment_type,
                 fo.job_type, fo.origin, fo.destination, fo.status, fo.quantity, fo.price,
                 fo.unit, fo.total_amount, fo.sales_name, fo.created_by_name, fo.notes, fo.created_at
        order by fo.trip_date desc, fo.created_at desc
      `,
      [...params, pageSize, offset],
    ),
    query(`select count(*)::int as total from sales_orders ${whereSql}`, params),
    query(
      `
        with filtered_orders as (
          select id, quantity, total_amount
          from sales_orders
          ${whereSql}
        ),
        job_summary as (
          select
            sales_order_id,
            count(*) filter (where status <> 'cancelled')::int as active_containers,
            count(*) filter (where status = 'completed')::int as completed_containers,
            count(*) filter (where status = 'cancelled')::int as cancelled_containers
          from container_jobs
          where sales_order_id in (select id from filtered_orders)
          group by sales_order_id
        )
        select count(*)::int as orders,
               coalesce(sum(fo.quantity), 0)::int as containers,
               coalesce(sum(js.active_containers), 0)::int as active_containers,
               coalesce(sum(js.completed_containers), 0)::int as completed_containers,
               coalesce(sum(js.cancelled_containers), 0)::int as cancelled_containers,
               coalesce(sum(fo.total_amount), 0)::numeric as revenue
        from filtered_orders fo
        left join job_summary js on js.sales_order_id = fo.id
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
      plannedContainers: Number(row.planned_containers || row.quantity || 0),
      activeContainers: Number(row.active_containers || 0),
      completedContainers: Number(row.completed_containers || 0),
      cancelledContainers: Number(row.cancelled_containers || 0),
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
      activeContainers: summary.rows[0]?.active_containers || 0,
      completedContainers: summary.rows[0]?.completed_containers || 0,
      cancelledContainers: summary.rows[0]?.cancelled_containers || 0,
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
  const clauses = [];
  const params = [period.dateFrom, period.dateToExclusive];
  appendEntrySourceFilters(clauses, params, options, 'cj');
  const sourceWhereSql = clauses.length ? `and ${clauses.join(' and ')}` : '';
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
          cj.destination,
          so.price,
          so.total_amount,
          to_jsonb(so)->'line_items' as line_items,
          cj.container_number,
          cj.container_size,
          ${timestampToJakartaDateSql('cj.completed_at')} as completed_date,
          coalesce(cj.entry_source, 'realtime') as entry_source,
          cj.historical_period,
          nullif(cj.assignment_snapshot->>'driver', '') as driver,
          coalesce(nullif(cj.assignment_snapshot->>'unitCode', ''), v.unit_code, snapshot_vehicle.unit_code) as unit_code,
          nullif(cj.assignment_snapshot->>'plateNumber', '') as plate_number,
          greatest(1, coalesce(nullif(so.quantity, 0), nullif(ojt.total_jobs, 0), 1))::int as total_containers
        from sales_orders so
        join container_jobs cj on cj.sales_order_id = so.id
        left join order_job_totals ojt on ojt.sales_order_id = so.id
        left join vehicles v on v.id = cj.vehicle_id
        left join vehicles snapshot_vehicle on snapshot_vehicle.archived_at is null
          and trim(snapshot_vehicle.plate_number) = trim(nullif(cj.assignment_snapshot->>'plateNumber', ''))
        where so.status <> 'cancelled'
          and cj.status = 'completed'
          ${sourceWhereSql}
      )
      select *
      from completed_jobs
      where completed_date >= $1::date
        and completed_date < $2::date
      order by completed_date desc, plate_number asc nulls last, so_number asc, job_id asc
    `,
    params,
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
    unitCode: row.unit_code || '',
    plateNumber: row.plate_number || '',
    totalContainers: Number(row.total_containers || 0),
    revenue: calculateCompletedJobRevenue(row),
    entrySource: row.entry_source || 'realtime',
    historicalPeriod: row.historical_period || '',
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

export async function getSalesPerformanceReport(options = {}) {
  const period = parseRevenuePeriod(options);
  const clauses = [];
  const params = [period.dateFrom, period.dateToExclusive];
  appendEntrySourceFilters(clauses, params, options, 'cj');
  const sourceWhereSql = clauses.length ? `and ${clauses.join(' and ')}` : '';
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
          so.sales_name,
          so.created_by_name,
          so.price,
          so.total_amount,
          to_jsonb(so)->'line_items' as line_items,
          cj.container_size,
          ${timestampToJakartaDateSql('cj.completed_at')} as completed_date,
          coalesce(cj.entry_source, 'realtime') as entry_source,
          cj.historical_period,
          greatest(1, coalesce(nullif(so.quantity, 0), nullif(ojt.total_jobs, 0), 1))::int as total_containers
        from sales_orders so
        join container_jobs cj on cj.sales_order_id = so.id
        left join order_job_totals ojt on ojt.sales_order_id = so.id
        where so.status <> 'cancelled'
          and cj.status = 'completed'
          ${sourceWhereSql}
      )
      select *
      from completed_jobs
      where completed_date >= $1::date
        and completed_date < $2::date
      order by completed_date desc, sales_name asc nulls last, so_number asc, job_id asc
    `,
    params,
  );

  const rows = buildSalesPerformanceRows(result.rows);

  return {
    period: {
      month: period.month,
      year: period.year,
    },
    rows,
    total: rows.length,
    summary: summarizeSalesPerformanceRows(rows),
  };
}

async function getAllCustomerOutstandingRollupRows() {
  const pageSize = 100;
  const firstPage = await getCustomerOutstandingRollupPage({ page: 1, pageSize });
  const rows = Array.isArray(firstPage.rows) ? [...firstPage.rows] : [];
  const totalPages = Number(firstPage.totalPages || 1);

  for (let page = 2; page <= totalPages; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await getCustomerOutstandingRollupPage({ page, pageSize });
    if (Array.isArray(result.rows)) rows.push(...result.rows);
  }

  return rows;
}

export async function getCustomerPerformanceReport(options = {}) {
  const period = parseRevenuePeriod(options);
  const clauses = [];
  const params = [period.dateFrom, period.dateToExclusive];
  appendEntrySourceFilters(clauses, params, options, 'cj');
  const sourceWhereSql = clauses.length ? `and ${clauses.join(' and ')}` : '';

  const [completedResult, outstandingRows] = await Promise.all([
    query(
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
            so.sales_name,
            so.created_by_name,
            so.price,
            so.total_amount,
            to_jsonb(so)->'line_items' as line_items,
            cj.container_size,
            ${timestampToJakartaDateSql('cj.completed_at')} as completed_date,
            coalesce(cj.entry_source, 'realtime') as entry_source,
            cj.historical_period,
            greatest(1, coalesce(nullif(so.quantity, 0), nullif(ojt.total_jobs, 0), 1))::int as total_containers
          from sales_orders so
          join container_jobs cj on cj.sales_order_id = so.id
          left join order_job_totals ojt on ojt.sales_order_id = so.id
          where so.status <> 'cancelled'
            and cj.status = 'completed'
            ${sourceWhereSql}
        )
        select *
        from completed_jobs
        where completed_date >= $1::date
          and completed_date < $2::date
        order by completed_date desc, customer_name asc, so_number asc, job_id asc
      `,
      params,
    ),
    getAllCustomerOutstandingRollupRows(),
  ]);

  const rows = buildCustomerPerformanceRows(completedResult.rows, outstandingRows);

  return {
    period: {
      month: period.month,
      year: period.year,
    },
    rows,
    total: rows.length,
    summary: summarizeCustomerPerformanceRows(rows),
  };
}

export async function getOperationReport(options = {}) {
  const { pageSize, offset } = parsePage(options);
  const status = String(options.status || '');
  const isFinishedHistory = status === 'finished';
  const dateColumn = isFinishedHistory
    ? `coalesce(${timestampToJakartaDateSql('cj.completed_at')}, ${timestampToJakartaDateSql('cj.cancelled_at')}, so.trip_date)`
    : status === 'completed'
    ? `coalesce(${timestampToJakartaDateSql('cj.completed_at')}, so.trip_date)`
    : status === 'repo_stored'
      ? `coalesce(${timestampToJakartaDateSql('cj.repo_stored_at')}, so.trip_date)`
      : 'so.trip_date';
  const dateFilter = buildDateWhere(dateColumn, options);
  const clauses = [...dateFilter.clauses];
  const params = [...dateFilter.params];

  if (isFinishedHistory) {
    clauses.push("cj.status in ('completed', 'cancelled')");
  } else if (status) {
    params.push(status);
    clauses.push(`cj.status = $${params.length}`);
  }
  if (options.query) {
    params.push(`%${String(options.query).trim()}%`);
    clauses.push(`(
      so.so_number ilike $${params.length}
      or so.do_number ilike $${params.length}
      or so.customer_name ilike $${params.length}
      or so.origin ilike $${params.length}
      or cj.destination ilike $${params.length}
      or cj.container_number ilike $${params.length}
      or cj.assignment_snapshot::text ilike $${params.length}
    )`);
  }
  appendEntrySourceFilters(clauses, params, options, 'cj');

  const whereSql = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;
  const orderBySql = (isFinishedHistory || status === 'completed')
    ? 'order by coalesce(cj.completed_at, cj.cancelled_at) desc nulls last, so.trip_date desc, cj.created_at desc'
    : 'order by so.trip_date desc, cj.created_at desc';
  const [rows, total, summary] = await Promise.all([
    query(
      `
        select cj.id, cj.container_number, cj.container_size, cj.container_type,
               cj.status, cj.rpuj_status, cj.spk_number, cj.loading_voucher_number,
               cj.unloading_voucher_number, cj.travel_document_number,
               cj.weighing_document_number, cj.tila_gatepass_document_number,
               cj.driver_id, cj.vehicle_id,
               cj.received_at, cj.running_at, cj.cancelled_at,
               cj.completed_at, cj.updated_at, cj.assignment_snapshot,
               cj.repo_location, cj.repo_stored_at, cj.repo_eir_number, cj.repo_reason, cj.repo_notes, cj.repo_container_condition,
               cj.repo_released_driver_id, cj.repo_released_vehicle_id,
               cj.repo_created_by_name, cj.repo_picked_up_at, cj.repo_picked_up_by_name,
               coalesce(cj.entry_source, 'realtime') as entry_source, cj.historical_period, cj.historical_notes,
               so.so_number, so.do_number, so.customer_name, so.so_date, so.trip_date,
               so.sales_name, so.created_by_name,
               so.origin, cj.destination,
               coalesce(nullif(cj.assignment_snapshot->>'unitCode', ''), v.unit_code, snapshot_vehicle.unit_code) as unit_code
        from container_jobs cj
        join sales_orders so on so.id = cj.sales_order_id
        left join vehicles v on v.id = cj.vehicle_id
        left join vehicles snapshot_vehicle on snapshot_vehicle.archived_at is null
          and trim(snapshot_vehicle.plate_number) = trim(nullif(cj.assignment_snapshot->>'plateNumber', ''))
        ${whereSql}
        ${orderBySql}
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
               count(*) filter (where cj.status = 'cancelled')::int as cancelled,
               count(*) filter (where cj.status = 'running')::int as running,
               count(*) filter (where cj.status = 'received')::int as received,
               count(*) filter (where cj.status = 'repo_stored')::int as repo_stored
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
      salesName: row.sales_name || row.created_by_name,
      soDate: row.so_date,
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
      driverId: row.driver_id,
      vehicleId: row.vehicle_id,
      driver: row.assignment_snapshot?.driver || null,
      unitCode: row.unit_code || row.assignment_snapshot?.unitCode || '',
      plateNumber: row.assignment_snapshot?.plateNumber || null,
      receivedAt: row.received_at,
      runningAt: row.running_at,
      completedAt: row.completed_at,
      cancelledAt: row.cancelled_at,
      updatedAt: row.updated_at,
      repoLocation: row.repo_location || '',
      repoStoredAt: row.repo_stored_at,
      repoEirNumber: row.repo_eir_number || '',
      repoReason: row.repo_reason || '',
      repoNotes: row.repo_notes || '',
      repoContainerCondition: row.repo_container_condition || '',
      repoReleasedDriverId: row.repo_released_driver_id,
      repoReleasedVehicleId: row.repo_released_vehicle_id,
      repoCreatedByName: row.repo_created_by_name || '',
      repoPickedUpAt: row.repo_picked_up_at,
      repoPickedUpByName: row.repo_picked_up_by_name || '',
      entrySource: row.entry_source || 'realtime',
      historicalPeriod: row.historical_period || '',
      historicalNotes: row.historical_notes || '',
    })),
    total: total.rows[0]?.total || 0,
    summary: summary.rows[0] || { jobs: 0, completed: 0, cancelled: 0, running: 0, received: 0, repo_stored: 0 },
  };
}

export async function getDriverPerformanceReport(options = {}) {
  const month = String(options.month || '').trim();
  const weekFrom = String(options.weekFrom || '').trim();
  const weekTo = String(options.weekTo || '').trim();
  const commissionStatus = String(options.commissionStatus || '').trim();
  const commissionPaymentStatus = String(options.commissionPaymentStatus || options.commission_payment_status || '').trim();
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
  const sourceClauses = [];
  appendEntrySourceFilters(sourceClauses, params, options, 'cj');
  const sourceCondition = sourceClauses.length ? `and ${sourceClauses.join(' and ')}` : '';
  const commissionCondition = commissionStatus === 'with_commission'
    ? 'and coalesce(cj.has_driver_commission, false) and coalesce(cj.driver_commission_amount, 0) > 0'
    : commissionStatus === 'without_commission'
      ? 'and not (coalesce(cj.has_driver_commission, false) and coalesce(cj.driver_commission_amount, 0) > 0)'
      : '';
  const commissionPaymentCondition = {
    unsubmitted: 'and coalesce(has_driver_commission, false) and coalesce(driver_commission_amount, 0) > 0 and commission_batch_status is null',
    submitted: "and commission_batch_status = 'submitted'",
    approved: "and commission_batch_status = 'approved' and coalesce(commission_payment_status, 'pending') <> 'paid'",
    paid: "and commission_payment_status = 'paid'",
    unpaid: "and coalesce(has_driver_commission, false) and coalesce(driver_commission_amount, 0) > 0 and coalesce(commission_payment_status, 'pending') <> 'paid'",
  }[commissionPaymentStatus] || '';

  const [rows, months] = await Promise.all([
    query(
      `
        with order_job_totals as (
          select sales_order_id, count(*)::int as total_jobs
          from container_jobs
          group by sales_order_id
        ),
        completed_jobs as (
          select cj.id,
                 nullif(cj.assignment_snapshot->>'driver', '') as driver,
                 coalesce(${timestampToJakartaDateSql('cj.completed_at')}, so.trip_date) as completed_date,
                 so.price,
                 so.total_amount,
                 to_jsonb(so)->'line_items' as line_items,
                 cj.container_size,
                 cj.has_driver_commission,
                 cj.driver_commission_amount,
                 dcb.status as commission_batch_status,
                 dcp.status as commission_payment_status,
                 dcp.paid_at as commission_paid_at,
                 greatest(1, coalesce(nullif(so.quantity, 0), nullif(ojt.total_jobs, 0), 1))::int as total_containers
          from container_jobs cj
          join sales_orders so on so.id = cj.sales_order_id
          left join order_job_totals ojt on ojt.sales_order_id = so.id
          left join driver_commission_items dci on dci.container_job_id = cj.id and dci.voided_at is null
          left join driver_commission_batches dcb on dcb.id = dci.batch_id
          left join driver_commission_payments dcp on dcp.id = dci.payment_id
          where cj.status = 'completed'
            and so.status <> 'cancelled'
            and nullif(cj.assignment_snapshot->>'driver', '') is not null
            ${sourceCondition}
            ${commissionCondition}
        )
        select *
        from completed_jobs cj
        where true ${monthCondition} ${weekFromCondition} ${weekToCondition} ${commissionPaymentCondition}
        order by completed_date desc, driver asc
      `,
      params,
    ),
    query(`
      select distinct to_char(coalesce(${timestampToJakartaDateSql('cj.completed_at')}, so.trip_date), 'YYYY-MM') as value
      from container_jobs cj
      join sales_orders so on so.id = cj.sales_order_id
      where cj.status = 'completed'
        and nullif(cj.assignment_snapshot->>'driver', '') is not null
      order by value desc
    `),
  ]);

  const drivers = new Map();
  rows.rows.forEach((row) => {
    const driver = row.driver || '';
    if (!drivers.has(driver)) {
      drivers.set(driver, {
        driver,
        weeklyTrips: 0,
        monthlyTrips: 0,
        totalTrips: 0,
        totalRevenue: 0,
        totalDriverCommission: 0,
        paidDriverCommission: 0,
        unpaidDriverCommission: 0,
      });
    }

    const summary = drivers.get(driver);
    const revenue = calculateCompletedJobRevenue(row);
    const driverCommission = calculateDriverCommissionAmount(row);
    const paymentAmount = splitDriverCommissionPaymentAmount(row);
    summary.weeklyTrips += 1;
    summary.monthlyTrips += 1;
    summary.totalTrips += 1;
    summary.totalRevenue += revenue;
    summary.totalDriverCommission += driverCommission;
    summary.paidDriverCommission += paymentAmount.paid;
    summary.unpaidDriverCommission += paymentAmount.unpaid;
  });

  const performanceRows = Array.from(drivers.values())
    .map((row) => ({
      ...row,
      averageRevenuePerTrip: row.totalTrips ? row.totalRevenue / row.totalTrips : 0,
      averageCommissionPerTrip: row.totalTrips ? row.totalDriverCommission / row.totalTrips : 0,
    }))
    .sort((left, right) => {
      if (right.totalRevenue !== left.totalRevenue) return right.totalRevenue - left.totalRevenue;
      if (right.monthlyTrips !== left.monthlyTrips) return right.monthlyTrips - left.monthlyTrips;
      return left.driver.localeCompare(right.driver);
    });

  return {
    rows: performanceRows,
    total: performanceRows.length,
    summary: {
      totalTrips: performanceRows.reduce((total, row) => total + row.totalTrips, 0),
      totalRevenue: performanceRows.reduce((total, row) => total + row.totalRevenue, 0),
      totalDriverCommission: performanceRows.reduce((total, row) => total + row.totalDriverCommission, 0),
      paidDriverCommission: performanceRows.reduce((total, row) => total + row.paidDriverCommission, 0),
      unpaidDriverCommission: performanceRows.reduce((total, row) => total + row.unpaidDriverCommission, 0),
      activeDrivers: performanceRows.filter((row) => row.totalTrips > 0).length,
    },
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
