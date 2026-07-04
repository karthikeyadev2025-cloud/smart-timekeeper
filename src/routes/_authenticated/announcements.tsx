import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, primaryRole } from "@/hooks/useCurrentUser";
import { Megaphone, Plus, Trash2, Pin, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/announcements")({
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  const { data: user, isLoading } = useCurrentUser();
  const qc = useQueryClient();
  const role = primaryRole(user?.roles ?? []);
  const tenantId = user?.tenant?.id;
  const isAdmin = role === "client_admin" || role === "branch_manager";
  const [open, setOpen] = useState(false);

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["announcements", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("announcements")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    const { error } = await (supabase as any).from("announcements").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["announcements", tenantId] }); }
  };

  const togglePin = async (id: string, next: boolean) => {
    const { error } = await (supabase as any).from("announcements").update({ is_pinned: next }).eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["announcements", tenantId] });
  };

  if (!isLoading && !tenantId) {
    return <AppShell><Card className="p-6">You need a company first.</Card></AppShell>;
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Megaphone className="h-6 w-6 text-primary" /> Announcements
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isAdmin ? "Post updates — every staff member gets notified instantly." : "Company updates from your admin."}
            </p>
          </div>
          {isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="h-4 w-4" /> New announcement</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New announcement</DialogTitle></DialogHeader>
                <AnnouncementForm tenantId={tenantId!} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["announcements", tenantId] }); }} />
              </DialogContent>
            </Dialog>
          )}
        </header>

        {isFetching ? (
          <Card className="p-6"><Loader2 className="h-4 w-4 animate-spin" /></Card>
        ) : rows.length === 0 ? (
          <Card className="p-10 text-center">
            <Megaphone className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">No announcements yet</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((a: any) => (
              <Card key={a.id} className={`p-4 ${a.is_pinned ? "border-primary/40 bg-primary/5" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {a.is_pinned && <Pin className="h-3.5 w-3.5 text-primary shrink-0" />}
                      <p className="font-semibold">{a.title}</p>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      {new Date(a.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => togglePin(a.id, !a.is_pinned)} title={a.is_pinned ? "Unpin" : "Pin to top"}>
                        <Pin className={`h-3.5 w-3.5 ${a.is_pinned ? "text-primary" : "text-muted-foreground"}`} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(a.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function AnnouncementForm({ tenantId, onDone }: { tenantId: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim() || !body.trim()) { toast.error("Title and message are required"); return; }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("announcements").insert({
        tenant_id: tenantId,
        title: title.trim(),
        body: body.trim(),
        is_pinned: pinned,
        created_by: auth.user?.id,
      });
      if (error) throw error;
      toast.success("Announcement posted — all staff notified");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium">Title</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Office closed Friday for maintenance" />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Message</label>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Details for your team..." />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-4 w-4 accent-primary" />
        Pin to top of everyone's dashboard
      </label>
      <Button onClick={submit} disabled={saving} className="w-full gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
        Post & notify all staff
      </Button>
    </div>
  );
}
