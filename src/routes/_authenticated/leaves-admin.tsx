import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useBranchFilter } from "@/hooks/useBranchFilter";
import { BranchFilter } from "@/components/BranchFilter";
import { downloadCsv } from "@/lib/csv";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leaves-admin")({
  component: LeavesAdmin,
});

function LeavesAdmin() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const tenantId = user?.tenant?.id;
  const tenantType = (user?.tenant as any)?.tenant_type ?? "business";
  const branchLabel = tenantType === "school" ? "Campus" : "Branch";
  const { branchId, setBranchId, branches } = useBranchFilter(tenantId);

  const { data } = useQuery({
    queryKey: ["admin-leaves", tenantId, branchId],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from("leave_requests")
        .select("*, profiles!leave_requests_user_id_fkey(full_name, email)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (branchId !== "all") q = q.eq("branch_id", branchId);
      const { data } = await q;
      return data ?? [];
    },
  });

  const review = async (id: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("leave_requests").update({ status, reviewed_by: user?.userId, reviewed_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success(`Leave ${status}`); qc.invalidateQueries({ queryKey: ["admin-leaves"] }); }
  };

  const exportCsv = () => {
    if (!data?.length) { toast.error("Nothing to export"); return; }
    const rows = data.map((l: any) => ({
      employee: l.profiles?.full_name ?? "",
      email: l.profiles?.email ?? "",
      start_date: l.start_date,
      end_date: l.end_date,
      days: l.days,
      reason: l.reason ?? "",
      status: l.status,
    }));
    const suffix = branchId === "all" ? "all" : (branches.find(b => b.id === branchId)?.name?.replace(/\s+/g, "_") ?? "branch");
    downloadCsv(`leaves_${suffix}.csv`, rows);
  };

  if (!tenantId) return <AppShell><Card className="p-6">You need a company first.</Card></AppShell>;

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Leave requests</h1>
            <p className="text-muted-foreground">Approve or reject staff leave applications.</p>
          </div>
          <div className="flex items-end gap-2">
            <BranchFilter value={branchId} onChange={setBranchId} branches={branches} label={branchLabel} />
            <Button variant="outline" onClick={exportCsv} className="gap-2"><FileSpreadsheet className="h-4 w-4" /> Export CSV</Button>
          </div>
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
