/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';
import { USER_ROLES } from '../constants/roles';
import * as authService from '../services/auth/authService';

const AuthContext = createContext(null);
const DEMO_STORAGE_KEY = 'tms-demo-session';

const demoAccounts = {
  'admin@armada.com': { fullName: 'Budi Santoso', role: USER_ROLES.ADMIN },
  'sales@armada.com': { fullName: 'Sarah Wijaya', role: USER_ROLES.SALES },
  'ops@armada.com': { fullName: 'Ahmad Pratama', role: USER_ROLES.OPERATIONAL },
  'finance@armada.com': { fullName: 'Fitri Finance', role: USER_ROLES.FINANCE },
  'management@armada.com': { fullName: 'Andi Kusuma', role: USER_ROLES.OBSERVER },
  'admin@demo.com': { fullName: 'Budi Santoso', role: USER_ROLES.ADMIN },
  'sales@demo.com': { fullName: 'Sarah Wijaya', role: USER_ROLES.SALES },
  'operational@demo.com': { fullName: 'Ahmad Pratama', role: USER_ROLES.OPERATIONAL },
  'finance@demo.com': { fullName: 'Fitri Finance', role: USER_ROLES.FINANCE },
  'pengamat@demo.com': { fullName: 'Andi Kusuma', role: USER_ROLES.OBSERVER },
};

function getStoredDemoUser() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const databaseMode = authService.isConfigured();
  const [user, setUser] = useState(() => databaseMode ? null : getStoredDemoUser());
  const [loading, setLoading] = useState(databaseMode);

  useEffect(() => {
    if (!databaseMode) return undefined;
    let active = true;

    authService.getSession()
      .then((session) => authService.getSessionUser(session))
      .then((sessionUser) => {
        if (active) setUser(sessionUser);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const unsubscribe = authService.onAuthStateChange(async (_event, session) => {
      try {
        setUser(await authService.getSessionUser(session));
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [databaseMode]);

  async function signIn(email, password) {
    if (!databaseMode) {
      if (!email || !password) throw new Error('Email dan password wajib diisi.');
      const account = demoAccounts[email.toLowerCase()];
      if (!account || password !== 'password') {
        throw new Error('Akun demo tidak ditemukan atau password salah.');
      }
      const nextUser = {
        id: `demo-${account.role}`,
        email: email.toLowerCase(),
        ...account,
      };
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(nextUser));
      setUser(nextUser);
      return;
    }

    const loggedInUser = await authService.login(email, password);
    if (loggedInUser) setUser(loggedInUser);
  }

  async function signOut() {
    localStorage.removeItem(DEMO_STORAGE_KEY);
    if (databaseMode) await authService.logout();
    setUser(null);
  }

  async function changePassword(currentPassword, nextPassword) {
    if (!databaseMode) return;
    await authService.changePassword(currentPassword, nextPassword, user?.email);
  }

  const value = {
    user,
    loading,
    signIn,
    signOut,
    changePassword,
    isDemo: !databaseMode,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth harus digunakan di dalam AuthProvider.');
  return context;
}
