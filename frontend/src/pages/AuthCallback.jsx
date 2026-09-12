import React, { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = location.hash || window.location.hash;
    const match = hash.match(/session_id=([^&]+)/);
    if (!match) { navigate("/"); return; }
    const sessionId = match[1];

    (async () => {
      try {
        const { data } = await api.post("/auth/session", { session_id: sessionId });
        window.history.replaceState(null, "", "/");
        const info = await refresh();
        if (info?.user?.is_super_admin) navigate("/admin", { replace: true });
        else if (info?.company) navigate("/dashboard", { replace: true });
        else navigate("/signup-company", { replace: true });
      } catch (e) {
        toast.error("Gagal masuk. Silakan coba lagi.");
        navigate("/", { replace: true });
      }
    })();
  }, [location.hash, navigate, refresh]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-muted-foreground">Memproses login...</div>
    </div>
  );
}
