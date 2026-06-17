import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion, useScroll, useTransform, type Variants } from "framer-motion";
import { useRef, useState } from "react";
import { MapPin, Camera, CheckCircle2, Clock, Users, Shield, Sparkles, Building2, ArrowRight, Map as MapIcon, GraduationCap, Briefcase, Smartphone, BellRing, Wallet, ShieldCheck, UserCog, ShieldAlert } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";
import { LogoScene3D } from "@/components/LogoScene3D";
import { RazorpayCheckoutModal } from "@/components/RazorpayCheckoutModal";

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
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SEO_TITLE },
      { name: "twitter:description", content: SEO_DESCRIPTION },
    ],
    links: [
      { rel: "canonical", href: "/" },
      { rel: "alternate", hrefLang: "en-IN", href: "/" },
      { rel: "alternate", hrefLang: "te-IN", href: "/" },
      { rel: "alternate", hrefLang: "x-default", href: "/" },
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

function Landing() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, 0.3]);
  const phoneRotate = useTransform(scrollYProgress, [0, 1], [0, -8]);

  const [checkoutPlan, setCheckoutPlan] = useState<{ id: string; name: string; price: number; billing: string } | null>(null);

  const { data: session } = useQuery({ queryKey: ["session"], queryFn: async () => { const { data } = await supabase.auth.getUser(); return data.user ?? null; } });
  const { data: tenantId } = useQuery({ queryKey: ["my-tenant", session?.id], enabled: !!session?.id, queryFn: async () => { const { data } = await supabase.from("user_roles").select("tenant_id").eq("user_id", session!.id).eq("role", "client_admin").limit(1).maybeSingle(); return data?.tenant_id ?? null; } });

  const { data: plans } = useQuery({
    queryKey: ["public-plans"],
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("*").eq("is_active", true).order("display_order");
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <motion.header
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Logo />
          <nav className="hidden gap-6 text-sm text-muted-foreground md:flex">
            <a href="#how" className="story-link hover:text-foreground">How it works</a>
            <a href="#features" className="story-link hover:text-foreground">Features</a>
            <a href="#pricing" className="story-link hover:text-foreground">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <Link to="/auth"><Button size="sm" className="gap-1">Get started <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
          </div>
        </div>
      </motion.header>

      {/* Hero */}
      <section ref={heroRef} className="relative isolate overflow-hidden">
        <div className="absolute inset-0 z-0" style={{ background: "var(--gradient-soft)" }} />
        <motion.div
          aria-hidden
          className="absolute -top-32 -left-32 z-0 h-[500px] w-[500px] rounded-full bg-primary/20 blur-3xl"
          animate={{ x: [0, 40, 0], y: [0, 30, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="absolute -bottom-40 -right-20 z-0 h-[400px] w-[400px] rounded-full bg-accent/25 blur-3xl"
          animate={{ x: [0, -30, 0], y: [0, -40, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
        <div
          aria-hidden
          className="absolute inset-0 z-0 opacity-[0.04]"
          style={{ backgroundImage: "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)", backgroundSize: "48px 48px" }}
        />
        <div aria-hidden className="absolute inset-0 z-0 opacity-90">
          <LogoScene3D />
        </div>

        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative z-10 mx-auto max-w-6xl px-4 py-20 md:py-28">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <motion.div variants={stagger} initial="hidden" animate="show">
              <motion.div variants={fadeUp}>
                <Badge variant="secondary" className="mb-4 gap-1">
                  <Sparkles className="h-3 w-3" /> New · Lifetime plans available
                </Badge>
              </motion.div>
              <motion.h1 variants={fadeUp} className="text-4xl font-bold leading-[1.05] tracking-tight text-foreground md:text-6xl">
                {BRAND.tagline}
              </motion.h1>
              <motion.p variants={fadeUp} className="mt-5 max-w-lg text-lg text-muted-foreground">
                Track employee attendance, breaks, and working hours effortlessly with a simple, structured workflow designed for accuracy and ease.
              </motion.p>
              <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-3">
                <Link to="/auth">
                  <Button size="lg" className="gap-2 group">
                    Start free
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                <a href="#pricing"><Button size="lg" variant="outline">See pricing</Button></a>
              </motion.div>
              <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-6 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Shield className="h-4 w-4 text-success" /> GPS verified</span>
                <span className="flex items-center gap-1.5"><Camera className="h-4 w-4 text-accent" /> Selfie proof</span>
                <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4 text-primary" /> Multi-branch</span>
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              style={{ rotate: phoneRotate }}
              className="relative mx-auto"
            >
              <motion.div
                animate={{ y: [0, -12, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="relative h-[560px] w-[280px] rounded-[40px] border-8 border-foreground/90 bg-background p-3"
                style={{ boxShadow: "var(--shadow-glow)" }}
              >
                <div className="flex h-full flex-col gap-3 overflow-hidden rounded-[28px] bg-gradient-to-br from-primary to-primary-glow p-5 text-primary-foreground">
                  <div className="flex items-center justify-between">
                    <Logo size={24} showName={false} />
                    <span className="text-xs opacity-80">9:41</span>
                  </div>
                  <div className="mt-2">
                    <p className="text-xs opacity-80">Good morning</p>
                    <p className="text-xl font-semibold">Aarav Singh</p>
                  </div>
                  <Card className="mt-2 bg-card/95 p-4 text-card-foreground">
                    <p className="text-xs text-muted-foreground">Today's shift</p>
                    <p className="text-base font-semibold">Morning · 9:00 — 6:00</p>
                    <motion.div
                      animate={{ opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="mt-3 flex items-center gap-2 text-xs text-success"
                    >
                      <MapPin className="h-3.5 w-3.5" /> Inside office geofence
                    </motion.div>
                  </Card>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="mt-auto rounded-2xl bg-card py-4 text-base font-semibold text-primary shadow-lg"
                  >
                    Check in →
                  </motion.button>
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                    <div className="rounded-lg bg-white/10 p-2">Home</div>
                    <div className="rounded-lg bg-white/10 p-2">Salary</div>
                    <div className="rounded-lg bg-white/10 p-2">Leave</div>
                  </div>
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1, duration: 0.8 }}
                className="absolute -left-10 top-20 hidden rounded-2xl border border-border/60 bg-background/90 p-3 shadow-xl backdrop-blur md:flex items-center gap-2"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success"><CheckCircle2 className="h-4 w-4" /></div>
                <div className="text-xs"><p className="font-semibold">Checked in</p><p className="text-muted-foreground">9:02 AM · HQ</p></div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.2, duration: 0.8 }}
                className="absolute -right-8 bottom-24 hidden rounded-2xl border border-border/60 bg-background/90 p-3 shadow-xl backdrop-blur md:flex items-center gap-2"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Clock className="h-4 w-4" /></div>
                <div className="text-xs"><p className="font-semibold">8h 12m today</p><p className="text-muted-foreground">2 breaks</p></div>
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* 3 steps */}
      <section id="how" className="border-t border-border/60 bg-card/40 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6 }} className="text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">3 simple steps</h2>
            <p className="mt-2 text-muted-foreground">From sign-in to verified attendance in seconds.</p>
          </motion.div>
          <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { icon: MapPin, title: "Verify location", desc: "GPS confirms staff is inside the office geofence radius." },
              { icon: Camera, title: "Capture selfie", desc: "Front camera snaps a quick selfie as proof of presence." },
              { icon: CheckCircle2, title: "Check-in done", desc: "Shift-aware multi-checkin tracks breaks, OT, and totals." },
            ].map((s, i) => (
              <motion.div key={s.title} variants={fadeUp} whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300 }}>
                <Card className="p-6 h-full border-border/60 hover:border-primary/40 hover:shadow-lg transition-all">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <s.icon className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">Step {i + 1}</span>
                  </div>
                  <h3 className="mt-4 text-xl font-semibold">{s.title}</h3>
                  <p className="mt-2 text-muted-foreground">{s.desc}</p>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20">
        <div className="mx-auto max-w-6xl px-4">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6 }} className="text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Everything you need</h2>
            <p className="mt-2 text-muted-foreground">One app for offices, field teams, multi-branch businesses, and schools.</p>
          </motion.div>
          <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Building2, title: "Multi-branch HQ", desc: "Unlimited branches/campuses, each with its own staff, shifts, and reports." },
              { icon: UserCog, title: "Branch managers", desc: "Delegate per-location management — managers see only their branch." },
              { icon: MapIcon, title: "Live staff map", desc: "See who's checked in and where, in real time, on one map." },
              { icon: Briefcase, title: "Field staff mode", desc: "Reps & delivery staff punch from anywhere — distance & accuracy logged." },
              { icon: MapPin, title: "Per-branch geofence", desc: "Set the office radius per location. Outside attempts are flagged automatically." },
              { icon: Camera, title: "Selfie + GPS proof", desc: "Tamper-proof check-ins, encrypted & stored privately." },
              { icon: Clock, title: "Multi-shift scheduling", desc: "Morning, night, rotational — assign shifts per staff." },
              { icon: Wallet, title: "Auto payroll", desc: "Salary calculated from attendance, OT, leaves — payslip PDF ready." },
              { icon: GraduationCap, title: "School mode", desc: "Teachers mark whole classes Present/Absent in one tap. No GPS needed." },
              { icon: Smartphone, title: "Installable PWA", desc: "Works on any phone or desktop. Install to home screen, use offline-friendly." },
              { icon: ShieldAlert, title: "Anti-cheat (mock GPS)", desc: "Detects fake-GPS apps using browser heuristics — flagged check-ins are marked for review." },
              { icon: BellRing, title: "Parent / WhatsApp alerts", desc: "One tap to ping all absent students' parents — or message any staff — via WhatsApp." },
            ].map((f) => (
              <motion.div key={f.title} variants={fadeUp} whileHover={{ y: -4, scale: 1.02 }} transition={{ type: "spring", stiffness: 300 }}>
                <Card className="relative p-6 h-full border-border/60 hover:border-primary/40 hover:shadow-md transition-all">
                  <f.icon className="h-6 w-6 text-primary" />
                  <h3 className="mt-4 font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
                </Card>
              </motion.div>
            ))}
          </motion.div>

        </div>
      </section>

      {/* Modes — interactive Business vs School tabs */}
      <ModesSection />


      {/* Pricing */}
      <PricingSection
        plans={plans ?? []}
        tenantId={tenantId ?? ""}
        isLoggedIn={!!session}
        onCheckout={(p) => {
          if (!session) {
            window.location.href = "/auth#signup";
            return;
          }
          if (!tenantId) {
            window.location.href = "/app";
            return;
          }
          setCheckoutPlan(p);
        }}
      />


      {/* CTA */}
      <section className="relative py-24 overflow-hidden">
        <motion.div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-40 blur-3xl"
          animate={{ background: [
            "radial-gradient(circle at 20% 50%, hsl(var(--primary)/0.35), transparent 60%)",
            "radial-gradient(circle at 80% 50%, hsl(var(--primary)/0.35), transparent 60%)",
            "radial-gradient(circle at 20% 50%, hsl(var(--primary)/0.35), transparent 60%)",
          ] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-3xl px-4 text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight md:text-5xl">Ready to digitize your attendance?</h2>
          <p className="mt-3 text-muted-foreground">Start free in under 60 seconds. No credit card required.</p>
          <Link to="/auth" className="mt-6 inline-block">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
              <Button size="lg" className="gap-2">Create your account <ArrowRight className="h-4 w-4" /></Button>
            </motion.div>
          </Link>
        </motion.div>
      </section>

      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto max-w-6xl px-4 space-y-6">
          <div className="flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
            <Logo size={20} />
            <div className="flex gap-6">
              <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
              <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            </div>
            <p>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</p>
          </div>
          <div className="border-t border-border/40 pt-6 text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Powered by{" "}
              <span className="font-semibold text-foreground">
                K<sup>2</sup> Adexos Global Technologies
              </span>
            </p>
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
    <section className="border-t border-border/60 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Two modes. One app.</h2>
          <p className="mt-2 text-muted-foreground">Switch between Business and School at signup — the whole app adapts.</p>
        </div>
        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-full border border-border/60 bg-card p-1">
            {(["business", "school"] as const).map(k => (
              <button
                key={k}
                onClick={() => setMode(k)}
                className={`relative rounded-full px-6 py-2 text-sm font-medium capitalize transition-colors ${mode === k ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
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
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mt-10 grid items-center gap-8 md:grid-cols-2"
        >
          <Card className="p-8 border-border/60">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <m.icon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">{m.title}</h3>
                <p className="text-sm text-muted-foreground">{m.tagline}</p>
              </div>
            </div>
            <ul className="mt-6 space-y-2 text-sm">
              {m.bullets.map(b => (
                <li key={b} className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> {b}</li>
              ))}
            </ul>
          </Card>
          <div className="relative">
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="rounded-3xl border border-border/60 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-8"
            >
              <div className="space-y-3">
                {(mode === "business"
                  ? [
                      { l: "HQ — Mumbai", v: "42 / 45 in", c: "text-success" },
                      { l: "Andheri Branch", v: "18 / 20 in", c: "text-success" },
                      { l: "Pune Branch", v: "11 / 15 in", c: "text-warning" },
                      { l: "Field reps (live)", v: "7 on the road", c: "text-primary" },
                    ]
                  : [
                      { l: "Grade 6-A · Mrs. Sharma", v: "38 / 40 present", c: "text-success" },
                      { l: "Grade 7-B · Mr. Khan", v: "35 / 36 present", c: "text-success" },
                      { l: "Grade 8-A · Ms. Iyer", v: "30 / 32 present", c: "text-warning" },
                      { l: "Today (whole school)", v: "94% attendance", c: "text-primary" },
                    ]
                ).map((row, i) => (
                  <motion.div
                    key={row.l}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="flex items-center justify-between rounded-lg bg-background/80 p-3 text-sm shadow-sm"
                  >
                    <span className="font-medium">{row.l}</span>
                    <span className={`text-xs font-semibold ${row.c}`}>{row.v}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
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
  employee_limit: number;
  price_inr: number | string;
  features: unknown;
};

function PricingSection({ plans, tenantId, isLoggedIn, onCheckout }: { plans: Plan[]; tenantId: string; isLoggedIn: boolean; onCheckout: (p: { id: string; name: string; price: number; billing: string }) => void }) {
  const [billing, setBilling] = useState<"lifetime" | "monthly">("lifetime");
  const core = plans
    .filter((p) => p.billing === billing && p.employee_limit <= 50)
    .sort((a, b) => Number(a.price_inr) - Number(b.price_inr));
  const school = plans.find((p) => /school/i.test(p.name));
  const enterprise = plans.find((p) => /enterprise/i.test(p.name));

  return (
    <section id="pricing" className="border-t border-border/60 bg-card/40 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6 }} className="text-center">
          <Badge variant="secondary" className="mb-3">Pricing</Badge>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Pay once. Use forever.</h2>
          <p className="mt-2 text-muted-foreground">Or pick a low monthly plan. Switch anytime.</p>
        </motion.div>

        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-full border border-border/60 bg-background p-1 shadow-sm">
            {(["lifetime", "monthly"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setBilling(k)}
                className={`relative rounded-full px-5 py-2 text-sm font-medium capitalize transition-colors ${billing === k ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {billing === k && (
                  <motion.span layoutId="bill-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                )}
                <span className="relative flex items-center gap-2">
                  {k === "lifetime" ? "Lifetime" : "Monthly"}
                  {k === "lifetime" && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${billing === k ? "bg-primary-foreground/20" : "bg-success/15 text-success"}`}>Save 80%</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        <motion.div key={billing} variants={stagger} initial="hidden" animate="show" className="mt-10 grid gap-6 md:grid-cols-3">
          {core.map((p, i) => {
            const popular = i === 1;
            const featuresArr = Array.isArray(p.features) ? (p.features as string[]) : [];
            return (
              <motion.div key={p.id} variants={fadeUp} whileHover={{ y: -8 }} transition={{ type: "spring", stiffness: 300 }}>
                <Card className={`relative p-6 h-full transition-all ${popular ? "border-primary/70 shadow-xl md:scale-[1.04] bg-gradient-to-b from-primary/5 to-transparent" : "border-border/60 hover:border-primary/40 hover:shadow-lg"}`}>
                  {popular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 shadow">Most popular</Badge>
                  )}
                  <h3 className="text-xl font-semibold">{p.name.replace(/ (Lifetime|Monthly)$/i, "")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Up to {p.employee_limit} employees</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">₹{Number(p.price_inr).toLocaleString("en-IN")}</span>
                    <span className="text-sm text-muted-foreground">{billing === "lifetime" ? "one-time" : "/mo"}</span>
                  </div>
                  <Button
                    className="w-full mt-5"
                    variant={popular ? "default" : "outline"}
                    onClick={() => onCheckout({ id: p.id, name: p.name.replace(/ (Lifetime|Monthly)$/i, ''), price: Number(p.price_inr), billing: p.billing })}
                  >
                    {isLoggedIn ? "Pay now" : "Sign up & pay"} <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                  <ul className="mt-6 space-y-2 text-sm">
                    {featuresArr.map((f) => (
                      <li key={f} className="flex gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {school && (
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
              <Card className="relative h-full overflow-hidden border-border/60 p-6 bg-gradient-to-br from-accent/15 via-card to-transparent">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/20 text-accent-foreground">
                      <GraduationCap className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">School Edition</h3>
                      <p className="text-xs text-muted-foreground">For schools, colleges & coaching centres</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">₹{Number(school.price_inr).toLocaleString("en-IN")}</div>
                    <div className="text-[11px] text-muted-foreground">lifetime</div>
                  </div>
                </div>
                <ul className="mt-4 grid gap-1.5 text-sm sm:grid-cols-2">
                  {(Array.isArray(school.features) ? (school.features as string[]) : []).slice(0, 6).map((f) => (
                    <li key={f} className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-success mt-0.5" /><span>{f}</span></li>
                  ))}
                </ul>
                <Link to="/auth" className="mt-5 inline-block">
                  <Button variant="outline" size="sm">Choose School Edition <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
                </Link>
              </Card>
            </motion.div>
          )}
          {enterprise && (
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.1 }}>
              <Card className="relative h-full overflow-hidden border-foreground/30 p-6 bg-gradient-to-br from-foreground to-foreground/90 text-background">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background/15">
                      <Building2 className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">Enterprise</h3>
                      <p className="text-xs opacity-70">500+ employees, SLA, custom domain</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">₹{Number(enterprise.price_inr).toLocaleString("en-IN")}</div>
                    <div className="text-[11px] opacity-70">lifetime</div>
                  </div>
                </div>
                <ul className="mt-4 grid gap-1.5 text-sm sm:grid-cols-2">
                  {(Array.isArray(enterprise.features) ? (enterprise.features as string[]) : []).slice(0, 6).map((f) => (
                    <li key={f} className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-success mt-0.5" /><span className="opacity-90">{f}</span></li>
                  ))}
                </ul>
                <Link to="/auth" className="mt-5 inline-block">
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


