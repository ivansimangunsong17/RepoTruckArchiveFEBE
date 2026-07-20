insert into system_settings (setting_key, setting_value)
values (
  'archive',
  '{
    "companyName": "PT Armada Baru",
    "frontendHost": "React.js / Vite",
    "backendHost": "Node.js API",
    "databaseHost": "PostgreSQL",
    "scope": "MVP sampai archive perjalanan"
  }'::jsonb
)
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
    updated_at = now();

insert into customers (name, address, pic_name, phone, contract_status)
values
  ('PT Sumber Logistik', 'Cikupa, Banten', 'Nadia Putri', '021-5211-8800', 'Aktif'),
  ('PT Lautan Niaga', 'Cikarang, Jawa Barat', 'Dian Prasetyo', '021-8980-1234', 'Aktif'),
  ('PT Mayora Indah', 'Bekasi, Jawa Barat', 'Maya Kusuma', '021-8877-2200', 'Aktif'),
  ('PT Cipta Retail', 'Cibitung, Jawa Barat', 'Rini Amanda', '021-7788-5544', 'Aktif')
on conflict (name) do update
set address = excluded.address,
    pic_name = excluded.pic_name,
    phone = excluded.phone,
    contract_status = excluded.contract_status,
    updated_at = now();

delete from drivers a
using drivers b
where a.name = b.name
  and a.ctid > b.ctid;

insert into drivers (name, phone, license_type, license_expiry_date, operational_status, health_status)
select item.name, item.phone, item.license_type, item.license_expiry_date::date, item.operational_status, item.health_status
from (
  values
    ('Andi Pratama', '0812-8821-1200', 'SIM B2 Umum', '2027-03-18', 'Bertugas', 'Aman'),
    ('Bambang Wijaya', '0813-9920-7711', 'SIM B2 Umum', '2027-04-22', 'Bertugas', 'Aman'),
    ('Rudi Hartono', '0857-1128-4400', 'SIM B2 Umum', '2027-05-11', 'Bertugas', 'Aman'),
    ('Agus Setiawan', '0812-3344-5566', 'SIM B1 Umum', '2026-12-09', 'Bertugas', 'Aman'),
    ('Dedi Irawan', '0813-2211-5544', 'SIM B2 Umum', '2027-01-15', 'Bertugas', 'Aman'),
    ('Joko Prasetyo', '0858-7712-8833', 'SIM B1 Umum', '2026-11-28', 'Bertugas', 'Aman'),
    ('Fajar Nugroho', '0812-6612-7788', 'SIM B2 Umum', '2027-06-19', 'Bertugas', 'Aman'),
    ('Hendra Saputra', '0813-5522-1199', 'SIM B2 Umum', '2027-07-08', 'Bertugas', 'Aman'),
    ('Irfan Maulana', '0821-7788-4411', 'SIM B1 Umum', '2027-02-04', 'Bertugas', 'Aman'),
    ('Yusuf Hidayat', '0856-3344-9988', 'SIM B2 Umum', '2027-08-13', 'Bertugas', 'Aman'),
    ('Tono Wibowo', '0812-9900-1122', 'SIM B2 Umum', '2027-09-21', 'Bertugas', 'Aman'),
    ('Eko Susanto', '0813-4455-6677', 'SIM B1 Umum', '2027-10-05', 'Bertugas', 'Aman'),
    ('Maman Firmansyah', '0857-2244-8899', 'SIM B2 Umum', '2027-11-12', 'Aktif', 'Aman'),
    ('Darmawan Putra', '0821-1199-3377', 'SIM B2 Umum', '2027-12-02', 'Aktif', 'Aman'),
    ('Rizky Ramadhan', '0812-4433-7788', 'SIM B1 Umum', '2028-01-18', 'Aktif', 'Aman'),
    ('Wawan Kurniawan', '0813-8866-5544', 'SIM B2 Umum', '2028-02-09', 'Aktif', 'Aman'),
    ('Slamet Riyadi', '0858-1122-7766', 'SIM B2 Umum', '2028-03-16', 'Aktif', 'Aman'),
    ('Arif Rahman', '0821-5533-9911', 'SIM B1 Umum', '2028-04-25', 'Aktif', 'Aman'),
    ('Nandang Suherman', '0812-7766-3344', 'SIM B2 Umum', '2028-05-07', 'Aktif', 'Aman'),
    ('Gilang Permana', '0813-2299-6655', 'SIM B2 Umum', '2028-06-14', 'Aktif', 'Aman')
) as item(name, phone, license_type, license_expiry_date, operational_status, health_status)
where not exists (
  select 1 from drivers existing where existing.name = item.name
);

insert into vehicles (unit_code, plate_number, brand, vehicle_type, container_size, production_year, operational_status, default_driver_name)
values
  ('TRK-001', 'B 1234 XYZ', 'Hino', '500 Ranger', '20FT', 2021, 'Bertugas', 'Andi Pratama'),
  ('TRK-002', 'B 2190 UYK', 'Mitsubishi Fuso', 'Fighter FM 65', '40FT', 2020, 'Bertugas', 'Bambang Wijaya'),
  ('TRK-003', 'B 9142 UYK', 'Hino', '500 Ranger', '40FT', 2022, 'Bertugas', 'Rudi Hartono'),
  ('TRK-004', 'B 8871 TZX', 'UD Trucks', 'Quester', '20FT', 2021, 'Bertugas', 'Agus Setiawan'),
  ('TRK-005', 'B 6681 KKA', 'Mitsubishi Fuso', 'Fighter FM 65', '20FT', 2019, 'Bertugas', 'Dedi Irawan'),
  ('TRK-006', 'B 4421 TZX', 'Hino', '500 Ranger', '20FT', 2020, 'Bertugas', 'Joko Prasetyo'),
  ('TRK-007', 'B 7782 KLA', 'Mitsubishi Fuso', 'Fighter FM 65', '40FT', 2021, 'Bertugas', 'Fajar Nugroho'),
  ('TRK-008', 'B 3190 UYK', 'UD Trucks', 'Quester', '40FT', 2022, 'Bertugas', 'Hendra Saputra'),
  ('TRK-009', 'B 5560 TZX', 'Hino', '500 Ranger', '20FT', 2020, 'Bertugas', 'Irfan Maulana'),
  ('TRK-010', 'B 7021 KKA', 'Mitsubishi Fuso', 'Fighter FM 65', '20FT', 2021, 'Bertugas', 'Yusuf Hidayat'),
  ('TRK-011', 'B 6102 WXA', 'Hino', '500 Ranger', '20FT', 2022, 'Bertugas', 'Tono Wibowo'),
  ('TRK-012', 'B 8104 WXA', 'UD Trucks', 'Quester', '40FT', 2021, 'Bertugas', 'Eko Susanto'),
  ('TRK-013', 'B 1905 UYK', 'Mitsubishi Fuso', 'Fighter FM 65', '20FT', 2020, 'Aktif', 'Maman Firmansyah'),
  ('TRK-014', 'B 3317 KLA', 'Hino', '500 Ranger', '20FT', 2022, 'Aktif', 'Darmawan Putra'),
  ('TRK-015', 'B 7750 TZX', 'UD Trucks', 'Quester', '40FT', 2021, 'Aktif', 'Rizky Ramadhan'),
  ('TRK-016', 'B 2468 WXA', 'Mitsubishi Fuso', 'Fighter FM 65', '20FT', 2020, 'Aktif', 'Wawan Kurniawan'),
  ('TRK-017', 'B 8642 KKA', 'Hino', '500 Ranger', '20FT', 2021, 'Aktif', 'Slamet Riyadi'),
  ('TRK-018', 'B 4109 UYK', 'UD Trucks', 'Quester', '40FT', 2022, 'Aktif', 'Arif Rahman'),
  ('TRK-019', 'B 5207 KLA', 'Mitsubishi Fuso', 'Fighter FM 65', '20FT', 2021, 'Aktif', 'Nandang Suherman'),
  ('TRK-020', 'B 6398 WXA', 'Hino', '500 Ranger', '20FT', 2020, 'Aktif', 'Gilang Permana')
on conflict (plate_number) do update
set unit_code = excluded.unit_code,
    brand = excluded.brand,
    vehicle_type = excluded.vehicle_type,
    container_size = excluded.container_size,
    production_year = excluded.production_year,
    operational_status = excluded.operational_status,
    default_driver_name = excluded.default_driver_name,
    updated_at = now();

with so as (
  insert into sales_orders (
    so_number, do_number, so_date, trip_date, received_at,
    customer_name, customer_pic, customer_phone, customer_address,
    shipment_type, job_type, job_description,
    price, quantity, unit, total_amount,
    origin, destination, status, sales_name, created_by_name, updated_by_name
  )
  values (
    'SO-2607-001', 'DO-SLG-001', current_date, current_date, now(),
    'PT Sumber Logistik', 'Nadia Putri', '021-5211-8800', 'Cikupa, Banten',
    'import', 'Trucking Container', 'Pengiriman container sesuai jadwal operasional hari ini.',
    2500000, 2, 'Container', 5850000,
    'Tanjung Priok', 'Cikupa', 'running', 'Sinta Maharani', 'Sinta Maharani', 'Budi Operational'
  )
  on conflict (so_number) do update
  set quantity = excluded.quantity,
      total_amount = excluded.total_amount,
      status = excluded.status,
      updated_at = now()
  returning id
)
insert into container_jobs (
  sales_order_id, container_number, container_size, container_type,
  rpuj_status, spk_number, loading_voucher_number,
  assignment_snapshot, status, received_at, running_at,
  created_by_name, updated_by_name
)
select so.id, item.container_number, item.container_size, 'Dry',
       'approved', item.spk_number, item.loading_voucher_number,
       item.assignment_snapshot::jsonb, 'running', now(), now(),
       'Sinta Maharani', 'Budi Operational'
from so
cross join (
  values
    ('TCLU1234567', '20FT', 'SPK-2607-001-01', 'BM-2607-001-01', '{"driver":"Andi Pratama","plateNumber":"B 1234 XYZ","vehicleDetail":"TRK-001 - Hino 500 Ranger"}'),
    ('MSCU7742108', '40FT', 'SPK-2607-001-02', 'BM-2607-001-02', '{"driver":"Bambang Wijaya","plateNumber":"B 2190 UYK","vehicleDetail":"TRK-002 - Mitsubishi Fuso Fighter FM 65"}')
) as item(container_number, container_size, spk_number, loading_voucher_number, assignment_snapshot)
where not exists (
  select 1
  from container_jobs existing_job
  where existing_job.sales_order_id = so.id
    and existing_job.container_number = item.container_number
);

insert into activity_logs (actor_name, actor_role, action, target)
values
  ('System', 'Admin', 'Menyiapkan database PostgreSQL MVP', 'Schema master, sales order, container job, archive')
on conflict do nothing;
