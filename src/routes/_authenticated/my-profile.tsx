import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarHeart, IdCard, Landmark, Save, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";
import { updateMyProfile } from "@/lib/staff.functions";

export const Route = createFileRoute("/_authenticated/my-profile")({
  component: MyProfile,
});

const FIELDS = [
  "date_of_birth", "gender", "address", "emergency_contact_name", "emergency_contact_phone",
  "id_proof_type", "id_proof_number", "bank_account_holder", "bank_account_number", "bank_ifsc", "bank_name",
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
          bank_account_holder: get("bank_account_holder") || null,
          bank_account_number: get("bank_account_number") || null,
          bank_ifsc: get("bank_ifsc") || null,
          bank_name: get("bank_name") || null,
          upi_id: get("upi_id") || null,
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

          <Card className="p-5 space-y-4">
            <h3 className="flex items-center gap-2 font-semibold"><Landmark className="h-4 w-4" /> Bank account for salary</h3>
            <p className="text-xs text-muted-foreground">Your employer uses this to pay your salary by bank transfer.</p>
            <div className="space-y-3">
              <div className="space-y-1"><Label>Account holder name</Label><Input value={get("bank_account_holder")} onChange={(e) => set("bank_account_holder")(e.target.value)} placeholder="As per bank passbook" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Account number</Label><Input value={get("bank_account_number")} onChange={(e) => set("bank_account_number")(e.target.value.replace(/[^0-9]/g, ""))} className="font-mono" /></div>
                <div className="space-y-1"><Label>IFSC code</Label><Input value={get("bank_ifsc")} onChange={(e) => set("bank_ifsc")(e.target.value.toUpperCase())} className="font-mono" maxLength={11} placeholder="SBIN0001234" /></div>
              </div>
              <div className="space-y-1"><Label>Bank name & branch</Label><Input value={get("bank_name")} onChange={(e) => set("bank_name")(e.target.value)} /></div>
              <div className="space-y-1"><Label>UPI ID (optional)</Label><Input value={get("upi_id")} onChange={(e) => set("upi_id")(e.target.value)} className="font-mono" placeholder="name@upi" /></div>
            </div>
          </Card>
        </div>

        <Button onClick={save} disabled={saving} className="gap-2" size="lg">
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save my details"}
        </Button>
      </div>
    </AppShell>
  );
}
