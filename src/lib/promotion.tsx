import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles } from "lucide-react";

/**
 * Active promotion (if any), with live counts.
 * `remaining = max_claims - actual signups since promo started`,
 * so it reflects real signups — admins can't fake the count.
 */
export type ActivePromotion = {
  id: string;
  slug: string;
  title: string;
  banner_text: string;
  cta_text: string;
  max_claims: number;
  claimed_count: number;
  remaining: number;
  highlight_plan_id: string | null;
  is_exhausted: boolean;
  is_expired: boolean;
};

export function useActivePromotion() {
  return useQuery({
    queryKey: ["active-promotion"],
    staleTime: 60_000,    // refresh once a minute — counts change as people sign up
    queryFn: async (): Promise<ActivePromotion | null> => {
      const { data, error } = await supabase.rpc("get_active_promotion");
      if (error || !data || data.length === 0) return null;
      return data[0] as ActivePromotion;
    },
  });
}

/* ─────────────── BANNER ─────────────── */
export function PromotionBanner() {
  const { data: promo } = useActivePromotion();

  if (!promo || promo.is_exhausted || promo.is_expired) return null;

  const filledPct = Math.min(Math.round((promo.claimed_count / promo.max_claims) * 100), 100);
  const lowStock = promo.remaining <= Math.ceil(promo.max_claims * 0.2); // last 20%

  return (
    <Link to="/auth" className="block">
      <div className="relative overflow-hidden rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 p-4 text-white shadow-lg transition-transform hover:scale-[1.01] sm:p-5">
        {/* sparkle accent in the corner */}
        <Sparkles className="absolute -top-2 -right-2 h-16 w-16 rotate-12 text-white/15" />

        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1 min-w-[200px]">
            <p className="text-[10px] uppercase tracking-[0.2em] opacity-90 font-medium">
              {promo.title}
            </p>
            <p className="mt-1 text-sm font-semibold sm:text-base">
              {promo.banner_text}
            </p>
            {/* Live counter row */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
              <div className="flex h-1.5 w-32 overflow-hidden rounded-full bg-white/20">
                <div className="h-full bg-white transition-all" style={{ width: `${filledPct}%` }} />
              </div>
              <span className="font-medium tabular-nums">
                {promo.claimed_count} / {promo.max_claims} claimed
              </span>
              {lowStock && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 font-semibold uppercase tracking-wider text-[10px]">
                  Only {promo.remaining} left
                </span>
              )}
            </div>
          </div>
          <button className="shrink-0 rounded-full bg-white px-5 py-2 text-sm font-bold text-orange-600 shadow-md transition-all hover:scale-105">
            {promo.cta_text} →
          </button>
        </div>
      </div>
    </Link>
  );
}

/* ─────────────── PRICE-SHEET BADGE ───────────────
 * Small accent shown on the highlighted plan card. Returns null when there's
 * no active promo or this plan isn't the highlighted one. */
export function PromotionPlanBadge({ planId }: { planId: string }) {
  const { data: promo } = useActivePromotion();
  if (!promo || promo.is_exhausted || promo.is_expired) return null;
  if (promo.highlight_plan_id !== planId) return null;

  return (
    <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
      <div className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
        <Sparkles className="h-3 w-3" />
        {promo.remaining} of {promo.max_claims} left · Lifetime free
      </div>
    </div>
  );
}
