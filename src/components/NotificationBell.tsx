import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Check, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const ICON_BY_KIND: Record<string, string> = {
  check_in_missed: "⏰",
  leave_approved: "✅",
  leave_rejected: "❌",
  leave_pending_admin: "📝",
  payslip_ready: "💰",
  salary_paid: "💵",
  bank_change_approved: "🏦",
  bank_change_rejected: "⚠️",
  subscription_expiring: "⏰",
  irregular_attendance: "📊",
};

export function NotificationBell() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.userId],
    enabled: !!user?.userId,
    refetchInterval: 60_000, // poll every minute
    retry: false,            // if the table doesn't exist yet (SQL not run), don't hammer it
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("notifications")
          .select("id, kind, title, body, action_url, read_at, created_at")
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) {
          // Common case: SQL migration not run yet → silently hide the bell
          // rather than breaking the page. Once migration runs the bell starts working.
          console.warn("[notifications] table not ready:", error.message);
          return [];
        }
        return data ?? [];
      } catch (e) {
        console.warn("[notifications] query failed:", e);
        return [];
      }
    },
  });

  const unreadCount = notifications.filter((n: any) => !n.read_at).length;

  // Realtime subscription — instant updates when a new notification is inserted
  useEffect(() => {
    if (!user?.userId) return;
    let channel: any = null;
    try {
      channel = supabase
        .channel(`notif:${user.userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.userId}` },
          () => qc.invalidateQueries({ queryKey: ["notifications", user.userId] }),
        )
        .subscribe();
    } catch (e) {
      console.warn("[notifications] realtime subscribe failed:", e);
    }
    return () => { if (channel) try { supabase.removeChannel(channel); } catch {} };
  }, [user?.userId, qc]);

  const markAllRead = async () => {
    try {
      await (supabase as any).rpc("mark_notifications_read");
      qc.invalidateQueries({ queryKey: ["notifications", user?.userId] });
    } catch (e) { console.warn("[notifications] mark all read failed:", e); }
  };

  const onItemClick = async (n: any) => {
    if (!n.read_at) {
      try {
        await (supabase as any).rpc("mark_notifications_read", { _ids: [n.id] });
        qc.invalidateQueries({ queryKey: ["notifications", user?.userId] });
      } catch {}
    }
    setOpen(false);
    if (n.action_url) {
      try { navigate({ to: n.action_url as any }); } catch {}
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="Notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground tabular-nums">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="font-semibold">Notifications</p>
            {unreadCount > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {unreadCount} unread
              </p>
            )}
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="gap-1.5 h-auto px-2 py-1 text-xs">
              <CheckCheck className="h-3 w-3" /> Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-[440px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-10 text-center">
              <Bell className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
              <p className="text-xs text-muted-foreground mt-1">You'll see attendance, leave, and payment updates here.</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n: any) => (
                <button
                  key={n.id}
                  onClick={() => onItemClick(n)}
                  className={`group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent ${!n.read_at ? "bg-primary/[0.03]" : ""}`}
                >
                  <span className="text-xl shrink-0 leading-none mt-0.5">{ICON_BY_KIND[n.kind] ?? "🔔"}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${!n.read_at ? "font-semibold" : ""}`}>{n.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{relativeTime(n.created_at)}</p>
                  </div>
                  {!n.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-primary mt-2" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
