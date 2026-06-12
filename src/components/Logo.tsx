import { BRAND } from "@/lib/brand";

export function Logo({ size = 28, showName = true }: { size?: number; showName?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label={`${BRAND.name} logo`}
      >
        <defs>
          <linearGradient id="punchly-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="oklch(0.52 0.22 275)" />
            <stop offset="1" stopColor="oklch(0.68 0.18 280)" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#punchly-g)" />
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
