import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/plans")({
  component: PlansPage,
});

function PlansPage() {
  const { data: plans } = useQuery({
    queryKey: ["all-plans"],
    queryFn: async () => (await supabase.from("plans").select("*").order("display_order")).data ?? [],
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Plans & pricing</h1>
          <p className="text-muted-foreground">Plans available to clients on the landing page.</p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {(plans ?? []).map((p) => (
            <Card key={p.id} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="text-sm text-muted-foreground">{p.description}</p>
                </div>
                <Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="mt-3 text-3xl font-bold">₹{Number(p.price_inr).toLocaleString("en-IN")}<span className="text-sm font-normal text-muted-foreground">/{p.billing}</span></p>
              <p className="mt-1 text-sm text-muted-foreground">{p.employee_limit} employees</p>
              <ul className="mt-4 space-y-1 text-sm">
                {(Array.isArray(p.features) ? (p.features as unknown as string[]) : []).map((f) => (
                  <li key={f} className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> {f}</li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <Card className="p-4 text-sm text-muted-foreground">
          Plan editing UI coming next — for now plans can be edited via SQL or through the next iteration. Razorpay billing integration will hook into these plan IDs.
        </Card>
      </div>
    </AppShell>
  );
}
