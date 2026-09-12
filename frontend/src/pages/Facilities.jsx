import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash } from "@phosphor-icons/react";

export default function Facilities() {
  const [tab, setTab] = useState("facilities");
  const [facs, setFacs] = useState([]);
  const [assets, setAssets] = useState([]);
  const [regions, setRegions] = useState([]);
  const [open, setOpen] = useState(false);
  const [openAsset, setOpenAsset] = useState(false);
  const [form, setForm] = useState({ name:"", type:"office", address:"", region:"jamali" });
  const [assetForm, setAssetForm] = useState({ facility_id:"", name:"", type:"vehicle", capacity:"" });

  const load = async () => {
    const [f, a, r] = await Promise.all([api.get("/facilities"), api.get("/assets"), api.get("/regions")]);
    setFacs(f.data); setAssets(a.data); setRegions(r.data);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.name) { toast.error("Nama wajib diisi"); return; }
    await api.post("/facilities", form);
    toast.success("Fasilitas tersimpan");
    setOpen(false); setForm({ name:"", type:"office", address:"", region:"jamali" });
    load();
  };
  const del = async (id) => { await api.delete(`/facilities/${id}`); toast.success("Terhapus"); load(); };

  const submitAsset = async () => {
    if (!assetForm.facility_id || !assetForm.name) { toast.error("Lengkapi fasilitas & nama"); return; }
    await api.post("/assets", assetForm);
    toast.success("Aset tersimpan");
    setOpenAsset(false); setAssetForm({ facility_id:"", name:"", type:"vehicle", capacity:"" });
    load();
  };
  const delAsset = async (id) => { await api.delete(`/assets/${id}`); toast.success("Terhapus"); load(); };

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-display font-semibold">Master Data</h1>
      <p className="text-muted-foreground mt-1">Kelola cabang/pabrik dan aset perusahaan.</p>

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="facilities" data-testid="tab-facilities">Fasilitas ({facs.length})</TabsTrigger>
          <TabsTrigger value="assets" data-testid="tab-assets">Aset ({assets.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="facilities">
          <Card className="mt-4 p-5 card-flat">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display font-semibold">Cabang / Pabrik / Kantor</h3>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild><Button data-testid="add-facility-btn"><Plus size={16}/> Tambah Fasilitas</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Tambah Fasilitas</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Nama</Label><Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} data-testid="fac-name"/></div>
                    <div><Label>Tipe</Label>
                      <Select value={form.type} onValueChange={v=>setForm({...form,type:v})}>
                        <SelectTrigger data-testid="fac-type"><SelectValue/></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="office">Kantor</SelectItem>
                          <SelectItem value="plant">Pabrik</SelectItem>
                          <SelectItem value="branch">Cabang</SelectItem>
                          <SelectItem value="warehouse">Gudang</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Wilayah</Label>
                      <Select value={form.region} onValueChange={v=>setForm({...form,region:v})}>
                        <SelectTrigger data-testid="fac-region"><SelectValue/></SelectTrigger>
                        <SelectContent>{regions.map(r=><SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Alamat</Label><Input value={form.address} onChange={e=>setForm({...form,address:e.target.value})} data-testid="fac-address"/></div>
                  </div>
                  <DialogFooter><Button onClick={submit} data-testid="fac-submit">Simpan</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Tipe</TableHead><TableHead>Wilayah</TableHead><TableHead>Alamat</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {facs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Belum ada fasilitas</TableCell></TableRow>}
                {facs.map(f => (
                  <TableRow key={f.facility_id}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell className="capitalize">{f.type}</TableCell>
                    <TableCell>{regions.find(r=>r.id===f.region)?.name || f.region}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{f.address}</TableCell>
                    <TableCell><Button size="sm" variant="ghost" onClick={()=>del(f.facility_id)} data-testid={`del-fac-${f.facility_id}`}><Trash size={14}/></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="assets">
          <Card className="mt-4 p-5 card-flat">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display font-semibold">Aset Perusahaan</h3>
              <Dialog open={openAsset} onOpenChange={setOpenAsset}>
                <DialogTrigger asChild><Button data-testid="add-asset-btn"><Plus size={16}/> Tambah Aset</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Tambah Aset</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Fasilitas</Label>
                      <Select value={assetForm.facility_id} onValueChange={v=>setAssetForm({...assetForm,facility_id:v})}>
                        <SelectTrigger data-testid="asset-facility"><SelectValue placeholder="Pilih fasilitas"/></SelectTrigger>
                        <SelectContent>{facs.map(f=><SelectItem key={f.facility_id} value={f.facility_id}>{f.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Nama Aset</Label><Input value={assetForm.name} onChange={e=>setAssetForm({...assetForm,name:e.target.value})} data-testid="asset-name"/></div>
                    <div><Label>Tipe</Label>
                      <Select value={assetForm.type} onValueChange={v=>setAssetForm({...assetForm,type:v})}>
                        <SelectTrigger data-testid="asset-type"><SelectValue/></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="vehicle">Kendaraan</SelectItem>
                          <SelectItem value="genset">Genset</SelectItem>
                          <SelectItem value="ac_refrigerant">AC / Refrigerant</SelectItem>
                          <SelectItem value="machinery">Mesin Pabrik</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Kapasitas</Label><Input value={assetForm.capacity} onChange={e=>setAssetForm({...assetForm,capacity:e.target.value})} placeholder="mis. 1500 cc / 100 kVA" data-testid="asset-capacity"/></div>
                  </div>
                  <DialogFooter><Button onClick={submitAsset} data-testid="asset-submit">Simpan</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Tipe</TableHead><TableHead>Fasilitas</TableHead><TableHead>Kapasitas</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {assets.length===0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Belum ada aset</TableCell></TableRow>}
                {assets.map(a => (
                  <TableRow key={a.asset_id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="capitalize">{a.type.replace('_',' ')}</TableCell>
                    <TableCell>{facs.find(f=>f.facility_id===a.facility_id)?.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.capacity}</TableCell>
                    <TableCell><Button size="sm" variant="ghost" onClick={()=>delAsset(a.asset_id)}><Trash size={14}/></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
