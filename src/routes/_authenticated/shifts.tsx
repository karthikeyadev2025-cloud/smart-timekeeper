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
import { Plus, MapPin, Clock, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/shifts")({
  component: ShiftsLocations,
});

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

function LocationsPanel({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["locations", tenantId],
    queryFn: async () => (await supabase.from("office_locations").select("*").eq("tenant_id", tenantId)).data ?? [],
  });
  return (
    <div className="space-y-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> Add location</Button></DialogTrigger>
        <DialogContent><LocationForm tenantId={tenantId} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["locations"] }); }} /></DialogContent>
      </Dialog>
      <div className="grid gap-3 md:grid-cols-2">
        {(data ?? []).map((l) => (
          <Card key={l.id} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{l.name}</h3>
                <p className="text-sm text-muted-foreground">{l.address}</p>
                <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {Number(l.latitude).toFixed(5)}, {Number(l.longitude).toFixed(5)}
                </p>
              </div>
              <Badge>{l.radius_meters}m</Badge>
            </div>
          </Card>
        ))}
        {data?.length === 0 && <Card className="p-6 text-center text-muted-foreground md:col-span-2">No locations yet.</Card>}
      </div>
    </div>
  );
}

function LocationForm({ tenantId, onDone }: { tenantId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("100");
  const [loading, setLoading] = useState(false);

  const useMyLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(p.coords.latitude.toString()); setLng(p.coords.longitude.toString()); toast.success("Location captured"); },
      (e) => toast.error(e.message)
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("office_locations").insert({
      tenant_id: tenantId, name, address, latitude: Number(lat), longitude: Number(lng), radius_meters: Number(radius),
    });
    setLoading(false);
    if (error) toast.error(error.message); else { toast.success("Location added"); onDone(); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <DialogHeader><DialogTitle>New office location</DialogTitle></DialogHeader>
      <div className="space-y-1"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} required placeholder="HQ, Branch A…" /></div>
      <div className="space-y-1"><Label>Address</Label><Input value={address} onChange={e => setAddress(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1"><Label>Latitude</Label><Input value={lat} onChange={e => setLat(e.target.value)} required /></div>
        <div className="space-y-1"><Label>Longitude</Label><Input value={lng} onChange={e => setLng(e.target.value)} required /></div>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={useMyLocation} className="gap-1"><RefreshCw className="h-3 w-3" /> Use my current location</Button>
      <div className="space-y-1"><Label>Geofence radius (meters)</Label><Input type="number" value={radius} onChange={e => setRadius(e.target.value)} min={10} max={5000} /></div>
      <DialogFooter><Button type="submit" disabled={loading}>{loading ? "Saving…" : "Save"}</Button></DialogFooter>
    </form>
  );
}

function ShiftsPanel({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["shifts", tenantId],
    queryFn: async () => (await supabase.from("shifts").select("*").eq("tenant_id", tenantId)).data ?? [],
  });
  return (
    <div className="space-y-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> Add shift</Button></DialogTrigger>
        <DialogContent><ShiftForm tenantId={tenantId} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["shifts"] }); }} /></DialogContent>
      </Dialog>
      <div className="grid gap-3 md:grid-cols-2">
        {(data ?? []).map((s) => (
          <Card key={s.id} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{s.name}</h3>
                <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> {s.start_time} – {s.end_time}
                </p>
              </div>
              <Badge variant="outline">{s.break_minutes}m break</Badge>
            </div>
          </Card>
        ))}
        {data?.length === 0 && <Card className="p-6 text-center text-muted-foreground md:col-span-2">No shifts yet.</Card>}
      </div>
    </div>
  );
}

function ShiftForm({ tenantId, onDone }: { tenantId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");
  const [breakMin, setBreakMin] = useState("60");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("shifts").insert({
      tenant_id: tenantId, name, start_time: start, end_time: end, break_minutes: Number(breakMin),
    });
    setLoading(false);
    if (error) toast.error(error.message); else { toast.success("Shift created"); onDone(); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <DialogHeader><DialogTitle>New shift</DialogTitle></DialogHeader>
      <div className="space-y-1"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} required placeholder="Morning, Night, etc." /></div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1"><Label>Start</Label><Input type="time" value={start} onChange={e => setStart(e.target.value)} required /></div>
        <div className="space-y-1"><Label>End</Label><Input type="time" value={end} onChange={e => setEnd(e.target.value)} required /></div>
      </div>
      <div className="space-y-1"><Label>Break (minutes)</Label><Input type="number" value={breakMin} onChange={e => setBreakMin(e.target.value)} /></div>
      <DialogFooter><Button type="submit" disabled={loading}>{loading ? "Saving…" : "Save"}</Button></DialogFooter>
    </form>
  );
}
