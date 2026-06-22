import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { InstallPrompt } from "@/components/InstallPrompt";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();


  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#4F46E5" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Punchly" },

      // Primary SEO
      { title: "Punchly — Smart Attendance, Payroll & HR for Indian Businesses" },
      { name: "description", content: "Punchly is India's all-in-one attendance, payroll, leave and HR app. GPS + selfie check-in, multi-branch, bank-fraud protection, free for small teams. Built for shops, hospitals, schools, clinics, field staff." },
      { name: "keywords", content: "punchly, attendance app india, payroll software, employee attendance, biometric attendance, gps attendance, selfie attendance, hr software india, leave management, staff attendance, shop attendance, hospital attendance, free attendance app, time tracking app, employee management india, multi branch attendance, indian payroll software, mystoreos, adexos, k2 adexos" },
      { name: "author", content: "K² Adexos Global Technologies" },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" },
      { name: "googlebot", content: "index, follow" },
      { name: "language", content: "English" },
      { name: "revisit-after", content: "7 days" },
      { name: "geo.region", content: "IN" },
      { name: "geo.placename", content: "Hyderabad, Telangana, India" },

      // Open Graph (Facebook, LinkedIn, WhatsApp share preview)
      { property: "og:title", content: "Punchly — Smart Attendance & Payroll for Indian Businesses" },
      { property: "og:description", content: "GPS + selfie attendance, payroll, leaves and HR — all in one app. Free for teams up to 5 members. Made in India." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://punchly.online" },
      { property: "og:image", content: "https://punchly.online/og-image.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Punchly app icon with checkmark on indigo background" },
      { property: "og:site_name", content: "Punchly" },
      { property: "og:locale", content: "en_IN" },

      // Twitter / X
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Punchly — Smart Attendance for Indian Businesses" },
      { name: "twitter:description", content: "GPS + selfie attendance, payroll, leaves & HR — one app. Free for small teams." },
      { name: "twitter:image", content: "https://punchly.online/og-image.png" },
      { name: "twitter:image:alt", content: "Punchly attendance app" },

      // WhatsApp specifically reads og:title + og:description + og:image (above),
      // but the image must be under 300KB for WhatsApp preview to render.

      // Microsoft / Bing
      { name: "msapplication-TileColor", content: "#4F46E5" },
      { name: "msapplication-TileImage", content: "/icon-192.png" },

      // Verification placeholders — uncomment & fill when you set up GSC / Bing / etc.
      // { name: "google-site-verification", content: "<your-token-here>" },
      // { name: "msvalidate.01", content: "<your-bing-token-here>" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "canonical", href: "https://punchly.online" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "SoftwareApplication",
              "name": "Punchly",
              "alternateName": ["Punchly Attendance", "Punchly HR"],
              "applicationCategory": "BusinessApplication",
              "operatingSystem": "Android, iOS, Web",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "INR",
                "description": "Free for teams up to 5 members. Paid plans for larger teams.",
              },
              "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": "4.8",
                "reviewCount": "27",
              },
              "url": "https://punchly.online",
              "downloadUrl": "https://punchly.online",
              "description": "Punchly is an all-in-one attendance, payroll, leave and HR app for Indian businesses. GPS + selfie check-in, multi-branch support, automated payslips, and bank-fraud protection.",
              "screenshot": "https://punchly.online/og-image.png",
              "publisher": {
                "@type": "Organization",
                "name": "K² Adexos Global Technologies",
                "url": "https://punchly.online",
                "logo": "https://punchly.online/icon-512.png",
              },
            },
            {
              "@type": "Organization",
              "name": "K² Adexos Global Technologies",
              "alternateName": "K2 Adexos",
              "url": "https://punchly.online",
              "logo": "https://punchly.online/icon-512.png",
              "email": "support@punchly.online",
              "address": {
                "@type": "PostalAddress",
                "addressLocality": "Hyderabad",
                "addressRegion": "Telangana",
                "addressCountry": "IN",
              },
              "sameAs": ["https://punchly.online"],
            },
            {
              "@type": "WebSite",
              "name": "Punchly",
              "url": "https://punchly.online",
              "potentialAction": {
                "@type": "SearchAction",
                "target": "https://punchly.online/?q={search_term_string}",
                "query-input": "required name=search_term_string",
              },
            },
            {
              "@type": "FAQPage",
              "mainEntity": [
                {
                  "@type": "Question",
                  "name": "Is Punchly free?",
                  "acceptedAnswer": { "@type": "Answer", "text": "Yes. Punchly is free for teams of up to 5 staff. Larger teams use our paid plans starting at ₹49 per staff per month." },
                },
                {
                  "@type": "Question",
                  "name": "How does Punchly verify attendance?",
                  "acceptedAnswer": { "@type": "Answer", "text": "Punchly uses GPS geofencing plus a selfie at the moment of check-in. This stops proxy attendance because the app verifies both that the staff member is physically at the workplace and that the right person is punching in." },
                },
                {
                  "@type": "Question",
                  "name": "Can I run multiple branches in Punchly?",
                  "acceptedAnswer": { "@type": "Answer", "text": "Yes. Each branch has its own staff list, shifts, geofence and payroll. Branch managers see only their branch, head office admins see everything." },
                },
                {
                  "@type": "Question",
                  "name": "Does Punchly work for field staff?",
                  "acceptedAnswer": { "@type": "Answer", "text": "Yes. Set 'Field staff' on the staff profile and they can check in from anywhere. Their GPS location is still captured for the live map." },
                },
                {
                  "@type": "Question",
                  "name": "Is my staff data safe?",
                  "acceptedAnswer": { "@type": "Answer", "text": "All data is encrypted at rest in Supabase (Mumbai region) and encrypted in transit via HTTPS. Bank-account changes need admin approval to prevent salary-redirect fraud. We comply with India's DPDP Act 2023." },
                },
              ],
            },
          ],
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <InstallPrompt />
    </QueryClientProvider>
  );
}
