import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { statutoryDeductions, professionalTax, type PtSlab, type StatutoryConfig } from "@/lib/statutory";
import { ShieldCheck, ShieldAlert, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

/**
 * Shows what the PF/ESI/PT settings on this screen would actually take out of
 * real people's pay, and records that somebody checked them.
 *
 * The numbers shipped as defaults are the common Indian values. They are not
 * advice, and until now the only thing standing between a wrong percentage and
 * a wrong payslip every month was a sentence asking the reader to check. This
 * turns that sentence into two things a person can act on:
 *
 *   1. A worked example on the employer's OWN salaries, computed with the same
 *      functions payroll uses. Abstract bands are hard to check; "Ravi, on
 *      ₹18,000, loses ₹2,295" can be held against a real challan.
 *   2. A confirmation that goes stale the moment any rate or band changes, so
 *      the badge can never claim a number was checked when it was not.
 *
 * The preview is computed from the values currently in the form, not from what
 * was last saved, so a mistyped percentage is visible before it is stored.
 */

export type RegNumbers = { pf: string; esi: string; pt: string };

export function StatutoryCheck({
  tenantId,
  config,
  slabs,
  reg,
  onRegChange,
  hasUnsavedChanges,
}: {
  tenantId: string | undefined;
  config: StatutoryConfig;
  slabs: PtSlab[];
  reg: RegNumbers;
  onRegChange: (next: RegNumbers) => void;
  hasUnsavedChanges: boolean;
}) {
  const qc = useQueryClient();
  const anyOn = Boolean(config.pf_enabled || config.esi_enabled || config.professional_tax_enabled);

  const { data: status } = useQuery({
    queryKey: ["statutory-status", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("statutory_status", { _tenant_id: tenantId! });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    },
  });

  // The employer's real salaries. Distinct values only — twenty people on the
  // same wage are one line, not twenty.
  const { data: salaries } = useQuery({
    queryKey: ["statutory-preview-salaries", tenantId],
    enabled: Boolean(tenantId) && anyOn,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, monthly_salary")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .not("monthly_salary", "is", null)
        .gt("monthly_salary", 0)
        .order("monthly_salary");
      if (error) throw error;
      const seen = new Map<number, string>();
      for (const r of data ?? []) {
        const s = Number(r.monthly_salary);
        if (!seen.has(s)) seen.set(s, r.full_name ?? "—");
      }
      return [...seen.entries()].map(([salary, name]) => ({ salary, name }));
    },
  });

  // A spread rather than the first ten: the lowest and highest wages are where
  // a ceiling or a coverage limit shows up, and those are the rows worth
  // checking. Taking the first ten alphabetically could miss both.
  const rows = useMemo(() => {
    const all = salaries ?? [];
    if (all.length <= 8) return all;
    const picks = new Set<number>([0, all.length - 1]);
    for (let i = 1; i <= 6; i++) picks.add(Math.round((i * (all.length - 1)) / 7));
    return [...picks].sort((a, b) => a - b).map((i) => all[i]);
  }, [salaries]);

  const computed = rows.map((r) => {
    const { pf, esi } = statutoryDeductions(config, r.salary);
    const pt = professionalTax(config.professional_tax_enabled, slabs, r.salary);
    return { ...r, pf, esi, pt, total: pf + esi + pt, net: r.salary - pf - esi - pt };
  });

  const confirm = async () => {
    if (!tenantId) return;
    try {
      const { error } = await supabase.rpc("confirm_statutory_rates", { _tenant_id: tenantId });
      if (error) throw error;
      toast.success("Recorded — the rates are marked as checked");
      qc.invalidateQueries({ queryKey: ["statutory-status", tenantId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the check");
    }
  };

  if (!anyOn) return null;

  const inr = (n: number) =>
    n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 });

  return (
    <div className="space-y-4 border-t pt-5">
      <div>
        <Label className="text-base">Check these against your registration</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Below is what the settings above would take out of your own staff's pay this month,
          worked out exactly the way payroll will. Compare one row against a real PF or ESI
          statement before you generate payslips.
        </p>
      </div>

      {/* ── Registration numbers ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        {config.pf_enabled && (
          <div className="space-y-1">
            <Label className="text-xs">PF establishment code</Label>
            <Input value={reg.pf} placeholder="e.g. APHYD1234567000"
              onChange={(e) => onRegChange({ ...reg, pf: e.target.value })} />
          </div>
        )}
        {config.esi_enabled && (
          <div className="space-y-1">
            <Label className="text-xs">ESI employer code</Label>
            <Input value={reg.esi} placeholder="17-digit code"
              onChange={(e) => onRegChange({ ...reg, esi: e.target.value })} />
          </div>
        )}
        {config.professional_tax_enabled && (
          <div className="space-y-1">
            <Label className="text-xs">PT registration</Label>
            <Input value={reg.pt} placeholder="State PT number"
              onChange={(e) => onRegChange({ ...reg, pt: e.target.value })} />
          </div>
        )}
      </div>

      {/* ── The worked example ── */}
      {computed.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No staff have a monthly salary set yet, so there is nothing to work through. Add salaries
          on the staff records and this will fill in.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-left font-medium">On a full month</th>
                {config.pf_enabled && <th className="p-2 text-right font-medium">PF</th>}
                {config.esi_enabled && <th className="p-2 text-right font-medium">ESI</th>}
                {config.professional_tax_enabled && <th className="p-2 text-right font-medium">PT</th>}
                <th className="p-2 text-right font-medium">Deducted</th>
                <th className="p-2 text-right font-medium">Take-home</th>
              </tr>
            </thead>
            <tbody>
              {computed.map((r) => (
                <tr key={r.salary} className="border-t">
                  <td className="p-2">
                    <span className="font-medium">₹{inr(r.salary)}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{r.name}</span>
                  </td>
                  {config.pf_enabled && <td className="p-2 text-right tabular-nums">₹{inr(r.pf)}</td>}
                  {config.esi_enabled && (
                    <td className="p-2 text-right tabular-nums">
                      {r.esi === 0 ? <span className="text-xs text-muted-foreground">outside ESI</span> : `₹${inr(r.esi)}`}
                    </td>
                  )}
                  {config.professional_tax_enabled && <td className="p-2 text-right tabular-nums">₹{inr(r.pt)}</td>}
                  <td className="p-2 text-right font-medium tabular-nums">₹{inr(r.total)}</td>
                  <td className="p-2 text-right tabular-nums">₹{inr(r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Only the employee's share is shown — that is what a payslip deducts. Your matching employer
        contribution is a company cost and never appears on an employee's payslip. PF here is
        calculated on the whole wage: there is no basic/HRA split on a staff record, so if you
        compute PF on a separate basic component these figures will be higher than your challan.
      </p>

      {/* ── The confirmation ── */}
      {status?.missing_numbers && (
        <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" />
          <p>
            Running without a registration number on file for: <strong>{status.missing_numbers}</strong>.
            Fill it in above so a payslip queried next year can be traced back to the registration
            its rates came from.
          </p>
        </div>
      )}

      {status?.is_confirmed ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            Checked by <strong>{status.confirmed_by ?? "an admin"}</strong> on{" "}
            {status.confirmed_at ? new Date(status.confirmed_at).toLocaleDateString() : "—"}.
            Changing any rate or band clears this.
          </span>
        </div>
      ) : (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <div className="flex gap-2 text-xs">
            <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" />
            <p>
              <strong>Nobody has confirmed these rates.</strong> They are the common Indian values
              shipped as defaults, not advice. Payroll will still run — the payroll screen will say
              this too — but the figures above are the ones your staff will lose every month.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={confirm}
            disabled={!tenantId || hasUnsavedChanges}>
            I have checked these against our registration
          </Button>
          {hasUnsavedChanges && (
            <p className="text-[11px] text-muted-foreground">
              Save your changes first — otherwise you would be confirming the settings as they were
              before this edit.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
