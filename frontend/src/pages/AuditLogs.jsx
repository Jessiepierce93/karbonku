import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  useEffect(() => { api.get("/audit-logs").then(r=>setLogs(r.data)); }, []);

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-display font-semibold">Audit Trail</h1>
      <p className="text-muted-foreground mt-1">Riwayat aksi seluruh pengguna perusahaan.</p>
      <Card className="mt-6 p-5 card-flat">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Waktu</TableHead><TableHead>Aksi</TableHead><TableHead>User ID</TableHead><TableHead>Detail</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {logs.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Belum ada log</TableCell></TableRow>}
            {logs.map(l => (
              <TableRow key={l.audit_id}>
                <TableCell className="text-sm">{new Date(l.created_at).toLocaleString('id-ID')}</TableCell>
                <TableCell><Badge variant="outline">{l.action}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{l.user_id.slice(0,14)}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-md truncate">{JSON.stringify(l.meta)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
