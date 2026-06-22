import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui/card";
import { Mail, MessageCircle, ShieldQuestion, Trash2, RefreshCw, BookOpen } from "lucide-react";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — Punchly" },
      { name: "description", content: "Help, contact, FAQs, account deletion and data requests for Punchly attendance app. Email support@punchly.online or visit our help center." },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "Punchly Support — Help & Contact" },
      { property: "og:description", content: "Need help with Punchly attendance? Contact us at support@punchly.online — we respond within 24 hours." },
      { property: "og:url", content: "https://punchly.online/support" },
      { rel: "canonical", href: "https://punchly.online/support" } as any,
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 bg-background/80 backdrop-blur sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link to="/"><Logo className="h-7" /></Link>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Back to home</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-4xl font-bold tracking-tight mb-2">Support & Help</h1>
        <p className="text-muted-foreground mb-10">We typically respond within 24 hours on business days (Mon–Sat).</p>

        <div className="grid gap-4 sm:grid-cols-2 mb-12">
          <Card className="p-5">
            <Mail className="h-6 w-6 text-primary mb-3" />
            <h2 className="font-semibold mb-1">Email support</h2>
            <p className="text-sm text-muted-foreground mb-3">For any question, bug report, or feedback.</p>
            <a href="mailto:support@punchly.online" className="font-medium text-primary hover:underline">support@punchly.online</a>
          </Card>

          <Card className="p-5">
            <MessageCircle className="h-6 w-6 text-success mb-3" />
            <h2 className="font-semibold mb-1">WhatsApp</h2>
            <p className="text-sm text-muted-foreground mb-3">Quick questions, demos and onboarding help.</p>
            <a href="https://wa.me/918500016059" target="_blank" rel="noopener" className="font-medium text-success hover:underline">+91 85000 16059</a>
          </Card>

          <Card className="p-5">
            <ShieldQuestion className="h-6 w-6 text-amber-600 mb-3" />
            <h2 className="font-semibold mb-1">Privacy & data</h2>
            <p className="text-sm text-muted-foreground mb-3">Data export, GDPR/DPDP requests.</p>
            <a href="mailto:privacy@punchly.online" className="font-medium text-amber-600 hover:underline">privacy@punchly.online</a>
          </Card>

          <Card className="p-5">
            <Trash2 className="h-6 w-6 text-destructive mb-3" />
            <h2 className="font-semibold mb-1">Account deletion</h2>
            <p className="text-sm text-muted-foreground mb-3">Delete your account & personal data.</p>
            <a href="mailto:support@punchly.online?subject=Delete%20my%20account" className="font-medium text-destructive hover:underline">Request deletion →</a>
          </Card>
        </div>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" /> Frequently asked questions</h2>
          <div className="space-y-4">
            <FaqItem q="Is Punchly free?">
              Yes. Punchly is free for teams of up to 5 staff. Larger teams use paid plans starting at ₹49 per staff per month, billed monthly. No credit card needed for the free tier.
            </FaqItem>
            <FaqItem q="How does GPS + selfie attendance work?">
              When a staff member opens the check-in screen, the app verifies their GPS coordinates are inside the workplace geofence you configured, then asks for a selfie. The selfie + location + timestamp are stored together so you have audit-grade proof of attendance — no more proxy punching.
            </FaqItem>
            <FaqItem q="Can I run multiple branches?">
              Yes. Create unlimited branches. Each branch has its own staff list, shifts, geofence, and payroll. Branch managers see only their branch; head-office admins see everything across branches.
            </FaqItem>
            <FaqItem q="What happens if a staff member loses their phone?">
              As admin, go to <strong>Staff → click the person → Edit → Reset PIN</strong>. The staff member can then log in on the new phone with their phone number + new PIN.
            </FaqItem>
            <FaqItem q="Does it work for field staff (sales reps, technicians)?">
              Yes. On a staff member's profile, toggle "Field staff" on. They can then check in from anywhere — their location is still recorded for the live map, but the geofence check is bypassed.
            </FaqItem>
            <FaqItem q="Can I export attendance data?">
              Yes. From the <strong>Payroll page → Export Attendance CSV</strong>, you can download any month's full attendance with check-in/out times, locations, and selfie URLs. Payslips download as PDF individually.
            </FaqItem>
            <FaqItem q="Is my company data safe?">
              All data is encrypted at rest in Supabase (Mumbai region) and encrypted in transit via HTTPS. Each company's data is isolated by tenant_id with row-level security. Bank-account changes by staff require admin approval before they take effect — preventing salary-redirect fraud. We comply with India's DPDP Act 2023.
            </FaqItem>
            <FaqItem q="How do I delete my account?">
              Email <a className="text-primary hover:underline" href="mailto:support@punchly.online?subject=Delete%20my%20account">support@punchly.online</a> with the subject "Delete my account" from the email registered on your Punchly account. We will delete all your personal data within 7 working days (subject to your employer's legal obligation to retain attendance records for tax/labour audits, in which case attendance rows are retained but personal identifiers are removed).
            </FaqItem>
            <FaqItem q="How do I cancel my paid subscription?">
              Open <strong>Settings → Plan → Cancel subscription</strong>. Your plan stays active until the end of the current billing period, then auto-downgrades to the free tier. You don't lose any data.
            </FaqItem>
          </div>
        </section>

        <section className="border-t pt-8">
          <h2 className="text-2xl font-semibold mb-3 flex items-center gap-2"><RefreshCw className="h-5 w-5 text-primary" /> Service status</h2>
          <p className="text-sm text-muted-foreground">
            Punchly is hosted on Vercel (web) + Supabase (database, Mumbai region). For real-time outage status, check
            {" "}<a href="https://www.vercel-status.com" target="_blank" rel="noopener" className="text-primary hover:underline">vercel-status.com</a>
            {" "}and{" "}<a href="https://status.supabase.com" target="_blank" rel="noopener" className="text-primary hover:underline">status.supabase.com</a>.
          </p>
        </section>

        <footer className="mt-16 border-t pt-8 text-sm text-muted-foreground">
          <p>Punchly is operated by <strong>K² Adexos Global Technologies</strong>, Hyderabad, Telangana, India.</p>
          <p className="mt-2">
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            {" · "}<Link to="/terms" className="hover:text-foreground">Terms</Link>
            {" · "}<a href="mailto:support@punchly.online" className="hover:text-foreground">Contact</a>
          </p>
        </footer>
      </main>
    </div>
  );
}

function FaqItem({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border bg-card/50 p-4 hover:border-primary/40 transition-colors">
      <summary className="cursor-pointer font-medium list-none flex items-center justify-between">
        <span>{q}</span>
        <span className="text-muted-foreground group-open:rotate-45 transition-transform text-xl leading-none">+</span>
      </summary>
      <div className="mt-3 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </details>
  );
}
