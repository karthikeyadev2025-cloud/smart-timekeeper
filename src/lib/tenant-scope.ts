import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Which company is this request acting on?
 *
 * Two kinds of caller reach the admin server functions and they need opposite
 * treatment:
 *
 *   A CLIENT ADMIN administers exactly one company. The tenant is theirs and
 *   must never be taken from the request — an id in the payload would let an
 *   admin of one company mint a key against another's data.
 *
 *   A SUPER ADMIN administers every company and has no company of their own.
 *   Deriving a tenant from their roles found nothing, so every one of these
 *   functions refused them outright: "Only a company admin can manage API
 *   keys". The platform operator could not configure the product they sell.
 *
 * So the tenant is derived for a client admin and REQUIRED from a super admin.
 * Not defaulted — a super admin with five customers has no obvious default, and
 * quietly picking one would issue a key against the wrong customer's records.
 * Making them name it means the choice is always deliberate and always logged
 * in the request.
 *
 * A client admin who sends a tenant id gets the same refusal whether that
 * company exists or not, so this cannot be used to discover other tenants.
 */
export async function resolveManagedTenant(
  supabase: SupabaseClient,
  userId: string,
  requestedTenantId: string | null | undefined,
  action = "manage this",
): Promise<string> {
  const { data: isSuper, error: roleError } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin" as never,
  });
  // Fail closed: a lookup that errored is not proof of entitlement.
  if (roleError) throw new Error("Could not verify your permissions");

  if (isSuper) {
    if (!requestedTenantId) {
      throw new Error(
        `You administer every company, so ${action} needs one named. ` +
          "Pick a company at the top of the page.",
      );
    }
    // Confirm it is real, so a typo'd id fails here rather than writing rows
    // nobody can find.
    const { data: tenant, error } = await supabase
      .from("tenants")
      .select("id")
      .eq("id", requestedTenantId)
      .maybeSingle();
    if (error) throw new Error("Could not verify your permissions");
    if (!tenant) throw new Error("No such company");
    return requestedTenantId;
  }

  const { data, error } = await supabase
    .from("user_roles")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("role", "client_admin");
  if (error) throw new Error("Could not verify your permissions");

  const ownTenantId = (data as { tenant_id: string | null }[] | null)
    ?.find((r) => r.tenant_id)?.tenant_id;
  if (!ownTenantId) throw new Error(`Only a company admin can ${action}`);

  // A client admin naming somebody else's company is refused identically to
  // naming one that does not exist.
  if (requestedTenantId && requestedTenantId !== ownTenantId) {
    throw new Error("No such company");
  }
  return ownTenantId;
}
