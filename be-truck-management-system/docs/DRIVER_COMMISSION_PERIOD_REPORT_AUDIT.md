# Driver Commission Period Report Audit

Audit phase 1 untuk report komisi sopir per periode.

## Struktur Data Saat Ini

Sumber awal komisi ada di `container_jobs`:

- `has_driver_commission`
- `driver_commission_amount`
- `driver_commission_source_destination_id`
- `driver_commission_note`
- `driver_id`
- `assignment_snapshot`
- `completed_at`

Nominal default berasal dari master tujuan:

- `destination_locations.driver_commission_amount`

Batch pengajuan mingguan tersimpan di:

- `driver_commission_batches`
- `driver_commission_payments`
- `driver_commission_items`

## Kesimpulan Audit

Struktur saat ini sudah cukup untuk report per sopir tanpa mengubah report sopir existing.

Pola yang dipakai:

- `container_jobs` menjadi sumber calon komisi yang belum diajukan.
- `driver_commission_items` menjadi detail container/job setelah batch diajukan.
- `driver_commission_payments` menjadi ringkasan pembayaran per sopir.
- `driver_commission_batches` menjadi status periode Kamis-Rabu.

## Endpoint Baru Phase 2

Endpoint:

```http
GET /api/driver-commissions/period-report?periodStart=2026-08-13&periodEnd=2026-08-19
```

Alternatif:

```http
GET /api/driver-commissions/period-report?date=2026-08-14
```

Jika memakai `date`, sistem otomatis membentuk periode Kamis-Rabu.

## Bentuk Response

Response utama digrup per sopir:

```json
{
  "periodStart": "2026-08-13",
  "periodEnd": "2026-08-19",
  "status": "draft",
  "activeBatch": null,
  "summary": {
    "totalDrivers": 2,
    "totalItems": 6,
    "totalAmount": 300000,
    "unsubmittedItems": 6,
    "submittedItems": 0,
    "approvedItems": 0,
    "paidItems": 0,
    "unpaidAmount": 300000,
    "paidAmount": 0
  },
  "drivers": [
    {
      "driverId": "driver-id",
      "driverName": "Rahmat",
      "totalItems": 3,
      "totalAmount": 150000,
      "paidItems": 0,
      "unpaidItems": 3,
      "items": [
        {
          "containerJobId": "job-id",
          "soNumber": "SO-001",
          "containerNumber": "CONT-001",
          "destination": "Cikarang",
          "truckPlateNumber": "B 1000 AA",
          "completedDate": "2026-08-13",
          "amount": 50000,
          "paymentStatus": "unsubmitted"
        }
      ]
    }
  ]
}
```

## Catatan Integrasi UI

Operational dan Finance dapat memakai endpoint yang sama:

- Operational: review per sopir, buka detail container, lalu submit batch.
- Finance: lihat batch/periode per sopir, buka detail container, lalu bayar per sopir.

Report sopir existing tidak perlu diubah.
