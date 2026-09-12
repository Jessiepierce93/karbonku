import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { useNavigate } from "react-router-dom";
import { Buildings, ChartPie } from "@phosphor-icons/react";

const SCOPE = { 1:"#e07a5f", 2:"#8ecae6", 3:"#52796f" };
const STATUS = {
  approved: { label:"Disetujui", cls:"bg-primary/15 text-primary border-primary/30" },
  pending: { label:"Pending", cls:"bg-yellow-100 text-yellow-800 border-yellow-300" },
  flagged: { label:"Kekurangan", cls:"bg-orange-100 text-orange-800 border-orange-300" },
  rejected: { label:"Ditolak", variant:"destructive" },
  no_data: { label:"Belum ada data", variant:"outline" },
};

export default function AdminDashboard() {
  const nav = useNavigate();
  const [stats, setStats] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const load = async () => {
    const [s, c] = await Promise.all([api.get("/admin/stats"), api.get("/admin/companies")]);
    setStats(s.data); setCompanies(c.data);
  };
  useEffect(() => { load(); }, []);

  if (!stats) return <div className="p-8 text-muted-foreground">Memuat...</div>;

  const filtered = companies.filter(c =>
    (!q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.industry||"").toLowerCase().includes(q.toLowerCase())) &&
    (status === "all" || c.report_status === status)
  );

  const scopeData = [
    { name:"Scope 1", value: stats.by_scope_kg[1], color: SCOPE[1] },
    { name:"Scope 2", value: stats.by_scope_kg[2], color: SCOPE[2] },
    { name:"Scope 3", value: stats.by_scope_kg[3], color: SCOPE[3] },
  ];
  const industryData = stats.by_industry.map(i => ({ name: i.industry, kg: i.emissions_kg }));
  const rankData = [...companies].sort((a,b)=>b.total_kg_co2e-a.total_kg_co2e).slice(0,10)
    .map(c => ({ name: c.name.length>18?c.name.slice(0,16)+"…":c.name, kg: c.total_kg_co2e }));

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Super Admin Global</div>
        <h1 className="text-3xl md:text-4xl font-display font-semibold">Dashboard Global</h1>
        <p className="text-muted-foreground mt-1">Rekapitulasi lintas-perusahaan & tinjauan laporan.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 card-flat bg-primary/5 border-primary/20">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Perusahaan</div>
          <div className="text-3xl font-display font-bold text-primary mt-1" data-testid="admin-kpi-companies">{stats.companies_count}</div>
        </Card>
        <Card className="p-5 card-flat">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Emisi (Global)</div>
          <div className="text-2xl font-display font-semibold" data-testid="admin-kpi-total">{stats.total_tco2e.toLocaleString('id-ID')} <span className="text-sm text-muted-foreground">tCO2e</span></div>
        </Card>
        <Card className="p-5 card-flat">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Disetujui / Pending</div>
          <div className="text-2xl font-display font-semibold">{stats.counts.approved} / {stats.counts.pending}</div>
          <div className="text-xs text-muted-foreground">Flagged: {stats.counts.flagged} · Rejected: {stats.counts.rejected}</div>
        </Card>
        <Card className="p-5 card-flat">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Menu Master Data</div>
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="outline" onClick={()=>nav("/admin/master")} data-testid="goto-master">Kelola Master</Button>
            <Button size="sm" variant="outline" onClick={()=>nav("/admin/audit")}>Audit</Button>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5 card-flat">
          <h3 className="font-display font-semibold mb-3">Komposisi Emisi per Scope (Global)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={scopeData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95}>
                {scopeData.map((d,i)=><Cell key={i} fill={d.color}/>)}
              </Pie>
              <Tooltip formatter={(v)=>`${v.toLocaleString('id-ID')} kg`} />
              <Legend/>
            </PieChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5 card-flat">
          <h3 className="font-display font-semibold mb-3">Ranking Emisi Perusahaan (Top 10)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={rankData} layout="vertical" margin={{left:10}}>
              <XAxis type="number" stroke="#888" fontSize={11}/>
              <YAxis dataKey="name" type="category" stroke="#888" fontSize={11} width={110}/>
              <Tooltip/>
              <Bar dataKey="kg" fill="hsl(152 43% 25%)" name="kg CO2e"/>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="p-5 card-flat">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <h3 className="font-display font-semibold flex items-center gap-2"><Buildings size={20} weight="duotone"/> Semua Perusahaan</h3>
          <div className="flex gap-2 flex-1 md:justify-end">
            <Input placeholder="Cari nama / industri..." value={q} onChange={e=>setQ(e.target.value)} className="max-w-xs" data-testid="admin-search"/>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44" data-testid="admin-status-filter"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="approved">Disetujui</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="flagged">Kekurangan</SelectItem>
                <SelectItem value="rejected">Ditolak</SelectItem>
                <SelectItem value="no_data">Belum ada data</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nama</TableHead><TableHead>Industri</TableHead><TableHead>Wilayah</TableHead>
            <TableHead>Log</TableHead><TableHead className="text-right">tCO2e</TableHead>
            <TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length===0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Tidak ada perusahaan</TableCell></TableRow>}
            {filtered.map(c => {
              const st = STATUS[c.report_status] || STATUS.no_data;
              return (
                <TableRow key={c.company_id} className="cursor-pointer hover:bg-muted" onClick={()=>nav(`/admin/companies/${c.company_id}`)} data-testid={`co-row-${c.company_id}`}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-sm">{c.industry || "-"}</TableCell>
                  <TableCell className="text-sm">{c.region || "-"}</TableCell>
                  <TableCell>{c.log_count}</TableCell>
                  <TableCell className="text-right font-medium">{c.total_tco2e.toLocaleString('id-ID')}</TableCell>
                  <TableCell><Badge {...(st.variant?{variant:st.variant}:{})} className={st.cls}>{st.label}</Badge></TableCell>
                  <TableCell><Button size="sm" variant="ghost">Buka →</Button></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
