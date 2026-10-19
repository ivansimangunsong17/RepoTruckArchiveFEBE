# Arsip branch 19 Oktober 2026

Repo ini memakai `sync-production-development` sebagai branch kerja dan default GitHub. `main` tetap disimpan. Pemilik menyatakan server produksi memakai `sync-production-development` pada 19 Oktober 2026; konfigurasi server belum diperiksa langsung.

Sebelum branch lama dihapus, 14 tag `archive/2026-10-19/*` dibuat untuk menjaga ujung riwayat yang belum dijangkau `main`, `sync-production-development`, atau tag produksi yang sudah ada. Pemeriksaan `git rev-list` menunjukkan **0 commit yang tidak terjangkau** setelah tag arsip dibuat. Dua hotfix yang sudah menjadi leluhur branch kerja dihapus lebih dulu.

Untuk memulihkan branch lama, ambil tag dan commit terbaru dengan `git fetch --tags origin`, lalu jalankan `git switch -c nama-branch <SHA>` dan `git push -u origin nama-branch`. Nama branch dan SHA aslinya tercatat di bawah.

| Branch lama | SHA ujung |
| --- | --- |
| `backup/sync-production-development-pre-postbatch1` | `68d98d7f52e288cae808d511a53c40cff7041953` |
| `backup/sync-production-development-pre-postbatch2` | `f9ba5753b5c1f7e13e2144902889caad8eaca993` |
| `backup/sync-production-development-pre-reconcile-20261002` | `4ec9e37332d6c0701ab3fcdf0c4b5c3f069cce30` |
| `hotfix/combo-pickup-2x20` | `23569d03de9722f8b49b256c0fb434c3e5ec5f20` |
| `hotfix/commission-inap-container-titip` | `dea6450320c57f5214c1721d133a062090d5181b` |
| `hotfix/customer-outstanding-export` | `fc52473d791832f2c60e631f17f8827bd5daf9e1` |
| `hotfix/driver-commission-csv` | `9d6df9b28927e9b2356f16f02b359cf9987668a0` |
| `hotfix/finance-expense-check-ux` | `f4332631847044abc12bc26eb36e4d06bd4971f4` |
| `hotfix/finance-invoice-pagination-inap-list` | `d131f494bdba4d24b1a7eac27f3e3cf3ead7bd1b` |
| `hotfix/outstanding-and-dropping-validation` | `1dff07850f8c3d6f8196ec3969eec428ea346426` |
| `hotfix/outstanding-proof-optional` | `a8c85c57fcf63e65a2a0b4d32299ac45fc448521` |
| `hotfix/reefer-uj-surcharge` | `d7297ea7f820c2fffb77ff4df863616bee864577` |
| `hotfix/repo-shipment-no-commission` | `031faad86eddde4bc14a2567585d1a7330876a01` |
| `hotfix/utilization-historical-chassis` | `ff98da08c3ce6b191d7e55d8c059e9ffedb7282f` |
| `hotfix/vendor-container-jobs` | `dcd5907f9a08942666686d10e3d7493dc0e54446` |
| `hotfix/vendor-location-production` | `6b1d6fb584f58c3f95e11f56e05a349df27c18fa` |
| `integration/actual-uj-development` | `471203e5a28cd1c1267e42131dcafdfac50f6f99` |
| `production/current-state-20260924` | `8aa70501a1102ade786f4fbaf403e59c07af4d07` |
| `production/current-state-20261002-full` | `5b3e583bb5b96bfda65401299edb9e1240edf11f` |
| `reconcile/local-dev-after-afdebf6` | `68d98d7f52e288cae808d511a53c40cff7041953` |
| `reconcile/post-batch1-development` | `f9ba5753b5c1f7e13e2144902889caad8eaca993` |
| `reconcile/post-batch2-development` | `0609babdbe8174970a77ccfa63d2bfdff78f9756` |
| `reconcile/sync-prod-dev-20261002` | `afdebf6bcd5a8f9e237f86df9b77e231b8370f5e` |
| `release/assignment-identity-20261007` | `1dff07850f8c3d6f8196ec3969eec428ea346426` |
| `release/batch-1-20261005` | `9b39fe8724574bfbb24f8974a3dcf2d717a81002` |
| `release/batch-2-20261005` | `484fafb2bba84cfba0bf567ba61ae4750eca5662` |
| `release/finance-container-qty-20261006` | `8cd348ac6ac32df87dd74243a57ba673ef56fba0` |
| `release/finance-container-qty-on-maps-20261006` | `f94a5922bfaa120e159f9360015aeccabddf3140` |
| `release/finance-document-20mb-20261009` | `1b3d7b937e5b07e72507e880dd7da06eaf06bbef` |
| `release/finance-dropping-proof-dnd-20261009` | `580f4416f63ccf65c107e3c3b9eb974a82921e95` |
| `release/finance-order-party-20261008` | `93b6d07475bbc6a1fe954908324d6144f18dd106` |
| `release/fix-driver-utilization-20261006` | `d8018c714baf785395c18f22c133b75920deb4f3` |
| `release/maps-terminal-depot-20261006` | `8addd0fc087435fce71a2f8e30095364a8585b54` |
| `release/repo-flow-20261007` | `fbda7e7a92492f919bf46d2b4bab8c23402e0194` |
| `release/repo-flow-utilization-20261008` | `3fb198dae108c393d00f5b2978233e5e9395894e` |
| `release/repo-flow-vehicle-capacity-20261008` | `7462982e65c1feee834612b39eacc58f70acb495` |
| `release/repo-flow-vehicle-size-20261008` | `2fd966af3dff0043a2cd049e8f92a03f1ed81e71` |
| `release/repo-pickup-confirm-dialog-20261008` | `ba7b1bbc7d09589d2da42544e6ac99fcfd6647bb` |
| `release/vendor-sales-outstanding-filter-20261016` | `6bdbd65e05f12d8bd2c3de8f402c9b8ed00b0b4d` |

## Tag arsip

- `archive/2026-10-19/backup/sync-production-development-pre-postbatch1`
- `archive/2026-10-19/backup/sync-production-development-pre-postbatch2`
- `archive/2026-10-19/backup/sync-production-development-pre-reconcile-20261002`
- `archive/2026-10-19/hotfix/customer-outstanding-export`
- `archive/2026-10-19/hotfix/finance-expense-check-ux`
- `archive/2026-10-19/hotfix/finance-invoice-pagination-inap-list`
- `archive/2026-10-19/hotfix/reefer-uj-surcharge`
- `archive/2026-10-19/hotfix/utilization-historical-chassis`
- `archive/2026-10-19/hotfix/vendor-location-production`
- `archive/2026-10-19/integration/actual-uj-development`
- `archive/2026-10-19/release/finance-container-qty-20261006`
- `archive/2026-10-19/release/finance-document-20mb-20261009`
- `archive/2026-10-19/release/repo-flow-vehicle-size-20261008`
- `archive/2026-10-19/release/vendor-sales-outstanding-filter-20261016`
