import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const KEY = "branch-filter";

export type BranchRow = { id: string; name: string };

export function useBranchFilter(tenantId: string | null | undefined) {
  const [branchId, setBranchId] = useState<string>("all");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = localStorage.getItem(KEY);
    if (v) setBranchId(v);
  }, []);

  const update = (v: string) => {
    setBranchId(v);
    if (typeof window !== "undefined") localStorage.setItem(KEY, v);
  };

  const { data: branches } = useQuery({
    queryKey: ["branches-filter", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("branches")
        .select("id, name")
        .eq("tenant_id", tenantId!)
        .order("name");
      return (data ?? []) as BranchRow[];
    },
  });

  return { branchId, setBranchId: update, branches: branches ?? [] };
}
