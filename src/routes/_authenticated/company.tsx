import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { updateOwnCompanyProfile } from "@/lib/admin.functions";
import { IdCardTemplateChooser } from "@/components/IdCardTemplateChooser";
import { SignaturePad } from "@/components/SignaturePad";
import { Building2, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/company")({
  head: () => ({ meta: [{ title: "Company profile — Punchly" }] }),
  component: CompanyProfilePage,
});

function CompanyProfilePage() {
  const { data: user } = useCurrentUser();
  const tenantId = user?.tenant?.id;
  const qc = useQueryClient();
  const updateFn = useServerFn(updateOwnCompanyProfile);

  const { data: tenant } = useQuery({
    queryKey: ["company-profile", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("name, logo_url, primary_color, contact_email, contact_phone, slug, tenant_type, id_card_template, id_card_accent, partial_day_policy, default_monthly_working_days, late_alerts_enabled, late_alert_after_minutes, pf_enabled, pf_employee_percent, pf_wage_ceiling, esi_enabled, esi_employee_percent, esi_wage_threshold, live_tracking_enabled, live_tracking_interval_seconds, live_tracking_stale_minutes, live_tracking_retention_days")
        .eq("id", tenantId!)
        .maybeSingle();
      return data;
    },
  });

  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#4F46E5");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cardTemplate, setCardTemplate] = useState<"corporate" | "modern" | "compact" | "minimal" | "bold" | "formal" | "badge">("corporate");
  const [partialPolicy, setPartialPolicy] = useState<string>("full_day");
  const [lateAlerts, setLateAlerts] = useState(true);
  const [trackOn, setTrackOn] = useState(false);
  const [trackInterval, setTrackInterval] = useState("120");
  const [trackStale, setTrackStale] = useState("10");
  const [trackRetention, setTrackRetention] = useState("7");
  const [lateAfter, setLateAfter] = useState("2");
  const [pfOn, setPfOn] = useState(false);
  const [pfPct, setPfPct] = useState("12");
  const [pfCeiling, setPfCeiling] = useState("15000");
  const [esiOn, setEsiOn] = useState(false);
  const [esiPct, setEsiPct] = useState("0.75");
  const [esiThreshold, setEsiThreshold] = useState("21000");
  const [expectedDays, setExpectedDays] = useState<string>("");
  const [cardAccent, setCardAccent] = useState<string>("#4F46E5");

  // Sync state when tenant loads
  useEffect(() => {
    if (!tenant) return;
    setName(tenant.name ?? "");
    setContactEmail(tenant.contact_email ?? "");
    setContactPhone(tenant.contact_phone ?? "");
    setPrimaryColor(tenant.primary_color ?? "#4F46E5");
    setLogoUrl(tenant.logo_url ?? "");
    setCardTemplate(((tenant as any).id_card_template ?? "corporate") as any);
    setCardAccent((tenant as any).id_card_accent ?? "#4F46E5");
    setPartialPolicy((tenant as any).partial_day_policy ?? "full_day");
    setExpectedDays(((tenant as any).default_monthly_working_days ?? "").toString());
    const t = tenant as any;
    setLateAlerts(t.late_alerts_enabled ?? true);
    setTrackOn(t.live_tracking_enabled ?? false);
    setTrackInterval(String(t.live_tracking_interval_seconds ?? 120));
    setTrackStale(String(t.live_tracking_stale_minutes ?? 10));
    setTrackRetention(String(t.live_tracking_retention_days ?? 7));
    setLateAfter(String(t.late_alert_after_minutes ?? 2));
    setPfOn(t.pf_enabled ?? false);
    setPfPct(String(t.pf_employee_percent ?? 12));
    // Empty input means "no ceiling", so a null must not become the string "null".
    setPfCeiling(t.pf_wage_ceiling == null ? "" : String(t.pf_wage_ceiling));
    setEsiOn(t.esi_enabled ?? false);
    setEsiPct(String(t.esi_employee_percent ?? 0.75));
    setEsiThreshold(t.esi_wage_threshold == null ? "" : String(t.esi_wage_threshold));
  }, [tenant]);

  if (!tenantId) {
    return <AppShell><Card className="p-6">You need a company first.</Card></AppShell>;
  }

  const onPickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) { toast.error("Logo must be under 2 MB"); return; }
    if (!file.type.startsWith("image/")) { toast.error("Please upload an image"); return; }
    setLogoUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `${tenantId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("tenant-logos").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("tenant-logos").getPublicUrl(path);
      setLogoUrl(pub.publicUrl);
      toast.success("Logo uploaded — click Save to apply");
    } catch (e: any) {
      toast.error(e?.message ?? "Logo upload failed");
    } finally {
      setLogoUploading(false);
      e.target.value = "";
    }
  };

  const removeLogo = () => setLogoUrl("");

  const save = async () => {
    if (!name.trim()) { toast.error("Company name is required"); return; }
    setSaving(true);
    try {
      await updateFn({
        data: {
          name: name.trim(),
          logo_url: logoUrl || null,
          primary_color: primaryColor || null,
          contact_email: contactEmail || null,
          contact_phone: contactPhone || null,
          id_card_template: cardTemplate,
          id_card_accent: cardAccent || null,
          partial_day_policy: partialPolicy,
          default_monthly_working_days: expectedDays.trim() ? Number(expectedDays) : null,
          late_alerts_enabled: lateAlerts,
          live_tracking_enabled: trackOn,
          live_tracking_interval_seconds: Number(trackInterval) || 120,
          live_tracking_stale_minutes: Number(trackStale) || 10,
          live_tracking_retention_days: Number(trackRetention) || 7,
          late_alert_after_minutes: Number(lateAfter) || 0,
          pf_enabled: pfOn,
          pf_employee_percent: Number(pfPct) || 0,
          // Blank = no ceiling, deduct on the whole wage.
          pf_wage_ceiling: pfCeiling.trim() ? Number(pfCeiling) : null,
          esi_enabled: esiOn,
          esi_employee_percent: Number(esiPct) || 0,
          esi_wage_threshold: esiThreshold.trim() ? Number(esiThreshold) : null,
        },
      });
      toast.success("Company profile updated");
      qc.invalidateQueries({ queryKey: ["company-profile"] });
      qc.invalidateQueries({ queryKey: ["current-user"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-2xl">
        <header>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 sm:h-7 sm:w-7" /> Company profile
          </h1>
          <p className="text-muted-foreground">Update how your company shows up across Punchly.</p>
        </header>

        <Card className="p-4 sm:p-6 space-y-5">
          {/* Logo */}
          <div className="space-y-2">
            <Label>Company logo</Label>
            <div className="flex flex-wrap items-center gap-4">
              <div
                className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted"
                style={primaryColor ? { backgroundColor: primaryColor + "15" } : undefined}
              >
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="h-full w-full object-contain" />
                ) : (
                  <Building2 className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={onPickLogo} disabled={logoUploading} />
                  <span className={`inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-accent ${logoUploading ? "opacity-50" : ""}`}>
                    <Upload className="h-3.5 w-3.5" />
                    {logoUploading ? "Uploading…" : logoUrl ? "Replace logo" : "Upload logo"}
                  </span>
                </Label>
                {logoUrl && (
                  <Button type="button" variant="ghost" size="sm" onClick={removeLogo} className="gap-1">
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">PNG, JPG, or SVG. Max 2 MB. Square images look best.</p>
          </div>

          {/* Company name */}
          <div className="space-y-1.5">
            <Label htmlFor="cp-name">Company name</Label>
            <Input id="cp-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label htmlFor="cp-color">Brand colour</Label>
            <div className="flex items-center gap-3">
              <input
                id="cp-color"
                type="color"
                value={primaryColor || "#4F46E5"}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-md border bg-transparent"
              />
              <Input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="font-mono max-w-[140px]"
                placeholder="#4F46E5"
              />
            </div>
          </div>

          {/* Contact info */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cp-email">Contact email</Label>
              <Input id="cp-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="info@yourcompany.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-phone">Contact phone</Label>
              <Input id="cp-phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="9876543210" />
            </div>
          </div>

          {/* Read-only stuff */}
          <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
            <p><span className="font-medium text-foreground">Slug:</span> <span className="font-mono">{tenant?.slug ?? "—"}</span></p>
            <p><span className="font-medium text-foreground">Type:</span> {tenant?.tenant_type === "school" ? "School / college / coaching" : "Business"}</p>
          </div>

          {/* ─── Expected working days ─── */}
          <div className="space-y-2 border-t pt-5">
            <Label className="text-sm">Expected working days per month</Label>
            <p className="text-xs text-muted-foreground">
              For rotating weekly offs (7-day operations). Payroll measures attendance against this
              number instead of treating every non-attended day as absence. Leave blank to derive
              working days from each staff member's shift. Individual staff can override this.
            </p>
            <Input type="number" min={1} max={31} placeholder="e.g. 26" value={expectedDays}
              onChange={(e) => setExpectedDays(e.target.value)} className="sm:max-w-[12rem]" />
          </div>

          {/* ─── Partial day pay policy ─── */}
          <div className="space-y-2 border-t pt-5">
            <Label className="text-sm">Partial day pay</Label>
            <p className="text-xs text-muted-foreground">
              For staff who work several branches in a day — how a day is paid when some scheduled
              branch visits were missed. Individual branches can override this.
            </p>
            <select
              value={partialPolicy}
              onChange={(e) => setPartialPolicy(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm sm:max-w-sm"
            >
              <option value="full_day">Pay full day (just flag it)</option>
              <option value="proportional">Pay for the hours actually worked</option>
              <option value="half_day">Pay half day</option>
              <option value="absent">Treat the day as absent</option>
            </select>
          </div>

          {/* ─── Late arrival alerts ─── */}
          <div className="space-y-2 border-t pt-5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={lateAlerts} onChange={(e) => setLateAlerts(e.target.checked)}
                className="h-4 w-4 rounded border-input" />
              Alert me when a staff member is late
            </label>
            <p className="text-xs text-muted-foreground">
              Sends you a notification naming the person, minutes after their shift start and grace
              period have passed. A low number is noisy — anyone caught in traffic will trigger it.
            </p>
            {lateAlerts && (
              <div className="flex items-center gap-2">
                <Input type="number" min={0} max={240} value={lateAfter}
                  onChange={(e) => setLateAfter(e.target.value)} className="w-24" />
                <span className="text-sm text-muted-foreground">minutes after grace period</span>
              </div>
            )}
          </div>

          {/* ─── Live location tracking ─── */}
          <div className="space-y-2 border-t pt-5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={trackOn} onChange={(e) => setTrackOn(e.target.checked)}
                className="h-4 w-4 rounded border-input" />
              Track staff location while they are on duty
            </label>
            <p className="text-xs text-muted-foreground">
              Shows where on-duty staff are now on the live map, and lists anyone who has stopped
              sharing. Positions are only reported between check-in and check-out, and only while
              the app is open — closing the app stops it. Tell your staff you have turned this on.
            </p>
            {trackOn && (
              <div className="grid gap-3 sm:grid-cols-3 pl-6 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs">Report every (seconds)</Label>
                  <Input type="number" min={30} max={600} value={trackInterval}
                    onChange={(e) => setTrackInterval(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">Lower drains battery faster.</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Stale after (minutes)</Label>
                  <Input type="number" min={2} max={120} value={trackStale}
                    onChange={(e) => setTrackStale(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">Older than this counts as not sharing.</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Keep history (days)</Label>
                  <Input type="number" min={1} max={90} value={trackRetention}
                    onChange={(e) => setTrackRetention(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">Older positions are deleted nightly.</p>
                </div>
              </div>
            )}
          </div>

          {/* ─── Statutory deductions ─── */}
          <div className="space-y-4 border-t pt-5">
            <div>
              <Label className="text-base">Statutory deductions (PF &amp; ESI)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Turn these on only if you are registered for the scheme. They appear as separate
                lines on every payslip generated afterwards. Check the rates against your own
                registration — the defaults are the common values, not advice.
              </p>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={pfOn} onChange={(e) => setPfOn(e.target.checked)}
                  className="h-4 w-4 rounded border-input" />
                Deduct Provident Fund (PF)
              </label>
              {pfOn && (
                <div className="grid gap-3 sm:grid-cols-2 pl-6">
                  <div className="space-y-1">
                    <Label className="text-xs">Employee share (%)</Label>
                    <Input type="number" min={0} max={100} step="0.01" value={pfPct}
                      onChange={(e) => setPfPct(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Wage ceiling (₹)</Label>
                    <Input type="number" min={0} step="1" placeholder="Blank = no ceiling"
                      value={pfCeiling} onChange={(e) => setPfCeiling(e.target.value)} />
                    <p className="text-[11px] text-muted-foreground">
                      PF is calculated on wages up to this amount. Leave blank to use the full wage.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={esiOn} onChange={(e) => setEsiOn(e.target.checked)}
                  className="h-4 w-4 rounded border-input" />
                Deduct ESI
              </label>
              {esiOn && (
                <div className="grid gap-3 sm:grid-cols-2 pl-6">
                  <div className="space-y-1">
                    <Label className="text-xs">Employee share (%)</Label>
                    <Input type="number" min={0} max={100} step="0.01" value={esiPct}
                      onChange={(e) => setEsiPct(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Coverage limit (₹)</Label>
                    <Input type="number" min={0} step="1" placeholder="Blank = everyone"
                      value={esiThreshold} onChange={(e) => setEsiThreshold(e.target.value)} />
                    <p className="text-[11px] text-muted-foreground">
                      Staff earning above this are outside ESI, so nothing is deducted for them.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ─── ID card template picker ─── */}
          <div className="space-y-3 border-t pt-5">
            <div>
              <Label className="text-base">Staff ID card design</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pick a template. Every staff member's ID card will use it.
              </p>
            </div>

            <IdCardTemplateChooser
              value={cardTemplate}
              onChange={setCardTemplate}
              accent={cardAccent}
              tenantName={name || "Your Company"}
              logoUrl={logoUrl}
            />

            <div className="flex items-center gap-3 pt-2">
              <Label htmlFor="cp-accent" className="text-sm">Card accent color</Label>
              <input
                id="cp-accent"
                type="color"
                value={cardAccent}
                onChange={(e) => setCardAccent(e.target.value)}
                className="h-9 w-16 cursor-pointer rounded border"
              />
              <Input
                value={cardAccent}
                onChange={(e) => setCardAccent(e.target.value)}
                className="w-32 font-mono text-xs"
                maxLength={7}
              />
              <button
                type="button"
                onClick={() => setCardAccent("#4F46E5")}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Reset
              </button>
            </div>

            {tenantId && (
              <div className="pt-2">
                <SignaturePad kind="tenant" ownerId={tenantId} />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Appears as "Issuing authority" on every staff member's ID card. You can change this anytime — no approval needed.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
