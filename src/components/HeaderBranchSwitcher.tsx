import { useCurrentUser, primaryRole } from "@/hooks/useCurrentUser";
import { useBranchFilter } from "@/hooks/useBranchFilter";
import { BranchFilter } from "@/components/BranchFilter";

export function HeaderBranchSwitcher() {
  const { data: user } = useCurrentUser();
  const tenantId = user?.tenant?.id;
  const role = primaryRole(user?.roles ?? []);
  const tenantType = (user?.tenant as any)?.tenant_type ?? "business";
  const { branchId, setBranchId, branches } = useBranchFilter(tenantId);

  if (!tenantId || role !== "client_admin" || branches.length === 0) return null;
  const label = tenantType === "school" ? "Campus" : "Branch";
  return <BranchFilter value={branchId} onChange={setBranchId} branches={branches} label={label} />;
}
