import { Eye, EyeOff, KeyRound, UserRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import { ROLE_LABELS } from '../../constants/roles';
import { useFeedback } from '../../hooks/useFeedback';
import { useAuth } from '../../hooks/useAuth';

function ProfilePage() {
  const { user, changePassword, isDemo } = useAuth();
  const { confirmAction } = useFeedback();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!passwordOpen && !successOpen) return undefined;

    function handleEscape(event) {
      if (event.key === 'Escape' && !saving) {
        setPasswordOpen(false);
        setSuccessOpen(false);
      }
    }

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [passwordOpen, successOpen, saving]);

  function closePasswordModal(force = false) {
    if (saving && !force) return;
    setPasswordOpen(false);
    setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setShowCurrent(false);
    setShowNext(false);
    setError('');
  }

  function closeSuccessModal() {
    setSuccessOpen(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      setError('Semua field password wajib diisi.');
      return;
    }
    if (form.newPassword.length < 8) {
      setError('Password baru minimal 8 karakter.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('Password baru dan konfirmasi password tidak sama.');
      return;
    }

    const approved = await confirmAction({
      title: 'Simpan perubahan password?',
      message: 'Password baru akan langsung aktif setelah disimpan.',
      confirmLabel: 'Simpan Password',
      cancelLabel: 'Batal',
      tone: 'danger',
    });
    if (!approved) return;

    setSaving(true);
    try {
      await changePassword(form.currentPassword, form.newPassword);
      closePasswordModal(true);
      setSuccessOpen(true);
      return;
    } catch (requestError) {
      setError(requestError.message || 'Password gagal diperbarui.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Akun" title="Profil Saya" description="Informasi akun dan keamanan pengguna ATMS." />
      <div className="profile-page-grid">
        <section className="panel profile-summary-card">
          <div className="profile-large-avatar">{user?.fullName?.slice(0, 2).toUpperCase()}</div>
          <h2>{user?.fullName}</h2><span>{ROLE_LABELS[user?.role]}</span><p>{user?.email}</p>
        </section>
        <section className="panel profile-detail-card">
          <div className="profile-section-title"><UserRound size={18} /><div><h2>Informasi Pengguna</h2><p>Informasi akun hanya dapat dilihat.</p></div></div>
          <dl>
            <div><dt>Nama Lengkap</dt><dd>{user?.fullName}</dd></div>
            <div><dt>Email</dt><dd>{user?.email}</dd></div>
            <div><dt>Role</dt><dd>{ROLE_LABELS[user?.role]}</dd></div>
            <div><dt>Status Akun</dt><dd><span className="profile-status">Aktif</span></dd></div>
            <div><dt>Login Terakhir</dt><dd>20 Juni 2026, 08:42 WIB</dd></div>
          </dl>
          <p className="profile-security-note">Password bisa diubah langsung dari profil ini. Untuk reset akun user lain, gunakan User Management.</p>
          {!isDemo ? (
            <div className="profile-actions">
              <button className="primary-button" type="button" onClick={() => setPasswordOpen(true)}>
                <KeyRound size={16} /> Ubah Password
              </button>
            </div>
          ) : null}
        </section>
      </div>

      {passwordOpen && !isDemo ? (
        <div className="master-modal-backdrop" role="presentation" onMouseDown={closePasswordModal}>
          <section className="password-modal" role="dialog" aria-modal="true" aria-labelledby="profile-password-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <span><KeyRound size={18} /></span>
              <div>
                <h2 id="profile-password-title">Ubah Password</h2>
                <p>Gunakan password baru yang kuat dan tidak dipakai ulang.</p>
              </div>
              <button className="modal-close-button" type="button" aria-label="Tutup ubah password" onClick={closePasswordModal}>
                <X size={18} />
              </button>
            </header>
            <form onSubmit={handleSubmit}>
              {error ? <div className="alert error master-form-error">{error}</div> : null}
              <label>
                Password Saat Ini
                <div className="password-field">
                  <input type={showCurrent ? 'text' : 'password'} value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} />
                  <button type="button" onClick={() => setShowCurrent((value) => !value)} aria-label={showCurrent ? 'Sembunyikan password saat ini' : 'Tampilkan password saat ini'}>
                    {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
              <label>
                Password Baru
                <div className="password-field">
                  <input type={showNext ? 'text' : 'password'} value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} />
                  <button type="button" onClick={() => setShowNext((value) => !value)} aria-label={showNext ? 'Sembunyikan password baru' : 'Tampilkan password baru'}>
                    {showNext ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
              <label>
                Konfirmasi Password Baru
                <input type="password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} />
              </label>
              <footer>
                <button className="secondary-button" type="button" onClick={closePasswordModal} disabled={saving}>Batal</button>
                <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Password'}</button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {successOpen && !isDemo ? (
        <div className="master-modal-backdrop" role="presentation" onMouseDown={closeSuccessModal}>
          <section className="password-success-modal" role="dialog" aria-modal="true" aria-labelledby="password-success-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <span><KeyRound size={18} /></span>
              <div>
                <h2 id="password-success-title">Password berhasil diperbarui</h2>
                <p>Password baru sudah tersimpan di sistem.</p>
              </div>
              <button className="modal-close-button" type="button" aria-label="Tutup notifikasi" onClick={closeSuccessModal}>
                <X size={18} />
              </button>
            </header>
            <div className="password-success-body">
              <p>Silakan gunakan password baru saat login berikutnya.</p>
            </div>
            <footer>
              <button className="primary-button" type="button" onClick={closeSuccessModal}>OK</button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default ProfilePage;
