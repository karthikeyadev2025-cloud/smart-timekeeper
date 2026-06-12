import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { MapPin, ExternalLink, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/live-map")({
  component: LiveMapPage,
});

function LiveMapPage() {
  const { data: user } = useCurrentUser();
  const tenantId = user?.tenant?.id;
  const today = new Date().toISOString().slice(0, 10);

  const { data: punches } = useQuery({
    queryKey: ["live-map", tenantId, today],
    enabled: !!tenantId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("*, profiles!attendance_records_user_id_fkey(full_name, phone, is_field_staff), office_locations(name)")
        .eq("tenant_id", tenantId!)
        .eq("attendance_date", today)
        .order("occurred_at", { ascending: false });
      return data ?? [];
    },
  });

  if (!tenantId) return <AppShell><Card className="p-6">Need a company.</Card></AppShell>;

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Live punches</h1>
          <p className="text-muted-foreground">Today's attendance with GPS — auto-refreshes every 30s.</p>
        </header>

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
                  <div className="mt-3 flex gap-2">
                    <a href={mapUrl} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline" className="gap-1">
                        <ExternalLink className="h-3 w-3" /> Open in Google Maps
                      </Button>
                    </a>
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
    </AppShell>
  );
}
