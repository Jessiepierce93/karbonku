import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function Onboarding() {
  const { company, refresh } = useAuth();
  const nav = useNavigate();
  const [meta, setMeta] = useState({ industries: [], sizes: [], regions: [] });
  const [f, setF] = useState({ industry: "", size: "", region: "jamali", org_boundary: "operational_control", employees: 0, annual_production: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/meta").then(r => setMeta(r.data));
    if (company) setF({
      industry: company.industry || "",
      size: company.size || "",
      region: company.region || "jamali",
      org_boundary: company.org_boundary || "operational_control",
      employees: company.employees || 0,
      annual_production: company.annual_production || 0,
    });
  }, [company]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/companies/me", f);
      await refresh();
      toast.success("Profil bisnis tersimpan");
      nav("/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Gagal menyimpan");
    } finally { setSaving(false); }
  };

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto">
      <h1 className="text-3xl font-display font-semibold">Onboarding Profil Bisnis</h1>
      <p className="text-muted-foreground mt-1">Lengkapi profil agar perhitungan intensitas karbon lebih akurat.</p>
      <Card className="mt-6 p-6 card-flat">
        <form onSubmit={submit} className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Industri</Label>
            <Select value={f.industry} onValueChange={v=>setF({...f, industry:v})}>
              <SelectTrigger data-testid="onb-industry"><SelectValue placeholder="Pilih industri" /></SelectTrigger>
              <SelectContent>{meta.industries.map(i=><SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ukuran Bisnis</Label>
            <Select value={f.size} onValueChange={v=>setF({...f, size:v})}>
              <SelectTrigger data-testid="onb-size"><SelectValue placeholder="Pilih ukuran"/></SelectTrigger>
              <SelectContent>{meta.sizes.map(i=><SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Organizational Boundary</Label>
            <Select value={f.org_boundary} onValueChange={v=>setF({...f, org_boundary:v})}>
              <SelectTrigger data-testid="onb-boundary"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="operational_control">Operational Control</SelectItem>
                <SelectItem value="financial_control">Financial Control</SelectItem>
                <SelectItem value="equity_share">Equity Share</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Wilayah Operasional Utama (Grid EF)</Label>
            <Select value={f.region} onValueChange={v=>setF({...f, region:v})}>
              <SelectTrigger data-testid="onb-region"><SelectValue /></SelectTrigger>
              <SelectContent>{meta.regions.map(r=><SelectItem key={r.id} value={r.id}>{r.name} ({r.factor} kgCO2e/kWh)</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Jumlah Karyawan</Label>
            <Input type="number" min="0" value={f.employees} onChange={e=>setF({...f, employees: Number(e.target.value)})} data-testid="onb-employees" />
          </div>
          <div>
            <Label>Produksi Tahunan (unit)</Label>
            <Input type="number" min="0" step="0.01" value={f.annual_production} onChange={e=>setF({...f, annual_production: Number(e.target.value)})} data-testid="onb-production" />
          </div>
          <div className="md:col-span-2 flex gap-2 pt-2">
            <Button type="submit" disabled={saving} data-testid="onb-submit">{saving ? "Menyimpan..." : "Simpan & Lanjut ke Dashboard"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
