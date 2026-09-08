/**
 * The tenant resolver decides whose data a write lands on, so it is worth
 * proving in both directions: that a super admin can now act, and that a
 * client admin still cannot reach across to another company.
 */
import { resolveManagedTenant } from "../tenant-scope";

const OWN = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

/** A Supabase stub just rich enough for this function. */
function fakeSupabase(opts: {
  isSuper?: boolean;
  ownTenant?: string | null;
  knownTenants?: string[];
  roleError?: boolean;
}) {
  return {
    rpc: async () =>
      opts.roleError
        ? { data: null, error: new Error("boom") }
        : { data: Boolean(opts.isSuper), error: null },
    from: (table: string) => {
      if (table === "tenants") {
        let wanted = "";
        const b: any = {
          select: () => b,
          eq: (_c: string, v: string) => { wanted = v; return b; },
          maybeSingle: async () => ({
            data: (opts.knownTenants ?? [OWN, OTHER]).includes(wanted) ? { id: wanted } : null,
            error: null,
          }),
        };
        return b;
      }
      const rows = opts.ownTenant ? [{ tenant_id: opts.ownTenant }] : [];
      const b: any = { select: () => b, eq: () => b, then: undefined };
      // The call is `await supabase.from(...).select(...).eq(...).eq(...)`.
      b.eq = () => ({ select: () => b, eq: () => b, then: (r: any) => r({ data: rows, error: null }) });
      return { select: () => b.eq() };
    },
  } as never;
}

let failures = 0;
const check = async (label: string, fn: () => Promise<unknown>, expect: "ok" | string, want?: string) => {
  try {
    const got = await fn();
    if (expect !== "ok") { console.error(`FAIL  ${label} — expected refusal "${expect}", got ${got}`); failures++; return; }
    if (want && got !== want) { console.error(`FAIL  ${label} — got ${got}, wanted ${want}`); failures++; return; }
    console.log(`pass  ${label}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (expect === "ok") { console.error(`FAIL  ${label} — unexpected refusal: ${msg}`); failures++; return; }
    if (!msg.includes(expect)) { console.error(`FAIL  ${label} — refused with "${msg}", expected "${expect}"`); failures++; return; }
    console.log(`pass  ${label}`);
  }
};

await check("a client admin gets their own company without naming it",
  () => resolveManagedTenant(fakeSupabase({ ownTenant: OWN }), "u", null), "ok", OWN);

await check("a client admin naming their own company gets it",
  () => resolveManagedTenant(fakeSupabase({ ownTenant: OWN }), "u", OWN), "ok", OWN);

await check("a client admin CANNOT reach another company",
  () => resolveManagedTenant(fakeSupabase({ ownTenant: OWN }), "u", OTHER), "No such company");

await check("  and a company that does not exist is refused identically",
  () => resolveManagedTenant(fakeSupabase({ ownTenant: OWN }), "u", "33333333-3333-3333-3333-333333333333"),
  "No such company");

await check("somebody with no admin role is refused",
  () => resolveManagedTenant(fakeSupabase({ ownTenant: null }), "u", null, "create an API key"),
  "Only a company admin can create an API key");

await check("a super admin CAN act on a named company",
  () => resolveManagedTenant(fakeSupabase({ isSuper: true, ownTenant: null }), "u", OTHER), "ok", OTHER);

await check("a super admin naming nothing is asked to choose, not silently defaulted",
  () => resolveManagedTenant(fakeSupabase({ isSuper: true, ownTenant: null }), "u", null, "create an API key"),
  "needs one named");

await check("a super admin naming a company that does not exist is refused",
  () => resolveManagedTenant(fakeSupabase({ isSuper: true, ownTenant: null }), "u", "44444444-4444-4444-4444-444444444444"),
  "No such company");

await check("a failed role lookup refuses rather than assuming",
  () => resolveManagedTenant(fakeSupabase({ roleError: true }), "u", OWN), "Could not verify");

console.log(failures === 0 ? "\nall tenant-scope cases pass" : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
