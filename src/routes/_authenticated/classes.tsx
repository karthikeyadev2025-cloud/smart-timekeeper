import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, GraduationCap, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/classes")({
  component: ClassesPage,
});

function ClassesPage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const tenantId = user?.tenant?.id;
  const [classOpen, setClassOpen] = useState(false);
  const [studentForClass, setStudentForClass] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);

  const { data: classes } = useQuery({
    queryKey: ["classes", tenantId],
    enabled: !!tenantId,
    queryFn: async () => (await supabase.from("classes").select("*").eq("tenant_id", tenantId!).order("name")).data ?? [],
  });

  const { data: students } = useQuery({
    queryKey: ["students", tenantId, selectedClass],
    enabled: !!tenantId && !!selectedClass,
    queryFn: async () => (await supabase.from("students").select("*").eq("class_id", selectedClass!).order("roll_no")).data ?? [],
  });

  if (!tenantId) return <AppShell><Card className="p-6">Need a company.</Card></AppShell>;

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Classes & students</h1>
            <p className="text-muted-foreground">{classes?.length ?? 0} classes</p>
          </div>
          <Dialog open={classOpen} onOpenChange={setClassOpen}>
            <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> New class</Button></DialogTrigger>
            <DialogContent><ClassForm tenantId={tenantId} onDone={() => { setClassOpen(false); qc.invalidateQueries({ queryKey: ["classes"] }); }} /></DialogContent>
          </Dialog>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {(classes ?? []).map((c) => (
            <Card
              key={c.id}
              className={`cursor-pointer p-4 transition-colors ${selectedClass === c.id ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSelectedClass(c.id)}
            >
              <div className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary" />
                <p className="font-semibold">{c.name}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {[c.grade, c.section].filter(Boolean).join(" · ") || "—"}
              </p>
            </Card>
          ))}
          {classes?.length === 0 && <Card className="col-span-full p-6 text-center text-muted-foreground">No classes yet.</Card>}
        </div>

        {selectedClass && (
          <Card>
            <div className="flex items-center justify-between p-4">
              <h2 className="font-semibold">Students in {classes?.find(c => c.id === selectedClass)?.name}</h2>
              <Dialog open={!!studentForClass} onOpenChange={(o) => setStudentForClass(o ? selectedClass : null)}>
                <DialogTrigger asChild><Button size="sm" className="gap-2"><UserPlus className="h-4 w-4" /> Add student</Button></DialogTrigger>
                <DialogContent>
                  <StudentForm tenantId={tenantId} classId={selectedClass} onDone={() => { setStudentForClass(null); qc.invalidateQueries({ queryKey: ["students"] }); }} />
                </DialogContent>
              </Dialog>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Roll #</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Parent phone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(students ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono">{s.roll_no ?? "—"}</TableCell>
                    <TableCell className="font-medium">{s.full_name}</TableCell>
                    <TableCell className="font-mono">{s.parent_phone ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {students?.length === 0 && <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">No students yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function ClassForm({ tenantId, onDone }: { tenantId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [section, setSection] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from("classes").insert({ tenant_id: tenantId, name, grade: grade || null, section: section || null });
      if (error) throw error;
      toast.success("Class created");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <DialogHeader><DialogTitle>New class</DialogTitle></DialogHeader>
      <div className="space-y-1"><Label>Class name</Label><Input value={name} onChange={e => setName(e.target.value)} required placeholder="Class 5 - A" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>Grade</Label><Input value={grade} onChange={e => setGrade(e.target.value)} placeholder="5" /></div>
        <div className="space-y-1"><Label>Section</Label><Input value={section} onChange={e => setSection(e.target.value)} placeholder="A" /></div>
      </div>
      <DialogFooter><Button type="submit" disabled={loading}>{loading ? "Creating…" : "Create"}</Button></DialogFooter>
    </form>
  );
}

function StudentForm({ tenantId, classId, onDone }: { tenantId: string; classId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [roll, setRoll] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from("students").insert({
        tenant_id: tenantId, class_id: classId, full_name: name,
        roll_no: roll || null, parent_phone: parentPhone || null,
      });
      if (error) throw error;
      toast.success("Student added");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <DialogHeader><DialogTitle>Add student</DialogTitle></DialogHeader>
      <div className="space-y-1"><Label>Full name</Label><Input value={name} onChange={e => setName(e.target.value)} required /></div>
      <div className="space-y-1"><Label>Roll number</Label><Input value={roll} onChange={e => setRoll(e.target.value)} placeholder="1" /></div>
      <div className="space-y-1"><Label>Parent phone</Label><Input type="tel" value={parentPhone} onChange={e => setParentPhone(e.target.value.replace(/[^0-9]/g, ""))} placeholder="9876543210" /></div>
      <DialogFooter><Button type="submit" disabled={loading}>{loading ? "Adding…" : "Add"}</Button></DialogFooter>
    </form>
  );
}
