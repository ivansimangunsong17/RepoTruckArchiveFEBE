create table if not exists driver_commission_payment_deductions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references driver_commission_payments(id) on delete cascade,
  deduction_type text not null default 'lainnya'
    check (deduction_type in ('hutang_sopir', 'kasbon', 'penalti', 'lainnya')),
  amount numeric(14, 0) not null check (amount > 0),
  reason text not null,
  operational_note text,
  status text not null default 'active' check (status in ('active', 'void')),
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_by_user_id uuid,
  updated_by_name text,
  updated_at timestamptz not null default now(),
  voided_by_user_id uuid,
  voided_by_name text,
  voided_at timestamptz,
  void_reason text
);

create index if not exists idx_driver_commission_payment_deductions_payment
  on driver_commission_payment_deductions(payment_id, status);
