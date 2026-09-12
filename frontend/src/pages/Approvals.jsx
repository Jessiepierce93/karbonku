import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { api, monthNames } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";

export default function Approvals() {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState([]);
  const [facs, setFacs] = useState([]);
  const [rejectId, setRejectId] = useState(null);
  const [reason, setReason] = useState("");
  const canApprove = user?.role === "supervisor" || user?.role === "admin" || user?.is_super_admin;

  const load = async () => {
    const [d, f] = await Promise.all([api.get("/emissions", { params: { status: "draft" } }), api.get("/facilities")]);
    setDrafts(d.data); setFacs(f.data);
  };
  useEffect(() => { load(); }, []);

  const approve = async (id) => {
    try { await api.post(`/emissions/${id}/approve`); toast.success("Disetujui"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };
  const reject = async () => {
    if (!reason) { toast.error("Alasan wajib diisi"); return; }
    try {
      await api.post(`/emissions/${rejectId}/reject`, { reason });
      toast.success("Ditolak");
      setRejectId(null); setReason(""); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-display font-semibold">Persetujuan Data Emisi</h1>
      <p className="text-muted-foreground mt-1">Verifikasi log Draft dari Staf/Operator sebelum masuk laporan resmi.</p>

      {!canApprove && <Card className="mt-6 p-6 text-muted-foreground card-flat">Hanya Supervisor/Admin yang dapat menyetujui.</Card>}

      <Card className="mt-6 p-5 card-flat">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Periode</TableHead><TableHead>Scope</TableHead><TableHead>Kategori</TableHead>
            <TableHead>Fasilitas</TableHead><TableHead>Data</TableHead>
            <TableHead className="text-right">kg CO2e</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {drafts.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Tidak ada draft menunggu persetujuan</TableCell></TableRow>}
            {drafts.map(l => (
              <TableRow key={l.log_id}>
                <TableCell>{monthNames[l.period_month]} {l.period_year}</TableCell>
                <TableCell><Badge variant="outline">Scope {l.scope}</Badge></TableCell>
                <TableCell className="text-sm">{l.category}</TableCell>
                <TableCell>{facs.find(f=>f.facility_id===l.facility_id)?.name}</TableCell>
                <TableCell>{l.activity_data} {l.unit}</TableCell>
                <TableCell className="text-right font-medium">{l.total_kg_co2e.toLocaleString('id-ID',{maximumFractionDigits:2})}</TableCell>
                <TableCell className="flex gap-2 justify-end">
                  {canApprove && <>
                    <Button size="sm" onClick={()=>approve(l.log_id)} data-testid={`approve-${l.log_id}`}>Setujui</Button>
                    <Button size="sm" variant="destructive" onClick={()=>{setRejectId(l.log_id); setReason("");}} data-testid={`reject-${l.log_id}`}>Tolak</Button>
                  </>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!rejectId} onOpenChange={(o)=>!o && setRejectId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tolak Data Emisi</DialogTitle></DialogHeader>
          <Label>Alasan penolakan *</Label>
          <Textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} placeholder="Contoh: data ganda, satuan salah, dsb." data-testid="reject-reason"/>
          <DialogFooter>
            <Button variant="ghost" onClick={()=>setRejectId(null)}>Batal</Button>
            <Button variant="destructive" onClick={reject} data-testid="reject-confirm">Kirim Penolakan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
