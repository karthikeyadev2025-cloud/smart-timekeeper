import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Building2, Trash2, GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/branches")({
  component: BranchesPage,
});

function BranchesPage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const tenantId = user?.tenant?.id;
  const isSchool = user?.tenant?.tenant_type === "school";
  const noun = isSchool ? "Campus" : "Branch";
  const nounPlural = isSchool ? "Campuses" : "Branches";
  const [open, setOpen] = useState(false);

  const { data: branches } = useQuery({
    queryKey: ["branches", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("*").eq("tenant_id", tenantId!).order("created_at");
      return data ?? [];
    },
  });

  if (!tenantId) return <AppShell><Card className="p-6">You need a company to manage {nounPlural.toLowerCase()}.</Card></AppShell>;

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              {isSchool ? <GraduationCap className="h-7 w-7" /> : <Building2 className="h-7 w-7" />}
              {nounPlural}
            </h1>
            <p className="text-muted-foreground">{branches?.length ?? 0} {nounPlural.toLowerCase()} · Organize staff, attendance & reports per location.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> Add {noun.toLowerCase()}</Button></DialogTrigger>
            <DialogContent>
              <AddBranchForm tenantId={tenantId} noun={noun} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["branches"] }); }} />
            </DialogContent>
          </Dialog>
        </header>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(branches ?? []).map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="font-mono text-xs">{b.code ?? "—"}</TableCell>
                  <TableCell>{b.city ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{b.address ?? "—"}</TableCell>
                  <TableCell><Badge variant={b.is_active ? "default" : "secondary"}>{b.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={async () => {
                      if (!confirm(`Delete ${b.name}? Staff & records will be unassigned but kept.`)) return;
                      const { error } = await supabase.from("branches").delete().eq("id", b.id);
                      if (error) toast.error(error.message);
                      else { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["branches"] }); }
                    }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {branches?.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No {nounPlural.toLowerCase()} yet. Add your first one above.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppShell>
  );
}

function AddBranchForm({ tenantId, noun, onDone }: { tenantId: string; noun: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("branches").insert({
      tenant_id: tenantId,
      name,
      code: code || null,
      city: city || null,
      address: address || null,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else { toast.success(`${noun} created`); onDone(); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <DialogHeader><DialogTitle>Add {noun.toLowerCase()}</DialogTitle></DialogHeader>
      <div className="space-y-1"><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} required placeholder="HQ / Andheri / Primary Campus" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>Code</Label><Input value={code} onChange={e => setCode(e.target.value)} placeholder="HQ-01" /></div>
        <div className="space-y-1"><Label>City</Label><Input value={city} onChange={e => setCity(e.target.value)} placeholder="Mumbai" /></div>
      </div>
      <div className="space-y-1"><Label>Address</Label><Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, area, pincode" /></div>
      <DialogFooter><Button type="submit" disabled={loading}>{loading ? "Saving…" : `Create ${noun.toLowerCase()}`}</Button></DialogFooter>
    </form>
  );
}
