import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Punchly" },
      { name: "description", content: "Punchly Privacy Policy — how we collect, use, and protect your data in compliance with the Digital Personal Data Protection Act 2023." },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
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
        <h1 className="text-4xl font-bold tracking-tight mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: June 17, 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-[15px] leading-relaxed">

          <section>
            <h2 className="text-2xl font-semibold mb-3">1. Who We Are</h2>
            <p>
              Punchly is a biometric attendance management platform operated by K2 Adexos Global Technologies, Hyderabad, Telangana, India.
              We provide GPS + selfie-based attendance tracking, payroll management, leave management, and shift scheduling for businesses and schools
              across Andhra Pradesh and Telangana.
            </p>
            <p className="mt-3">
              <strong>Contact:</strong> support@punchly.app | K2 Adexos Global Technologies, Hyderabad, Telangana — 500001
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">2. Data We Collect</h2>
            <p>We collect only the data necessary to provide our attendance and payroll services:</p>

            <h3 className="text-lg font-medium mt-4 mb-2">2.1 Personal Identification Data</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Name, phone number, email address</li>
              <li>Employee ID, designation, department</li>
              <li>Date of joining, salary details</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">2.2 Biometric Data (Sensitive Personal Data)</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Selfie photographs</strong> — captured during check-in to verify physical presence</li>
              <li><strong>GPS location coordinates</strong> — captured at time of check-in to verify on-site presence</li>
              <li>Location accuracy, timestamp, and device identifier</li>
            </ul>
            <p className="mt-2 text-amber-600 dark:text-amber-400 font-medium">
              This constitutes "sensitive personal data" under the Digital Personal Data Protection Act, 2023 (DPDP Act). 
              We collect it only with your explicit consent.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-2">2.3 Attendance & Work Data</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Check-in and check-out times, breaks, overtime</li>
              <li>Leave requests and approval history</li>
              <li>Shift assignments, payroll calculations, payslips</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-2">2.4 Technical Data</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Device type, browser, operating system</li>
              <li>IP address, login timestamps</li>
              <li>App usage logs for debugging and fraud detection</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">3. How We Use Your Data</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Attendance verification:</strong> GPS and selfie are used only to confirm you are physically present at work at the time of check-in</li>
              <li><strong>Payroll processing:</strong> Attendance records are used to calculate salary, overtime, and deductions</li>
              <li><strong>Leave management:</strong> Leave requests and balances are tracked and processed</li>
              <li><strong>Fraud prevention:</strong> Mock GPS detection and attendance anomaly detection to prevent false check-ins</li>
              <li><strong>Reports:</strong> Attendance summaries are provided to your employer/manager</li>
              <li><strong>Platform improvement:</strong> Anonymized, aggregated usage data to improve the app</li>
            </ul>
            <p className="mt-3 font-medium">We do NOT use your biometric data for facial recognition, tracking outside work hours, or any purpose other than attendance verification.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">4. Legal Basis for Processing (DPDP Act 2023)</h2>
            <p>Under the Digital Personal Data Protection Act, 2023, we process your personal data on the following grounds:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li><strong>Consent:</strong> You explicitly consent to biometric data collection before your first check-in</li>
              <li><strong>Contractual necessity:</strong> Attendance data is required to fulfill the employment/payroll contract</li>
              <li><strong>Legitimate interest:</strong> Fraud detection and platform security</li>
              <li><strong>Legal obligation:</strong> Maintaining attendance records as required by Indian labour law</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">5. Data Storage & Security</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Storage:</strong> Data is stored on Supabase (PostgreSQL database) with encryption at rest (AES-256)</li>
              <li><strong>Location:</strong> Data is stored on servers located in India (Supabase India region)</li>
              <li><strong>Access control:</strong> Row-Level Security (RLS) ensures each company can only access its own employees' data</li>
              <li><strong>Selfie photos:</strong> Stored in encrypted Supabase Storage. Not processed by facial recognition systems</li>
              <li><strong>Transmission:</strong> All data is transmitted over HTTPS (TLS 1.3)</li>
              <li><strong>Access:</strong> Only your employer's designated admins can access your attendance records</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">6. Data Retention</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Attendance records:</strong> Retained for 7 years (as required by Indian labour law)</li>
              <li><strong>Selfie photographs:</strong> Retained for 3 years, then automatically deleted</li>
              <li><strong>GPS logs:</strong> Retained for 1 year, then automatically deleted</li>
              <li><strong>Payroll records:</strong> Retained for 7 years (as required by income tax laws)</li>
              <li><strong>Account data:</strong> Deleted within 30 days of account closure</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">7. Your Rights Under DPDP Act 2023</h2>
            <p>You have the following rights regarding your personal data:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li><strong>Right to access:</strong> Request a copy of all personal data we hold about you</li>
              <li><strong>Right to correction:</strong> Request correction of inaccurate personal data</li>
              <li><strong>Right to erasure:</strong> Request deletion of your data (subject to legal retention requirements)</li>
              <li><strong>Right to grievance redressal:</strong> Lodge a complaint about how your data is handled</li>
              <li><strong>Right to withdraw consent:</strong> Withdraw consent for biometric data collection at any time</li>
              <li><strong>Right to nominate:</strong> Nominate another person to exercise your rights in case of incapacity</li>
            </ul>
            <p className="mt-3">To exercise any of these rights, email us at: <strong>privacy@punchly.app</strong> with subject "Data Rights Request".</p>
            <p className="mt-2">We will respond within 72 hours and fulfil the request within 30 days.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">8. Data Sharing</h2>
            <p>We share your data only in the following circumstances:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li><strong>Your employer:</strong> Attendance, leave, and payroll data is shared with your employer's designated admin. This is the core purpose of the platform.</li>
              <li><strong>Supabase (Infrastructure):</strong> Our cloud database provider. They process data on our behalf under a Data Processing Agreement.</li>
              <li><strong>Vercel (Hosting):</strong> Our web hosting provider. They serve the app but do not process personal data.</li>
              <li><strong>Razorpay (Payments):</strong> Payment details for subscription billing. Punchly does NOT store card details.</li>
              <li><strong>Legal requirements:</strong> When required by Indian courts or government authorities.</li>
            </ul>
            <p className="mt-3 font-medium">We NEVER sell your personal data. We do NOT share biometric data with third parties.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">9. Biometric Data — Special Provisions</h2>
            <p>Because we collect biometric data (selfies + GPS during work hours), we follow additional protections:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>Explicit written consent is obtained before the first check-in</li>
              <li>Selfies are stored as photographs, NOT as facial embeddings or biometric templates</li>
              <li>We do not use facial recognition algorithms or compare faces across employees</li>
              <li>Your employer (admin) can view your check-in selfie as a visual audit trail only</li>
              <li>Biometric data is never used for advertising or shared outside the employer relationship</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">10. Children's Data</h2>
            <p>
              Punchly is intended for use by adults (18+) in professional or employment contexts. 
              For School Edition users, student attendance data is collected and managed by the school institution as the Data Fiduciary. 
              Parents have the right to request access to or deletion of their child's data by contacting the school administrator.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">11. Cookies & Tracking</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Session cookies:</strong> Used only for authentication (keeping you logged in). Essential and cannot be disabled.</li>
              <li><strong>No advertising cookies:</strong> We do not use Google Ads, Facebook Pixel, or any advertising trackers</li>
              <li><strong>No analytics cookies:</strong> We use privacy-respecting server-side analytics only (no user-level tracking)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">12. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify registered users by email at least 7 days before any material changes take effect. 
              Continued use of Punchly after the effective date constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">13. Grievance Officer</h2>
            <p>
              As required by the Digital Personal Data Protection Act, 2023, we have appointed a Grievance Officer:
            </p>
            <div className="mt-3 rounded-lg bg-muted/40 p-4 text-sm">
              <p><strong>Grievance Officer:</strong> Karthikeya</p>
              <p><strong>Organization:</strong> K2 Adexos Global Technologies</p>
              <p><strong>Address:</strong> Hyderabad, Telangana — 500001, India</p>
              <p><strong>Email:</strong> grievance@punchly.app</p>
              <p><strong>Response time:</strong> Within 72 hours acknowledgement, resolved within 30 days</p>
            </div>
            <p className="mt-3">
              If you are not satisfied with our response, you may approach the Data Protection Board of India once it is established.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">14. Contact Us</h2>
            <div className="rounded-lg bg-muted/40 p-4 text-sm">
              <p><strong>Punchly Privacy Team</strong></p>
              <p>K2 Adexos Global Technologies</p>
              <p>Hyderabad, Telangana — 500001</p>
              <p>Email: privacy@punchly.app</p>
              <p>Website: https://smartpunch.vercel.app</p>
            </div>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 mt-12 py-8">
        <div className="mx-auto max-w-4xl px-4 flex flex-wrap gap-6 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <Link to="/privacy" className="hover:text-foreground transition-colors text-foreground">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          <Link to="/auth" className="hover:text-foreground transition-colors">Sign in</Link>
          <span className="ml-auto">© 2026 Punchly. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
