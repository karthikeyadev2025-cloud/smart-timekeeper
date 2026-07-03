/**
 * ID Card Template Chooser.
 *
 * Shows the three shipped templates as live mini-previews (scaled to fit).
 * Each card uses a mock staff for the preview so admins can see exactly
 * what their tenant's cards will look like with their logo + accent.
 *
 * Rendered as radio-buttons — click a preview to select it.
 */

import { IdCardFront, type IdCardTemplate } from "@/components/IdCard";
import { Check } from "lucide-react";

const MOCK_STAFF = {
  id: "preview",
  staff_id: "EMP-0001",
  full_name: "Ravi Kumar",
  designation: "Sales Executive",
  phone: "9876543210",
  avatar_url: null,
  date_of_joining: "2024-01-15",
  branch_name: "Hyderabad",
  blood_group: "O+",
};

const TEMPLATES: { id: IdCardTemplate; label: string; blurb: string }[] = [
  { id: "corporate", label: "Corporate", blurb: "Classic layout. Photo left, details right." },
  { id: "modern",    label: "Modern",    blurb: "Bold hero band. Photo overlaps. Whitespace-forward." },
  { id: "compact",   label: "Compact",   blurb: "Landscape, dense. Great for lanyards." },
];

export function IdCardTemplateChooser({
  value, onChange, accent, tenantName, logoUrl,
}: {
  value: IdCardTemplate;
  onChange: (t: IdCardTemplate) => void;
  accent: string;
  tenantName: string;
  logoUrl: string | null | undefined;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {TEMPLATES.map((t) => {
        const selected = value === t.id;
        // Scale the 342px-wide card down to fit the preview slot.
        // 172 / 342 ≈ 0.503
        const scale = 0.5;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`group relative rounded-xl border-2 p-3 text-left transition-all ${
              selected
                ? "border-primary bg-primary/5 shadow-md"
                : "border-border hover:border-primary/40 hover:bg-muted/30"
            }`}
          >
            {selected && (
              <div className="absolute right-2 top-2 z-10 rounded-full bg-primary p-1 text-primary-foreground shadow">
                <Check className="h-3 w-3" />
              </div>
            )}

            {/* Preview area — scaled card in a fixed-height frame so cards
                of different aspect ratios all sit visually centered */}
            <div className="mb-2 flex h-[120px] items-center justify-center overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
              <div style={{
                transform: `scale(${scale})`,
                transformOrigin: "center",
                pointerEvents: "none",
              }}>
                <IdCardFront
                  staff={MOCK_STAFF as any}
                  tenant={{
                    id: "preview",
                    name: tenantName,
                    logo_url: logoUrl || null,
                    id_card_accent: accent,
                    id_card_template: t.id,
                  }}
                  verifyUrl="https://punchly.online/verify/preview"
                />
              </div>
            </div>

            <div className="text-sm font-semibold">{t.label}</div>
            <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{t.blurb}</div>
          </button>
        );
      })}
    </div>
  );
}
