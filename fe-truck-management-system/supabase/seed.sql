-- Optional starter data for ATMS testing.
-- Run after migration and after at least one Admin user exists.

insert into public.customers
  (name, npwp, address, pic_name, phone, email, contract_number, contract_start, contract_end, contract_status)
values
  ('PT Mayora Indah', '01.234.567.8-091.000', 'Bekasi, Jawa Barat', 'Dian Prasetyo', '021-8980-1234', 'logistik@mayora.co.id', 'UC/MYR/2026/014', '2026-01-01', '2026-12-31', 'Aktif'),
  ('PT Wings Surya', '02.345.678.9-092.000', 'Karawang, Jawa Barat', 'Maya Kusuma', '021-8877-2200', 'supply@wings.co.id', 'UC/WNG/2026/008', '2026-02-01', '2027-01-31', 'Aktif'),
  ('PT Unilever Indonesia', '04.567.890.1-094.000', 'Cikarang, Jawa Barat', 'Nadia Putri', '021-5211-8800', 'transport@unilever.co.id', 'UC/ULI/2026/012', '2026-01-15', '2027-01-14', 'Aktif')
on conflict (name) do nothing;

insert into public.vehicles
  (unit_code, plate_number, brand, vehicle_type, vin, engine_number, operational_status)
values
  ('TRK-001', 'B 8871 TZX', 'Hino', 'Ranger FG 235 JJ', 'MJEC1JG43K5001842', 'J08EUFJ-184201', 'Aktif'),
  ('TRK-002', 'B 9142 UYK', 'Mitsubishi Fuso', 'Fighter FN 62', 'MHMFM517HKR004211', '6M60-882194', 'Aktif'),
  ('TRK-003', 'B 7712 PXV', 'UD Trucks', 'Quester GKE 280', 'MHCWDE0PKJ0009172', 'GH8E-104892', 'Maintenance')
on conflict (unit_code) do nothing;

insert into public.drivers
  (name, phone, license_type, license_expiry, operational_status)
values
  ('Agus Setiawan', '0812-8821-1200', 'SIM B2 Umum', '2027-03-18', 'Aktif'),
  ('Rudi Hartono', '0813-9920-7711', 'SIM B2 Umum', '2026-08-04', 'Aktif'),
  ('Dedi Irawan', '0857-1128-4400', 'SIM B1 Umum', '2026-07-01', 'Cuti')
on conflict (phone) do nothing;

