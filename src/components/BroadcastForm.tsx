import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { broadcastAnnouncement, clearAnnouncement } from "@/lib/admin.functions";
import { toast } from "sonner";

export function BroadcastForm({ onDone }: { onDone: () => void }) {
  const broadcast = useServerFn(broadcastAnnouncement);
  const clear = useServerFn(clearAnnouncement);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<"info" | "warning" | "critical">("info");
  const [hoursValid, setHoursValid] = useState("24");
  const [loading, setLoading] = useState(false);

  const post = async () => {
    if (!title.trim() || !body.trim()) { toast.error("Title and message are required"); return; }
    setLoading(true);
    try {
      const expires_at = hoursValid && Number(hoursValid) > 0
        ? new Date(Date.now() + Number(hoursValid) * 3600 * 1000).toISOString()
        : null;
      await broadcast({ data: { title: title.trim(), body: body.trim(), severity, expires_at } });
      toast.success("Announcement posted to all clients");
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not broadcast");
    } finally {
      setLoading(false);
    }
  };

  const wipe = async () => {
    if (!confirm("Remove the current announcement from every client's dashboard?")) return;
    setLoading(true);
    try {
      await clear({});
      toast.success("Announcement cleared");
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not clear");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <DialogHeader>
        <DialogTitle>Broadcast to all clients</DialogTitle>
        <DialogDescription>Shown as a banner on every client admin's dashboard until it expires or you clear it.</DialogDescription>
      </DialogHeader>

      <div className="space-y-1">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Scheduled maintenance Sunday 2 AM IST" />
      </div>

      <div className="space-y-1">
        <Label>Message</Label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="We'll be performing scheduled maintenance for ~10 minutes…"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Severity</Label>
          <Select value={severity} onValueChange={(v) => setSeverity(v as "info" | "warning" | "critical")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="info">Info (blue)</SelectItem>
              <SelectItem value="warning">Warning (amber)</SelectItem>
              <SelectItem value="critical">Critical (red)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Auto-expire after (hours, blank = never)</Label>
          <Input type="number" min={0} value={hoursValid} onChange={(e) => setHoursValid(e.target.value)} placeholder="24" />
        </div>
      </div>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={wipe} disabled={loading}>Clear current</Button>
        <Button onClick={post} disabled={loading}>{loading ? "Posting…" : "Post announcement"}</Button>
      </DialogFooter>
    </div>
  );
}
