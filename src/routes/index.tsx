import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion, useScroll, useTransform, type Variants } from "framer-motion";
import { useRef, useState } from "react";
import { MapPin, Camera, CheckCircle2, Clock, Users, Shield, Sparkles, Building2, ArrowRight, Map as MapIcon, GraduationCap, Briefcase, Smartphone, BellRing, Wallet, ShieldCheck, UserCog } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};
const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Punchly — Smart GPS Attendance, Shifts & Payroll for Teams" },
      { name: "description", content: "Punchly tracks staff attendance with GPS + selfie in 3 simple steps. Multi-shift scheduling, auto payroll, leave approval — works on web and as a mobile app." },
      { property: "og:title", content: "Punchly — Smart Attendance for Modern Teams" },
      { property: "og:description", content: BRAND.description },
      { property: "og:type", content: "website" },
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
      <section ref={heroRef} className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10" style={{ background: "var(--gradient-soft)" }} />
        <motion.div
          aria-hidden
          className="absolute -top-32 -left-32 -z-10 h-[500px] w-[500px] rounded-full bg-primary/20 blur-3xl"
          animate={{ x: [0, 40, 0], y: [0, 30, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="absolute -bottom-40 -right-20 -z-10 h-[400px] w-[400px] rounded-full bg-accent/25 blur-3xl"
          animate={{ x: [0, -30, 0], y: [0, -40, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-[0.04]"
          style={{ backgroundImage: "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)", backgroundSize: "48px 48px" }}
        />

        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="mx-auto max-w-6xl px-4 py-20 md:py-28">
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
          </motion.div>
          <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Clock, title: "Multi-shift scheduling", desc: "Morning, night, rotational — assign shifts per staff." },
              { icon: Users, title: "Staff & roles", desc: "Add unlimited staff under your plan with role permissions." },
              { icon: MapPin, title: "Multi-branch geofence", desc: "Define office radius for each location." },
              { icon: Camera, title: "Selfie + GPS proof", desc: "Tamper-proof check-ins, stored privately." },
              { icon: Shield, title: "Auto payroll", desc: "Salary calculated from attendance, OT, leaves — payslip ready." },
              { icon: Building2, title: "White-label", desc: "Brand the app with your logo and colors." },
            ].map((f) => (
              <motion.div key={f.title} variants={fadeUp} whileHover={{ y: -4, scale: 1.02 }} transition={{ type: "spring", stiffness: 300 }}>
                <Card className="p-6 h-full border-border/60 hover:border-primary/40 hover:shadow-md transition-all">
                  <f.icon className="h-6 w-6 text-primary" />
                  <h3 className="mt-4 font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-border/60 bg-card/40 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6 }} className="text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Simple, transparent pricing</h2>
            <p className="mt-2 text-muted-foreground">One-time lifetime plans available. Pay once, use forever.</p>
          </motion.div>
          <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} className="mt-12 grid gap-6 md:grid-cols-3">
            {(plans ?? []).filter((p) => p.billing === "lifetime").map((p) => (
              <motion.div key={p.id} variants={fadeUp} whileHover={{ y: -8 }} transition={{ type: "spring", stiffness: 300 }}>
                <Card className="relative p-6 h-full border-border/60 hover:border-primary/60 hover:shadow-xl transition-all">
                  {p.employee_limit === 25 && (
                    <Badge className="absolute -top-3 left-6">Most popular</Badge>
                  )}
                  <h3 className="text-xl font-semibold">{p.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-bold">₹{Number(p.price_inr).toLocaleString("en-IN")}</span>
                    <span className="text-sm text-muted-foreground">one-time</span>
                  </div>
                  <ul className="mt-6 space-y-2 text-sm">
                    {(Array.isArray(p.features) ? (p.features as unknown as string[]) : []).map((f) => (
                      <li key={f} className="flex gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link to="/auth" className="mt-6 block">
                    <Button className="w-full">Get {p.employee_limit}-employee plan</Button>
                  </Link>
                </Card>
              </motion.div>
            ))}
          </motion.div>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Also available monthly from ₹499/mo. Need 100+ employees? Contact us.
          </p>
        </div>
      </section>

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
    </div>
  );
}
