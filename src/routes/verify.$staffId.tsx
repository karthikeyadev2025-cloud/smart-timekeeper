import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldX, Loader2, Building2 } from "lucide-react";

/**
 * PUBLIC page reached by scanning the QR on a Punchly ID card.
 *
 * Deliberately outside /_authenticated — a shop customer, security guard
 * or parent scanning a badge must not be asked to log in. Everything shown
 * here is already printed on the physical card (see public_verify_staff);
 * nothing sensitive is exposed.
 */

// Photo lives in a PRIVATE bucket, so a public page can't link it directly.
// This mints a short-lived signed URL server-side. Safe: it reveals only
// the one photo that is already printed on the card being scanned.
const getVerifyPhoto = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ staff_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: files } = await supabaseAdmin.storage
      .from("staff-photos")
      .list(data.staff_id, { limit: 1, search: "profile.jpg" });
    if (!files || files.length === 0) return { url: null };
    const { data: signed } = await supabaseAdmin.storage
      .from("staff-photos")
      .createSignedUrl(`${data.staff_id}/profile.jpg`, 300);
    return { url: signed?.signedUrl ?? null };
  });

export const Route = createFileRoute("/verify/$staffId")({
  component: VerifyPage,
});

type Info = {
  full_name: string | null;
  staff_id: string | null;
  designation: string | null;
  branch_name: string | null;
  company_name: string | null;
  company_logo_url: string | null;
  is_active: boolean;
  has_photo: boolean;
};

function VerifyPage() {
  const { staffId } = Route.useParams();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-verify", staffId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("public_verify_staff", { _staff_id: staffId });
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as Info | null;
    },
  });

  const { data: photo } = useQuery({
    queryKey: ["public-verify-photo", staffId],
    enabled: !!data?.has_photo,
    retry: false,
    queryFn: async () => (await getVerifyPhoto({ data: { staff_id: staffId } })).url,
  });

  const initials = (data?.full_name ?? "?")
    .split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
          </div>
        ) : isError || !data ? (
          <div className="p-8 text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <ShieldX className="h-7 w-7 text-destructive" />
            </div>
            <div>
              <p className="text-lg font-bold">Not a valid ID card</p>
              <p className="text-sm text-muted-foreground mt-1">
                This code doesn't match any employee record. Treat the card as unverified.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Status banner — the actual verdict, unmissable */}
            <div className={`flex items-center gap-2.5 px-5 py-3 ${data.is_active ? "bg-success/15" : "bg-destructive/15"}`}>
              {data.is_active ? (
                <ShieldCheck className="h-5 w-5 shrink-0 text-success" />
              ) : (
                <ShieldX className="h-5 w-5 shrink-0 text-destructive" />
              )}
              <div className="min-w-0">
                <p className={`text-sm font-bold ${data.is_active ? "text-success" : "text-destructive"}`}>
                  {data.is_active ? "Verified employee" : "No longer employed"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {data.is_active
                    ? "This card is currently valid."
                    : "This card is no longer valid — do not accept it."}
                </p>
              </div>
            </div>

            <div className="p-6 text-center space-y-4">
              <div className="mx-auto h-24 w-24 overflow-hidden rounded-full bg-muted flex items-center justify-center ring-4 ring-background shadow">
                {photo ? (
                  <img src={photo} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-muted-foreground">{initials}</span>
                )}
              </div>

              <div>
                <p className="text-xl font-bold leading-tight">{data.full_name ?? "—"}</p>
                {data.designation && (
                  <p className="text-sm text-muted-foreground mt-0.5">{data.designation}</p>
                )}
                {data.staff_id && (
                  <Badge variant="secondary" className="mt-2 font-mono text-xs">{data.staff_id}</Badge>
                )}
              </div>

              <div className="border-t pt-4 space-y-1">
                <div className="flex items-center justify-center gap-2">
                  {data.company_logo_url ? (
                    <img src={data.company_logo_url} alt="" className="h-5 w-5 rounded object-contain" />
                  ) : (
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  )}
                  <p className="text-sm font-semibold">{data.company_name}</p>
                </div>
                {data.branch_name && (
                  <p className="text-xs text-muted-foreground">{data.branch_name}</p>
                )}
              </div>
            </div>
          </>
        )}
      </Card>

      <Link to="/" className="mt-5 text-xs text-muted-foreground hover:text-foreground">
        Verified by <span className="font-semibold">Punchly</span>
      </Link>
    </div>
  );
}
