export const recentTrips = [
  { id: 1, doNumber: 'DO-2606-0182', client: 'PT Unilever Indonesia', truck: 'B 9284 TYA', driver: 'Budi Santoso', route: 'Tanjung Priok → Cikarang', status: 'on_trip', time: '10:42 WIB' },
  { id: 2, doNumber: 'DO-2606-0181', client: 'PT Mayora Indah', truck: 'B 9142 UYK', driver: 'Rudi Hartono', route: 'Marunda → Bekasi', status: 'loading', time: '09:18 WIB' },
  { id: 3, doNumber: 'DO-2606-0179', client: 'PT Wings Surya', truck: 'B 8871 TZX', driver: 'Agus Setiawan', route: 'Tanjung Priok → Karawang', status: 'completed', time: '08:55 WIB' },
  { id: 4, doNumber: 'DO-2606-0178', client: 'PT Indofood CBP', truck: 'B 9321 TGH', driver: 'Dedi Suhendra', route: 'Cakung → Tangerang', status: 'scheduled', time: '08:10 WIB' },
];

export const expiringDocuments = [
  { id: 1, truck: 'B 9284 TYA', type: 'KIR', number: 'KIR-28491', days: 7, expiry: '25 Jun 2026' },
  { id: 2, truck: 'B 9142 UYK', type: 'STNK', number: 'STNK-14822', days: 14, expiry: '02 Jul 2026' },
  { id: 3, truck: 'B 8871 TZX', type: 'Asuransi', number: 'POL-77219', days: 23, expiry: '11 Jul 2026' },
];

export const truckPositions = [
  { id: 1, plate: 'B 9284 TYA', location: 'Jl. Raya Bekasi, Cakung', speed: '42 km/j', updated: '2 menit lalu', moving: true },
  { id: 2, plate: 'B 9142 UYK', location: 'Pelabuhan Tanjung Priok', speed: '0 km/j', updated: '5 menit lalu', moving: false },
  { id: 3, plate: 'B 8871 TZX', location: 'Tol Jakarta–Cikampek KM 32', speed: '68 km/j', updated: '6 menit lalu', moving: true },
  { id: 4, plate: 'B 9321 TGH', location: 'Pool Cakung', speed: '0 km/j', updated: '8 menit lalu', moving: false },
];
