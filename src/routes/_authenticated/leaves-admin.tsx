import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leaves-admin")({
  component: LeavesAdmin,
});

function LeavesAdmin() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const tenantId = user?.tenant?.id;

  const { data } = useQuery({
    queryKey: ["admin-leaves", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("leave_requests")
        .select("*, profiles!leave_requests_user_id_fkey(full_name, email)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const review = async (id: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("leave_requests").update({ status, reviewed_by: user?.userId, reviewed_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success(`Leave ${status}`); qc.invalidateQueries({ queryKey: ["admin-leaves"] }); }
  };

  if (!tenantId) return <AppShell><Card className="p-6">You need a company first.</Card></AppShell>;

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Leave requests</h1>
          <p className="text-muted-foreground">Approve or reject staff leave applications.</p>
        </header>
        <div className="space-y-3">
          {(data ?? []).map((l: any) => (
            <Card key={l.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{l.profiles?.full_name ?? "Staff"}</p>
                  <p className="text-sm text-muted-foreground">{l.profiles?.email}</p>
                  <p className="mt-2 text-sm">{l.start_date} → {l.end_date} · <span className="text-muted-foreground">{l.days} day(s)</span></p>
                  {l.reason && <p className="mt-1 text-sm italic">"{l.reason}"</p>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"} className="capitalize">{l.status}</Badge>
                  {l.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => review(l.id, "rejected")}>Reject</Button>
                      <Button size="sm" onClick={() => review(l.id, "approved")}>Approve</Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
          {data?.length === 0 && <Card className="p-6 text-center text-muted-foreground">No leave requests yet.</Card>}
        </div>
      </div>
    </AppShell>
  );
}
