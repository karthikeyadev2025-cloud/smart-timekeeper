import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, GraduationCap, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [tenantType, setTenantType] = useState<"business" | "school">("business");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // If they already have a tenant, send them to /app
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate({ to: "/auth" }); return; }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("tenant_id, role")
        .eq("user_id", user.id);
      if (roles && roles.some(r => r.tenant_id !== null || r.role === "super_admin")) {
        navigate({ to: "/app" });
        return;
      }
      setChecking(false);
    })();
  }, [navigate]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) { toast.error("Please enter your company name"); return; }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // 1. Create tenant
      const { data: tenant, error: tenantErr } = await supabase
        .from("tenants")
        .insert({ name: companyName.trim(), tenant_type: tenantType, owner_user_id: user.id })
        .select()
        .single();
      if (tenantErr) throw tenantErr;

      // 2. Link profile to tenant
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ tenant_id: tenant.id })
        .eq("id", user.id);
      if (profileErr) throw profileErr;

      // 3. Assign client_admin role for this tenant
      const { error: roleErr } = await supabase
        .from("user_roles")
        .insert({ user_id: user.id, role: "client_admin", tenant_id: tenant.id });
      if (roleErr) throw roleErr;

      // 4. Start a 7-day free trial so they can use the app immediately
      const trialEnd = new Date(Date.now() + 7 * 86400000).toISOString();
      await supabase.from("subscriptions").insert({
        tenant_id: tenant.id,
        status: "active",
        expires_at: trialEnd,
      });

      toast.success("Welcome to Punchly! Your 7-day free trial has started.");
      navigate({ to: "/app" });
    } catch (e: any) {
      toast.error(e.message ?? "Setup failed");
    } finally {
      setLoading(false);
    }
  };

  if (checking) return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Loading…</p></div>;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-background to-secondary/40 p-4">
      <div className="mb-6"><Logo /></div>
      <Card className="w-full max-w-md p-6">
        <header className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight">Set up your company</h1>
          <p className="text-sm text-muted-foreground">One quick step — then you're ready to roll.</p>
        </header>

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Company name</Label>
            <Input
              id="name"
              placeholder="e.g. Acme Logistics"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>What kind of organisation?</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTenantType("business")}
                className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-all ${tenantType === "business" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              >
                <Building2 className={`h-6 w-6 ${tenantType === "business" ? "text-primary" : "text-muted-foreground"}`} />
                <span className="font-medium">Business</span>
                <span className="text-xs text-muted-foreground">Office, retail, field</span>
              </button>
              <button
                type="button"
                onClick={() => setTenantType("school")}
                className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-all ${tenantType === "school" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              >
                <GraduationCap className={`h-6 w-6 ${tenantType === "school" ? "text-primary" : "text-muted-foreground"}`} />
                <span className="font-medium">School</span>
                <span className="text-xs text-muted-foreground">School, college, coaching</span>
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full gap-2" disabled={loading}>
            {loading ? "Setting up…" : <>Continue <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </form>
      </Card>
    </div>
  );
}
