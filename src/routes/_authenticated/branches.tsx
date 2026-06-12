import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Building2, Trash2, GraduationCap, Settings, Clock, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/branches")({
  component: BranchesPage,
});

type Branch = {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  address: string | null;
  is_active: boolean;
  default_radius_meters: number | null;
  checkin_window_start: string | null;
  checkin_window_end: string | null;
  checkout_window_start: string | null;
  checkout_window_end: string | null;
};

function BranchesPage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const tenantId = user?.tenant?.id;
  const isSchool = user?.tenant?.tenant_type === "school";
  const noun = isSchool ? "Campus" : "Branch";
  const nounPlural = isSchool ? "Campuses" : "Branches";
  const [open, setOpen] = useState(false);
  const [settingsBranch, setSettingsBranch] = useState<Branch | null>(null);

  const { data: branches } = useQuery({
    queryKey: ["branches", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("*").eq("tenant_id", tenantId!).order("created_at");
      return (data ?? []) as Branch[];
    },
  });

  if (!tenantId) return <AppShell><Card className="p-6">You need a company to manage {nounPlural.toLowerCase()}.</Card></AppShell>;

  const refresh = () => qc.invalidateQueries({ queryKey: ["branches"] });

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              {isSchool ? <GraduationCap className="h-7 w-7" /> : <Building2 className="h-7 w-7" />}
              {nounPlural}
            </h1>
            <p className="text-muted-foreground">{branches?.length ?? 0} {nounPlural.toLowerCase()} · Configure geofence radius & check-in windows per location.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> Add {noun.toLowerCase()}</Button></DialogTrigger>
            <DialogContent>
              <AddBranchForm tenantId={tenantId} noun={noun} onDone={() => { setOpen(false); refresh(); }} />
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
                <TableHead>Radius</TableHead>
                <TableHead>Check-in window</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(branches ?? []).map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="font-mono text-xs">{b.code ?? "—"}</TableCell>
                  <TableCell>{b.city ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" />{b.default_radius_meters ?? 100}m</Badge></TableCell>
                  <TableCell className="text-sm">
                    {b.checkin_window_start && b.checkin_window_end
                      ? <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-muted-foreground" />{fmt(b.checkin_window_start)}–{fmt(b.checkin_window_end)}</span>
                      : <span className="text-muted-foreground">Any time</span>}
                  </TableCell>
                  <TableCell><Badge variant={b.is_active ? "default" : "secondary"}>{b.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setSettingsBranch(b)} className="gap-1">
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={async () => {
                      if (!confirm(`Delete ${b.name}? Staff & records will be unassigned but kept.`)) return;
                      const { error } = await supabase.from("branches").delete().eq("id", b.id);
                      if (error) toast.error(error.message);
                      else { toast.success("Deleted"); refresh(); }
                    }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {branches?.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No {nounPlural.toLowerCase()} yet. Add your first one above.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <Dialog open={!!settingsBranch} onOpenChange={(v) => !v && setSettingsBranch(null)}>
          <DialogContent>
            {settingsBranch && (
              <BranchSettingsForm
                branch={settingsBranch}
                noun={noun}
                onDone={() => { setSettingsBranch(null); refresh(); }}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}

function fmt(t: string) {
  // "HH:MM:SS" -> "HH:MM"
  return t.slice(0, 5);
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

function BranchSettingsForm({ branch, noun, onDone }: { branch: Branch; noun: string; onDone: () => void }) {
  const [radius, setRadius] = useState<number>(branch.default_radius_meters ?? 100);
  const [ciStart, setCiStart] = useState<string>(toTime(branch.checkin_window_start));
  const [ciEnd, setCiEnd] = useState<string>(toTime(branch.checkin_window_end));
  const [coStart, setCoStart] = useState<string>(toTime(branch.checkout_window_start));
  const [coEnd, setCoEnd] = useState<string>(toTime(branch.checkout_window_end));
  const [propagate, setPropagate] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setRadius(branch.default_radius_meters ?? 100);
    setCiStart(toTime(branch.checkin_window_start));
    setCiEnd(toTime(branch.checkin_window_end));
    setCoStart(toTime(branch.checkout_window_start));
    setCoEnd(toTime(branch.checkout_window_end));
  }, [branch.id]);

  const valid = (s: string, e: string) => (!s && !e) || (!!s && !!e);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!valid(ciStart, ciEnd) || !valid(coStart, coEnd)) {
      toast.error("Provide both start and end (or leave both empty)");
      return;
    }
    if (radius < 10 || radius > 5000) {
      toast.error("Radius must be between 10 and 5000 metres");
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("branches").update({
      default_radius_meters: radius,
      checkin_window_start: ciStart || null,
      checkin_window_end: ciEnd || null,
      checkout_window_start: coStart || null,
      checkout_window_end: coEnd || null,
    }).eq("id", branch.id);
    if (error) { setLoading(false); toast.error(error.message); return; }

    if (propagate) {
      const { error: locErr } = await supabase
        .from("office_locations")
        .update({ radius_meters: radius })
        .eq("branch_id", branch.id);
      if (locErr) toast.warning(`Branch saved, but updating locations failed: ${locErr.message}`);
    }
    setLoading(false);
    toast.success(`${noun} settings saved`);
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Settings className="h-4 w-4" /> {branch.name} · Settings</DialogTitle>
      </DialogHeader>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><MapPin className="h-4 w-4" /> Geofence radius</h3>
        <p className="text-xs text-muted-foreground">Default radius for new office locations added to this {noun.toLowerCase()}.</p>
        <div className="flex items-center gap-2">
          <Input type="number" min={10} max={5000} step={10} value={radius} onChange={e => setRadius(Number(e.target.value))} className="w-32" />
          <span className="text-sm text-muted-foreground">metres</span>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={propagate} onChange={e => setPropagate(e.target.checked)} className="h-3.5 w-3.5" />
          Also update all existing office locations in this {noun.toLowerCase()} to {radius}m
        </label>
      </section>

      <section className="space-y-2 border-t pt-4">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><Clock className="h-4 w-4" /> Allowed check-in window</h3>
        <p className="text-xs text-muted-foreground">Staff can only check in during this time range. Leave both blank for any time.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label className="text-xs">From</Label><Input type="time" value={ciStart} onChange={e => setCiStart(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">To</Label><Input type="time" value={ciEnd} onChange={e => setCiEnd(e.target.value)} /></div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><Clock className="h-4 w-4" /> Allowed check-out window</h3>
        <p className="text-xs text-muted-foreground">Staff can only check out during this range. Blank = any time.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label className="text-xs">From</Label><Input type="time" value={coStart} onChange={e => setCoStart(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">To</Label><Input type="time" value={coEnd} onChange={e => setCoEnd(e.target.value)} /></div>
        </div>
      </section>

      <DialogFooter><Button type="submit" disabled={loading}>{loading ? "Saving…" : "Save settings"}</Button></DialogFooter>
    </form>
  );
}

function toTime(t: string | null): string {
  if (!t) return "";
  return t.slice(0, 5);
}
