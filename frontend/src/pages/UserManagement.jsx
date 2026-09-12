import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { UserPlus } from "@phosphor-icons/react";

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("staff");

  const load = () => api.get("/users").then(r=>setUsers(r.data));
  useEffect(() => { load(); }, []);

  const invite = async () => {
    if (!email) { toast.error("Email wajib diisi"); return; }
    try {
      const { data } = await api.post("/users/invite", { email, role });
      toast.success(data.message || "Undangan tersimpan");
      setEmail("");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Gagal"); }
  };

  const updateRole = async (uid, r) => {
    await api.put(`/users/${uid}/role`, { role: r });
    toast.success("Peran diperbarui");
    load();
  };

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-display font-semibold">Manajemen Pengguna</h1>
      <p className="text-muted-foreground mt-1">Kelola staf, supervisor, dan admin perusahaan.</p>

      <Card className="mt-6 p-5 card-flat">
        <h3 className="font-display font-semibold mb-3">Undang Pengguna Baru</h3>
        <div className="flex flex-col md:flex-row gap-2">
          <Input placeholder="email@perusahaan.com" value={email} onChange={e=>setEmail(e.target.value)} className="flex-1" data-testid="invite-email"/>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="md:w-48" data-testid="invite-role"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="staff">Staf / Operator</SelectItem>
              <SelectItem value="supervisor">Supervisor / EHS</SelectItem>
              <SelectItem value="admin">Admin Perusahaan</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={invite} data-testid="invite-btn"><UserPlus size={16}/> Undang</Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Pengguna otomatis bergabung ke perusahaan Anda saat sign-in dengan email tersebut.</p>
      </Card>

      <Card className="mt-4 p-5 card-flat">
        <h3 className="font-display font-semibold mb-3">Anggota Perusahaan</h3>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nama</TableHead><TableHead>Email</TableHead><TableHead>Peran</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {users.map(u => (
              <TableRow key={u.user_id}>
                <TableCell className="font-medium flex items-center gap-2">
                  {u.picture && <img src={u.picture} className="w-7 h-7 rounded-full"/>}
                  {u.name}
                  {u.is_super_admin && <Badge className="text-[10px]">Super</Badge>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <Select value={u.role} onValueChange={v=>updateRole(u.user_id, v)}>
                    <SelectTrigger className="w-40" data-testid={`role-${u.user_id}`}><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="staff">Staf</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell><Badge variant="outline">{new Date(u.created_at).toLocaleDateString('id-ID')}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
