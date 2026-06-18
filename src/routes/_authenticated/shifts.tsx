import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, MapPin, Clock, RefreshCw, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/shifts")({
  component: ShiftsLocations,
});

type Location = {
  id: string; name: string; address: string | null;
  latitude: number; longitude: number; radius_meters: number;
};

type Shift = {
  id: string; name: string;
  start_time: string; end_time: string; break_minutes: number;
};

function ShiftsLocations() {
  const { data: user } = useCurrentUser();
  const tenantId = user?.tenant?.id;
  if (!tenantId) return <AppShell><Card className="p-6">You need a company first.</Card></AppShell>;

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Shifts & locations</h1>
          <p className="text-muted-foreground">Define office geofences and working shifts.</p>
        </header>
        <Tabs defaultValue="locations">
          <TabsList>
            <TabsTrigger value="locations">Office locations</TabsTrigger>
            <TabsTrigger value="shifts">Shifts</TabsTrigger>
          </TabsList>
          <TabsContent value="locations" className="pt-4"><LocationsPanel tenantId={tenantId} /></TabsContent>
          <TabsContent value="shifts" className="pt-4"><ShiftsPanel tenantId={tenantId} /></TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

/* ──────────────── LOCATIONS ──────────────── */

function LocationsPanel({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editLoc, setEditLoc] = useState<Location | null>(null);

  const { data } = useQuery<Location[]>({
    queryKey: ["locations", tenantId],
    queryFn: async () => (await supabase.from("office_locations").select("*").eq("tenant_id", tenantId).order("name")).data as any ?? [],
  });

  const deleteLoc = async (loc: Location) => {
    if (!confirm(`Delete "${loc.name}"? Staff assigned to it will lose this geofence.`)) return;
    const { error } = await supabase.from("office_locations").delete().eq("id", loc.id);
    if (error) toast.error(error.message);
    else { toast.success("Location deleted"); qc.invalidateQueries({ queryKey: ["locations"] }); }
  };

  return (
    <div className="space-y-4">
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> Add location</Button></DialogTrigger>
        <DialogContent><LocationForm tenantId={tenantId} initial={null} onDone={() => { setAddOpen(false); qc.invalidateQueries({ queryKey: ["locations"] }); }} /></DialogContent>
      </Dialog>

      <Dialog open={!!editLoc} onOpenChange={(v) => !v && setEditLoc(null)}>
        <DialogContent>
          {editLoc && <LocationForm tenantId={tenantId} initial={editLoc} onDone={() => { setEditLoc(null); qc.invalidateQueries({ queryKey: ["locations"] }); }} />}
        </DialogContent>
      </Dialog>

      <div className="grid gap-3 md:grid-cols-2">
        {(data ?? []).map((l) => (
          <Card key={l.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold truncate">{l.name}</h3>
                <p className="text-sm text-muted-foreground truncate">{l.address}</p>
                <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {Number(l.latitude).toFixed(5)}, {Number(l.longitude).toFixed(5)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <Badge>{l.radius_meters}m</Badge>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditLoc(l)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteLoc(l)} title="Delete"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
        {data?.length === 0 && <Card className="p-6 text-center text-muted-foreground md:col-span-2">No locations yet.</Card>}
      </div>
    </div>
  );
}

function LocationForm({ tenantId, initial, onDone }: { tenantId: string; initial: Location | null; onDone: () => void }) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [lat, setLat] = useState(initial?.latitude?.toString() ?? "");
  const [lng, setLng] = useState(initial?.longitude?.toString() ?? "");
  const [radius, setRadius] = useState((initial?.radius_meters ?? 100).toString());
  const [loading, setLoading] = useState(false);

  const useMyLocation = () => {
    if (!navigator.geolocation) { toast.error("Geolocation not supported"); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(p.coords.latitude.toString()); setLng(p.coords.longitude.toString()); toast.success("Location captured"); },
      (e) => toast.error(e.message)
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Name is required"); return; }
    const latN = Number(lat), lngN = Number(lng);
    if (!isFinite(latN) || !isFinite(lngN)) { toast.error("Enter valid coordinates"); return; }
    setLoading(true);
    const payload = {
      tenant_id: tenantId,
      name: name.trim(),
      address: address?.trim() || null,
      latitude: latN,
      longitude: lngN,
      radius_meters: Math.max(10, Math.min(5000, Number(radius) || 100)),
    };
    const { error } = isEdit
      ? await supabase.from("office_locations").update(payload).eq("id", initial!.id)
      : await supabase.from("office_locations").insert(payload);
    setLoading(false);
    if (error) toast.error(error.message);
    else { toast.success(isEdit ? "Location updated" : "Location added"); onDone(); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <DialogHeader><DialogTitle>{isEdit ? "Edit office location" : "New office location"}</DialogTitle></DialogHeader>
      <div className="space-y-1"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} required placeholder="HQ, Branch A…" /></div>
      <div className="space-y-1"><Label>Address</Label><Input value={address ?? ""} onChange={e => setAddress(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1"><Label>Latitude</Label><Input value={lat} onChange={e => setLat(e.target.value)} required /></div>
        <div className="space-y-1"><Label>Longitude</Label><Input value={lng} onChange={e => setLng(e.target.value)} required /></div>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={useMyLocation} className="gap-1"><RefreshCw className="h-3 w-3" /> Use my current location</Button>
      <div className="space-y-1"><Label>Geofence radius (meters)</Label><Input type="number" value={radius} onChange={e => setRadius(e.target.value)} min={10} max={5000} /></div>
      <DialogFooter><Button type="submit" disabled={loading}>{loading ? "Saving…" : isEdit ? "Save changes" : "Save"}</Button></DialogFooter>
    </form>
  );
}

/* ──────────────── SHIFTS ──────────────── */

function ShiftsPanel({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editShift, setEditShift] = useState<Shift | null>(null);

  const { data } = useQuery<Shift[]>({
    queryKey: ["shifts", tenantId],
    queryFn: async () => (await supabase.from("shifts").select("*").eq("tenant_id", tenantId).order("start_time")).data as any ?? [],
  });

  const deleteShift = async (s: Shift) => {
    if (!confirm(`Delete shift "${s.name}"? Staff assigned to this shift will be unassigned.`)) return;
    const { error } = await supabase.from("shifts").delete().eq("id", s.id);
    if (error) toast.error(error.message);
    else { toast.success("Shift deleted"); qc.invalidateQueries({ queryKey: ["shifts"] }); }
  };

  return (
    <div className="space-y-4">
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> Add shift</Button></DialogTrigger>
        <DialogContent><ShiftForm tenantId={tenantId} initial={null} onDone={() => { setAddOpen(false); qc.invalidateQueries({ queryKey: ["shifts"] }); }} /></DialogContent>
      </Dialog>

      <Dialog open={!!editShift} onOpenChange={(v) => !v && setEditShift(null)}>
        <DialogContent>
          {editShift && <ShiftForm tenantId={tenantId} initial={editShift} onDone={() => { setEditShift(null); qc.invalidateQueries({ queryKey: ["shifts"] }); }} />}
        </DialogContent>
      </Dialog>

      <div className="grid gap-3 md:grid-cols-2">
        {(data ?? []).map((s) => (
          <Card key={s.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold truncate">{s.name}</h3>
                <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> {s.start_time} – {s.end_time}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <Badge variant="outline">{s.break_minutes}m break</Badge>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditShift(s)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteShift(s)} title="Delete"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
        {data?.length === 0 && <Card className="p-6 text-center text-muted-foreground md:col-span-2">No shifts yet.</Card>}
      </div>
    </div>
  );
}

function ShiftForm({ tenantId, initial, onDone }: { tenantId: string; initial: Shift | null; onDone: () => void }) {
  const isEdit = !!initial;
  // Time values from Postgres come back as "HH:MM:SS"; <input type="time"> wants "HH:MM"
  const trimTime = (t?: string) => (t ?? "").slice(0, 5);

  const [name, setName] = useState(initial?.name ?? "");
  const [start, setStart] = useState(trimTime(initial?.start_time) || "09:00");
  const [end, setEnd] = useState(trimTime(initial?.end_time) || "18:00");
  const [breakMin, setBreakMin] = useState((initial?.break_minutes ?? 60).toString());
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Name is required"); return; }
    setLoading(true);
    const payload = {
      tenant_id: tenantId,
      name: name.trim(),
      start_time: start,
      end_time: end,
      break_minutes: Math.max(0, Number(breakMin) || 0),
    };
    const { error } = isEdit
      ? await supabase.from("shifts").update(payload).eq("id", initial!.id)
      : await supabase.from("shifts").insert(payload);
    setLoading(false);
    if (error) toast.error(error.message);
    else { toast.success(isEdit ? "Shift updated" : "Shift created"); onDone(); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <DialogHeader><DialogTitle>{isEdit ? "Edit shift" : "New shift"}</DialogTitle></DialogHeader>
      <div className="space-y-1"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} required placeholder="Morning, Night, etc." /></div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1"><Label>Start</Label><Input type="time" value={start} onChange={e => setStart(e.target.value)} required /></div>
        <div className="space-y-1"><Label>End</Label><Input type="time" value={end} onChange={e => setEnd(e.target.value)} required /></div>
      </div>
      <div className="space-y-1"><Label>Break (minutes)</Label><Input type="number" value={breakMin} onChange={e => setBreakMin(e.target.value)} min={0} max={480} /></div>
      <DialogFooter><Button type="submit" disabled={loading}>{loading ? "Saving…" : isEdit ? "Save changes" : "Save"}</Button></DialogFooter>
    </form>
  );
}
