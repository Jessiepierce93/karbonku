import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { api, monthNames } from "@/lib/api";
import { toast } from "sonner";

const BADGE = {
  draft:{label:"Draft",variant:"outline"},
  approved:{label:"Disetujui",cls:"bg-primary/15 text-primary border-primary/30"},
  flagged:{label:"Kekurangan",cls:"bg-orange-100 text-orange-800 border-orange-300"},
  rejected:{label:"Ditolak",variant:"destructive"},
};

export default function AdminCompanyDetail() {
  const { cid } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [reviewLog, setReviewLog] = useState(null);
  const [action, setAction] = useState("approve");
  const [reason, setReason] = useState("");

  const load = () => api.get(`/admin/companies/${cid}/emissions`).then(r=>setData(r.data));
  useEffect(() => { load(); }, [cid]);

  const submitReview = async () => {
    if (action !== "approve" && !reason) { toast.error("Alasan wajib"); return; }
    try {
      await api.post(`/admin/emissions/${reviewLog.log_id}/review`, { action, reason });
      toast.success("Tinjauan tersimpan");
      setReviewLog(null); setReason(""); load();
    } catch(e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };

  if (!data) return <div className="p-8 text-muted-foreground">Memuat...</div>;
  const facMap = Object.fromEntries(data.facilities.map(f=>[f.facility_id, f.name]));

  return (
    <div className="p-6 md:p-8">
      <Button variant="ghost" size="sm" onClick={()=>nav("/admin")} data-testid="admin-back">← Kembali</Button>
      <h1 className="text-3xl font-display font-semibold mt-2">{data.company?.name}</h1>
      <div className="text-sm text-muted-foreground">
        {data.company?.industry} · {data.company?.region} · {data.company?.size}
      </div>

      <Card className="mt-6 p-5 card-flat">
        <h3 className="font-display font-semibold mb-3">Semua Log Emisi ({data.emissions.length})</h3>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Periode</TableHead><TableHead>Scope</TableHead><TableHead>Kategori</TableHead>
            <TableHead>Fasilitas</TableHead><TableHead>Data</TableHead>
            <TableHead className="text-right">kg CO2e</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.emissions.map(l => {
              const b = BADGE[l.status] || {label:l.status, variant:"outline"};
              return (
                <TableRow key={l.log_id}>
                  <TableCell>{monthNames[l.period_month]} {l.period_year}</TableCell>
                  <TableCell><Badge variant="outline">Scope {l.scope}</Badge></TableCell>
                  <TableCell className="text-sm">{l.category}</TableCell>
                  <TableCell>{facMap[l.facility_id]}</TableCell>
                  <TableCell>{l.activity_data} {l.unit}</TableCell>
                  <TableCell className="text-right font-medium">{l.total_kg_co2e.toLocaleString('id-ID',{maximumFractionDigits:2})}</TableCell>
                  <TableCell><Badge {...(b.variant?{variant:b.variant}:{})} className={b.cls}>{b.label}</Badge></TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={()=>{setReviewLog(l); setAction("approve"); setReason("");}} data-testid={`admin-review-${l.log_id}`}>Tinjau</Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!reviewLog} onOpenChange={(o)=>!o && setReviewLog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tinjau Log Emisi</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {reviewLog && <>Periode: {monthNames[reviewLog.period_month]} {reviewLog.period_year} · {reviewLog.total_kg_co2e} kg CO2e</>}
            </div>
            <div className="flex gap-2">
              {["approve","flag","reject"].map(a => (
                <Button key={a} variant={action===a?"default":"outline"} size="sm" onClick={()=>setAction(a)} data-testid={`review-action-${a}`}>
                  {a==="approve"?"Setujui":a==="flag"?"Tandai Kekurangan":"Tolak"}
                </Button>
              ))}
            </div>
            {action !== "approve" && (
              <div><Label>Alasan / Catatan *</Label>
                <Textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} data-testid="review-reason"/>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={()=>setReviewLog(null)}>Batal</Button>
            <Button onClick={submitReview} data-testid="review-submit">Kirim</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
