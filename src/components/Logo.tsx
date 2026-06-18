import { BRAND } from "@/lib/brand";
import { useId } from "react";

export function Logo({ size = 28, showName = true }: { size?: number; showName?: boolean }) {
  // Unique gradient id per instance so multiple <Logo />s on the same page each render correctly.
  const gid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradientId = `punchly-g-${gid}`;

  return (
    <div className="flex items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label={`${BRAND.name} logo`}
        className="shrink-0"
      >
        <defs>
          {/* Plain hex stops — oklch isn't supported in SVG <stop> on all browsers
              (notably Safari / older Chromium), which made the logo render blank. */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="#4F46E5" />
            <stop offset="1" stopColor="#7C3AED" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill={`url(#${gradientId})`} />
        <path
          d="M9 17.5l4.2 4.2L23 12"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showName && (
        <span className="text-lg font-bold tracking-tight text-foreground">{BRAND.name}</span>
      )}
    </div>
  );
}
