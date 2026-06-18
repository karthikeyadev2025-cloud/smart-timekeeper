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
        .select("name, logo_url, primary_color, contact_email, contact_phone, slug, tenant_type")
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

  // Sync state when tenant loads
  useEffect(() => {
    if (!tenant) return;
    setName(tenant.name ?? "");
    setContactEmail(tenant.contact_email ?? "");
    setContactPhone(tenant.contact_phone ?? "");
    setPrimaryColor(tenant.primary_color ?? "#4F46E5");
    setLogoUrl(tenant.logo_url ?? "");
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
