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
import { Buildings } from "@phosphor-icons/react";

export default function SignUp() {
  const { user, refresh, logout } = useAuth();
  const nav = useNavigate();
  const [meta, setMeta] = useState({ industries: [], sizes: [], regions: [] });
  const [form, setForm] = useState({ name: "", industry: "", size: "", region: "jamali" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get("/meta").then(r => setMeta(r.data)); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Nama perusahaan wajib diisi"); return; }
    setSaving(true);
    try {
      await api.post("/companies", form);
      await refresh();
      toast.success("Perusahaan berhasil didaftarkan");
      nav("/onboarding");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Gagal mendaftar");
    } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 marketing-hero">
      <Card className="max-w-lg w-full p-8 card-flat">
        <div className="flex items-center gap-3 mb-6">
          <Buildings size={32} weight="duotone" className="text-primary" />
          <div>
            <h1 className="text-2xl font-display font-semibold">Daftarkan Perusahaan</h1>
            <p className="text-sm text-muted-foreground">Hi <b>{user?.name}</b> — Anda akan menjadi <b>Admin</b> perusahaan ini.</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Nama Perusahaan *</Label>
            <Input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} data-testid="signup-company-name" placeholder="PT Contoh Sejahtera" />
          </div>
          <div>
            <Label>Industri</Label>
            <Select value={form.industry} onValueChange={v=>setForm({...form, industry:v})}>
              <SelectTrigger data-testid="signup-industry"><SelectValue placeholder="Pilih industri" /></SelectTrigger>
              <SelectContent>{meta.industries.map(i=><SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ukuran Bisnis</Label>
            <Select value={form.size} onValueChange={v=>setForm({...form, size:v})}>
              <SelectTrigger data-testid="signup-size"><SelectValue placeholder="Pilih ukuran" /></SelectTrigger>
              <SelectContent>{meta.sizes.map(i=><SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Wilayah Operasional Utama</Label>
            <Select value={form.region} onValueChange={v=>setForm({...form, region:v})}>
              <SelectTrigger data-testid="signup-region"><SelectValue /></SelectTrigger>
              <SelectContent>{meta.regions.map(r=><SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saving} data-testid="signup-submit-btn">
              {saving ? "Menyimpan..." : "Daftar Perusahaan"}
            </Button>
            <Button type="button" variant="ghost" onClick={logout} data-testid="signup-logout-btn">Keluar</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
