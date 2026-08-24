drop index if exists uq_operational_fund_requests_active_date;

create index if not exists idx_operational_fund_requests_active_date
  on operational_fund_requests(request_date)
  where status in ('submitted', 'approved', 'transferred');
