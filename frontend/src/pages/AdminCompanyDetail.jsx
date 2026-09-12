import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, monthNames } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash, PencilSimple } from "@phosphor-icons/react";

const BADGE = {
  draft:{label:"Draft",variant:"outline"},
  approved:{label:"Disetujui",cls:"bg-primary/15 text-primary border-primary/30"},
  flagged:{label:"Kekurangan",cls:"bg-orange-100 text-orange-800 border-orange-300"},
  rejected:{label:"Ditolak",variant:"destructive"},
};

function EmissionsTab({ cid, emissions, facMap, reload }) {
  const [reviewLog, setReviewLog] = useState(null);
  const [action, setAction] = useState("approve");
  const [reason, setReason] = useState("");
  const [editLog, setEditLog] = useState(null);
  const [editForm, setEditForm] = useState({ activity_data: 0, period_year: 2026, period_month: 1, notes: "" });

  const submitReview = async () => {
    if (action !== "approve" && !reason) { toast.error("Alasan wajib"); return; }
    try {
      await api.post(`/admin/emissions/${reviewLog.log_id}/review`, { action, reason });
      toast.success("Tinjauan tersimpan");
      setReviewLog(null); setReason(""); reload();
    } catch(e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };
  const openEdit = (l) => { setEditLog(l); setEditForm({ activity_data: l.activity_data, period_year: l.period_year, period_month: l.period_month, notes: l.notes || "" }); };
  const submitEdit = async () => {
    try { await api.put(`/admin/emissions/${editLog.log_id}`, editForm); toast.success("Log diperbarui"); setEditLog(null); reload(); }
    catch(e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };
  const del = async (l) => {
    if (!window.confirm("Hapus log emisi ini?")) return;
    try { await api.delete(`/admin/emissions/${l.log_id}`); toast.success("Terhapus"); reload(); }
    catch(e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };

  return (
    <Card className="p-5 card-flat">
      <h3 className="font-display font-semibold mb-3">Log Emisi ({emissions.length})</h3>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Periode</TableHead><TableHead>Scope</TableHead><TableHead>Kategori</TableHead>
          <TableHead>Fasilitas</TableHead><TableHead>Data</TableHead>
          <TableHead className="text-right">kg CO2e</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {emissions.map(l => {
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
                <TableCell className="flex gap-1 justify-end">
                  <Button size="sm" variant="ghost" onClick={()=>{setReviewLog(l); setAction("approve"); setReason("");}} data-testid={`admin-review-${l.log_id}`}>Tinjau</Button>
                  <Button size="sm" variant="ghost" onClick={()=>openEdit(l)} data-testid={`admin-edit-em-${l.log_id}`}><PencilSimple size={14}/></Button>
                  <Button size="sm" variant="ghost" onClick={()=>del(l)}><Trash size={14} className="text-destructive"/></Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

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
              <div><Label>Alasan / Catatan *</Label><Textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} data-testid="review-reason"/></div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={()=>setReviewLog(null)}>Batal</Button>
            <Button onClick={submitReview} data-testid="review-submit">Kirim</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editLog} onOpenChange={(o)=>!o && setEditLog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Log Emisi</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Data Aktivitas</Label><Input type="number" step="0.01" value={editForm.activity_data} onChange={e=>setEditForm({...editForm,activity_data:Number(e.target.value)})} data-testid="edit-em-activity"/></div>
            <div><Label>Tahun</Label><Input type="number" value={editForm.period_year} onChange={e=>setEditForm({...editForm,period_year:Number(e.target.value)})}/></div>
            <div><Label>Bulan</Label><Input type="number" min="1" max="12" value={editForm.period_month} onChange={e=>setEditForm({...editForm,period_month:Number(e.target.value)})}/></div>
            <div className="col-span-2"><Label>Catatan</Label><Textarea rows={2} value={editForm.notes} onChange={e=>setEditForm({...editForm,notes:e.target.value})}/></div>
          </div>
          <DialogFooter><Button onClick={submitEdit} data-testid="edit-em-submit">Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function FacilitiesTab({ cid, facilities, reload }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name:"", type:"office", address:"", region:"jamali" });
  const openCreate = () => { setEditing(null); setForm({ name:"", type:"office", address:"", region:"jamali" }); setOpen(true); };
  const openEdit = (f) => { setEditing(f.facility_id); setForm({ name:f.name, type:f.type, address:f.address||"", region:f.region||"jamali" }); setOpen(true); };
  const submit = async () => {
    if (!form.name) { toast.error("Nama wajib"); return; }
    try {
      if (editing) await api.put(`/admin/facilities/${editing}`, form);
      else await api.post(`/admin/companies/${cid}/facilities`, form);
      toast.success("Tersimpan"); setOpen(false); reload();
    } catch(e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };
  const del = async (f) => {
    if (!window.confirm(`Hapus fasilitas "${f.name}"?`)) return;
    try { await api.delete(`/admin/facilities/${f.facility_id}`); reload(); }
    catch(e) { toast.error("Gagal"); }
  };
  return (
    <Card className="p-5 card-flat">
      <div className="flex justify-between mb-3">
        <h3 className="font-display font-semibold">Fasilitas ({facilities.length})</h3>
        <Button size="sm" onClick={openCreate} data-testid="admin-add-fac-btn"><Plus size={14}/> Tambah</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Tipe</TableHead><TableHead>Wilayah</TableHead><TableHead>Alamat</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {facilities.map(f => (
            <TableRow key={f.facility_id}>
              <TableCell className="font-medium">{f.name}</TableCell>
              <TableCell className="capitalize">{f.type}</TableCell>
              <TableCell>{f.region}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{f.address}</TableCell>
              <TableCell className="flex gap-1 justify-end">
                <Button size="sm" variant="ghost" onClick={()=>openEdit(f)}><PencilSimple size={14}/></Button>
                <Button size="sm" variant="ghost" onClick={()=>del(f)}><Trash size={14} className="text-destructive"/></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Tambah"} Fasilitas</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nama</Label><Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} data-testid="admin-fac-name"/></div>
            <div><Label>Tipe</Label>
              <Select value={form.type} onValueChange={v=>setForm({...form,type:v})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="office">Kantor</SelectItem>
                  <SelectItem value="plant">Pabrik</SelectItem>
                  <SelectItem value="branch">Cabang</SelectItem>
                  <SelectItem value="warehouse">Gudang</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Alamat</Label><Input value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></div>
          </div>
          <DialogFooter><Button onClick={submit} data-testid="admin-fac-submit">Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function UsersTab({ cid }) {
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email:"", name:"", role:"staff" });
  const load = () => api.get(`/admin/companies/${cid}/users`).then(r=>setUsers(r.data));
  useEffect(()=>{load();},[cid]);
  const add = async () => {
    if (!form.email || !form.name) { toast.error("Lengkapi email & nama"); return; }
    try { await api.post(`/admin/companies/${cid}/users`, form); toast.success("Pengguna ditambahkan"); setOpen(false); setForm({email:"",name:"",role:"staff"}); load(); }
    catch(e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };
  const updateRole = async (u, role) => {
    try { await api.put(`/admin/users/${u.user_id}`, { role }); toast.success("Peran diperbarui"); load(); }
    catch(e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };
  const del = async (u) => {
    if (!window.confirm(`Hapus pengguna ${u.email}?`)) return;
    try { await api.delete(`/admin/users/${u.user_id}`); load(); }
    catch(e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };
  return (
    <Card className="p-5 card-flat">
      <div className="flex justify-between mb-3">
        <h3 className="font-display font-semibold">Pengguna ({users.length})</h3>
        <Button size="sm" onClick={()=>setOpen(true)} data-testid="admin-add-user-btn"><Plus size={14}/> Tambah</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Email</TableHead><TableHead>Peran</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {users.map(u => (
            <TableRow key={u.user_id}>
              <TableCell className="font-medium">{u.name}{u.is_super_admin && <Badge className="ml-2 text-[10px]">Super</Badge>}</TableCell>
              <TableCell className="text-sm">{u.email}</TableCell>
              <TableCell>
                {u.is_super_admin ? <Badge variant="outline">admin</Badge> :
                <Select value={u.role} onValueChange={v=>updateRole(u,v)}>
                  <SelectTrigger className="w-36" data-testid={`admin-role-${u.user_id}`}><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="staff">Staf</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                  </SelectContent>
                </Select>}
              </TableCell>
              <TableCell className="text-right">
                {!u.is_super_admin && <Button size="sm" variant="ghost" onClick={()=>del(u)}><Trash size={14} className="text-destructive"/></Button>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tambah Pengguna</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} data-testid="admin-user-email"/></div>
            <div><Label>Nama</Label><Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} data-testid="admin-user-name"/></div>
            <div><Label>Peran</Label>
              <Select value={form.role} onValueChange={v=>setForm({...form,role:v})}>
                <SelectTrigger data-testid="admin-user-role"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="staff">Staf</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={add} data-testid="admin-user-submit">Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function AdminCompanyDetail() {
  const { cid } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);

  const load = () => api.get(`/admin/companies/${cid}/emissions`).then(r=>setData(r.data));
  useEffect(() => { load(); }, [cid]);

  if (!data) return <div className="p-8 text-muted-foreground">Memuat...</div>;
  const facMap = Object.fromEntries(data.facilities.map(f=>[f.facility_id, f.name]));

  return (
    <div className="p-6 md:p-8">
      <Button variant="ghost" size="sm" onClick={()=>nav("/admin")} data-testid="admin-back">← Kembali</Button>
      <h1 className="text-3xl font-display font-semibold mt-2">{data.company?.name}</h1>
      <div className="text-sm text-muted-foreground">
        {data.company?.industry} · {data.company?.region} · {data.company?.size}
      </div>

      <Tabs defaultValue="emissions" className="mt-6">
        <TabsList>
          <TabsTrigger value="emissions" data-testid="admin-tab-emissions">Emisi ({data.emissions.length})</TabsTrigger>
          <TabsTrigger value="facilities" data-testid="admin-tab-facilities">Fasilitas ({data.facilities.length})</TabsTrigger>
          <TabsTrigger value="users" data-testid="admin-tab-users">Pengguna</TabsTrigger>
        </TabsList>
        <TabsContent value="emissions">
          <EmissionsTab cid={cid} emissions={data.emissions} facMap={facMap} reload={load}/>
        </TabsContent>
        <TabsContent value="facilities">
          <FacilitiesTab cid={cid} facilities={data.facilities} reload={load}/>
        </TabsContent>
        <TabsContent value="users">
          <UsersTab cid={cid}/>
        </TabsContent>
      </Tabs>
    </div>
  );
}
