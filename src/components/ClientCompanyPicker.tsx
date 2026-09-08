import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Building2 } from "lucide-react";

/**
 * Lets a super admin say which customer they are working on.
 *
 * A client admin never sees this — they have exactly one company and the
 * server derives it from their role regardless of what the page sends. It
 * exists because a super admin has no company of their own, which is why every
 * one of these screens used to refuse them outright.
 *
 * Nothing is preselected on purpose. Defaulting to the first company would mean
 * an operator who came here to look at one customer could mint a key, or edit a
 * payroll setting, against another — and the screen would look right while
 * doing it. An empty picker cannot be acted on by mistake.
 */
export function ClientCompanyPicker({
  value,
  onChange,
  what,
}: {
  value: string | null;
  onChange: (tenantId: string | null) => void;
  /** What the chosen company is for, e.g. "issue API keys for". */
  what: string;
}) {
  const { data: companies, isLoading } = useQuery({
    queryKey: ["picker-companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, is_active")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // If the chosen company vanishes — deleted, or the list reloads without it —
  // clear the selection rather than keep acting on an id that is no longer
  // there.
  useEffect(() => {
    if (!companies || !value) return;
    if (!companies.some((c) => c.id === value)) onChange(null);
  }, [companies, value, onChange]);

  return (
    <Card className="space-y-2 border-dashed p-4">
      <Label className="flex items-center gap-2 text-sm font-medium">
        <Building2 className="h-4 w-4" />
        Which company do you want to {what}?
      </Label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm sm:max-w-sm"
      >
        <option value="">
          {isLoading ? "Loading companies…" : "— Choose a company —"}
        </option>
        {(companies ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.is_active ? "" : "  (suspended)"}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        You are the platform operator, so nothing is chosen for you — anything you
        do here applies to the company named above.
      </p>
    </Card>
  );
}
