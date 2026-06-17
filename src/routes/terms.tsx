import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Punchly" },
      { name: "description", content: "Punchly Terms of Service — your rights and responsibilities when using our biometric attendance platform." },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border/40 bg-background/80 backdrop-blur sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link to="/">
            <Logo className="h-7" />
          </Link>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-4xl font-bold tracking-tight mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-8">Last updated: June 17, 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-[15px] leading-relaxed">

          <section>
            <h2 className="text-2xl font-semibold mb-3">1. Acceptance of Terms</h2>
            <p>
              By signing up for or using Punchly ("the Service"), you agree to be bound by these Terms of Service ("Terms").
              These Terms form a legally binding agreement between you (or the company you represent) and K2 Adexos Global Technologies, Hyderabad, India ("Punchly", "we", "us").
            </p>
            <p className="mt-3">
              If you are signing up on behalf of a company, you represent that you have the authority to bind that company to these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">2. The Service</h2>
            <p>Punchly provides a cloud-based biometric attendance management platform including:</p>
            <ul className="list-disc pl-6 space-y-1 mt-3">
              <li>GPS + selfie-based employee check-in and check-out</li>
              <li>Payroll calculation and payslip generation</li>
              <li>Leave management and approval workflow</li>
              <li>Shift scheduling and overtime tracking</li>
              <li>Branch and team management</li>
              <li>School attendance management (School Edition)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">3. Account Registration</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>You must provide accurate and complete information when creating an account</li>
              <li>You are responsible for maintaining the security of your login credentials</li>
              <li>You must notify us immediately if you suspect unauthorized access to your account</li>
              <li>One account per company/organization. Multiple branches may be managed under one account.</li>
              <li>You must be at least 18 years old to create an admin account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">4. Plans, Pricing & Payment</h2>

            <h3 className="text-lg font-medium mt-4 mb-2">4.1 Subscription Plans</h3>
            <p>Punchly offers the following plan types:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Monthly plans:</strong> Billed every 30 days. Cancel anytime.</li>
              <li><strong>Lifetime plans:</strong> One-time payment. Access for the lifetime of the product.</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">4.2 Payment</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>All prices are in Indian Rupees (INR) inclusive of applicable taxes</li>
              <li>Payments are processed securely through Razorpay</li>
              <li>We do not store your card details on our servers</li>
              <li>GST of 18% is applicable on all plans as per Indian tax law</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">4.3 Refund Policy</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Monthly plans:</strong> Full refund if requested within 7 days of payment, provided the account has fewer than 10 check-ins recorded.</li>
              <li><strong>Lifetime plans:</strong> Full refund if requested within 14 days of purchase, provided the account has fewer than 10 check-ins recorded.</li>
              <li>No refunds after the eligible period or if significant usage has occurred.</li>
              <li>To request a refund, email billing@punchly.app with your order ID.</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">4.4 Price Changes</h3>
            <p>We may change prices for monthly plans with 30 days' advance notice. Lifetime plan pricing is locked at the time of purchase and will not change.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">5. Acceptable Use Policy</h2>
            <p>You agree NOT to use Punchly to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>Use mock GPS apps or location spoofers to fake check-in locations (this is grounds for immediate account suspension)</li>
              <li>Use deepfakes, pre-recorded videos, or photographs to fake selfie check-ins</li>
              <li>Access another employee's account without authorization</li>
              <li>Attempt to circumvent the anti-cheat or fraud detection systems</li>
              <li>Use the platform for any unlawful purpose under Indian law</li>
              <li>Collect or harvest data from other users without consent</li>
              <li>Reverse engineer, decompile, or attempt to extract the source code of Punchly</li>
              <li>Resell or sublicense the Service without our written permission</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">6. Data & Privacy</h2>
            <p>
              Our collection and use of personal and biometric data is governed by our{" "}
              <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>,
              which is incorporated into these Terms by reference.
            </p>
            <p className="mt-3">
              As a company admin ("Client Admin"), you are the Data Fiduciary for your employees' personal data.
              You are responsible for:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Obtaining employees' consent before enrolling them in Punchly</li>
              <li>Informing employees that GPS and selfie data will be collected</li>
              <li>Responding to employee data requests (access, correction, deletion)</li>
              <li>Complying with applicable data protection laws including DPDP Act 2023</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">7. Service Availability & SLA</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Standard plans:</strong> We target 99% uptime but do not guarantee it. Scheduled maintenance will be communicated in advance.</li>
              <li><strong>Enterprise plans:</strong> 99.5% uptime SLA with priority support.</li>
              <li>We are not liable for downtime caused by third-party services (Supabase, Vercel, Razorpay, internet providers).</li>
              <li>Force majeure events (natural disasters, government orders, cyberattacks) are excluded from SLA calculations.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">8. Intellectual Property</h2>
            <p>
              All intellectual property in Punchly — including the software, design, branding, and documentation — is owned by K2 Adexos Global Technologies.
              You are granted a limited, non-exclusive, non-transferable license to use the Service for your internal business operations.
            </p>
            <p className="mt-3">
              You retain ownership of all your data (employee records, attendance data, etc.) that you store in Punchly.
              We claim no ownership over your data.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">9. Termination</h2>
            <h3 className="text-lg font-medium mt-4 mb-2">9.1 By You</h3>
            <p>You may cancel your subscription at any time. Your access continues until the end of the current billing period. For lifetime plans, you may deactivate your account but no refund will be issued after the eligible refund period.</p>

            <h3 className="text-lg font-medium mt-4 mb-2">9.2 By Us</h3>
            <p>We may suspend or terminate your account if you:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Violate the Acceptable Use Policy</li>
              <li>Fail to pay for 14+ days after the due date</li>
              <li>Provide false registration information</li>
              <li>Engage in fraudulent use of the Service</li>
            </ul>
            <p className="mt-3">We will provide 7 days' notice except in cases of severe policy violations or fraud.</p>

            <h3 className="text-lg font-medium mt-4 mb-2">9.3 Data on Termination</h3>
            <p>Upon account closure, you have 30 days to export your data. After 30 days, data will be deleted per our retention policy. We cannot recover deleted data.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">10. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by Indian law, Punchly's total liability for any claim arising from the use of the Service
              is limited to the amount you paid us in the 3 months preceding the claim.
            </p>
            <p className="mt-3">We are not liable for:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Loss of business, profits, or revenue</li>
              <li>Data loss due to user error</li>
              <li>Indirect, consequential, or punitive damages</li>
              <li>Disputes between employers and employees arising from attendance records</li>
              <li>Inaccurate GPS readings due to device limitations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">11. Governing Law & Disputes</h2>
            <p>
              These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in Hyderabad, Telangana.
            </p>
            <p className="mt-3">
              Before initiating legal proceedings, you agree to attempt to resolve disputes informally by contacting us at legal@punchly.app.
              We will attempt to resolve disputes within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">12. Changes to Terms</h2>
            <p>
              We may update these Terms from time to time. We will notify you by email at least 15 days before any material changes take effect.
              Continued use of Punchly after the effective date constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">13. Contact</h2>
            <div className="rounded-lg bg-muted/40 p-4 text-sm">
              <p><strong>K2 Adexos Global Technologies</strong></p>
              <p>Hyderabad, Telangana — 500001, India</p>
              <p>General: support@punchly.app</p>
              <p>Billing: billing@punchly.app</p>
              <p>Legal: legal@punchly.app</p>
            </div>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 mt-12 py-8">
        <div className="mx-auto max-w-4xl px-4 flex flex-wrap gap-6 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-foreground transition-colors text-foreground">Terms of Service</Link>
          <Link to="/auth" className="hover:text-foreground transition-colors">Sign in</Link>
          <span className="ml-auto">© 2026 Punchly. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
