import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import LandingPage from "@/pages/LandingPage";
import AuthCallback from "@/pages/AuthCallback";
import SignUp from "@/pages/SignUp";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import Facilities from "@/pages/Facilities";
import Emissions from "@/pages/Emissions";
import Approvals from "@/pages/Approvals";
import Reports from "@/pages/Reports";
import UserManagement from "@/pages/UserManagement";
import AuditLogs from "@/pages/AuditLogs";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminCompanyDetail from "@/pages/AdminCompanyDetail";
import AdminMaster from "@/pages/AdminMaster";
import AdminAudit from "@/pages/AdminAudit";
import AppLayout from "@/components/AppLayout";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Memuat...</div>;
  if (!user) return <Navigate to="/" replace />;
  return children;
}

function RequireCompany({ children }) {
  const { user, company, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Memuat...</div>;
  if (!user) return <Navigate to="/" replace />;
  if (!company && !user.is_super_admin) return <Navigate to="/signup-company" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function RequireSuper({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Memuat...</div>;
  if (!user) return <Navigate to="/" replace />;
  if (!user.is_super_admin) return <Navigate to="/dashboard" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AppRouter() {
  const location = useLocation();
  // CRITICAL: sync detection of OAuth callback (prevents race with ProtectedRoute)
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/signup-company" element={<Protected><SignUp /></Protected>} />
      <Route path="/onboarding" element={<RequireCompany><Onboarding /></RequireCompany>} />
      <Route path="/dashboard" element={<RequireCompany><Dashboard /></RequireCompany>} />
      <Route path="/fasilitas" element={<RequireCompany><Facilities /></RequireCompany>} />
      <Route path="/emisi" element={<RequireCompany><Emissions /></RequireCompany>} />
      <Route path="/persetujuan" element={<RequireCompany><Approvals /></RequireCompany>} />
      <Route path="/laporan" element={<RequireCompany><Reports /></RequireCompany>} />
      <Route path="/pengguna" element={<RequireCompany><UserManagement /></RequireCompany>} />
      <Route path="/audit" element={<RequireCompany><AuditLogs /></RequireCompany>} />
      <Route path="/admin" element={<RequireSuper><AdminDashboard /></RequireSuper>} />
      <Route path="/admin/companies/:cid" element={<RequireSuper><AdminCompanyDetail /></RequireSuper>} />
      <Route path="/admin/master" element={<RequireSuper><AdminMaster /></RequireSuper>} />
      <Route path="/admin/audit" element={<RequireSuper><AdminAudit /></RequireSuper>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="bottom-right" richColors />
          <AppRouter />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
