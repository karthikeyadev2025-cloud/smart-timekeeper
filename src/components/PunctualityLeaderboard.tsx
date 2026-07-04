import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Trophy } from "lucide-react";

const MEDAL = ["🥇", "🥈", "🥉"];

/** Top-5 punctuality leaderboard for the current month. Admin-only widget. */
export function PunctualityLeaderboard({ tenantId }: { tenantId: string | undefined }) {
  const { data: rows } = useQuery({
    queryKey: ["punctuality-leaderboard", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("tenant_punctuality_leaderboard", {
        _tenant_id: tenantId, _limit: 5,
      });
      if (error) return [];
      return data ?? [];
    },
  });

  if (!rows || rows.length === 0) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="h-4 w-4 text-amber-500" />
        <p className="text-sm font-semibold">Punctuality leaderboard</p>
        <span className="text-[10px] text-muted-foreground ml-auto uppercase tracking-wide">This month</span>
      </div>
      <div className="space-y-2">
        {rows.map((r: any, i: number) => (
          <div key={r.user_id} className="flex items-center gap-3">
            <span className="w-5 text-center text-sm shrink-0">{MEDAL[i] ?? `#${i + 1}`}</span>
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
              {r.avatar_url ? (
                <img src={r.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[10px] font-bold text-primary">
                  {(r.full_name ?? "?").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{r.full_name ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">{r.staff_id}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold tabular-nums text-success">{r.punctuality_pct}%</p>
              <p className="text-[10px] text-muted-foreground">{r.present_days}d present</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
