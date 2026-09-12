import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { api, monthNames } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { Plus } from "@phosphor-icons/react";

const STATUS_BADGE = {
  draft: { label: "Draft", variant: "outline" },
  approved: { label: "Disetujui", className: "bg-primary/15 text-primary border-primary/30" },
  rejected: { label: "Ditolak", variant: "destructive" },
};

export default function Emissions() {
  const { user, company } = useAuth();
  const [logs, setLogs] = useState([]);
  const [facs, setFacs] = useState([]);
  const [factors, setFactors] = useState([]);
  const [scope, setScope] = useState("1");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ facility_id:"", factor_id:"", activity_data:"", period_year: new Date().getFullYear(), period_month: new Date().getMonth()+1, notes:"" });
  const canInput = user?.role !== "supervisor";

  const load = async () => {
    const [l, f] = await Promise.all([api.get("/emissions"), api.get("/facilities")]);
    setLogs(l.data); setFacs(f.data);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    api.get("/emission-factors", { params: { scope: Number(scope) } }).then(r => {
      const list = r.data.filter(f => !f.region || f.region === (company?.region || "jamali"));
      setFactors(list);
      setForm(fm => ({ ...fm, factor_id: list[0]?.factor_id || "" }));
    });
  }, [scope, company]);

  const submit = async () => {
    if (!form.facility_id || !form.factor_id || !form.activity_data) { toast.error("Lengkapi semua field wajib"); return; }
    try {
      await api.post("/emissions", { ...form, activity_data: Number(form.activity_data) });
      toast.success("Data emisi tersimpan (status: Draft)");
      setOpen(false);
      setForm({ facility_id:"", factor_id: factors[0]?.factor_id || "", activity_data:"", period_year: new Date().getFullYear(), period_month: new Date().getMonth()+1, notes:"" });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal menyimpan");
    }
  };

  const del = async (id) => { await api.delete(`/emissions/${id}`); toast.success("Terhapus"); load(); };
  const selectedFactor = factors.find(f => f.factor_id === form.factor_id);
  const preview = selectedFactor && form.activity_data ? Number(form.activity_data) * selectedFactor.factor * (selectedFactor.category.startsWith("refrigerant") ? 1 : (selectedFactor.gwp || 1)) : 0;

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-display font-semibold">Log Emisi</h1>
          <p className="text-muted-foreground mt-1">Input data aktivitas bulanan. Kalkulasi otomatis berdasarkan faktor emisi.</p>
        </div>
        {canInput && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button data-testid="add-emission-btn"><Plus size={16}/> Input Data Emisi</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Input Data Emisi</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Scope</Label>
                  <Select value={scope} onValueChange={setScope}>
                    <SelectTrigger data-testid="em-scope"><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Scope 1 — Langsung</SelectItem>
                      <SelectItem value="2">Scope 2 — Energi</SelectItem>
                      <SelectItem value="3">Scope 3 — Rantai Nilai</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Fasilitas</Label>
                  <Select value={form.facility_id} onValueChange={v=>setForm({...form,facility_id:v})}>
                    <SelectTrigger data-testid="em-facility"><SelectValue placeholder="Pilih fasilitas"/></SelectTrigger>
                    <SelectContent>{facs.map(f=><SelectItem key={f.facility_id} value={f.facility_id}>{f.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Kategori Aktivitas</Label>
                  <Select value={form.factor_id} onValueChange={v=>setForm({...form,factor_id:v})}>
                    <SelectTrigger data-testid="em-factor"><SelectValue/></SelectTrigger>
                    <SelectContent>{factors.map(f=><SelectItem key={f.factor_id} value={f.factor_id}>{f.label} — {f.unit}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Data Aktivitas ({selectedFactor?.unit})</Label>
                    <Input type="number" step="0.01" value={form.activity_data} onChange={e=>setForm({...form,activity_data:e.target.value})} data-testid="em-activity"/>
                  </div>
                  <div><Label>Faktor Emisi</Label>
                    <Input readOnly value={selectedFactor ? `${selectedFactor.factor} kgCO2e/${selectedFactor.unit}` : ""}/>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Tahun</Label><Input type="number" value={form.period_year} onChange={e=>setForm({...form,period_year: Number(e.target.value)})} data-testid="em-year"/></div>
                  <div><Label>Bulan</Label>
                    <Select value={String(form.period_month)} onValueChange={v=>setForm({...form,period_month: Number(v)})}>
                      <SelectTrigger data-testid="em-month"><SelectValue/></SelectTrigger>
                      <SelectContent>{Array.from({length:12}, (_,i)=><SelectItem key={i+1} value={String(i+1)}>{monthNames[i+1]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Catatan</Label><Textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} rows={2} data-testid="em-notes"/></div>
                {preview > 0 && (
                  <div className="p-3 rounded bg-primary/5 border border-primary/20 text-sm">
                    <b>Preview:</b> {preview.toLocaleString('id-ID',{maximumFractionDigits:4})} kg CO2e ({(preview/1000).toLocaleString('id-ID',{maximumFractionDigits:6})} tCO2e)
                  </div>
                )}
              </div>
              <DialogFooter><Button onClick={submit} data-testid="em-submit">Simpan sebagai Draft</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="p-5 card-flat">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Periode</TableHead><TableHead>Scope</TableHead><TableHead>Kategori</TableHead>
            <TableHead>Fasilitas</TableHead><TableHead>Data</TableHead><TableHead className="text-right">kg CO2e</TableHead>
            <TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {logs.length===0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Belum ada log emisi</TableCell></TableRow>}
            {logs.map(l => {
              const badge = STATUS_BADGE[l.status];
              return (
                <TableRow key={l.log_id}>
                  <TableCell>{monthNames[l.period_month]} {l.period_year}</TableCell>
                  <TableCell><Badge variant="outline">Scope {l.scope}</Badge></TableCell>
                  <TableCell className="text-sm">{l.category}</TableCell>
                  <TableCell>{facs.find(f=>f.facility_id===l.facility_id)?.name}</TableCell>
                  <TableCell>{l.activity_data} {l.unit}</TableCell>
                  <TableCell className="text-right font-medium">{l.total_kg_co2e.toLocaleString('id-ID',{maximumFractionDigits:2})}</TableCell>
                  <TableCell><Badge {...(badge.variant?{variant:badge.variant}:{})} className={badge.className}>{badge.label}</Badge></TableCell>
                  <TableCell>
                    {l.status === "draft" && canInput && <Button size="sm" variant="ghost" onClick={()=>del(l.log_id)}>Hapus</Button>}
                    {l.status === "rejected" && <span className="text-xs text-destructive" title={l.reject_reason}>ⓘ Alasan</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
