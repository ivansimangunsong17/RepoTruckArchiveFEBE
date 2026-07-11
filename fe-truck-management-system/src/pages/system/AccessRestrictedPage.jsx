import { ShieldX } from 'lucide-react';
import { Link } from 'react-router-dom';

function AccessRestrictedPage() {
  return (
    <div className="access-restricted">
      <span><ShieldX size={30} /></span>
      <h1>Akses Dibatasi</h1>
      <p>Role Anda tidak memiliki izin untuk membuka halaman ini.</p>
      <Link className="primary-button" to="/dashboard">Kembali ke Dashboard</Link>
    </div>
  );
}

export default AccessRestrictedPage;
