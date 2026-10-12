import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!tokenStore.get());

  useEffect(() => {
    setUnauthorizedHandler(() => { tokenStore.clear(); setUser(null); });
    if (!tokenStore.get()) return;
    api('/api/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const authenticate = useCallback(async (path, body) => {
    const d = await api(path, { method: 'POST', body });
    tokenStore.set(d.token);
    setUser(d.user);
    return d.user;
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    login: (email, password) => authenticate('/api/auth/login', { email, password }),
    register: (form) => authenticate('/api/auth/register', form),
    logout: () => { tokenStore.clear(); setUser(null); },
  }), [user, loading, authenticate]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
