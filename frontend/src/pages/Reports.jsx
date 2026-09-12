import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, BACKEND_URL } from "@/lib/api";
import { toast } from "sonner";
import { FileArrowDown, Sparkle } from "@phosphor-icons/react";

export default function Reports() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [reco, setReco] = useState("");
  const [loading, setLoading] = useState(false);

  const download = (type) => {
    const url = `${BACKEND_URL}/api/reports/${type}?year=${year}`;
    fetch(url, { credentials: "include" })
      .then(r => { if (!r.ok) throw new Error("Gagal"); return r.blob(); })
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `laporan_karbon_${year}.${type}`;
        a.click();
      }).catch(() => toast.error("Gagal mengunduh"));
  };

  const genReco = async () => {
    setLoading(true); setReco("");
    try {
      const { data } = await api.post("/ai/recommendations");
      setReco(data.recommendations);
      toast.success("Rekomendasi dihasilkan");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gagal menghasilkan");
    } finally { setLoading(false); }
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-display font-semibold">Laporan & Rekomendasi AI</h1>
        <p className="text-muted-foreground mt-1">Ekspor laporan berstandar GHG Protocol & GRI 305 serta rekomendasi decarbonization berbasis AI.</p>
      </div>

      <Card className="p-6 card-flat">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold">Ekspor Laporan</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Tahun</span>
            <Select value={String(year)} onValueChange={v=>setYear(Number(v))}>
              <SelectTrigger className="w-32" data-testid="report-year"><SelectValue/></SelectTrigger>
              <SelectContent>
                {[0,1,2,3].map(o=>{ const y=new Date().getFullYear()-o; return <SelectItem key={y} value={String(y)}>{y}</SelectItem>; })}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Berisi rekapitulasi Scope 1/2/3, breakdown per fasilitas, dan intensitas karbon. Hanya mencakup entri berstatus <b>Disetujui</b>.</p>
        <div className="flex gap-2">
          <Button onClick={()=>download("csv")} data-testid="export-csv-btn"><FileArrowDown size={16}/> Ekspor CSV</Button>
          <Button onClick={()=>download("pdf")} variant="outline" data-testid="export-pdf-btn"><FileArrowDown size={16}/> Ekspor PDF</Button>
        </div>
      </Card>

      <Card className="p-6 card-flat bg-primary/5 border-primary/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Sparkle size={26} weight="duotone" className="text-primary"/>
            <div>
              <h3 className="font-display font-semibold">Decarbonization Roadmap (AI)</h3>
              <p className="text-sm text-muted-foreground">Rekomendasi reduksi emisi otomatis dari data Anda — Gemini 3 Flash.</p>
            </div>
          </div>
          <Button onClick={genReco} disabled={loading} data-testid="gen-reco-btn">{loading ? "Menghasilkan..." : "Hasilkan Rekomendasi"}</Button>
        </div>
        {reco && (
          <div className="mt-4 whitespace-pre-wrap bg-card border border-border rounded p-5 text-sm leading-relaxed" data-testid="reco-output">
            {reco}
          </div>
        )}
      </Card>
    </div>
  );
}
