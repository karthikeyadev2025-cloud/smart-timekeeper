import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export const Route = createFileRoute("/_authenticated/my-attendance")({
  component: MyAttendance,
});

function MyAttendance() {
  const { data: user } = useCurrentUser();
  const { data } = useQuery({
    queryKey: ["my-attendance", user?.userId],
    enabled: !!user?.userId,
    queryFn: async () => (await supabase
      .from("attendance_records")
      .select("*")
      .eq("user_id", user!.userId)
      .order("occurred_at", { ascending: false })
      .limit(100)).data ?? [],
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">My attendance</h1>
          <p className="text-muted-foreground">Last 100 events</p>
        </header>
        <Card>
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Time</TableHead><TableHead>Action</TableHead><TableHead>Location</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.attendance_date}</TableCell>
                  <TableCell>{new Date(r.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{r.kind.replace("_", " ")}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{r.latitude ? `${Number(r.latitude).toFixed(4)}, ${Number(r.longitude).toFixed(4)}` : "—"}</TableCell>
                </TableRow>
              ))}
              {data?.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No attendance records yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppShell>
  );
}
