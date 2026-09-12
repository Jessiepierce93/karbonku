import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [impersonating, setImpersonating] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      setCompany(data.company);
      setImpersonating(data.impersonating);
      return data;
    } catch {
      setUser(null); setCompany(null); setImpersonating(false);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Skip /me check if returning from OAuth callback (AuthCallback will handle it first)
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    refresh();
  }, [refresh]);

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    setUser(null); setCompany(null);
    window.location.href = "/";
  };

  return (
    <AuthCtx.Provider value={{ user, company, impersonating, loading, refresh, logout, setUser, setCompany }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
