import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { MapPin, Camera, CheckCircle2, Clock, Shield, Sparkles, Building2, ArrowRight, Map as MapIcon, GraduationCap, Briefcase, Smartphone, BellRing, Wallet, UserCog, ShieldAlert, IdCard as IdCardIcon } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";
import { PromotionBanner, PromotionPlanBadge } from "@/lib/promotion";
import { LogoScene3D } from "@/components/LogoScene3D";
import { RazorpayCheckoutModal } from "@/components/RazorpayCheckoutModal";
import { FeatureStory } from "@/components/FeatureStory";
import { ClientMarquee } from "@/components/ClientMarquee";
import { toast } from "sonner";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};
const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const SEO_TITLE =
  "Biometric Attendance System in Andhra Pradesh & Telangana | Punchly — Hyderabad, Vijayawada, Visakhapatnam, Guntur, Tirupati, Warangal";
const SEO_DESCRIPTION =
  "Punchly is the #1 biometric attendance app for offices, schools and field teams across Andhra Pradesh and Telangana — GPS + selfie face biometric punch-in, multi-shift scheduling, auto payroll and leave approval. Used in Hyderabad, Vijayawada, Visakhapatnam, Guntur, Tirupati, Warangal, Kurnool, Nellore, Rajahmundry, Kakinada, Karimnagar and across all Telugu states.";
const SEO_KEYWORDS = [
  "biometric attendance",
  "biometric attendance system",
  "biometric attendance app",
  "face recognition attendance",
  "GPS attendance",
  "selfie attendance",
  "fingerprint attendance alternative",
  "biometric attendance Andhra Pradesh",
  "biometric attendance Telangana",
  "biometric attendance Hyderabad",
  "biometric attendance Vijayawada",
  "biometric attendance Visakhapatnam",
  "biometric attendance Guntur",
  "biometric attendance Tirupati",
  "biometric attendance Warangal",
  "biometric attendance Kurnool",
  "biometric attendance Nellore",
  "biometric attendance Rajahmundry",
  "biometric attendance Kakinada",
  "biometric attendance Karimnagar",
  "biometric attendance Nizamabad",
  "biometric attendance Khammam",
  "biometric attendance Anantapur",
  "biometric attendance Kadapa",
  "bayometric haajaru app", // Telugu transliteration
  "haajaru app Telugu",
  "school biometric attendance Telugu states",
  "staff biometric attendance Andhra",
  "employee attendance software Telangana",
  "payroll software Hyderabad",
  "shift management Andhra Pradesh",
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: SEO_TITLE },
      { name: "description", content: SEO_DESCRIPTION },
      { name: "keywords", content: SEO_KEYWORDS.join(", ") },
      { name: "author", content: "Punchly" },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1" },
      { name: "googlebot", content: "index, follow" },
      { name: "language", content: "English, Telugu" },
      { name: "geo.region", content: "IN-TG" },
      { name: "geo.placename", content: "Hyderabad, Telangana, Andhra Pradesh, India" },
      { name: "geo.position", content: "17.3850;78.4867" },
      { name: "ICBM", content: "17.3850, 78.4867" },
      { name: "coverage", content: "Andhra Pradesh, Telangana, India" },
      { name: "distribution", content: "global" },
      { name: "rating", content: "general" },
      { property: "og:title", content: SEO_TITLE },
      { property: "og:description", content: SEO_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Punchly" },
      { property: "og:locale", content: "en_IN" },
      { property: "og:locale:alternate", content: "te_IN" },
      { property: "og:url", content: "https://punchly.online/" },
      { property: "og:image", content: "https://punchly.online/og-image.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Punchly — Smart Attendance for Indian Businesses" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SEO_TITLE },
      { name: "twitter:description", content: SEO_DESCRIPTION },
      { name: "twitter:image", content: "https://punchly.online/og-image.png" },
    ],
    links: [
      // Landing-page typefaces. Preconnect first so the display face isn't the
      // thing holding up first paint. CSP already allows these two hosts.
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=IBM+Plex+Mono:wght@400;500;600&family=Instrument+Sans:wght@400;500;600&display=swap",
      },
      { rel: "canonical", href: "https://punchly.online/" },
      { rel: "alternate", hrefLang: "en-IN", href: "https://punchly.online/" },
      { rel: "alternate", hrefLang: "te-IN", href: "https://punchly.online/" },
      { rel: "alternate", hrefLang: "x-default", href: "https://punchly.online/" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "SoftwareApplication",
              name: "Punchly — Biometric Attendance",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web, Android, iOS",
              description: SEO_DESCRIPTION,
              areaServed: [
                { "@type": "State", name: "Andhra Pradesh" },
                { "@type": "State", name: "Telangana" },
                { "@type": "City", name: "Hyderabad" },
                { "@type": "City", name: "Vijayawada" },
                { "@type": "City", name: "Visakhapatnam" },
                { "@type": "City", name: "Guntur" },
                { "@type": "City", name: "Tirupati" },
                { "@type": "City", name: "Warangal" },
              ],
              offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
              aggregateRating: { "@type": "AggregateRating", ratingValue: "4.9", reviewCount: "1280" },
            },
            {
              "@type": "Organization",
              name: "Punchly",
              url: "/",
              areaServed: ["Andhra Pradesh", "Telangana", "India"],
              sameAs: [],
            },
            {
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "What is the best biometric attendance system in Andhra Pradesh and Telangana?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Punchly is a leading biometric attendance system across Andhra Pradesh and Telangana, using face biometric (selfie) + GPS geofence instead of fingerprint hardware. It works in Hyderabad, Vijayawada, Visakhapatnam, Guntur, Tirupati, Warangal and every Telugu-speaking district.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Does Punchly work as a biometric attendance app without a fingerprint device?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Yes. Punchly replaces fingerprint machines with a face-biometric selfie plus GPS verification on any phone, so schools and offices across Telugu states can start without buying hardware.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Is Punchly available in Telugu?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Punchly is built for Telugu-state businesses and schools — staff and parents in Andhra Pradesh and Telangana can use it on any Android or iPhone with simple, tap-based screens.",
                  },
                },
              ],
            },
          ],
        }),
      },
    ],
  }),
  component: Landing,
});

/* ────────────────────────────────────────────────────────────────────────────
   THE REGISTER
   Punchly replaces two physical objects: the paper attendance register and the
   fingerprint box screwed next to the door. So the page is built as a ledger —
   hairline rules, tabular figures, status pills, rows that read like real
   punch entries. The hero shows the product's actual output instead of a
   phone floating at an angle.
   ──────────────────────────────────────────────────────────────────────────── */

type PunchRow = {
  name: string;
  id: string;
  time: string;
  place: string;
  status: "in" | "late" | "field" | "out";
};

const REGISTER_ROWS: PunchRow[] = [
  { name: "Aarav Singh", id: "EMP-0041", time: "09:02", place: "HQ · Hyderabad", status: "in" },
  { name: "Lakshmi Rao", id: "EMP-0067", time: "09:14", place: "Vijayawada", status: "in" },
  { name: "Imran Q.", id: "EMP-0112", time: "09:41", place: "Guntur", status: "late" },
  { name: "Divya Reddy", id: "EMP-0088", time: "10:05", place: "On the road", status: "field" },
  { name: "Suresh K.", id: "EMP-0023", time: "18:04", place: "HQ · Hyderabad", status: "out" },
];

const STATUS_STYLE: Record<PunchRow["status"], { label: string; cls: string }> = {
  in:    { label: "Verified",  cls: "bg-success/12 text-success" },
  late:  { label: "Late 11m",  cls: "bg-warning/15 text-warning-foreground" },
  field: { label: "Field",     cls: "bg-primary/12 text-primary" },
  out:   { label: "Checked out", cls: "bg-muted text-muted-foreground" },
};

/** One ledger line. Used in the hero and again in the modes preview. */
function RegisterRow({ row, delay = 0, highlight = false }: { row: PunchRow; delay?: number; highlight?: boolean }) {
  const s = STATUS_STYLE[row.status];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`rule-row flex items-center gap-3 px-4 py-3 sm:px-5 ${highlight ? "bg-success/[0.06]" : ""}`}
    >
      <span className="font-data text-[13px] font-medium text-foreground tabular-nums">{row.time}</span>
      <span aria-hidden className="h-8 w-px shrink-0 bg-border" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{row.name}</span>
        <span className="font-data block truncate text-[11px] text-muted-foreground">
          {row.id} · {row.place}
        </span>
      </span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>
    </motion.div>
  );
}

/* ── The playable punch ──────────────────────────────────────────────────────
   The objection every buyer has is "a phone can't replace my fingerprint
   machine". Arguing with that in copy is weak; letting them do it is not. So
   the hero is the real check-in loop — locate, verify the face, record —
   playable in about six seconds, with their own punch landing in the register
   at the end. No signup, no backend: it is a client-side state machine that
   mirrors what src/routes/_authenticated/check-in.tsx actually does.
   ──────────────────────────────────────────────────────────────────────────── */

type DemoStage = "idle" | "locating" | "located" | "capturing" | "captured" | "done";

/** Honours the OS "reduce motion" setting; SSR-safe. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

const STAGE_COPY: Record<DemoStage, string> = {
  idle: "Ready",
  locating: "Finding you…",
  located: "Inside the geofence",
  capturing: "Hold still…",
  captured: "Face verified",
  done: "Recorded",
};

function PunchDemo() {
  const [stage, setStage] = useState<DemoStage>("idle");
  const [accuracy, setAccuracy] = useState(48);
  const [rows, setRows] = useState<PunchRow[]>(REGISTER_ROWS);
  const [present, setPresent] = useState(98);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const reduced = usePrefersReducedMotion();

  // Every timer this component starts is tracked so a mid-run unmount (or a
  // replay) can't leave a stray setState firing into a dead component.
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const after = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, reduced ? Math.min(ms, 120) : ms)); };
  useEffect(() => clearTimers, []);

  const running = stage !== "idle" && stage !== "done";

  const run = () => {
    if (running) return;
    clearTimers();
    setRows(REGISTER_ROWS);
    setPresent(98);
    setAccuracy(48);
    setStage("locating");

    // GPS tightening: the accuracy readout walks down the way a real fix does.
    [40, 31, 24, 17, 11, 6].forEach((a, i) => after(180 + i * 190, () => setAccuracy(a)));

    after(1500, () => setStage("located"));
    after(2250, () => setStage("capturing"));
    after(3700, () => setStage("captured"));
    after(4350, () => {
      // The visitor's own punch, stamped with the real clock. Computed here
      // (in a click handler) rather than at render, so SSR and hydration agree.
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const mine: PunchRow = { name: "You", id: "EMP-0001", time: `${hh}:${mm}`, place: "HQ · Hyderabad", status: "in" };
      setRows((r) => [mine, ...r].slice(0, 5));
      setPresent((p) => p + 1);
      setStage("done");
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
    >
      {/* ── The punch panel ── */}
      <div className="relative border-b border-border bg-muted/30 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-data text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Try a check-in</p>
            <p className="mt-1 text-sm text-muted-foreground">The real thing, minus the signup.</p>
          </div>
          <span
            className={`font-data shrink-0 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
              stage === "done" ? "bg-success/12 text-success" : running ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground"
            }`}
            role="status"
            aria-live="polite"
          >
            {STAGE_COPY[stage]}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-4">
          {/* Geofence dial — the ring tightens as the fix sharpens. */}
          <div className="relative grid h-20 w-20 shrink-0 place-items-center">
            <motion.span
              aria-hidden
              className="absolute rounded-full border-2 border-primary/30"
              animate={{
                width: stage === "idle" ? 72 : stage === "locating" ? [72, 44] : 44,
                height: stage === "idle" ? 72 : stage === "locating" ? [72, 44] : 44,
                opacity: stage === "capturing" || stage === "captured" ? 0.35 : 1,
              }}
              transition={{ duration: reduced ? 0 : 1.4, ease: "easeOut" }}
            />
            <motion.span
              aria-hidden
              className={`absolute rounded-full ${stage === "idle" ? "bg-muted-foreground/40" : "bg-primary"}`}
              animate={{ width: 10, height: 10, scale: running ? [1, 1.35, 1] : 1 }}
              transition={{ duration: reduced ? 0 : 1.2, repeat: running && !reduced ? Infinity : 0 }}
            />
            {(stage === "located" || stage === "capturing" || stage === "captured" || stage === "done") && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full bg-success text-success-foreground"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </motion.span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">
                {stage === "idle" ? "HQ · Hyderabad" : stage === "locating" ? "Locating…" : "HQ · Hyderabad"}
              </span>
              <span className="font-data text-xs text-muted-foreground">±{accuracy}m</span>
            </div>
            {/* Face frame appears only for the capture beat. */}
            <div className="mt-2 h-9">
              {(stage === "capturing" || stage === "captured") ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full items-center gap-2">
                  <motion.span
                    aria-hidden
                    className={`h-8 w-8 rounded-lg border-2 ${stage === "captured" ? "border-success" : "border-primary"}`}
                    animate={stage === "capturing" && !reduced ? { scale: [1, 0.94, 1] } : { scale: 1 }}
                    transition={{ duration: 0.9, repeat: stage === "capturing" && !reduced ? Infinity : 0 }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {stage === "captured" ? "Selfie captured — stored privately" : "Face in frame, shutter fires itself"}
                  </span>
                </motion.div>
              ) : (
                <div className="flex h-full items-center">
                  <span className="text-xs text-muted-foreground">
                    {stage === "done" ? "Punch written to the register below" : "GPS, then a selfie. Two checks, one tap."}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <Button onClick={run} disabled={running} className="mt-4 w-full gap-2" size="lg">
          {stage === "idle" ? "Check in" : stage === "done" ? "Run it again" : "Working…"}
          {!running && <ArrowRight className="h-4 w-4" />}
        </Button>
      </div>

      {/* ── The register ── */}
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="motion-safe-only absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          <span className="font-data text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Today&rsquo;s register</span>
        </div>
        <span className="font-data text-[11px] text-muted-foreground">4 branches</span>
      </div>

      <div>
        <AnimatePresence initial={false}>
          {rows.map((r, i) => (
            <motion.div
              key={`${r.id}-${r.time}`}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: reduced ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <RegisterRow row={r} delay={r.name === "You" ? 0 : 0.5 + i * 0.11} highlight={r.name === "You"} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-3 sm:px-5">
        <span className="text-[11px] text-muted-foreground">Every row carries GPS + a selfie</span>
        <motion.span key={present} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="font-data text-[11px] font-medium text-success">
          {present} / 104 present
        </motion.span>
      </div>
    </motion.div>
  );
}

function Landing() {
  const [checkoutPlan, setCheckoutPlan] = useState<{ id: string; name: string; price: number; billing: string } | null>(null);

  const { data: session } = useQuery({ queryKey: ["session"], queryFn: async () => { const { data } = await supabase.auth.getUser(); return data.user ?? null; } });
  const { data: userInfo } = useQuery({
    queryKey: ["my-roles-and-tenant", session?.id],
    enabled: !!session?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role, tenant_id")
        .eq("user_id", session!.id);
      const rows = data ?? [];
      const isSuper = rows.some((r) => r.role === "super_admin");
      // First tenant_id where the user is an admin of the tenant
      const tenantId = rows.find((r) => (r.role === "client_admin" || r.role === "branch_manager") && r.tenant_id)?.tenant_id ?? null;
      return { isSuper, tenantId };
    },
  });
  const tenantId = userInfo?.tenantId ?? null;

  // Resume any checkout flow the user started before signing up.
  // Declared AFTER session/tenantId so the deps array isn't a TDZ trap.
  useEffect(() => {
    if (!session || !tenantId || checkoutPlan) return;
    try {
      const stashed = sessionStorage.getItem("pendingCheckoutPlan");
      if (stashed) {
        const plan = JSON.parse(stashed);
        sessionStorage.removeItem("pendingCheckoutPlan");
        setCheckoutPlan(plan);
        toast.success("Welcome! Continuing your checkout.");
      }
    } catch {}
  }, [session, tenantId, checkoutPlan]);
  const isSuper = userInfo?.isSuper ?? false;

  const { data: plans } = useQuery({
    queryKey: ["public-plans"],
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("*").eq("is_active", true).order("display_order");
      return data ?? [];
    },
  });

  return (
    <div className="font-body min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Logo />
          <nav className="hidden gap-7 text-sm text-muted-foreground md:flex">
            <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">Pricing</a>
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link to="/auth"><Button variant="ghost" size="sm" className="px-2 sm:px-3">Sign in</Button></Link>
            <Link to="/auth"><Button size="sm" className="gap-1 px-2.5 sm:px-3"><span className="hidden xs:inline sm:inline">Get started </span><ArrowRight className="h-3.5 w-3.5" /></Button></Link>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden border-b border-border">
        <div aria-hidden className="absolute inset-0 z-0" style={{ background: "var(--gradient-soft)" }} />
        {/* Kept from the original hero, dialled back so it sits behind the
            register rather than competing with it. */}
        <div aria-hidden className="absolute inset-0 z-0 opacity-40">
          <LogoScene3D />
        </div>
        <div
          aria-hidden
          className="absolute inset-0 z-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />

        <div className="relative z-10 mx-auto max-w-6xl px-4 py-16 md:py-24">
          <div className="mb-10">
            <PromotionBanner />
          </div>

          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
            <motion.div variants={stagger} initial="hidden" animate="show">
              <motion.div variants={fadeUp} className="mb-5 flex items-center gap-2">
                <Badge variant="secondary" className="gap-1.5">
                  <Sparkles className="h-3 w-3" /> Flexible plans — monthly to multi-year
                </Badge>
              </motion.div>

              <motion.h1
                variants={fadeUp}
                className="font-display text-[2.6rem] font-700 leading-[0.98] tracking-[-0.03em] text-foreground sm:text-6xl"
                style={{ fontWeight: 700, textWrap: "balance" }}
              >
                {BRAND.tagline}
              </motion.h1>

              <motion.p variants={fadeUp} className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                Retire the paper register and the fingerprint box on the wall. Staff punch in
                with GPS and a selfie on the phone they already own — and payroll adds itself up.
              </motion.p>

              <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-3">
                <Link to="/auth">
                  <Button size="lg" className="group gap-2">
                    Start free
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                </Link>
                <a href="#pricing"><Button size="lg" variant="outline">See pricing</Button></a>
              </motion.div>

              <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Shield className="h-4 w-4 text-success" /> GPS verified</span>
                <span className="flex items-center gap-1.5"><Camera className="h-4 w-4 text-accent" /> Selfie proof</span>
                <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4 text-primary" /> Multi-branch</span>
              </motion.div>
            </motion.div>

            <PunchDemo />
          </div>
        </div>
      </section>

      {/* ── Numbers, set as a ledger footer ────────────────────────────────── */}
      <section className="border-b border-border bg-card/30">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-y-8 px-4 py-10 sm:grid-cols-4">
          {[
            { n: 700, suffix: "ms", label: "Check-in speed" },
            { n: 99, suffix: "%", label: "GPS accuracy" },
            { n: 3, suffix: " taps", label: "To run payroll" },
            { n: 100, suffix: "%", label: "Data stays in India" },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="text-center sm:border-r sm:border-border sm:last:border-r-0"
            >
              <CountUp target={s.n} suffix={s.suffix} />
              <p className="mt-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <ClientMarquee />

      <FeatureStory />

      {/* ── How it works: a real clock sequence, so the times carry meaning ── */}
      <section id="how" className="border-b border-border py-20">
        <div className="mx-auto max-w-6xl px-4">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6 }}>
            <p className="font-data text-[11px] uppercase tracking-[0.2em] text-muted-foreground">One staff member, one day</p>
            <h2 className="font-display mt-3 text-3xl tracking-[-0.02em] md:text-4xl" style={{ fontWeight: 600 }}>
              Three taps, and the day is on record
            </h2>
          </motion.div>

          <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
            {[
              { icon: MapPin, at: "09:02", title: "Location verified", desc: "GPS confirms the staff member is inside the branch geofence before the app will accept a punch." },
              { icon: Camera, at: "09:02", title: "Selfie captured", desc: "The front camera snaps proof of presence. Face detection fires the shutter — no button to game." },
              { icon: CheckCircle2, at: "18:04", title: "Day closed", desc: "Breaks, overtime and totals are already counted. Nothing to key in at month end." },
            ].map((s) => (
              <motion.div key={s.title} variants={fadeUp} className="bg-card p-7">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <span className="font-data text-sm text-muted-foreground">{s.at}</span>
                </div>
                <h3 className="font-display mt-5 text-lg" style={{ fontWeight: 600 }}>{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Features: bento. Three lead capabilities, then the full set. ───── */}
      <section id="features" className="border-b border-border bg-card/30 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6 }}>
            <p className="font-data text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Everything included</p>
            <h2 className="font-display mt-3 text-3xl tracking-[-0.02em] md:text-4xl" style={{ fontWeight: 600 }}>
              One app for offices, field teams and schools
            </h2>
          </motion.div>

          {/* Lead three — the capabilities that decide the sale. */}
          <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              { icon: Wallet, title: "Payroll that adds itself up", desc: "Salary is calculated from the attendance already on record — overtime, leave and late deductions included. Payslip PDF at the end of it." },
              { icon: MapIcon, title: "Live staff map", desc: "See who is checked in and where, right now, across every branch on one map." },
              { icon: GraduationCap, title: "School mode", desc: "Teachers mark a whole class present or absent in one tap. Students need no phone and no GPS." },
            ].map((f) => (
              <motion.div key={f.title} variants={fadeUp}>
                <Card className="h-full border-border p-7 transition-colors hover:border-primary/40">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-display mt-5 text-lg" style={{ fontWeight: 600 }}>{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          {/* The rest, compact — every capability the product ships. */}
          <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Building2, title: "Multi-branch HQ", desc: "Unlimited branches or campuses, each with its own staff, shifts and reports." },
              { icon: UserCog, title: "Branch managers", desc: "Delegate per location — a manager sees only their own branch." },
              { icon: Briefcase, title: "Field staff mode", desc: "Reps and delivery staff punch from anywhere; distance and accuracy are logged." },
              { icon: MapPin, title: "Per-branch geofence", desc: "Set the radius per location. Punches from outside it are flagged automatically." },
              { icon: Camera, title: "Selfie + GPS proof", desc: "Tamper-proof check-ins, encrypted and stored privately." },
              { icon: Clock, title: "Multi-shift scheduling", desc: "Morning, night, rotational — assign shifts per staff member." },
              { icon: Smartphone, title: "Installable app", desc: "Works on any phone or desktop. Add to home screen and keep working offline." },
              { icon: ShieldAlert, title: "Mock-GPS detection", desc: "Spots fake-location apps and marks those check-ins for review." },
              { icon: BellRing, title: "Parent & staff alerts", desc: "Ping every absent student's parent — or any staff member — over WhatsApp in one tap." },
              { icon: IdCardIcon, title: "Staff ID cards", desc: "Generated with your logo, photo and a QR code. Seven templates, download or share." },
              { icon: BellRing, title: "Smart notifications", desc: "Missed check-ins, leave approvals, payslips and expiring plans, raised automatically." },
            ].map((f) => (
              <motion.div key={f.title} variants={fadeUp} className="bg-card p-6 transition-colors hover:bg-muted/40">
                <f.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-4 text-sm font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <ModesSection />

      <PricingSection
        plans={plans ?? []}
        tenantId={tenantId ?? ""}
        isLoggedIn={!!session}
        onCheckout={(p) => {
          if (!session) {
            // Stash the plan they wanted so we can resume after signup
            try { sessionStorage.setItem("pendingCheckoutPlan", JSON.stringify(p)); } catch {}
            toast.info("Create an account to continue with payment");
            window.location.href = "/auth";
            return;
          }
          if (isSuper) {
            toast.info("Switch to a client admin account to purchase");
            return;
          }
          if (!tenantId) {
            toast.error("Your account isn't linked to a company yet. Contact support.");
            return;
          }
          setCheckoutPlan(p);
        }}
      />

      {/* ── Closing ────────────────────────────────────────────────────────── */}
      <section className="border-b border-border py-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-3xl px-4 text-center"
        >
          <h2 className="font-display text-3xl tracking-[-0.02em] md:text-5xl" style={{ fontWeight: 700, textWrap: "balance" }}>
            Tomorrow morning, the register fills itself
          </h2>
          <p className="mt-4 text-muted-foreground">Set up in under a minute. No card, no hardware, no installation visit.</p>
          <Link to="/auth" className="mt-7 inline-block">
            <Button size="lg" className="group gap-2">
              Create your account
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
        </motion.div>
      </section>

      <footer className="bg-card/30">
        <div className="mx-auto max-w-6xl space-y-8 px-4 py-14">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="space-y-3 md:col-span-2">
              <Logo size={24} />
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                GPS + selfie attendance, automatic payroll, leave management and staff
                ID cards — built for Indian businesses and schools.
              </p>
            </div>
            <div>
              <p className="font-data mb-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Product</p>
              <div className="flex flex-col gap-2.5 text-sm">
                <a href="#features" className="text-muted-foreground transition-colors hover:text-foreground">Features</a>
                <a href="#pricing" className="text-muted-foreground transition-colors hover:text-foreground">Pricing</a>
                <a href="#how" className="text-muted-foreground transition-colors hover:text-foreground">How it works</a>
              </div>
            </div>
            <div>
              <p className="font-data mb-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Company</p>
              <div className="flex flex-col gap-2.5 text-sm">
                <Link to="/privacy" className="text-muted-foreground transition-colors hover:text-foreground">Privacy Policy</Link>
                <Link to="/terms" className="text-muted-foreground transition-colors hover:text-foreground">Terms of Service</Link>
                <Link to="/support" className="text-muted-foreground transition-colors hover:text-foreground">Support</Link>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border p-6 text-center">
            <p className="font-data text-[10px] uppercase tracking-[0.3em] text-muted-foreground">An innovation by</p>
            <p className="font-display mt-2 text-lg tracking-[-0.01em]" style={{ fontWeight: 700 }}>Nikki Tech Labs</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Powered by <span className="font-semibold text-foreground">K<sup>2</sup> Adexos Global Technologies</span>
            </p>
          </div>

          <div className="flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground md:flex-row">
            <p>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</p>
            <p>Made with ❤️ in Hyderabad, India</p>
          </div>
        </div>
      </footer>

      {checkoutPlan && (
        <RazorpayCheckoutModal
          isOpen={!!checkoutPlan}
          onClose={() => setCheckoutPlan(null)}
          planId={checkoutPlan.id}
          planName={checkoutPlan.name}
          amountInr={checkoutPlan.price}
          billing={checkoutPlan.billing}
          tenantId={tenantId ?? ""}
          onSuccess={() => { setCheckoutPlan(null); window.location.href = "/app"; }}
        />
      )}
    </div>
  );
}

function ModesSection() {
  const [mode, setMode] = useState<"business" | "school">("business");
  const modes = {
    business: {
      title: "Business / Office mode",
      tagline: "Offices, retail, factories, field teams.",
      bullets: [
        "GPS + selfie attendance with per-branch geofence",
        "Field staff can punch from anywhere — distance auto-logged",
        "Live map shows every active staff in real time",
        "Multi-shift, overtime & break tracking",
        "Auto payroll → payslip PDF every month",
        "Multi-branch with branch manager role",
      ],
      icon: Briefcase,
    },
    school: {
      title: "School / College mode",
      tagline: "Schools, colleges, coaching centres.",
      bullets: [
        "Teachers mark whole classes in one tap (no GPS)",
        "Students don't need phones — teacher marks attendance",
        "Multiple campuses with campus-wise reports",
        "Parent SMS / WhatsApp on absent",
        "Monthly student attendance PDF",
        "Teacher attendance with selfie (optional)",
      ],
      icon: GraduationCap,
    },
  } as const;
  const m = modes[mode];

  return (
    <section className="border-b border-border py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-data text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Two modes, one app</p>
            <h2 className="font-display mt-3 text-3xl tracking-[-0.02em] md:text-4xl" style={{ fontWeight: 600 }}>
              Pick yours at signup. The whole app adapts.
            </h2>
          </div>
          <div className="inline-flex shrink-0 rounded-full border border-border bg-card p-1">
            {(["business", "school"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setMode(k)}
                className={`relative rounded-full px-6 py-2 text-sm font-medium transition-colors ${mode === k ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {mode === k && (
                  <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                )}
                <span className="relative">{k === "business" ? "Business" : "School"}</span>
              </button>
            ))}
          </div>
        </div>

        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mt-10 grid items-start gap-6 md:grid-cols-2"
        >
          <Card className="border-border p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <m.icon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-display text-xl" style={{ fontWeight: 600 }}>{m.title}</h3>
                <p className="text-sm text-muted-foreground">{m.tagline}</p>
              </div>
            </div>
            <ul className="mt-6 space-y-2.5 text-sm">
              {m.bullets.map((b) => (
                <li key={b} className="flex gap-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> <span className="text-muted-foreground">{b}</span></li>
              ))}
            </ul>
          </Card>

          {/* Same ledger language as the hero, showing what this mode records. */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border bg-muted/40 px-5 py-3">
              <span className="font-data text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {mode === "business" ? "Live across branches" : "Today, by class"}
              </span>
            </div>
            {(mode === "business"
              ? [
                  { l: "HQ — Mumbai", v: "42 / 45 in", c: "text-success" },
                  { l: "Andheri Branch", v: "18 / 20 in", c: "text-success" },
                  { l: "Pune Branch", v: "11 / 15 in", c: "text-warning-foreground" },
                  { l: "Field reps (live)", v: "7 on the road", c: "text-primary" },
                ]
              : [
                  { l: "Grade 6-A · Mrs. Sharma", v: "38 / 40 present", c: "text-success" },
                  { l: "Grade 7-B · Mr. Khan", v: "35 / 36 present", c: "text-success" },
                  { l: "Grade 8-A · Ms. Iyer", v: "30 / 32 present", c: "text-warning-foreground" },
                  { l: "Today (whole school)", v: "94% attendance", c: "text-primary" },
                ]
            ).map((row, i) => (
              <motion.div
                key={row.l}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.07 }}
                className="rule-row flex items-center justify-between px-5 py-3.5 text-sm"
              >
                <span className="text-muted-foreground">{row.l}</span>
                <span className={`font-data text-xs font-medium ${row.c}`}>{row.v}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

type Plan = {
  id: string;
  name: string;
  description?: string | null;
  billing: string;
  employee_limit: number | null; // null = unlimited
  price_inr: number | string;
  features: unknown;
};


function billingLabel(p: Plan): string {
  // Prefer billing_period_months if set (the new explicit duration field).
  // Falls back to the legacy enum so old plans still render sensibly.
  const m = (p as any).billing_period_months as number | null | undefined;
  if (m == null) {
    switch ((p.billing ?? "").toLowerCase()) {
      case "lifetime": return "one-time";
      case "monthly":  return "/month";
      case "yearly":   return "/year";
      case "weekly":   return "/week";
      default:         return p.billing || "";
    }
  }
  if (m === 1) return "/month";
  if (m === 12) return "/year";
  if (m % 12 === 0) return `/${m / 12} years`;
  return `/${m} months`;
}

function PricingSection({ plans, tenantId, isLoggedIn, onCheckout }: { plans: Plan[]; tenantId: string; isLoggedIn: boolean; onCheckout: (p: { id: string; name: string; price: number; billing: string }) => void }) {
  // Tab semantics: "monthly" = pay-monthly, "longterm" = anything longer.
  // We split by billing_period_months (1 = monthly, anything else = longterm).
  const [billing, setBilling] = useState<"monthly" | "longterm">("longterm");

  const isMonthlyPlan = (p: Plan) => {
    const m = (p as any).billing_period_months as number | null | undefined;
    if (m != null) return m === 1;
    return p.billing === "monthly";
  };

  const core = plans
    .filter((p) => (billing === "monthly" ? isMonthlyPlan(p) : !isMonthlyPlan(p)))
    .filter((p) => p.employee_limit != null && p.employee_limit <= 50)
    .filter((p) => !/school|enterprise/i.test(p.name))
    .sort((a, b) => Number(a.price_inr) - Number(b.price_inr));
  const school = plans.find((p) => /school/i.test(p.name));
  const enterprise = plans.find((p) => /enterprise/i.test(p.name));

  // Compute savings hint dynamically — average longterm price / months vs avg monthly price.
  const avgMonthly = (() => {
    const ms = plans.filter(isMonthlyPlan);
    if (ms.length === 0) return null;
    return ms.reduce((a, p) => a + Number(p.price_inr), 0) / ms.length;
  })();
  const avgLongPerMonth = (() => {
    const lts = plans.filter((p) => !isMonthlyPlan(p) && !/school|enterprise/i.test(p.name));
    if (lts.length === 0 || !avgMonthly) return null;
    const perMonth = lts.map((p) => {
      const m = (p as any).billing_period_months ?? (p.billing === "yearly" ? 12 : 36);
      return Number(p.price_inr) / m;
    });
    return perMonth.reduce((a, n) => a + n, 0) / perMonth.length;
  })();
  const savePct = avgMonthly && avgLongPerMonth
    ? Math.max(0, Math.round((1 - avgLongPerMonth / avgMonthly) * 100))
    : null;

  return (
    <section id="pricing" className="border-b border-border bg-card/30 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6 }} className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-data text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Pricing</p>
            <h2 className="font-display mt-3 text-3xl tracking-[-0.02em] md:text-4xl" style={{ fontWeight: 600 }}>
              Pay less by staying longer
            </h2>
            <p className="mt-2 text-muted-foreground">Pick a long-term plan for the best price, or pay monthly. Switch anytime.</p>
          </div>
          <div className="inline-flex shrink-0 rounded-full border border-border bg-background p-1">
            {(["longterm", "monthly"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setBilling(k)}
                className={`relative rounded-full px-5 py-2 text-sm font-medium transition-colors ${billing === k ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {billing === k && (
                  <motion.span layoutId="bill-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                )}
                <span className="relative flex items-center gap-2">
                  {k === "longterm" ? "Long-term" : "Monthly"}
                  {k === "longterm" && savePct && savePct >= 10 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${billing === k ? "bg-primary-foreground/20" : "bg-success/15 text-success"}`}>Save {savePct}%</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div key={billing} variants={stagger} initial="hidden" animate="show" className="mt-10 grid gap-5 md:grid-cols-3">
          {core.map((p, i) => {
            const popular = i === 1;
            const featuresArr = Array.isArray(p.features) ? (p.features as string[]) : [];
            return (
              <motion.div key={p.id} variants={fadeUp}>
                <Card className={`relative flex h-full flex-col p-7 transition-all ${popular ? "border-primary/60 shadow-lg" : "border-border hover:border-primary/30"}`}>
                  <PromotionPlanBadge planId={p.id} />
                  {popular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 shadow">Most popular</Badge>
                  )}
                  <h3 className="font-display text-xl" style={{ fontWeight: 600 }}>{p.name.replace(/\s*(Lifetime|Monthly|Yearly|\d+[- ]?(Year|Month)s?)$/i, "")}</h3>
                  <p className="font-data mt-1 text-xs text-muted-foreground">
                    {p.employee_limit == null ? "Unlimited employees" : `Up to ${p.employee_limit} employees`}
                  </p>
                  <div className="mt-5 flex items-baseline gap-1.5">
                    <span className="font-data text-4xl font-semibold tracking-tight">₹{Number(p.price_inr).toLocaleString("en-IN")}</span>
                    <span className="text-sm text-muted-foreground">{billingLabel(p)}</span>
                  </div>
                  {!!(p as any).maintenance_fee_inr && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      + ₹{Number((p as any).maintenance_fee_inr).toLocaleString("en-IN")}/yr maintenance from year {Math.round(((p as any).maintenance_grace_months ?? 24) / 12) + 1}
                    </p>
                  )}
                  <Button
                    className="mt-6 w-full"
                    variant={popular ? "default" : "outline"}
                    onClick={() => onCheckout({ id: p.id, name: p.name.replace(/\s*(Lifetime|Monthly|Yearly|\d+[- ]?(Year|Month)s?)$/i, ''), price: Number(p.price_inr), billing: p.billing })}
                  >
                    {isLoggedIn ? "Pay now" : "Sign up & pay"} <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                  <ul className="mt-6 space-y-2.5 text-sm">
                    {featuresArr.map((f) => (
                      <li key={f} className="flex gap-2.5">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                        <span className="text-muted-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {school && (
            <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
              <Card className="h-full border-border p-7">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/20 text-accent-foreground">
                      <GraduationCap className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-display text-lg" style={{ fontWeight: 600 }}>School Edition</h3>
                      <p className="text-xs text-muted-foreground">For schools, colleges &amp; coaching centres</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-data text-2xl font-semibold">₹{Number(school.price_inr).toLocaleString("en-IN")}</div>
                    <div className="font-data text-[11px] text-muted-foreground">{billingLabel(school)}</div>
                  </div>
                </div>
                <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
                  {(Array.isArray(school.features) ? (school.features as string[]) : []).slice(0, 6).map((f) => (
                    <li key={f} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /><span className="text-muted-foreground">{f}</span></li>
                  ))}
                </ul>
                <Link to="/auth" className="mt-6 inline-block">
                  <Button variant="outline" size="sm">Choose School Edition <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
                </Link>
              </Card>
            </motion.div>
          )}
          {enterprise && (
            <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.08 }}>
              <Card className="h-full border-foreground/20 bg-foreground p-7 text-background">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background/15">
                      <Building2 className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-display text-lg" style={{ fontWeight: 600 }}>Enterprise</h3>
                      <p className="text-xs opacity-70">500+ employees, SLA, custom domain</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-data text-2xl font-semibold">₹{Number(enterprise.price_inr).toLocaleString("en-IN")}</div>
                    <div className="font-data text-[11px] opacity-70">{billingLabel(enterprise)}</div>
                  </div>
                </div>
                <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
                  {(Array.isArray(enterprise.features) ? (enterprise.features as string[]) : []).slice(0, 6).map((f) => (
                    <li key={f} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /><span className="opacity-90">{f}</span></li>
                  ))}
                </ul>
                <Link to="/auth" className="mt-6 inline-block">
                  <Button size="sm" variant="secondary">Talk to sales <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
                </Link>
              </Card>
            </motion.div>
          )}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          All plans include GPS + selfie check-in, payroll, leaves, and the mobile PWA. No credit card to start.
        </p>
      </div>
    </section>
  );
}



/** Animated number counter — counts from 0 to target when scrolled into view. */
function CountUp({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [value, setValue] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started) {
          setStarted(true);
          const duration = 1200;
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min(1, (now - start) / duration);
            // easeOutCubic
            const eased = 1 - Math.pow(1 - p, 3);
            setValue(Math.round(eased * target));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [target, started]);

  return (
    <span ref={ref} className="font-data text-3xl font-semibold tracking-tight text-foreground">
      {value}{suffix}
    </span>
  );
}
