import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, Clock, CheckCheck, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";
import { broadcastWhatsapp, openWhatsapp } from "@/lib/whatsapp";

export const Route = createFileRoute("/_authenticated/mark-attendance")({
  component: MarkAttendancePage,
});

type Status = "present" | "absent" | "late";

function MarkAttendancePage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const tenantId = user?.tenant?.id;
  const today = new Date().toISOString().slice(0, 10);
  const [classId, setClassId] = useState<string>("");
  const [date, setDate] = useState(today);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [saving, setSaving] = useState(false);

  const { data: classes } = useQuery({
    queryKey: ["classes", tenantId],
    enabled: !!tenantId,
    queryFn: async () => (await supabase.from("classes").select("*").eq("tenant_id", tenantId!).order("name")).data ?? [],
  });

  const { data: students } = useQuery({
    queryKey: ["students-class", classId],
    enabled: !!classId,
    queryFn: async () => (await supabase.from("students").select("*").eq("class_id", classId).eq("is_active", true).order("roll_no")).data ?? [],
  });

  const { data: existing } = useQuery({
    queryKey: ["student-att", classId, date],
    enabled: !!classId,
    queryFn: async () => (await supabase.from("student_attendance").select("*").eq("class_id", classId).eq("attendance_date", date)).data ?? [],
  });

  useMemo(() => {
    if (!existing) return;
    const m: Record<string, Status> = {};
    existing.forEach((r: any) => { m[r.student_id] = r.status; });
    setMarks(m);
  }, [existing]);

  const markAllPresent = () => {
    const m: Record<string, Status> = {};
    (students ?? []).forEach((s) => { m[s.id] = "present"; });
    setMarks(m);
  };

  const submit = async () => {
    if (!tenantId || !classId) return;
    setSaving(true);
    try {
      const rows = (students ?? []).map((s) => ({
        tenant_id: tenantId, class_id: classId, student_id: s.id,
        attendance_date: date, status: (marks[s.id] ?? "absent") as Status,
        marked_by: user?.userId,
      }));
      const { error } = await supabase.from("student_attendance").upsert(rows, { onConflict: "student_id,attendance_date" });
      if (error) throw error;
      toast.success("Attendance saved");
      qc.invalidateQueries({ queryKey: ["student-att"] });
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const presentCount = Object.values(marks).filter((s) => s === "present").length;
  const absentees = (students ?? []).filter((s) => marks[s.id] === "absent" && (s as any).parent_phone);
  const className = (classes ?? []).find((c) => c.id === classId)?.name ?? "your child's class";
  const dateLabel = new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const notifyAllAbsent = async () => {
    if (absentees.length === 0) { toast.error("No absentees with a parent phone number"); return; }
    const recipients = absentees.map((s) => ({
      phone: (s as any).parent_phone as string,
      message: `Hello, this is ${user?.tenant?.name ?? "school"}. ${s.full_name} was marked ABSENT in ${className} on ${dateLabel}. Please reply if this is unexpected.`,
    }));
    const opened = await broadcastWhatsapp(recipients);
    toast.success(`Opened ${opened} WhatsApp chats`);
  };

  if (!tenantId) return <AppShell><Card className="p-6">Need a company.</Card></AppShell>;

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Mark attendance</h1>
          <p className="text-muted-foreground">Tap each student. One tap saves the whole class.</p>
        </header>

        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground">Class</label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger><SelectValue placeholder="Pick a class" /></SelectTrigger>
                <SelectContent>{(classes ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div className="flex items-end">
              <Button onClick={markAllPresent} variant="outline" className="w-full gap-2" disabled={!students?.length}>
                <CheckCheck className="h-4 w-4" /> All present
              </Button>
            </div>
          </div>
        </Card>

        {classId && (
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Badge variant="secondary">{presentCount}/{students?.length ?? 0} present</Badge>
              <div className="flex gap-2">
                <Button
                  onClick={notifyAllAbsent}
                  variant="outline"
                  size="sm"
                  disabled={absentees.length === 0}
                  className="gap-1"
                  title={absentees.length === 0 ? "No absent students with a parent phone" : `Notify ${absentees.length} parents on WhatsApp`}
                >
                  <MessageCircle className="h-4 w-4" /> Notify parents ({absentees.length})
                </Button>
                <Button onClick={submit} disabled={saving || !students?.length}>{saving ? "Saving…" : "Save attendance"}</Button>
              </div>
            </div>
            <div className="grid gap-2">
              {(students ?? []).map((s) => {
                const status = marks[s.id];
                const parentPhone = (s as any).parent_phone as string | null;
                return (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="font-medium">{s.full_name}</p>
                      <p className="text-xs text-muted-foreground">Roll {s.roll_no ?? "—"}{parentPhone ? ` · 📱 ${parentPhone}` : ""}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant={status === "present" ? "default" : "outline"} onClick={() => setMarks((m) => ({ ...m, [s.id]: "present" }))} className="gap-1">
                        <Check className="h-4 w-4" /> P
                      </Button>
                      <Button size="sm" variant={status === "late" ? "default" : "outline"} onClick={() => setMarks((m) => ({ ...m, [s.id]: "late" }))} className="gap-1">
                        <Clock className="h-4 w-4" /> L
                      </Button>
                      <Button size="sm" variant={status === "absent" ? "destructive" : "outline"} onClick={() => setMarks((m) => ({ ...m, [s.id]: "absent" }))} className="gap-1">
                        <X className="h-4 w-4" /> A
                      </Button>
                      {status === "absent" && parentPhone && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openWhatsapp(parentPhone, `Hello, this is ${user?.tenant?.name ?? "school"}. ${s.full_name} was marked ABSENT in ${className} on ${dateLabel}.`)}
                          className="gap-1 text-success"
                          title="Message this parent on WhatsApp"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {students?.length === 0 && <p className="py-6 text-center text-muted-foreground">No students in this class.</p>}
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
