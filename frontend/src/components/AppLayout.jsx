import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { House, Buildings, ChartLine, ClipboardText, CheckCircle, FileArrowDown, Users, Notepad, Leaf, SignOut, Shield, Database, ChartPie } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: ChartLine, roles: ["admin","staff","supervisor"] },
  { to: "/fasilitas", label: "Fasilitas & Aset", icon: Buildings, roles: ["admin","staff","supervisor"] },
  { to: "/emisi", label: "Input Emisi", icon: ClipboardText, roles: ["admin","staff"] },
  { to: "/persetujuan", label: "Persetujuan", icon: CheckCircle, roles: ["admin","supervisor"] },
  { to: "/laporan", label: "Laporan & AI", icon: FileArrowDown, roles: ["admin","staff","supervisor"] },
  { to: "/pengguna", label: "Manajemen User", icon: Users, roles: ["admin"] },
  { to: "/audit", label: "Audit Trail", icon: Notepad, roles: ["admin","supervisor"] },
];

const ADMIN_NAV = [
  { to: "/admin", label: "Dashboard Global", icon: ChartPie },
  { to: "/admin/master", label: "Master Data", icon: Database },
  { to: "/admin/audit", label: "Audit Global", icon: Notepad },
];

export default function AppLayout({ children }) {
  const { user, company, logout } = useAuth();
  const nav = useNavigate();
  const superOnly = user?.is_super_admin && !company;
  const items = superOnly ? [] : NAV.filter(n => n.roles.includes(user?.role) || user?.is_super_admin);
  const homeUrl = superOnly ? "/admin" : "/dashboard";

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 border-r border-border bg-card hidden md:flex flex-col">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-2 cursor-pointer" onClick={()=>nav(homeUrl)}>
            <Leaf size={26} weight="fill" className="text-primary" />
            <span className="font-display font-bold text-lg">KarbonKu</span>
          </div>
          {superOnly ? (
            <>
              <div className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">Mode</div>
              <div className="font-semibold truncate flex items-center gap-1 text-primary" data-testid="sidebar-super-mode"><Shield size={14}/> Super Admin Global</div>
            </>
          ) : (
            <>
              <div className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">Perusahaan</div>
              <div className="font-semibold truncate" data-testid="sidebar-company-name">{company?.name}</div>
            </>
          )}
        </div>
        <nav className="flex-1 py-3 overflow-y-auto">
          {items.map(item => (
            <NavLink key={item.to} to={item.to} data-testid={`nav-${item.to.slice(1)}`}
              className={({isActive}) => `flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${isActive ? "bg-primary/10 text-primary border-l-2 border-primary font-semibold" : "text-foreground/70 hover:bg-muted"}`}>
              <item.icon size={18} weight={"regular"} />
              {item.label}
            </NavLink>
          ))}
          {user?.is_super_admin && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="px-5 mb-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">
                <Shield size={12}/> Super Admin
              </div>
              {ADMIN_NAV.map(item => (
                <NavLink key={item.to} to={item.to} end={item.to === "/admin"} data-testid={`nav-${item.to.replace(/\//g,'-')}`}
                  className={({isActive}) => `flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${isActive ? "bg-primary/10 text-primary border-l-2 border-primary font-semibold" : "text-foreground/70 hover:bg-muted"}`}>
                  <item.icon size={18} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          )}
        </nav>
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2 mb-3">
            {user?.picture ? <img src={user.picture} alt="" className="w-8 h-8 rounded-full" /> :
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">{user?.name?.[0]}</div>}
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{user?.name}</div>
              <div className="flex gap-1 items-center">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0" data-testid="user-role-badge">{user?.role}</Badge>
                {user?.is_super_admin && <Badge className="text-[10px] px-1.5 py-0">Super</Badge>}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={logout} className="w-full" data-testid="logout-btn">
            <SignOut size={14} /> Keluar
          </Button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <div className="md:hidden border-b border-border p-3 flex items-center justify-between bg-card">
          <div className="flex items-center gap-2">
            <Leaf size={22} weight="fill" className="text-primary" />
            <span className="font-display font-bold">KarbonKu</span>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}><SignOut size={16}/></Button>
        </div>
        {children}
      </main>
    </div>
  );
}
