import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, primaryRole } from "@/hooks/useCurrentUser";
import { RazorpayCheckoutModal, loadRazorpayScript } from "@/components/RazorpayCheckoutModal";
import { createMaintenanceOrder, verifyRazorpayPayment } from "@/lib/payment.functions";
import { useActivePromotion } from "@/lib/promotion";
import {
  Wallet, CheckCircle2, Clock, Calendar, Sparkles, ShieldAlert, Receipt,
  AlertTriangle, ArrowRight, Download, Wrench, Loader2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/billing")({
  component: BillingPage,
});

function BillingPage() {
  const { data: user, isLoading } = useCurrentUser();
  const role = primaryRole(user?.roles ?? []);
  const tenantId = user?.tenant?.id;
  const [checkoutPlan, setCheckoutPlan] = useState<{ id: string; name: string; price: number; billing: string } | null>(null);
  const [billingMode, setBillingMode] = useState<"monthly" | "lifetime">("lifetime");

  // Only client admins should be on this page
  if (!isLoading && role !== "client_admin") {
    return (
      <AppShell>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Only your company's admin can manage billing.</p>
          <Link to="/app"><Button variant="outline" size="sm" className="mt-3">Back to dashboard</Button></Link>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Billing & subscription</h1>
          <p className="text-muted-foreground">Your current plan, payment history, and upgrade options.</p>
        </header>

        {tenantId && <CurrentPlanCard tenantId={tenantId} />}
        {tenantId && <MaintenanceFeeCard tenantId={tenantId} />}

        <PromoBanner />

        <h2 className="text-xl font-semibold pt-4">Choose a plan</h2>
        <PlansGrid
          billing={billingMode}
          onBillingChange={setBillingMode}
          tenantId={tenantId ?? ""}
          onCheckout={setCheckoutPlan}
        />

        {tenantId && <PaymentHistoryCard tenantId={tenantId} />}

        {checkoutPlan && (
          <RazorpayCheckoutModal
            isOpen={!!checkoutPlan}
            onClose={() => setCheckoutPlan(null)}
            planId={checkoutPlan.id}
            planName={checkoutPlan.name}
            amountInr={checkoutPlan.price}
            billing={checkoutPlan.billing}
            tenantId={tenantId ?? ""}
            onSuccess={() => { setCheckoutPlan(null); window.location.reload(); }}
          />
        )}
      </div>
    </AppShell>
  );
}

/* ─────────────── CURRENT PLAN CARD ─────────────── */
function CurrentPlanCard({ tenantId }: { tenantId: string }) {
  const { data: sub } = useQuery({
    queryKey: ["billing-current-sub", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("id, status, expires_at, created_at, plans(id, name, price_inr, billing, employee_limit, features)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
  });

  if (!sub) {
    return (
      <Card className="overflow-hidden border-amber-500/30 p-0">
        <div className="bg-gradient-to-br from-amber-500/10 to-transparent p-5 flex items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-amber-600" />
          <div>
            <p className="font-semibold">You're on the free trial</p>
            <p className="text-sm text-muted-foreground">Pick a plan below to keep your data and unlock all features.</p>
          </div>
        </div>
      </Card>
    );
  }

  const plan = sub.plans as any;
  const daysLeft = sub.expires_at
    ? Math.max(0, Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / 86400000))
    : null;
  const isExpired = sub.expires_at && new Date(sub.expires_at) < new Date();
  const isLifetime = plan?.billing === "lifetime";
  const expiringSoon = daysLeft !== null && daysLeft <= 14 && !isLifetime;

  return (
    <Card className="overflow-hidden border-primary/20 p-0">
      <div className="bg-gradient-to-br from-primary via-primary to-primary/80 p-5 text-primary-foreground sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] opacity-80">Current plan</p>
            <h2 className="mt-1 text-2xl font-bold sm:text-3xl">{plan?.name ?? "—"}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-white/30 bg-white/10 text-white gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${isExpired ? "bg-destructive" : "bg-success animate-pulse"}`} />
                {isExpired ? "Expired" : sub.status === "active" ? "Active" : sub.status}
              </Badge>
              {isLifetime && (
                <Badge variant="outline" className="border-white/30 bg-white/10 text-white gap-1">
                  <Sparkles className="h-3 w-3" /> Lifetime
                </Badge>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tabular-nums">₹{Number(plan?.price_inr ?? 0).toLocaleString("en-IN")}</p>
            <p className="text-xs opacity-80">{plan?.billing === "monthly" ? "/month" : plan?.billing === "yearly" ? "/year" : "one-time"}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4 sm:p-6">
        <BillingStat
          icon={Calendar}
          label={isLifetime ? "Never expires" : isExpired ? "Expired on" : "Renews on"}
          value={isLifetime ? "—" : sub.expires_at ? new Date(sub.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
        />
        {!isLifetime && (
          <BillingStat
            icon={Clock}
            label="Days remaining"
            value={daysLeft !== null ? `${daysLeft} ${daysLeft === 1 ? "day" : "days"}` : "—"}
            tint={expiringSoon ? "amber" : "primary"}
          />
        )}
        <BillingStat icon={CheckCircle2} label="Employee limit" value={`Up to ${plan?.employee_limit ?? "—"}`} />
        <BillingStat icon={Receipt} label="Started" value={new Date(sub.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} />
      </div>

      {expiringSoon && (
        <div className="border-t bg-amber-500/5 px-5 py-3 text-sm sm:px-6">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            ⏰ Your subscription expires in {daysLeft} {daysLeft === 1 ? "day" : "days"}. Pick a plan below to renew.
          </p>
        </div>
      )}
      {isExpired && (
        <div className="border-t bg-destructive/10 px-5 py-3 text-sm sm:px-6">
          <p className="font-medium text-destructive">
            ⚠️ Your subscription has expired. Renew below to restore full access.
          </p>
        </div>
      )}
    </Card>
  );
}

function BillingStat({ icon: Icon, label, value, tint = "primary" }: { icon: any; label: string; value: string; tint?: "primary" | "amber" }) {
  const tintMap = { primary: "bg-primary/10 text-primary", amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400" };
  return (
    <div>
      <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${tintMap[tint]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-sm font-semibold leading-tight">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

/* ─────────────── PROMO BANNER ─────────────── */
function PromoBanner() {
  const { data: promo } = useActivePromotion();
  if (!promo || promo.is_exhausted || promo.is_expired) return null;
  return (
    <Card className="overflow-hidden border-amber-400/30 p-0">
      <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 p-4 text-white sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Sparkles className="h-6 w-6 shrink-0" />
            <div>
              <p className="font-semibold text-sm sm:text-base">{promo.banner_text}</p>
              <p className="text-xs opacity-90 mt-0.5">{promo.claimed_count} / {promo.max_claims} claimed · {promo.remaining} slots remaining</p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function formatBillingLabel(months: number | null | undefined, billing?: string): string {
  // Prefer explicit billing_period_months; fall back to legacy enum.
  if (months == null) {
    if (billing === "monthly") return "/mo";
    if (billing === "yearly") return "/yr";
    return "once";
  }
  if (months === 1) return "/mo";
  if (months === 12) return "/yr";
  if (months % 12 === 0) return `/${months / 12} yrs`;
  return `/${months} mo`;
}

/* ─────────────── PLANS GRID ─────────────── */
function PlansGrid({
  billing, onBillingChange, tenantId, onCheckout,
}: {
  billing: "monthly" | "lifetime";
  onBillingChange: (b: "monthly" | "lifetime") => void;
  tenantId: string;
  onCheckout: (p: { id: string; name: string; price: number; billing: string }) => void;
}) {
  const { data: plans } = useQuery({
    queryKey: ["billing-plans"],
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("*").eq("is_active", true).order("display_order");
      return data ?? [];
    },
  });

  const { data: promo } = useActivePromotion();
  const filtered = (plans ?? []).filter((p: any) => p.billing === billing);

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div className="inline-flex rounded-full border bg-muted/30 p-1 text-sm">
          {(["monthly", "lifetime"] as const).map((b) => (
            <button
              key={b}
              onClick={() => onBillingChange(b)}
              className={`relative rounded-full px-5 py-1.5 transition-all ${billing === b ? "bg-primary text-primary-foreground font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {b === "monthly" ? "Monthly" : "Lifetime"}
              {b === "lifetime" && billing !== b && (
                <span className="ml-1.5 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">Save 80%</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {filtered.map((p: any, i: number) => {
          const popular = i === 1;
          const featuresArr = Array.isArray(p.features) ? p.features : [];
          const highlighted = promo?.highlight_plan_id === p.id && !promo?.is_exhausted && !promo?.is_expired;
          return (
            <Card key={p.id} className={`relative p-5 transition-all hover:shadow-lg ${popular ? "border-primary/70 shadow-md md:scale-[1.02] bg-gradient-to-b from-primary/5 to-transparent" : "border-border/60"}`}>
              {highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
                    <Sparkles className="h-3 w-3" />
                    {promo!.remaining} of {promo!.max_claims} left
                  </div>
                </div>
              )}
              {popular && !highlighted && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 shadow">Most popular</Badge>
              )}

              <h3 className="text-lg font-semibold">{p.name.replace(/ (Lifetime|Monthly)$/i, "")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">Up to {p.employee_limit} employees</p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight">₹{Number(p.price_inr).toLocaleString("en-IN")}</span>
                <span className="text-xs text-muted-foreground">
                  {formatBillingLabel(p.billing_period_months, p.billing)}
                </span>
              </div>

              <Button
                className="w-full mt-4"
                variant={popular ? "default" : "outline"}
                onClick={() => onCheckout({
                  id: p.id,
                  name: p.name.replace(/ (Lifetime|Monthly)$/i, ""),
                  price: Number(p.price_inr),
                  billing: p.billing,
                })}
              >
                Pay now <ArrowRight className="ml-1 h-4 w-4" />
              </Button>

              <ul className="mt-4 space-y-1.5 text-xs">
                {featuresArr.slice(0, 6).map((f: string) => (
                  <li key={f} className="flex gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────── PAYMENT HISTORY ─────────────── */
function PaymentHistoryCard({ tenantId }: { tenantId: string }) {
  const { data: payments } = useQuery({
    queryKey: ["billing-history", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("id, amount_inr, status, created_at, payer_name, plans(name, billing)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as any[];
    },
  });

  if (!payments || payments.length === 0) {
    return (
      <Card className="p-6 text-center">
        <Receipt className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No payments yet.</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b p-4">
        <h3 className="font-semibold flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" /> Payment history</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Your last {payments.length} {payments.length === 1 ? "payment" : "payments"}</p>
      </div>
      <div className="divide-y">
        {payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">{p.plans?.name ?? "Subscription"}</p>
                <Badge
                  variant={p.status === "success" ? "default" : p.status === "failed" ? "destructive" : "secondary"}
                  className={`text-[10px] ${p.status === "success" ? "bg-success/15 text-success border-success/20" : ""}`}
                >
                  {p.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(p.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
            <p className="font-semibold tabular-nums whitespace-nowrap">
              ₹{Number(p.amount_inr).toLocaleString("en-IN")}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ─────────────── MAINTENANCE FEE CARD ───────────────
 * Only renders when the tenant's plan has a maintenance fee configured
 * (maintenance_due_at is non-null on their subscription). Shows the next
 * due date, an overdue warning if applicable, and a Pay button that opens
 * a lightweight Razorpay checkout for just the maintenance amount. */
function MaintenanceFeeCard({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);

  const { data: info } = useQuery({
    queryKey: ["maintenance-info", tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("tenant_maintenance_info", { _tenant_id: tenantId });
      if (error || !data || data.length === 0) return null;
      return data[0] as {
        maintenance_due_at: string | null;
        maintenance_fee_inr: number | null;
        is_overdue: boolean;
        days_until_lockout: number | null;
      };
    },
  });

  // No maintenance fee on this plan at all — render nothing.
  if (!info || info.maintenance_due_at == null) return null;

  const dueDate = new Date(info.maintenance_due_at);
  const isPastDue = dueDate.getTime() < Date.now();
  const fee = Number(info.maintenance_fee_inr ?? 0);

  const handlePay = async () => {
    setPaying(true);
    try {
      await loadRazorpayScript();
      const order = await createMaintenanceOrder({ data: { tenant_id: tenantId } });

      await new Promise<void>((resolve, reject) => {
        const rzp = new (window as any).Razorpay({
          key: order.key_id,
          order_id: order.order_id,
          amount: order.amount_paise,
          currency: "INR",
          name: "Punchly",
          description: `${order.plan_name} — maintenance fee`,
          theme: { color: "#4F46E5" },
          modal: { ondismiss() { reject(new Error("dismissed")); } },
          handler: async (response: any) => {
            try {
              await verifyRazorpayPayment({
                data: {
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                },
              });
              toast.success("🎉 Maintenance fee paid — account fully active.");
              qc.invalidateQueries({ queryKey: ["maintenance-info", tenantId] });
              resolve();
            } catch (err: any) {
              reject(err);
            }
          },
        });
        rzp.open();
      });
    } catch (err: any) {
      if (err.message !== "dismissed") toast.error(`Payment failed: ${err.message}`);
    } finally {
      setPaying(false);
    }
  };

  return (
    <Card className={`overflow-hidden p-0 ${info.is_overdue ? "border-destructive/40" : isPastDue ? "border-amber-500/40" : "border-border/60"}`}>
      <div className={`flex flex-wrap items-center justify-between gap-3 p-5 ${info.is_overdue ? "bg-destructive/10" : isPastDue ? "bg-amber-500/10" : "bg-muted/30"}`}>
        <div className="flex items-start gap-3">
          <div className={`rounded-lg p-2 ${info.is_overdue ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary"}`}>
            <Wrench className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold">
              {info.is_overdue ? "Maintenance fee overdue — account is read-only" : isPastDue ? "Maintenance fee due now" : "Maintenance fee"}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {info.is_overdue
                ? `Pay ₹${fee.toLocaleString("en-IN")} to restore full access immediately.`
                : isPastDue
                ? `₹${fee.toLocaleString("en-IN")} due now. ${info.days_until_lockout != null ? `Account becomes read-only in ${info.days_until_lockout} day${info.days_until_lockout === 1 ? "" : "s"} if unpaid.` : ""}`
                : `Next payment of ₹${fee.toLocaleString("en-IN")} due on ${dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.`}
            </p>
          </div>
        </div>
        <Button
          onClick={handlePay}
          disabled={paying || (!isPastDue && !info.is_overdue)}
          variant={info.is_overdue ? "destructive" : "default"}
        >
          {paying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {paying ? "Processing…" : `Pay ₹${fee.toLocaleString("en-IN")}`}
        </Button>
      </div>
    </Card>
  );
}
