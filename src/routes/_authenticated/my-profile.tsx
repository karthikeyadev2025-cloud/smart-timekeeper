import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { StaffPhotoUpload } from "@/components/StaffPhotoUpload";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarHeart, IdCard, Landmark, Save, ShieldCheck, ShieldAlert, Clock, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";
import { updateMyProfile } from "@/lib/staff.functions";
import { requestBankChange } from "@/lib/bank-change.functions";

export const Route = createFileRoute("/_authenticated/my-profile")({
  component: MyProfile,
});

const FIELDS = [
  "date_of_birth", "gender", "address", "emergency_contact_name", "emergency_contact_phone",
  "id_proof_type", "id_proof_number", "bank_account_number",
] as const;

function MyProfile() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const updateFn = useServerFn(updateMyProfile);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile-full", user?.userId],
    enabled: !!user?.userId,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.userId).maybeSingle();
      return data;
    },
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const get = (k: string) => (touched ? form[k] ?? "" : (profile as any)?.[k] ?? "");
  const set = (k: string) => (v: string) => { setTouched(true); setForm((f) => ({ ...(touched ? f : profile ?? {}), [k]: v })); };

  const completion = profile
    ? Math.round((FIELDS.filter((f) => !!(touched ? form[f] : (profile as any)[f])).length / FIELDS.length) * 100)
    : 0;

  const save = async () => {
    setSaving(true);
    try {
      await updateFn({
        data: {
          date_of_birth: get("date_of_birth") || null,
          gender: (get("gender") || null) as any,
          address: get("address") || null,
          emergency_contact_name: get("emergency_contact_name") || null,
          emergency_contact_phone: get("emergency_contact_phone") || null,
          id_proof_type: (get("id_proof_type") || null) as any,
          id_proof_number: get("id_proof_number") || null,
        },
      });
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: ["my-profile-full", user?.userId] });
      setTouched(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const initials = (user?.profile?.full_name ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  if (isLoading) return <AppShell><Card className="p-6 text-muted-foreground">Loading…</Card></AppShell>;

  return (
    <AppShell>
      <div className="space-y-6">
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-primary to-primary-glow p-6 text-primary-foreground">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14 border-2 border-white/30">
                <AvatarFallback className="bg-white/15 text-lg font-semibold text-primary-foreground">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-2xl font-bold">{user?.profile?.full_name ?? "My profile"}</h1>
                <p className="text-sm opacity-90">{user?.profile?.designation || "—"} · {(profile as any)?.staff_id ?? user?.tenant?.name}</p>
              </div>
            </div>
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs opacity-90">
                <span>Profile completeness</span>
                <span>{completion}%</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-white transition-all" style={{ width: `${completion}%` }} />
              </div>
              {completion < 100 && (
                <p className="mt-1.5 text-xs opacity-80">Fill emergency contact & bank details so payroll runs smoothly.</p>
              )}
            </div>
          </div>
        </Card>

        {/* ID card photo — used on the /my-id-card page. Both staff and admin
            can upload (RLS gates writes to own-photo OR tenant-admin-of-owner). */}
        {user?.userId && (
          <StaffPhotoUpload
            userId={user.userId}
            currentName={user?.profile?.full_name}
            photoLocked={!!user?.profile?.photo_locked}
          />
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5 space-y-4">
            <h3 className="flex items-center gap-2 font-semibold"><CalendarHeart className="h-4 w-4" /> Personal details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Date of birth</Label><Input type="date" value={get("date_of_birth")} onChange={(e) => set("date_of_birth")(e.target.value)} /></div>
              <div className="space-y-1">
                <Label>Gender</Label>
                <Select value={get("gender") || "unset"} onValueChange={(v) => set("gender")(v === "unset" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">—</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Blood group</Label>
                <Select value={get("blood_group") || "unset"} onValueChange={(v) => set("blood_group")(v === "unset" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">—</SelectItem>
                    {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((bg) => (
                      <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 col-span-2"><Label>Address</Label><Textarea value={get("address")} onChange={(e) => set("address")(e.target.value)} rows={2} /></div>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <h3 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> Emergency contact</h3>
            <p className="text-xs text-muted-foreground">Who should we call in case of an emergency at work?</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Contact name</Label><Input value={get("emergency_contact_name")} onChange={(e) => set("emergency_contact_name")(e.target.value)} placeholder="e.g. Father, Spouse" /></div>
              <div className="space-y-1"><Label>Contact phone</Label><Input value={get("emergency_contact_phone")} onChange={(e) => set("emergency_contact_phone")(e.target.value.replace(/[^0-9]/g, ""))} className="font-mono" /></div>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <h3 className="flex items-center gap-2 font-semibold"><IdCard className="h-4 w-4" /> ID proof</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Proof type</Label>
                <Select value={get("id_proof_type") || "unset"} onValueChange={(v) => set("id_proof_type")(v === "unset" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">—</SelectItem>
                    <SelectItem value="aadhaar">Aadhaar</SelectItem>
                    <SelectItem value="pan">PAN</SelectItem>
                    <SelectItem value="voter_id">Voter ID</SelectItem>
                    <SelectItem value="driving_license">Driving licence</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Proof number</Label><Input value={get("id_proof_number")} onChange={(e) => set("id_proof_number")(e.target.value)} className="font-mono" /></div>
            </div>
          </Card>

          <MyBankCard tenantId={user?.tenant?.id} profile={profile as any} />
        </div>

        <Button onClick={save} disabled={saving} className="gap-2" size="lg">
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save my details"}
        </Button>
      </div>
    </AppShell>
  );
}

/* ───────────────────────── BANK CARD WITH APPROVAL FLOW ───────────────────────── */

function MyBankCard({ tenantId, profile }: { tenantId: string | undefined; profile: any }) {
  const qc = useQueryClient();
  const requestFn = useServerFn(requestBankChange);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    bank_account_holder: profile?.bank_account_holder ?? "",
    bank_account_number: profile?.bank_account_number ?? "",
    bank_ifsc: profile?.bank_ifsc ?? "",
    bank_name: profile?.bank_name ?? "",
    upi_id: profile?.upi_id ?? "",
  });

  const { data: pending } = useQuery({
    queryKey: ["my-bank-request", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("pending_bank_changes")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const submit = async () => {
    if (!tenantId) return;
    setSubmitting(true);
    try {
      await requestFn({
        data: {
          tenant_id: tenantId,
          bank_account_holder: form.bank_account_holder || null,
          bank_account_number: form.bank_account_number || null,
          bank_ifsc: form.bank_ifsc || null,
          bank_name: form.bank_name || null,
          upi_id: form.upi_id || null,
        },
      });
      toast.success("Sent for admin approval");
      qc.invalidateQueries({ queryKey: ["my-bank-request", profile?.id] });
      setEditing(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not submit");
    } finally {
      setSubmitting(false);
    }
  };

  const isPending = pending?.status === "pending";
  const wasRejected = pending?.status === "rejected" && new Date(pending.reviewed_at).getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000;
  const hasBank = !!profile?.bank_account_number;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold"><Landmark className="h-4 w-4" /> Bank account for salary</h3>
        {isPending && <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pending approval</Badge>}
        {!isPending && hasBank && <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Active</Badge>}
      </div>

      {wasRejected && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs">
          <p className="flex items-center gap-1 font-medium text-destructive"><XCircle className="h-3 w-3" /> Last change was rejected</p>
          {pending?.reject_reason && <p className="mt-0.5 text-muted-foreground">{pending.reject_reason}</p>}
        </div>
      )}

      <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
        <p className="text-xs text-muted-foreground">Current bank on file (used for salary)</p>
        {hasBank ? (
          <>
            <p><span className="text-muted-foreground">A/c holder:</span> {profile.bank_account_holder || "—"}</p>
            <p><span className="text-muted-foreground">A/c no:</span> <span className="font-mono">{profile.bank_account_number}</span></p>
            <p><span className="text-muted-foreground">IFSC:</span> <span className="font-mono">{profile.bank_ifsc || "—"}</span></p>
            <p><span className="text-muted-foreground">Bank:</span> {profile.bank_name || "—"}</p>
            {profile.upi_id && <p><span className="text-muted-foreground">UPI:</span> <span className="font-mono">{profile.upi_id}</span></p>}
          </>
        ) : (
          <p className="text-muted-foreground">No bank account on file yet.</p>
        )}
      </div>

      {!editing && !isPending && (
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditing(true)}>
          <ShieldAlert className="h-4 w-4" /> {hasBank ? "Change bank details" : "Add bank details"}
        </Button>
      )}

      {editing && (
        <div className="space-y-3 rounded-md border-2 border-dashed border-primary/40 p-3">
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span>For your protection, bank changes need admin approval before your next salary uses the new account.</span>
          </p>
          <div className="space-y-1"><Label>Account holder name</Label><Input value={form.bank_account_holder} onChange={(e) => setForm((f) => ({ ...f, bank_account_holder: e.target.value }))} placeholder="As per bank passbook" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Account number</Label><Input value={form.bank_account_number} onChange={(e) => setForm((f) => ({ ...f, bank_account_number: e.target.value.replace(/[^0-9]/g, "") }))} className="font-mono" /></div>
            <div className="space-y-1"><Label>IFSC code</Label><Input value={form.bank_ifsc} onChange={(e) => setForm((f) => ({ ...f, bank_ifsc: e.target.value.toUpperCase() }))} className="font-mono" maxLength={11} placeholder="SBIN0001234" /></div>
          </div>
          <div className="space-y-1"><Label>Bank name & branch</Label><Input value={form.bank_name} onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))} /></div>
          <div className="space-y-1"><Label>UPI ID (optional)</Label><Input value={form.upi_id} onChange={(e) => setForm((f) => ({ ...f, upi_id: e.target.value }))} className="font-mono" placeholder="name@upi" /></div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" disabled={submitting} onClick={submit}>{submitting ? "Submitting…" : "Send for approval"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {isPending && pending && (
        <div className="rounded-md border bg-amber-50 dark:bg-amber-950/20 p-3 text-xs space-y-1">
          <p className="font-medium text-amber-900 dark:text-amber-200">Requested change (awaiting approval)</p>
          <p><span className="text-muted-foreground">A/c no:</span> <span className="font-mono">{pending.bank_account_number || "—"}</span></p>
          <p><span className="text-muted-foreground">IFSC:</span> <span className="font-mono">{pending.bank_ifsc || "—"}</span></p>
          <p><span className="text-muted-foreground">Bank:</span> {pending.bank_name || "—"}</p>
        </div>
      )}
    </Card>
  );
}
