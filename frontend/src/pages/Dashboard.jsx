import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, monthNames } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, Tooltip, LineChart, Line, Legend } from "recharts";
import { ArrowUpRight, Factory, Lightning, Truck } from "@phosphor-icons/react";

const SCOPE_COLORS = { 1: "#e07a5f", 2: "#8ecae6", 3: "#52796f" };

export default function Dashboard() {
  const { company } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/dashboard/stats", { params: { year } }).then(r => setStats(r.data));
  }, [year]);

  if (!stats) return <div className="p-8 text-muted-foreground">Memuat dashboard...</div>;

  const scopeData = [
    { name: "Scope 1", value: stats.by_scope_kg[1], color: SCOPE_COLORS[1] },
    { name: "Scope 2", value: stats.by_scope_kg[2], color: SCOPE_COLORS[2] },
    { name: "Scope 3", value: stats.by_scope_kg[3], color: SCOPE_COLORS[3] },
  ];
  const monthData = stats.by_month.map(m => ({ ...m, month: monthNames[m.month] }));

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Inventarisasi GRK</div>
          <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tight">Dashboard {company?.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Tahun</span>
          <Select value={String(year)} onValueChange={v=>setYear(Number(v))}>
            <SelectTrigger className="w-32" data-testid="dashboard-year"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[0,1,2,3].map(o => { const y = new Date().getFullYear() - o; return <SelectItem key={y} value={String(y)}>{y}</SelectItem>; })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 card-flat bg-primary/5 border-primary/20">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Emisi ({year})</div>
          <div className="text-3xl font-display font-bold text-primary mt-1" data-testid="kpi-total">{stats.total_tco2e.toLocaleString('id-ID')}</div>
          <div className="text-xs text-muted-foreground">tCO2e ({stats.total_kg_co2e.toLocaleString('id-ID')} kg)</div>
        </Card>
        {[1,2,3].map(s => (
          <Card key={s} className="p-5 card-flat">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Scope {s}</div>
              {s===1 && <Factory size={20} className="scope-1-text" weight="duotone"/>}
              {s===2 && <Lightning size={20} className="scope-2-text" weight="duotone"/>}
              {s===3 && <Truck size={20} className="scope-3-text" weight="duotone"/>}
            </div>
            <div className="text-2xl font-display font-semibold mt-1" data-testid={`kpi-scope-${s}`}>
              {(stats.by_scope_kg[s]/1000).toLocaleString('id-ID',{maximumFractionDigits:3})}
              <span className="text-sm text-muted-foreground ml-1">tCO2e</span>
            </div>
            <div className="text-xs text-muted-foreground">{stats.total_kg_co2e ? ((stats.by_scope_kg[s]/stats.total_kg_co2e)*100).toFixed(1) : 0}% dari total</div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-6">
        <Card className="p-5 card-flat lg:col-span-2">
          <h3 className="font-display font-semibold mb-4">Tren Bulanan (kg CO2e)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthData}>
              <XAxis dataKey="month" stroke="#888" fontSize={12}/>
              <YAxis stroke="#888" fontSize={12}/>
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="scope1" stroke={SCOPE_COLORS[1]} strokeWidth={2} name="Scope 1"/>
              <Line type="monotone" dataKey="scope2" stroke={SCOPE_COLORS[2]} strokeWidth={2} name="Scope 2"/>
              <Line type="monotone" dataKey="scope3" stroke={SCOPE_COLORS[3]} strokeWidth={2} name="Scope 3"/>
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5 card-flat">
          <h3 className="font-display font-semibold mb-4">Komposisi per Scope</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={scopeData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>
                {scopeData.map((d,i)=><Cell key={i} fill={d.color}/>)}
              </Pie>
              <Tooltip formatter={(v)=>`${v.toLocaleString('id-ID')} kg`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Card className="p-5 card-flat lg:col-span-2">
          <h3 className="font-display font-semibold mb-4">Emisi per Fasilitas</h3>
          {stats.by_facility.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Belum ada data disetujui.</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.by_facility}>
                <XAxis dataKey="name" stroke="#888" fontSize={11}/>
                <YAxis stroke="#888" fontSize={12}/>
                <Tooltip />
                <Bar dataKey="total_kg" fill="hsl(152 43% 25%)" name="kg CO2e"/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card className="p-5 card-flat">
          <h3 className="font-display font-semibold mb-2">Intensitas Karbon</h3>
          <div className="space-y-4 mt-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">per Karyawan</div>
              <div className="text-2xl font-display font-semibold" data-testid="kpi-intensity-emp">{stats.intensity_per_employee_tco2e.toLocaleString('id-ID')}</div>
              <div className="text-xs text-muted-foreground">tCO2e / karyawan</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">per Unit Produksi</div>
              <div className="text-2xl font-display font-semibold">{stats.intensity_per_production_tco2e.toLocaleString('id-ID')}</div>
              <div className="text-xs text-muted-foreground">tCO2e / unit</div>
            </div>
            <Link to="/laporan" className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2" data-testid="dashboard-goto-reports">
              Lihat rekomendasi AI <ArrowUpRight size={14}/>
            </Link>
          </div>
        </Card>
      </div>

      <div className="mt-6 text-xs text-muted-foreground">
        Total {stats.count_logs} entri disetujui pada {year}. Standar: GHG Protocol, ISO 14064-1, GRI 305.
      </div>
    </div>
  );
}
