import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { API_SCOPES, generateApiKey } from "@/lib/api-keys";
import { resolveManagedTenant } from "@/lib/tenant-scope";

/**
 * Minting and revoking tenant API keys.
 *
 * A client admin's tenant is derived from their own role and can never be
 * overridden by the request, so an admin of one company cannot mint a key for
 * another. A super admin has no company of their own and must name one. See
 * resolveManagedTenant for why that is required rather than defaulted.
 */

const createInput = z.object({
  // Only a super admin may set this; for a client admin it is either absent or
  // their own, and anything else is refused.
  tenant_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(API_SCOPES)).min(1, "Pick at least one scope"),
  // Days until expiry. Null = never, which the UI warns about.
  expires_in_days: z.number().int().min(1).max(3650).nullable().optional(),
  rate_limit_per_hour: z.number().int().min(1).max(100000).optional(),
});

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveManagedTenant(
      supabase, userId, data.tenant_id, "create an API key",
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // A company with an unbounded number of live keys cannot be audited by
    // the person who owns it. Ten is generous for an integration.
    const { count } = await supabaseAdmin
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("revoked_at", null);
    if ((count ?? 0) >= 10) {
      throw new Error("You already have 10 active API keys. Revoke one first.");
    }

    const { key, hash, prefix } = await generateApiKey();

    const { error } = await supabaseAdmin.from("api_keys").insert({
      tenant_id: tenantId,
      name: data.name.trim(),
      key_prefix: prefix,
      key_hash: hash,
      scopes: data.scopes,
      rate_limit_per_hour: data.rate_limit_per_hour ?? 1000,
      created_by: userId,
      expires_at: data.expires_in_days
        ? new Date(Date.now() + data.expires_in_days * 86_400_000).toISOString()
        : null,
    });
    if (error) throw new Error(`Could not create the key: ${error.message}`);

    // The only time the plaintext exists outside the customer's hands. It is
    // not stored, not logged, and cannot be shown again.
    return { key, prefix };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      tenant_id: z.string().uuid().nullable().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveManagedTenant(
      supabase, userId, data.tenant_id, "revoke an API key",
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Scope the UPDATE by tenant as well as id, so a guessed id from another
    // company revokes nothing rather than sabotaging a stranger's integration.
    const { data: updated, error } = await supabaseAdmin
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .is("revoked_at", null)
      .select("id");

    if (error) throw new Error(`Could not revoke the key: ${error.message}`);
    if (!updated?.length) throw new Error("That key does not exist, or is already revoked");

    // Revocation is immediate: api_key_resolve checks revoked_at on every call.
    return { revoked: true };
  });
