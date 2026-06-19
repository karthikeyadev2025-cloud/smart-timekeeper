import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { MapPin, ExternalLink, AlertTriangle, RefreshCw, Camera } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export const Route = createFileRoute("/_authenticated/live-map")({
  ssr: false,
  component: LiveMapPage,
});

// Default markers fail because Leaflet's bundled icon URLs assume a webpack flow.
// Inline a small SVG pin so the map works without copying assets.
const checkInIcon = L.divIcon({
  className: "punchly-pin",
  html: '<div style="background:#10b981;border:2px solid white;width:26px;height:26px;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:12px;">IN</div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});
const checkOutIcon = L.divIcon({
  className: "punchly-pin",
  html: '<div style="background:#6366f1;border:2px solid white;width:26px;height:26px;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:11px;">OUT</div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});
const mockIcon = L.divIcon({
  className: "punchly-pin",
  html: '<div style="background:#ef4444;border:2px solid white;width:26px;height:26px;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:11px;">!</div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});
const officeIcon = L.divIcon({
  className: "punchly-pin",
  html: '<div style="background:#4f46e5;border:2px solid white;width:18px;height:18px;border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,.3);"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function LiveMapPage() {
  const { data: user } = useCurrentUser();
  const tenantId = user?.tenant?.id;
  const today = new Date().toISOString().slice(0, 10);
  const [viewingPhoto, setViewingPhoto] = useState<{ path: string; staffName: string; time: string } | null>(null);

  const { data: punches, refetch, isFetching } = useQuery({
    queryKey: ["live-map", tenantId, today],
    enabled: !!tenantId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("*, profiles!attendance_records_user_id_fkey(full_name, phone, is_field_staff), office_locations(name), selfie_url")
        .eq("tenant_id", tenantId!)
        .eq("attendance_date", today)
        .order("occurred_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: offices } = useQuery({
    queryKey: ["office-locations-map", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("office_locations")
        .select("id, name, latitude, longitude, radius_meters")
        .eq("tenant_id", tenantId!);
      return data ?? [];
    },
  });

  // Compute map center: average of all today's punches, fallback to first office, fallback to India centre
  const { center, zoom } = useMemo(() => {
    const pts = (punches ?? []).filter((p: any) => p.latitude != null && p.longitude != null);
    if (pts.length > 0) {
      const lat = pts.reduce((a, p: any) => a + Number(p.latitude), 0) / pts.length;
      const lng = pts.reduce((a, p: any) => a + Number(p.longitude), 0) / pts.length;
      return { center: [lat, lng] as [number, number], zoom: 13 };
    }
    if (offices && offices.length > 0) {
      return { center: [Number(offices[0].latitude), Number(offices[0].longitude)] as [number, number], zoom: 14 };
    }
    return { center: [20.5937, 78.9629] as [number, number], zoom: 5 }; // India
  }, [punches, offices]);

  if (!tenantId) return <AppShell><Card className="p-6">Need a company.</Card></AppShell>;

  const validPunches = (punches ?? []).filter((p: any) => p.latitude != null && p.longitude != null);

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Live staff map</h1>
            <p className="text-muted-foreground">Today's attendance with GPS — auto-refreshes every 30s.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </header>

        {/* Map */}
        <Card className="overflow-hidden">
          <MapContainer
            center={center}
            zoom={zoom}
            style={{ height: "420px", width: "100%" }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Office locations + geofence rings */}
            {(offices ?? []).map((o: any) => (
              <div key={`office-${o.id}`}>
                <Marker position={[Number(o.latitude), Number(o.longitude)]} icon={officeIcon}>
                  <Popup><strong>{o.name}</strong><br/>Geofence: {o.radius_meters}m</Popup>
                </Marker>
                <Circle
                  center={[Number(o.latitude), Number(o.longitude)]}
                  radius={Number(o.radius_meters) ?? 100}
                  pathOptions={{ color: "#4f46e5", fillColor: "#4f46e5", fillOpacity: 0.08, weight: 1 }}
                />
              </div>
            ))}

            {/* Punches */}
            {validPunches.map((p: any) => {
              const icon = p.is_mock_location ? mockIcon : p.kind === "check_out" ? checkOutIcon : checkInIcon;
              return (
                <Marker key={p.id} position={[Number(p.latitude), Number(p.longitude)]} icon={icon}>
                  <Popup>
                    <strong>{p.profiles?.full_name ?? "Unknown"}</strong><br/>
                    {String(p.kind).replace("_", " ")} · {new Date(p.occurred_at).toLocaleTimeString()}<br/>
                    {p.profiles?.phone ?? "—"}
                    {p.is_mock_location && <><br/><span style={{color:"#ef4444"}}>⚠ Mock GPS suspected</span></>}
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
          <div className="flex flex-wrap gap-3 border-t bg-muted/30 p-3 text-xs">
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-emerald-500" /> Check-in</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-indigo-500" /> Check-out</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-red-500" /> Mock GPS</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 bg-indigo-600" /> Office (with geofence)</span>
          </div>
        </Card>

        {/* List */}
        <div className="grid gap-3">
          {(punches ?? []).map((p: any) => {
            const enforcement = p.enforcement_status as string | null;
            const mapUrl = p.latitude && p.longitude
              ? `https://www.google.com/maps?q=${p.latitude},${p.longitude}`
              : null;
            return (
              <Card key={p.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{p.profiles?.full_name ?? "Unknown"}</p>
                      {p.profiles?.is_field_staff && <Badge variant="outline" className="text-xs">Field</Badge>}
                      <Badge className="text-xs capitalize">{String(p.kind).replace("_", " ")}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.occurred_at).toLocaleTimeString()} · {p.profiles?.phone ?? "—"}
                    </p>
                    {p.office_locations?.name && (
                      <p className="mt-1 text-xs text-muted-foreground">Office: {p.office_locations.name}</p>
                    )}
                    {p.address_text && <p className="mt-1 text-sm">{p.address_text}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {enforcement === "outside_blocked" && (
                      <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Blocked</Badge>
                    )}
                    {enforcement === "outside_allowed" && (
                      <Badge variant="secondary">Outside geofence (field)</Badge>
                    )}
                    {enforcement === "inside" && (
                      <Badge variant="default" className="gap-1"><MapPin className="h-3 w-3" />Inside</Badge>
                    )}
                    {p.is_mock_location && <Badge variant="destructive">Mock GPS</Badge>}
                    {p.accuracy_meters != null && (
                      <span className="text-xs text-muted-foreground">±{Math.round(p.accuracy_meters)}m</span>
                    )}
                    {p.distance_from_office_m != null && (
                      <span className="text-xs text-muted-foreground">{Math.round(p.distance_from_office_m)}m from office</span>
                    )}
                  </div>
                </div>
                {mapUrl && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={mapUrl} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline" className="gap-1">
                        <ExternalLink className="h-3 w-3" /> Open in Google Maps
                      </Button>
                    </a>
                    {p.selfie_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => setViewingPhoto({
                          path: p.selfie_url,
                          staffName: p.profiles?.full_name ?? "Unknown",
                          time: new Date(p.occurred_at).toLocaleString(),
                        })}
                      >
                        <Camera className="h-3 w-3" /> View photo
                      </Button>
                    )}
                    <span className="self-center text-xs font-mono text-muted-foreground">
                      {Number(p.latitude).toFixed(5)}, {Number(p.longitude).toFixed(5)}
                    </span>
                  </div>
                )}
              </Card>
            );
          })}
          {punches?.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">No punches yet today.</Card>
          )}
        </div>
      </div>

      <Dialog open={!!viewingPhoto} onOpenChange={(v) => !v && setViewingPhoto(null)}>
        <DialogContent className="max-w-md">
          {viewingPhoto && (
            <div className="space-y-3">
              <div>
                <p className="font-semibold">{viewingPhoto.staffName}</p>
                <p className="text-xs text-muted-foreground">{viewingPhoto.time}</p>
              </div>
              <SelfieImage path={viewingPhoto.path} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

/** Loads a short-lived signed URL for a selfie from the private bucket and renders it. */
function SelfieImage({ path }: { path: string }) {
  const { data: url, isLoading, error } = useQuery({
    queryKey: ["selfie-url", path],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("attendance-selfies").createSignedUrl(path, 300);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  if (isLoading) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading photo…</div>;
  if (error || !url) return <div className="flex h-64 items-center justify-center text-sm text-destructive">Could not load photo</div>;
  return <img src={url} alt="Check-in selfie" className="w-full rounded-lg border object-contain max-h-[60vh]" />;
}
