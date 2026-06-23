import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { useCurrentUser, primaryRole } from "@/hooks/useCurrentUser";
import {
  DEFAULTS,
  useSiteContent,
  useUpsertContent,
  cityKey,
  cityFallback,
  type HomeHero,
  type Branding,
  type SeoDefaults,
  type PublishableKeys,
  type CityOverride,
} from "@/lib/site-content";
import { CITIES } from "@/lib/cities";
import { ShieldAlert, Save, KeyRound, Globe, Building2, Paintbrush, FileText, Lock, ExternalLink, AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { data: user, isLoading } = useCurrentUser();
  const role = primaryRole(user?.roles ?? []);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-8 text-center text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  if (role !== "super_admin") {
    return (
      <AppShell>
        <Card className="mx-auto max-w-lg p-8 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
          <h2 className="mt-4 text-2xl font-bold">Super admin only</h2>
          <p className="mt-2 text-muted-foreground">
            This page lets the Punchly super admin edit every public page and integration key. Your
            current role can't access it.
          </p>
          <Button className="mt-4" onClick={() => navigate({ to: "/app" })}>Back to app</Button>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Site Editor</h1>
          <p className="text-muted-foreground">
            Edit every public page and manage integration keys. Changes go live the moment you save.
          </p>
        </header>

        <Tabs defaultValue="home" className="space-y-4">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="home"><Globe className="mr-1 h-4 w-4" />Home</TabsTrigger>
            <TabsTrigger value="cities"><Building2 className="mr-1 h-4 w-4" />City pages</TabsTrigger>
            <TabsTrigger value="branding"><Paintbrush className="mr-1 h-4 w-4" />Branding</TabsTrigger>
            <TabsTrigger value="seo"><FileText className="mr-1 h-4 w-4" />SEO</TabsTrigger>
            <TabsTrigger value="integrations"><KeyRound className="mr-1 h-4 w-4" />Integrations</TabsTrigger>
            <TabsTrigger value="promotions"><Sparkles className="mr-1 h-4 w-4" />Promotions</TabsTrigger>
          </TabsList>

          <TabsContent value="home"><HomeEditor /></TabsContent>
          <TabsContent value="cities"><CitiesEditor /></TabsContent>
          <TabsContent value="branding"><BrandingEditor /></TabsContent>
          <TabsContent value="seo"><SeoEditor /></TabsContent>
          <TabsContent value="integrations"><IntegrationsEditor /></TabsContent>
          <TabsContent value="promotions"><PromotionsEditor /></TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

// ---------------- Generic save helpers ----------------

function useEditor<T extends object>(sk: any, fallback: T) {
  const { data } = useSiteContent<T>(sk, fallback);
  const upsert = useUpsertContent();
  const [draft, setDraft] = useState<T | null>(null);
  const current = draft ?? data ?? fallback;
  const dirty = draft !== null;

  const save = async () => {
    try {
      await upsert.mutateAsync({ sk, content: current });
      setDraft(null);
      toast.success("Saved — live on the public site.");
    } catch (e: any) {
      toast.error(`Save failed: ${e.message}`);
    }
  };

  const set = (patch: Partial<T>) => setDraft({ ...current, ...patch });

  return { current, set, save, dirty, saving: upsert.isPending };
}

function SaveBar({ dirty, saving, onSave }: { dirty: boolean; saving: boolean; onSave: () => void }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t pt-4">
      {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
      <Button onClick={onSave} disabled={!dirty || saving} className="gap-2">
        <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

// ---------------- Home editor ----------------

function HomeEditor() {
  const { current, set, save, dirty, saving } = useEditor<HomeHero>("home.hero", DEFAULTS["home.hero"]);
  return (
    <Card className="space-y-4 p-6">
      <h2 className="text-xl font-semibold">Home page — hero</h2>
      <Field label="Top badge"><Input value={current.badge} onChange={(e) => set({ badge: e.target.value })} /></Field>
      <Field label="Headline (H1)"><Input value={current.title} onChange={(e) => set({ title: e.target.value })} /></Field>
      <Field label="Subtitle"><Textarea rows={3} value={current.subtitle} onChange={(e) => set({ subtitle: e.target.value })} /></Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Primary button text"><Input value={current.ctaPrimary} onChange={(e) => set({ ctaPrimary: e.target.value })} /></Field>
        <Field label="Secondary button text"><Input value={current.ctaSecondary} onChange={(e) => set({ ctaSecondary: e.target.value })} /></Field>
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={save} />
    </Card>
  );
}

// ---------------- City pages editor ----------------

function CitiesEditor() {
  const [slug, setSlug] = useState<string>(CITIES[0].slug);
  return (
    <div className="grid gap-4 md:grid-cols-[220px,1fr]">
      <Card className="p-2">
        <p className="px-2 py-1 text-xs font-medium uppercase text-muted-foreground">City pages</p>
        <div className="space-y-1">
          {CITIES.map((c) => (
            <button
              key={c.slug}
              onClick={() => setSlug(c.slug)}
              className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-muted ${slug === c.slug ? "bg-muted font-medium" : ""}`}
            >
              <span>{c.name}</span>
              <Badge variant="outline" className="text-[10px]">{c.state.split(" ")[1] ?? c.state}</Badge>
            </button>
          ))}
        </div>
      </Card>
      <CityEditor key={slug} slug={slug} />
    </div>
  );
}

function CityEditor({ slug }: { slug: string }) {
  const fallback = useMemo(() => cityFallback(slug), [slug]);
  const { current, set, save, dirty, saving } = useEditor<CityOverride>(cityKey(slug) as any, fallback);
  const areasText = (current.areas ?? []).join(", ");
  const indText = (current.industries ?? []).join(", ");
  const faqs = current.faqs ?? [];

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Edit /biometric-attendance/{slug}</h2>
        <a href={`/biometric-attendance/${slug}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          View live <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <Field label="H1 / page title (override)"><Input value={current.h1 ?? ""} placeholder={`Biometric attendance in ${current.name}`} onChange={(e) => set({ h1: e.target.value })} /></Field>
      <Field label="City display name"><Input value={current.name ?? ""} onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label="Intro paragraph"><Textarea rows={4} value={current.intro ?? ""} onChange={(e) => set({ intro: e.target.value })} /></Field>
      <Field label="Areas served (comma-separated)">
        <Textarea rows={2} value={areasText} onChange={(e) => set({ areas: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
      </Field>
      <Field label="Industries (comma-separated)">
        <Textarea rows={2} value={indText} onChange={(e) => set({ industries: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
      </Field>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Meta title (SEO)"><Input value={current.metaTitle ?? ""} onChange={(e) => set({ metaTitle: e.target.value })} /></Field>
        <Field label="Meta description (SEO)"><Input value={current.metaDescription ?? ""} onChange={(e) => set({ metaDescription: e.target.value })} /></Field>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>FAQs</Label>
          <Button size="sm" variant="outline" onClick={() => set({ faqs: [...faqs, { q: "", a: "" }] })}>+ Add FAQ</Button>
        </div>
        {faqs.map((f, i) => (
          <div key={i} className="rounded border p-3 space-y-2">
            <Input placeholder="Question" value={f.q} onChange={(e) => {
              const next = [...faqs]; next[i] = { ...next[i], q: e.target.value }; set({ faqs: next });
            }} />
            <Textarea rows={2} placeholder="Answer" value={f.a} onChange={(e) => {
              const next = [...faqs]; next[i] = { ...next[i], a: e.target.value }; set({ faqs: next });
            }} />
            <Button size="sm" variant="ghost" onClick={() => set({ faqs: faqs.filter((_, x) => x !== i) })}>Remove</Button>
          </div>
        ))}
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={save} />
    </Card>
  );
}

// ---------------- Branding editor ----------------

function BrandingEditor() {
  const { current, set, save, dirty, saving } = useEditor<Branding>("branding.site", DEFAULTS["branding.site"]);
  return (
    <Card className="space-y-4 p-6">
      <h2 className="text-xl font-semibold">Branding & contact</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Brand name"><Input value={current.brandName} onChange={(e) => set({ brandName: e.target.value })} /></Field>
        <Field label="Tagline"><Input value={current.tagline} onChange={(e) => set({ tagline: e.target.value })} /></Field>
        <Field label="Contact phone"><Input value={current.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} /></Field>
        <Field label="WhatsApp number"><Input value={current.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} /></Field>
        <Field label="Contact email"><Input value={current.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} /></Field>
        <Field label="Address"><Input value={current.address} onChange={(e) => set({ address: e.target.value })} /></Field>
        <Field label="Logo URL"><Input value={current.logoUrl} onChange={(e) => set({ logoUrl: e.target.value })} /></Field>
        <Field label="OG share image URL"><Input value={current.ogImageUrl} onChange={(e) => set({ ogImageUrl: e.target.value })} /></Field>
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={save} />
    </Card>
  );
}

// ---------------- SEO editor ----------------

function SeoEditor() {
  const { current, set, save, dirty, saving } = useEditor<SeoDefaults>("seo.defaults", DEFAULTS["seo.defaults"]);
  return (
    <Card className="space-y-4 p-6">
      <h2 className="text-xl font-semibold">Global SEO defaults</h2>
      <Field label="Title suffix (appended to every page title)"><Input value={current.titleSuffix} onChange={(e) => set({ titleSuffix: e.target.value })} /></Field>
      <Field label="Default meta description"><Textarea rows={3} value={current.defaultDescription} onChange={(e) => set({ defaultDescription: e.target.value })} /></Field>
      <Field label="Default keywords (comma-separated)"><Textarea rows={3} value={current.keywords} onChange={(e) => set({ keywords: e.target.value })} /></Field>
      <Field label="Robots meta"><Input value={current.robots} onChange={(e) => set({ robots: e.target.value })} /></Field>
      <SaveBar dirty={dirty} saving={saving} onSave={save} />
    </Card>
  );
}

// ---------------- Integrations editor ----------------

function IntegrationsEditor() {
  const { current, set, save, dirty, saving } = useEditor<PublishableKeys>("integrations.publishable", DEFAULTS["integrations.publishable"]);

  const fb = current.firebase;
  const setFb = (patch: Partial<PublishableKeys["firebase"]>) => set({ firebase: { ...fb, ...patch } });

  const secrets = [
    { name: "RAZORPAY_KEY_SECRET", label: "Razorpay Key Secret", help: "From Razorpay Dashboard → Settings → API Keys. Used to verify payment signatures on the server." },
    { name: "RAZORPAY_WEBHOOK_SECRET", label: "Razorpay Webhook Secret", help: "Set when you create a webhook in Razorpay. Used to verify webhook signatures." },
    { name: "FIREBASE_SERVICE_ACCOUNT_JSON", label: "Firebase Admin SDK service account (JSON)", help: "Firebase Console → Project settings → Service accounts → Generate new private key. Paste the full JSON contents as the value." },
    { name: "GOOGLE_OAUTH_CLIENT_SECRET", label: "Google OAuth Client Secret", help: "From Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client ID." },
  ];

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-6">
        <h2 className="text-xl font-semibold">Publishable keys</h2>
        <p className="text-sm text-muted-foreground">
          These are safe to expose in the browser. Updated here, they're live on the site immediately.
        </p>
        <Field label="Razorpay Key ID (starts with rzp_)">
          <Input value={current.razorpayKeyId} onChange={(e) => set({ razorpayKeyId: e.target.value })} placeholder="rzp_live_xxx or rzp_test_xxx" />
        </Field>
        <Field label="Google OAuth Client ID">
          <Input value={current.googleOauthClientId} onChange={(e) => set({ googleOauthClientId: e.target.value })} placeholder="123-xyz.apps.googleusercontent.com" />
        </Field>

        <div className="space-y-2 rounded-lg border p-4">
          <h3 className="font-medium">Firebase web config</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="apiKey"><Input value={fb.apiKey} onChange={(e) => setFb({ apiKey: e.target.value })} /></Field>
            <Field label="authDomain"><Input value={fb.authDomain} onChange={(e) => setFb({ authDomain: e.target.value })} /></Field>
            <Field label="projectId"><Input value={fb.projectId} onChange={(e) => setFb({ projectId: e.target.value })} /></Field>
            <Field label="appId"><Input value={fb.appId} onChange={(e) => setFb({ appId: e.target.value })} /></Field>
            <Field label="messagingSenderId"><Input value={fb.messagingSenderId} onChange={(e) => setFb({ messagingSenderId: e.target.value })} /></Field>
            <Field label="storageBucket"><Input value={fb.storageBucket} onChange={(e) => setFb({ storageBucket: e.target.value })} /></Field>
          </div>
        </div>

        <SaveBar dirty={dirty} saving={saving} onSave={save} />
      </Card>

      <Card className="space-y-4 p-6">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h2 className="text-xl font-semibold">Server environment variables</h2>
            <p className="text-sm text-muted-foreground">
              These secrets must never live in the browser or database. Add them as environment
              variables in your hosting provider (Vercel → Project → Settings → Environment
              Variables, or equivalent). Redeploy after changes so the server picks up the new values.
            </p>
          </div>
        </div>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Why not store them in the database?</AlertTitle>
          <AlertDescription>
            Payment and admin secrets in the database can be drained by anyone with read access
            or a SQL injection. Environment variables stay on the server and are never shipped to
            the browser bundle.
          </AlertDescription>
        </Alert>

        <div className="divide-y rounded-lg border">
          {secrets.map((s) => (
            <div key={s.name} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{s.name}</code>
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <CheckCircle2 className="h-3 w-3" /> Server env var
                  </Badge>
                </div>
                <p className="mt-1 text-sm font-medium">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.help}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          After adding or changing any variable above, trigger a redeploy so the new values are
          loaded by the server runtime.
        </p>
      </Card>
    </div>
  );
}

// ---------------- Tiny field helper ----------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/* ─────────────── PROMOTIONS EDITOR (super-admin only) ─────────────── */
function PromotionsEditor() {
  const { data: promo, refetch } = useQuery({
    queryKey: ["admin-active-promotion"],
    queryFn: async () => {
      // Fetch the full promotion row (admin sees more than the public view).
      const [{ data: row }, { data: counters }] = await Promise.all([
        supabase.from("promotions").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.rpc("get_active_promotion"),
      ]);
      return {
        row: row as any,
        counters: counters && counters.length > 0 ? counters[0] : null,
      };
    },
  });

  const { data: plans } = useQuery({
    queryKey: ["plans-for-promo"],
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("id, name, price_inr, billing").eq("is_active", true).order("display_order");
      return data ?? [];
    },
  });

  const [form, setForm] = useState<any | null>(null);
  // Hydrate the form from the loaded row exactly once so super-admin edits aren't clobbered.
  if (form === null && promo?.row) setForm({ ...promo.row });

  const save = async () => {
    if (!form?.id) return;
    const { error } = await supabase.from("promotions").update({
      title: form.title,
      banner_text: form.banner_text,
      cta_text: form.cta_text,
      max_claims: Number(form.max_claims) || 0,
      ends_at: form.ends_at || null,
      is_active: !!form.is_active,
      highlight_plan_id: form.highlight_plan_id || null,
    }).eq("id", form.id);
    if (error) toast.error(error.message);
    else { toast.success("Promotion updated"); refetch(); }
  };

  if (!promo?.row || !form) {
    return <Card className="p-6"><p className="text-sm text-muted-foreground">Loading promotion...</p></Card>;
  }

  const counters = promo.counters;

  return (
    <div className="space-y-4">
      {/* Live counter card */}
      {counters && (
        <Card className="overflow-hidden border-amber-400/30 p-0">
          <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 p-5 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] opacity-90">Live counter</p>
                <p className="mt-1 text-2xl font-bold sm:text-3xl">
                  {counters.claimed_count} / {counters.max_claims} claimed
                </p>
                <p className="text-sm opacity-90 mt-0.5">
                  {counters.remaining} slots remaining
                  {counters.is_exhausted && ' — banner is hidden (offer exhausted)'}
                  {counters.is_expired && ' — banner is hidden (offer expired)'}
                </p>
              </div>
              <div className="h-16 w-16 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles className="h-7 w-7" />
              </div>
            </div>
            <div className="mt-4 h-2 rounded-full bg-white/20 overflow-hidden">
              <div className="h-full bg-white transition-all" style={{ width: `${Math.min(100, (counters.claimed_count / counters.max_claims) * 100)}%` }} />
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6 space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> Edit promotion
        </h3>

        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={!!form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="h-4 w-4 cursor-pointer accent-primary"
            />
            <span className="text-sm font-medium">Active</span>
          </label>
          <p className="text-xs text-muted-foreground">Turn off to hide the banner from the landing page without losing the configuration.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Title (small label on banner)</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Lifetime Free - First 50" />
          </div>
          <div className="space-y-1.5">
            <Label>CTA button text</Label>
            <Input value={form.cta_text} onChange={(e) => setForm({ ...form, cta_text: e.target.value })} placeholder="Claim free lifetime" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Banner text (the main message)</Label>
          <Textarea value={form.banner_text} onChange={(e) => setForm({ ...form, banner_text: e.target.value })} rows={2} placeholder="🎉 Limited launch offer: First 50 companies get lifetime free access. No card needed." />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Max claims (offer hides after this many sign-ups)</Label>
            <Input type="number" min="0" value={form.max_claims} onChange={(e) => setForm({ ...form, max_claims: e.target.value })} />
            <p className="text-xs text-muted-foreground">Count is real signups since {new Date(form.starts_at).toLocaleDateString()}, not a manual counter.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Ends at (optional)</Label>
            <Input
              type="datetime-local"
              value={form.ends_at ? new Date(form.ends_at).toISOString().slice(0, 16) : ""}
              onChange={(e) => setForm({ ...form, ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
            <p className="text-xs text-muted-foreground">Leave blank for no time limit.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Highlight which plan on the pricing page</Label>
          <select
            value={form.highlight_plan_id ?? ""}
            onChange={(e) => setForm({ ...form, highlight_plan_id: e.target.value || null })}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— no highlight —</option>
            {(plans ?? []).map((p: any) => (
              <option key={p.id} value={p.id}>{p.name} (₹{p.price_inr} {p.billing})</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">The matching plan card on the price sheet gets an "Lifetime free · X of Y left" badge.</p>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={save} className="gap-2">
            <Save className="h-4 w-4" /> Save promotion
          </Button>
        </div>
      </Card>
    </div>
  );
}
