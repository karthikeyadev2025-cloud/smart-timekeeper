import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion, useScroll, useTransform, type Variants } from "framer-motion";
import { useRef } from "react";
import { MapPin, Camera, CheckCircle2, Clock, Users, Shield, Sparkles, Building2, ArrowRight } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.7, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] } }),
};
const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Punchly — Smart GPS Attendance, Shifts & Payroll for Teams" },
      {
        name: "description",
        content:
          "Punchly tracks staff attendance with GPS + selfie in 3 simple steps. Multi-shift scheduling, auto payroll, leave approval — works on web and as a mobile app.",
      },
      { property: "og:title", content: "Punchly — Smart Attendance for Modern Teams" },
      { property: "og:description", content: BRAND.description },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { data: plans } = useQuery({
    queryKey: ["public-plans"],
    queryFn: async () => {
      const { data } = await supabase
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .order("display_order");
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Logo />
          <nav className="hidden gap-6 text-sm text-muted-foreground md:flex">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/auth">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10" style={{ background: "var(--gradient-soft)" }} />
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div>
              <Badge variant="secondary" className="mb-4 gap-1">
                <Sparkles className="h-3 w-3" /> New · Lifetime plans available
              </Badge>
              <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-foreground md:text-6xl">
                {BRAND.tagline}
              </h1>
              <p className="mt-5 max-w-lg text-lg text-muted-foreground">
                Track employee attendance, breaks, and working hours effortlessly with a simple,
                structured workflow designed for accuracy and ease.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/auth">
                  <Button size="lg" className="gap-2">
                    Start free <CheckCircle2 className="h-4 w-4" />
                  </Button>
                </Link>
                <a href="#pricing">
                  <Button size="lg" variant="outline">See pricing</Button>
                </a>
              </div>
              <div className="mt-8 flex flex-wrap gap-6 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Shield className="h-4 w-4 text-success" /> GPS verified</span>
                <span className="flex items-center gap-1.5"><Camera className="h-4 w-4 text-accent" /> Selfie proof</span>
                <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4 text-primary" /> Multi-branch</span>
              </div>
            </div>

            {/* Phone mock */}
            <div className="relative mx-auto">
              <div
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
                    <div className="mt-3 flex items-center gap-2 text-xs text-success">
                      <MapPin className="h-3.5 w-3.5" /> Inside office geofence
                    </div>
                  </Card>
                  <button className="mt-auto rounded-2xl bg-card py-4 text-base font-semibold text-primary shadow-lg">
                    Check in →
                  </button>
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                    <div className="rounded-lg bg-white/10 p-2">Home</div>
                    <div className="rounded-lg bg-white/10 p-2">Salary</div>
                    <div className="rounded-lg bg-white/10 p-2">Leave</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 steps */}
      <section id="how" className="border-t border-border/60 bg-card/40 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">3 simple steps</h2>
            <p className="mt-2 text-muted-foreground">From sign-in to verified attendance in seconds.</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { icon: MapPin, title: "Verify location", desc: "GPS confirms staff is inside the office geofence radius." },
              { icon: Camera, title: "Capture selfie", desc: "Front camera snaps a quick selfie as proof of presence." },
              { icon: CheckCircle2, title: "Check-in done", desc: "Shift-aware multi-checkin tracks breaks, OT, and totals." },
            ].map((s, i) => (
              <Card key={s.title} className="p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">Step {i + 1}</span>
                </div>
                <h3 className="mt-4 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-muted-foreground">{s.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Everything you need</h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Clock, title: "Multi-shift scheduling", desc: "Morning, night, rotational — assign shifts per staff." },
              { icon: Users, title: "Staff & roles", desc: "Add unlimited staff under your plan with role permissions." },
              { icon: MapPin, title: "Multi-branch geofence", desc: "Define office radius for each location." },
              { icon: Camera, title: "Selfie + GPS proof", desc: "Tamper-proof check-ins, stored privately." },
              { icon: Shield, title: "Auto payroll", desc: "Salary calculated from attendance, OT, leaves — payslip ready." },
              { icon: Building2, title: "White-label", desc: "Brand the app with your logo and colors." },
            ].map((f) => (
              <Card key={f.title} className="p-6">
                <f.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-border/60 bg-card/40 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Simple, transparent pricing</h2>
            <p className="mt-2 text-muted-foreground">One-time lifetime plans available. Pay once, use forever.</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {(plans ?? []).filter((p) => p.billing === "lifetime").map((p) => (
              <Card key={p.id} className="relative p-6">
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
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Also available monthly from ₹499/mo. Need 100+ employees? Contact us.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Ready to digitize your attendance?</h2>
          <p className="mt-3 text-muted-foreground">Start free in under 60 seconds. No credit card required.</p>
          <Link to="/auth" className="mt-6 inline-block">
            <Button size="lg">Create your account</Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground md:flex-row">
          <Logo size={20} />
          <p>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
