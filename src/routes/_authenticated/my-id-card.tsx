import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Share2, Loader2, IdCard as IdCardIcon, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { IdCardFront, IdCardBack } from "@/components/IdCard";
import { useStaffPhotoUrl } from "@/components/StaffPhotoUpload";
import { cardToDataUrl, downloadDataUrl, shareCard } from "@/lib/id-card-export";

export const Route = createFileRoute("/_authenticated/my-id-card")({
  component: MyIdCardPage,
});

function MyIdCardPage() {
  const { data: user, isLoading } = useCurrentUser();
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"idle" | "download" | "share">("idle");

  // Staff-owned profile + tenant + branch — one round trip
  const { data, isLoading: loadingProfile } = useQuery({
    queryKey: ["my-id-card", user?.userId],
    enabled: !!user?.userId,
    queryFn: async () => {
      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("id, staff_id, full_name, designation, phone, email, avatar_url, date_of_birth, date_of_joining, blood_group, emergency_contact_name, emergency_contact_phone, id_proof_type, id_proof_number, address, branches(name)")
        .eq("id", user!.userId)
        .maybeSingle();
      if (!profile) return null;

      const { data: tenant } = await (supabase as any)
        .from("tenants")
        .select("id, name, logo_url, id_card_accent")
        .eq("id", (profile as any).tenant_id ?? user?.tenant?.id)
        .maybeSingle();

      return {
        staff: { ...(profile as any), branch_name: (profile as any).branches?.name ?? null },
        tenant: tenant as any,
      };
    },
  });

  const staff = data?.staff;
  const tenant = data?.tenant;
  // Fresh signed URL for the photo (avatar_url on the row may be a stale
  // signed URL if the photo was uploaded a while ago).
  const { data: photoUrl } = useStaffPhotoUrl(user?.userId);
  const staffForCard = staff ? { ...staff, avatar_url: photoUrl ?? staff.avatar_url } : null;
  const verifyUrl = `${typeof window !== "undefined" ? window.location.origin : "https://punchly.online"}/verify/${staff?.id ?? ""}`;
  const filename = `${staff?.staff_id || "EMP"}_${(staff?.full_name || "id").replace(/\s+/g, "_")}_id.png`;

  const doExport = async (action: "download" | "share") => {
    if (!frontRef.current || !backRef.current) return;
    setBusy(action);
    try {
      const dataUrl = await cardToDataUrl(frontRef.current, backRef.current);
      if (action === "download") {
        downloadDataUrl(dataUrl, filename);
        toast.success("Downloaded");
      } else {
        await shareCard(dataUrl, filename, staff?.full_name || "staff");
      }
    } catch (e: any) {
      toast.error(`${action === "download" ? "Download" : "Share"} failed: ${e?.message ?? e}`);
    } finally {
      setBusy("idle");
    }
  };

  if (isLoading || loadingProfile) {
    return <AppShell><Card className="p-6"><Loader2 className="h-4 w-4 animate-spin" /></Card></AppShell>;
  }

  if (!staff || !tenant) {
    return (
      <AppShell>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Couldn't load your ID card details.</p>
        </Card>
      </AppShell>
    );
  }

  // Warn if the profile is missing key fields — the card still renders, but
  // some fields will show '—' and it's a nudge to complete the profile.
  const missingFields = [
    !staff.date_of_birth && "date of birth",
    !staff.blood_group && "blood group",
    !staff.emergency_contact_phone && "emergency contact",
    !staff.date_of_joining && "joining date",
  ].filter(Boolean);

  return (
    <AppShell>
      <div className="space-y-6 max-w-md mx-auto">
        <header>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <IdCardIcon className="h-6 w-6 text-primary" />
            My ID Card
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your official {tenant.name} employee ID. Download or share whenever needed.
          </p>
        </header>

        {missingFields.length > 0 && (
          <Card className="flex items-start gap-3 border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Your ID card is missing some info</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Add {missingFields.join(", ")} in your profile so the card is complete.
              </p>
              <Link to="/my-profile"><Button variant="link" size="sm" className="h-auto p-0 mt-1">Update profile →</Button></Link>
            </div>
          </Card>
        )}

        <div className="flex flex-col items-center gap-4">
          <div ref={frontRef}>
            <IdCardFront staff={staffForCard!} tenant={tenant} verifyUrl={verifyUrl} />
          </div>
          <div ref={backRef}>
            <IdCardBack staff={staffForCard!} tenant={tenant} />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => doExport("download")}
            disabled={busy !== "idle"}
            className="flex-1 gap-2"
          >
            {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download
          </Button>
          <Button
            onClick={() => doExport("share")}
            disabled={busy !== "idle"}
            className="flex-1 gap-2"
          >
            {busy === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            Share
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
