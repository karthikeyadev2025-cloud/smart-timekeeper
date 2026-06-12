import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { listPinResetRequests, resolvePinReset } from "@/lib/pin-reset.functions";
import { KeyRound, Phone, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pin-resets")({
  head: () => ({ meta: [{ title: "PIN reset requests — Punchly" }] }),
  component: PinResetsPage,
});

function generatePin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function PinResetsPage() {
  const list = useServerFn(listPinResetRequests);
  const resolve = useServerFn(resolvePinReset);
  const qc = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["pin-resets"],
    queryFn: () => list(),
  });

  const [active, setActive] = useState<(typeof requests)[number] | null>(null);
  const [newPin, setNewPin] = useState("");
  const [done, setDone] = useState<{ phone: string; pin: string } | null>(null);

  const mutate = useMutation({
    mutationFn: async () =>
      resolve({ data: { request_id: active!.id, new_pin: newPin } }),
    onSuccess: (res) => {
      setDone({ phone: res.phone, pin: res.new_pin });
      setActive(null);
      setNewPin("");
      qc.invalidateQueries({ queryKey: ["pin-resets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = requests.filter((r) => r.status === "pending");
  const resolved = requests.filter((r) => r.status !== "pending");

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <KeyRound className="h-6 w-6" /> PIN reset requests
          </h1>
          <p className="text-sm text-muted-foreground">
            Staff who forgot their PIN appear here. Set a new 4-digit PIN and share it with them.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pending ({pending.length})
          </h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : pending.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No pending requests.
            </Card>
          ) : (
            pending.map((r) => (
              <Card key={r.id} className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-2"><Phone className="h-4 w-4 text-primary" /></div>
                  <div>
                    <p className="text-base font-semibold">{r.phone}</p>
                    <p className="text-xs text-muted-foreground">
                      Requested {new Date(r.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => { setActive(r); setNewPin(generatePin()); }}
                >
                  Reset PIN
                </Button>
              </Card>
            ))
          )}
        </section>

        {resolved.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Recently resolved
            </h2>
            {resolved.slice(0, 20).map((r) => (
              <Card key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="font-medium">{r.phone}</span>
                  <Badge variant="secondary">resolved</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {r.resolved_at ? new Date(r.resolved_at).toLocaleString() : ""}
                </span>
              </Card>
            ))}
          </section>
        )}
      </div>

      {/* Reset dialog */}
      <Dialog open={!!active} onOpenChange={(o) => { if (!o) { setActive(null); setNewPin(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset PIN for {active?.phone}</DialogTitle>
            <DialogDescription>
              A new 4-digit PIN has been generated. You can change it or keep it as-is.
              Share the new PIN with the staff member.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="np">New PIN</Label>
            <Input
              id="np"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
              className="h-14 text-center text-2xl tracking-[0.5em] font-bold"
              maxLength={8}
            />
            <Button variant="ghost" size="sm" type="button" onClick={() => setNewPin(generatePin())}>
              Generate again
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActive(null)}>Cancel</Button>
            <Button
              disabled={newPin.length < 4 || mutate.isPending}
              onClick={() => mutate.mutate()}
            >
              {mutate.isPending ? "Saving…" : "Set new PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog showing the PIN */}
      <Dialog open={!!done} onOpenChange={(o) => { if (!o) setDone(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>✅ PIN reset</DialogTitle>
            <DialogDescription>
              Share this PIN with the staff member. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-6 text-center">
            <p className="text-sm text-muted-foreground">Phone</p>
            <p className="text-lg font-semibold">{done?.phone}</p>
            <p className="mt-3 text-sm text-muted-foreground">New PIN</p>
            <p className="text-4xl font-bold tracking-[0.4em]">{done?.pin}</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setDone(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
