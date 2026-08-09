import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { isApiAuthSource } from '../../services/config/dataSource';
import armadaLogo from '../../Assets/BGLogoArmada.png';

function LoginPage() {
  const { user, signIn, isDemo } = useAuth();
  const [form, setForm] = useState(() => (
    isApiAuthSource()
      ? { email: '', password: '' }
      : { email: 'admin@demo.com', password: 'password' }
  ));
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  if (user) return <Navigate to="/order-running" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signIn(form.email, form.password);
      navigate(location.state?.from?.pathname || '/order-running', { replace: true });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <div className="login-brand"><span><img src={armadaLogo} alt="Armada" /></span><p><strong>ARMADA</strong><small>Transportation Management System</small></p></div>
        <div className="login-copy">
          <span className="login-kicker">Data archive system</span>
          <h1>Data trucking lebih rapi, mudah dicari, dan aman tersimpan.</h1>
          <p>Kelola master data, Sales Order, Container Job, serta dokumen pendukung dalam satu sistem terpusat.</p>
        </div>
        <div className="login-metrics"><div><strong>4</strong><span>Role pengguna</span></div><div><strong>1</strong><span>Sumber data</span></div><div><strong>24/7</strong><span>Akses arsip</span></div></div>
      </section>
      <section className="login-form-panel">
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="mobile-login-brand"><img src={armadaLogo} alt="Armada" /><strong>ARMADA</strong></div>
          <span className="login-lock"><LockKeyhole size={23} /></span>
          <h2>Selamat datang kembali</h2>
          <p>Masuk untuk melanjutkan ke order berjalan.</p>
          {isDemo ? <div className="demo-notice">Akun demo: admin@demo.com, sales@demo.com, operational@demo.com, atau pengamat@demo.com. Password: password.</div> : null}
          {error ? <div className="alert error">{error}</div> : null}
          <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nama@perusahaan.com" /></label>
          <label>Password<div className="password-field"><input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
          <div className="login-options"><label><input type="checkbox" /> Ingat saya</label><button type="button">Lupa password?</button></div>
          <button className="primary-button full" disabled={loading}>{loading ? 'Memproses...' : 'Masuk ke Aplikasi'}</button>
          <small className="login-footer">© 2026 Transportation Management System</small>
        </form>
      </section>
    </main>
  );
}

export default LoginPage;
