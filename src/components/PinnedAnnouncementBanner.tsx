import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone } from "lucide-react";

/** Shows the most recent PINNED announcement (if any and not expired) as a
 * dashboard banner. Clicking it goes to the full announcements feed. */
export function PinnedAnnouncementBanner({ tenantId }: { tenantId: string | undefined }) {
  const { data: announcement } = useQuery({
    queryKey: ["pinned-announcement", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("announcements")
        .select("id, title, body, created_at, expires_at")
        .eq("tenant_id", tenantId)
        .eq("is_pinned", true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  if (!announcement) return null;

  return (
    <Link to="/announcements">
      <Card className="flex items-start gap-3 border-primary/30 bg-primary/5 p-3.5 transition-colors hover:bg-primary/10">
        <div className="rounded-lg bg-primary/15 p-1.5 shrink-0">
          <Megaphone className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{announcement.title}</p>
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{announcement.body}</p>
        </div>
      </Card>
    </Link>
  );
}
