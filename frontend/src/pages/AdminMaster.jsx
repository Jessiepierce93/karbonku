import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash } from "@phosphor-icons/react";

function FactorEditor() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ scope: 1, category:"", label:"", unit:"", factor: 0, gwp: 1, region:"", source:"Custom" });
  const load = () => api.get("/emission-factors").then(r=>setItems(r.data));
  useEffect(()=>{load();},[]);
  const submit = async () => {
    try { await api.post("/admin/emission-factors", form); toast.success("Faktor emisi ditambahkan"); setOpen(false); load(); }
    catch(e){ toast.error(e?.response?.data?.detail||"Gagal"); }
  };
  const del = async (id) => { await api.delete(`/admin/emission-factors/${id}`); toast.success("Terhapus"); load(); };
  return (
    <Card className="p-5 card-flat">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-display font-semibold">Faktor Emisi ({items.length})</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="add-factor-btn"><Plus size={16}/> Tambah</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Tambah Faktor Emisi</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Scope</Label>
                <Select value={String(form.scope)} onValueChange={v=>setForm({...form,scope:Number(v)})}>
                  <SelectTrigger data-testid="f-scope"><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="1">1</SelectItem><SelectItem value="2">2</SelectItem><SelectItem value="3">3</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Kategori (key)</Label><Input value={form.category} onChange={e=>setForm({...form,category:e.target.value})} data-testid="f-cat"/></div>
              <div className="col-span-2"><Label>Label</Label><Input value={form.label} onChange={e=>setForm({...form,label:e.target.value})} data-testid="f-label"/></div>
              <div><Label>Satuan</Label><Input value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} data-testid="f-unit"/></div>
              <div><Label>Faktor</Label><Input type="number" step="0.0001" value={form.factor} onChange={e=>setForm({...form,factor:Number(e.target.value)})} data-testid="f-factor"/></div>
              <div><Label>GWP</Label><Input type="number" step="0.01" value={form.gwp} onChange={e=>setForm({...form,gwp:Number(e.target.value)})}/></div>
              <div><Label>Region (opsional)</Label><Input value={form.region} onChange={e=>setForm({...form,region:e.target.value})}/></div>
              <div className="col-span-2"><Label>Sumber</Label><Input value={form.source} onChange={e=>setForm({...form,source:e.target.value})}/></div>
            </div>
            <DialogFooter><Button onClick={submit} data-testid="f-submit">Simpan</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Scope</TableHead><TableHead>Label</TableHead><TableHead>Kategori</TableHead><TableHead>Satuan</TableHead><TableHead>Faktor</TableHead><TableHead>GWP</TableHead><TableHead>Region</TableHead><TableHead>Sumber</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {items.map(i => (
            <TableRow key={i.factor_id}>
              <TableCell>{i.scope}</TableCell>
              <TableCell className="font-medium">{i.label}</TableCell>
              <TableCell className="text-xs font-mono">{i.category}</TableCell>
              <TableCell>{i.unit}</TableCell>
              <TableCell>{i.factor}</TableCell>
              <TableCell>{i.gwp}</TableCell>
              <TableCell>{i.region || "-"}</TableCell>
              <TableCell className="text-xs">{i.source}</TableCell>
              <TableCell><Button size="sm" variant="ghost" onClick={()=>del(i.factor_id)}><Trash size={14}/></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function RegionEditor() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ id:"", name:"", factor: 0 });
  const load = () => api.get("/admin/regions").then(r=>setItems(r.data));
  useEffect(()=>{load();},[]);
  const submit = async () => {
    if (!form.id || !form.name) { toast.error("Isi id & nama"); return; }
    await api.post("/admin/regions", form);
    toast.success("Wilayah tersimpan"); setForm({id:"",name:"",factor:0}); load();
  };
  const del = async (id) => { await api.delete(`/admin/regions/${id}`); load(); };
  return (
    <Card className="p-5 card-flat">
      <h3 className="font-display font-semibold mb-4">Wilayah & Grid EF</h3>
      <div className="grid md:grid-cols-4 gap-2 mb-4">
        <Input placeholder="id (mis. papua)" value={form.id} onChange={e=>setForm({...form,id:e.target.value})} data-testid="r-id"/>
        <Input placeholder="Nama Wilayah" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} data-testid="r-name"/>
        <Input type="number" step="0.01" placeholder="Faktor" value={form.factor} onChange={e=>setForm({...form,factor:Number(e.target.value)})} data-testid="r-factor"/>
        <Button onClick={submit} data-testid="r-submit"><Plus size={16}/> Simpan</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Nama</TableHead><TableHead>Faktor</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {items.map(i => (
            <TableRow key={i.id}>
              <TableCell className="font-mono text-xs">{i.id}</TableCell>
              <TableCell>{i.name}</TableCell>
              <TableCell>{i.factor}</TableCell>
              <TableCell><Button size="sm" variant="ghost" onClick={()=>del(i.id)}><Trash size={14}/></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function TypeEditor() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ kind:"facility_type", key:"", label:"" });
  const load = () => api.get("/admin/types").then(r=>setItems(r.data));
  useEffect(()=>{load();},[]);
  const submit = async () => {
    if (!form.key || !form.label) { toast.error("Lengkapi"); return; }
    await api.post("/admin/types", form); toast.success("Tersimpan"); setForm({...form, key:"", label:""}); load();
  };
  const del = async (kind, key) => { await api.delete(`/admin/types/${kind}/${key}`); load(); };
  return (
    <Card className="p-5 card-flat">
      <h3 className="font-display font-semibold mb-4">Tipe Fasilitas & Aset (Dinamis)</h3>
      <div className="grid md:grid-cols-4 gap-2 mb-4">
        <Select value={form.kind} onValueChange={v=>setForm({...form,kind:v})}>
          <SelectTrigger data-testid="t-kind"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="facility_type">Tipe Fasilitas</SelectItem>
            <SelectItem value="asset_type">Tipe Aset</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="key (mis. tractor)" value={form.key} onChange={e=>setForm({...form,key:e.target.value})} data-testid="t-key"/>
        <Input placeholder="Label" value={form.label} onChange={e=>setForm({...form,label:e.target.value})} data-testid="t-label"/>
        <Button onClick={submit} data-testid="t-submit"><Plus size={16}/> Simpan</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Kind</TableHead><TableHead>Key</TableHead><TableHead>Label</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {items.map(i => (
            <TableRow key={`${i.kind}-${i.key}`}>
              <TableCell className="text-xs">{i.kind}</TableCell>
              <TableCell className="font-mono text-xs">{i.key}</TableCell>
              <TableCell>{i.label}</TableCell>
              <TableCell><Button size="sm" variant="ghost" onClick={()=>del(i.kind,i.key)}><Trash size={14}/></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

export default function AdminMaster() {
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-display font-semibold">Kelola Master Data</h1>
      <p className="text-muted-foreground mt-1">CRUD dinamis untuk faktor emisi, wilayah, dan tipe fasilitas/aset.</p>
      <Tabs defaultValue="factors" className="mt-6">
        <TabsList>
          <TabsTrigger value="factors" data-testid="tab-factors">Faktor Emisi</TabsTrigger>
          <TabsTrigger value="regions" data-testid="tab-regions">Wilayah</TabsTrigger>
          <TabsTrigger value="types" data-testid="tab-types">Tipe</TabsTrigger>
        </TabsList>
        <TabsContent value="factors"><FactorEditor/></TabsContent>
        <TabsContent value="regions"><RegionEditor/></TabsContent>
        <TabsContent value="types"><TypeEditor/></TabsContent>
      </Tabs>
    </div>
  );
}
