import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, MapPin, Camera, Shield, CheckCircle2, Building2, GraduationCap, Briefcase, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import { CITIES, getCity, type CityData } from "@/lib/cities";
import { useSiteContent, cityKey, cityFallback, type CityOverride } from "@/lib/site-content";

export const Route = createFileRoute("/biometric-attendance/$city")({
  loader: ({ params }) => {
    const city = getCity(params.city);
    if (!city) throw notFound();
    return { city };
  },
  head: ({ loaderData, params }) => {
    const city = loaderData?.city as CityData | undefined;
    if (!city) return { meta: [{ title: "City not found" }] };
    const title = `Biometric Attendance System in ${city.name}, ${city.state} | Punchly — Face + GPS Haajaru App`;
    const description = `Best biometric attendance app for ${city.name}, ${city.state}. Punchly uses face-biometric selfie + GPS geofence — no fingerprint machine needed. Used by schools, offices, hospitals and field teams across ${city.areas.slice(0, 4).join(", ")} and all over ${city.state}.`;
    const path = `/biometric-attendance/${params.city}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        {
          name: "keywords",
          content: [
            `biometric attendance ${city.name}`,
            `biometric attendance system ${city.name}`,
            `biometric attendance app ${city.name}`,
            `face recognition attendance ${city.name}`,
            `GPS attendance ${city.name}`,
            `school attendance app ${city.name}`,
            `employee attendance software ${city.name}`,
            `payroll software ${city.name}`,
            `haajaru app ${city.name}`,
            `biometric attendance ${city.state}`,
            "biometric attendance Andhra Pradesh",
            "biometric attendance Telangana",
            "Telugu biometric attendance",
          ].join(", "),
        },
        { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1" },
        { name: "geo.region", content: city.stateCode },
        { name: "geo.placename", content: `${city.name}, ${city.state}, India` },
        { name: "geo.position", content: city.geo },
        { name: "ICBM", content: city.geo.replace(";", ", ") },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: "Punchly" },
        { property: "og:locale", content: "en_IN" },
        { property: "og:locale:alternate", content: "te_IN" },
        { property: "og:url", content: path },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [
        { rel: "canonical", href: path },
        { rel: "alternate", hrefLang: "en-IN", href: path },
        { rel: "alternate", hrefLang: "te-IN", href: path },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "LocalBusiness",
                name: `Punchly Biometric Attendance — ${city.name}`,
                description,
                areaServed: { "@type": "City", name: city.name, containedInPlace: { "@type": "State", name: city.state } },
                address: { "@type": "PostalAddress", addressLocality: city.name, addressRegion: city.state, addressCountry: "IN" },
                geo: {
                  "@type": "GeoCoordinates",
                  latitude: city.geo.split(";")[0],
                  longitude: city.geo.split(";")[1],
                },
                aggregateRating: { "@type": "AggregateRating", ratingValue: "4.9", reviewCount: "320" },
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Home", item: "/" },
                  { "@type": "ListItem", position: 2, name: "Biometric Attendance", item: "/biometric-attendance" },
                  { "@type": "ListItem", position: 3, name: city.name, item: path },
                ],
              },
              {
                "@type": "FAQPage",
                mainEntity: [
                  {
                    "@type": "Question",
                    name: `Which is the best biometric attendance system in ${city.name}?`,
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: `Punchly is among the most-used biometric attendance systems in ${city.name}, ${city.state}. It uses a face-biometric selfie + GPS geofence on any phone, so you don't need to buy a fingerprint machine.`,
                    },
                  },
                  {
                    "@type": "Question",
                    name: `How much does biometric attendance cost in ${city.name}?`,
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: `Punchly has a free plan to start and affordable monthly + lifetime plans for ${city.name} businesses and schools. See our pricing page for current rates.`,
                    },
                  },
                  {
                    "@type": "Question",
                    name: `Does Punchly work for schools in ${city.name}?`,
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: `Yes. Teachers in ${city.name} schools can mark a whole class Present/Absent in one tap and instantly notify absent students' parents via WhatsApp.`,
                    },
                  },
                ],
              },
            ],
          }),
        },
      ],
    };
  },
  component: CityLanding,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center"><h1 className="text-2xl font-bold">City not found</h1><Link to="/" className="text-primary">Go home</Link></div>
    </div>
  ),
});

function CityLanding() {
  const { city: base } = Route.useLoaderData();
  const { data: override } = useSiteContent<CityOverride>(cityKey(base.slug) as any, cityFallback(base.slug));
  const city = {
    ...base,
    name: override?.name || base.name,
    intro: override?.intro || base.intro,
    areas: override?.areas?.length ? override.areas : base.areas,
    industries: override?.industries?.length ? override.industries : base.industries,
  };
  const h1 = override?.h1 || `Biometric Attendance System in ${city.name}`;
  const defaultFaqs = [
    { q: `Which is the best biometric attendance system in ${city.name}?`, a: `Punchly is among the most-used biometric attendance apps in ${city.name}, ${city.state}. It uses face biometric (selfie) + GPS — no fingerprint machine purchase needed.` },
    { q: `Do I need a fingerprint device for attendance in ${city.name}?`, a: `No. Punchly replaces fingerprint hardware with a face-biometric selfie on any Android or iPhone, with GPS geofence verification.` },
    { q: `Does Punchly support Telugu-medium schools?`, a: `Yes. The teacher screens are tap-based — Telugu-medium schools across ${city.state} use it without training, and parents get WhatsApp alerts for absentees.` },
    { q: `How much does biometric attendance cost in ${city.name}?`, a: `Start free, upgrade to monthly or lifetime plans. See the pricing section on the home page for current rates.` },
    { q: `Can I track field staff and multiple branches?`, a: `Yes. Add unlimited branches across ${city.state}; managers see only their branch; live map shows who's checked in and where.` },
  ];
  const faqs = override?.faqs?.length ? override.faqs : defaultFaqs;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/"><Logo /></Link>
          <div className="flex items-center gap-2">
            <Link to="/auth"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <Link to="/auth"><Button size="sm" className="gap-1">Get started <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ background: "var(--gradient-soft)" }}>
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Badge variant="secondary" className="mb-4 gap-1">
              <MapPin className="h-3 w-3" /> {city.name}, {city.state}
            </Badge>
            <h1 className="text-3xl font-bold leading-tight tracking-tight md:text-5xl">
              {h1}
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{city.intro}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/auth"><Button size="lg" className="gap-2">Start free in {city.name} <ArrowRight className="h-4 w-4" /></Button></Link>
              <Link to="/"><Button size="lg" variant="outline">See all features</Button></Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Shield className="h-4 w-4 text-success" /> GPS geofenced</span>
              <span className="flex items-center gap-1.5"><Camera className="h-4 w-4 text-accent" /> Face biometric (selfie)</span>
              <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4 text-primary" /> No hardware needed</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Why */}
      <section className="border-t border-border/60 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-bold md:text-3xl">Why {city.name} businesses choose Punchly</h2>
          <p className="mt-2 text-muted-foreground">Built for the way teams across {city.state} actually work.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Camera, title: "Face biometric, no device", desc: `${city.name} offices skip ₹15,000+ fingerprint machines — every phone becomes a punch device.` },
              { icon: MapPin, title: "Per-branch geofence", desc: `Set the office radius for each ${city.name} location. Outside punches are flagged automatically.` },
              { icon: Clock, title: "Multi-shift ready", desc: "Morning, night, rotational, split shifts — common in hospitals & retail across Telugu states." },
              { icon: Briefcase, title: "Field staff GPS", desc: `Sales reps and delivery teams across ${city.state} punch from anywhere with accuracy logged.` },
              { icon: GraduationCap, title: "School mode (Telugu friendly)", desc: `${city.name} schools mark a whole class P/A in one tap, no GPS needed.` },
              { icon: CheckCircle2, title: "Auto payroll & payslips", desc: "Salary from attendance + OT + leaves. Payslip PDF ready for every staff." },
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

      {/* Industries */}
      <section className="border-t border-border/60 bg-card/40 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-bold md:text-3xl">Who uses Punchly in {city.name}</h2>
          <div className="mt-6 flex flex-wrap gap-2">
            {city.industries.map((i) => (
              <Badge key={i} variant="secondary" className="text-sm">{i}</Badge>
            ))}
          </div>
        </div>
      </section>

      {/* Areas */}
      <section className="border-t border-border/60 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-bold md:text-3xl">Areas we serve in {city.name}</h2>
          <p className="mt-2 text-muted-foreground">Punchly biometric attendance works anywhere with a mobile signal — popular pockets include:</p>
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {city.areas.map((a) => (
              <div key={a} className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm">
                <MapPin className="mr-1 inline h-3.5 w-3.5 text-primary" /> {a}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border/60 bg-card/40 py-16">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-2xl font-bold md:text-3xl">FAQ — Biometric attendance in {city.name}</h2>
          <div className="mt-6 space-y-4">
            {faqs.map((f) => (
              <Card key={f.q} className="p-5">
                <h3 className="font-semibold">{f.q}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Other cities */}
      <section className="border-t border-border/60 py-12">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-lg font-semibold">Biometric attendance in other Telugu-state cities</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {CITIES.filter((c) => c.slug !== city.slug).map((c) => (
              <Link key={c.slug} to="/biometric-attendance/$city" params={{ city: c.slug }}>
                <Badge variant="outline" className="cursor-pointer hover:bg-accent">{c.name}, {c.state}</Badge>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Punchly — Biometric attendance across Andhra Pradesh & Telangana.
        </div>
      </footer>
    </div>
  );
}
