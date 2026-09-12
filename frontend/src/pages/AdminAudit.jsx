import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

export default function AdminAudit() {
  const [logs, setLogs] = useState([]);
  useEffect(() => { api.get("/admin/audit-logs").then(r=>setLogs(r.data)); }, []);
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-display font-semibold">Audit Trail Global</h1>
      <p className="text-muted-foreground mt-1">Semua aksi Super Admin & perusahaan.</p>
      <Card className="mt-6 p-5 card-flat">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Waktu</TableHead><TableHead>Aksi</TableHead>
            <TableHead>Company</TableHead><TableHead>User</TableHead><TableHead>Detail</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {logs.map(l => (
              <TableRow key={l.audit_id}>
                <TableCell className="text-xs">{new Date(l.created_at).toLocaleString('id-ID')}</TableCell>
                <TableCell><Badge variant="outline">{l.action}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{l.company_id?.slice(0,14)}</TableCell>
                <TableCell className="font-mono text-xs">{l.user_id?.slice(0,14)}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-md truncate">{JSON.stringify(l.meta)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
