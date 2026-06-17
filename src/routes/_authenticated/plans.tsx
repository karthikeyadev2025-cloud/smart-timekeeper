import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, primaryRole } from "@/hooks/useCurrentUser";
import { CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/plans")({
  component: PlansPage,
});

type Plan = {
  id: string;
  name: string;
  description: string | null;
  price_inr: number;
  billing: string;
  employee_limit: number | null;
  features: string[];
  is_active: boolean;
  display_order: number;
};

const EMPTY_PLAN: Omit<Plan, "id"> = {
  name: "",
  description: "",
  price_inr: 0,
  billing: "monthly",
  employee_limit: null,
  features: [],
  is_active: true,
  display_order: 0,
};

function PlansPage() {
  const { data: user } = useCurrentUser();
  const role = primaryRole(user?.roles ?? []);
  const qc = useQueryClient();
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const { data: plans } = useQuery({
    queryKey: ["all-plans"],
    queryFn: async () => (await supabase.from("plans").select("*").order("display_order")).data ?? [],
  });

  const isSuper = role === "super_admin";

  const toggleActive = async (plan: Plan) => {
    const { error } = await supabase.from("plans").update({ is_active: !plan.is_active }).eq("id", plan.id);
    if (error) toast.error(error.message);
    else { toast.success(plan.is_active ? "Plan deactivated" : "Plan activated"); qc.invalidateQueries({ queryKey: ["all-plans"] }); }
  };

  const deletePlan = async (plan: Plan) => {
    if (!confirm(`Delete "${plan.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("plans").delete().eq("id", plan.id);
    if (error) toast.error(error.message);
    else { toast.success("Plan deleted"); qc.invalidateQueries({ queryKey: ["all-plans"] }); }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Plans & pricing</h1>
            <p className="text-muted-foreground">Plans shown on the public pricing page.</p>
          </div>
          {isSuper && (
            <Button className="gap-2" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" /> New plan
            </Button>
          )}
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {(plans ?? []).map((p: any) => (
            <Card key={p.id} className="p-5 flex flex-col">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h3 className="font-semibold truncate">{p.name}</h3>
                  <p className="text-sm text-muted-foreground">{p.description}</p>
                </div>
                <Badge variant={p.is_active ? "default" : "secondary"} className="ml-2 shrink-0">
                  {p.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <p className="mt-3 text-3xl font-bold">
                ₹{Number(p.price_inr).toLocaleString("en-IN")}
                <span className="text-sm font-normal text-muted-foreground">/{p.billing}</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{p.employee_limit ?? "Unlimited"} employees</p>
              <ul className="mt-4 space-y-1 text-sm flex-1">
                {(Array.isArray(p.features) ? (p.features as string[]) : []).map((f: string) => (
                  <li key={f} className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> {f}</li>
                ))}
              </ul>
              {isSuper && (
                <div className="mt-4 flex items-center gap-2 border-t pt-4">
                  <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />
                  <span className="text-xs text-muted-foreground flex-1">{p.is_active ? "Visible on site" : "Hidden"}</span>
                  <Button size="sm" variant="ghost" onClick={() => setEditPlan(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => deletePlan(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* Edit Dialog */}
        <Dialog open={!!editPlan} onOpenChange={(v) => !v && setEditPlan(null)}>
          <DialogContent className="max-w-lg">
            {editPlan && (
              <PlanForm
                initial={editPlan}
                onDone={() => { setEditPlan(null); qc.invalidateQueries({ queryKey: ["all-plans"] }); }}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* New Plan Dialog */}
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogContent className="max-w-lg">
            <PlanForm
              initial={null}
              onDone={() => { setNewOpen(false); qc.invalidateQueries({ queryKey: ["all-plans"] }); }}
            />
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}

function PlanForm({ initial, onDone }: { initial: Plan | null; onDone: () => void }) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [price, setPrice] = useState(String(initial?.price_inr ?? ""));
  const [billing, setBilling] = useState(initial?.billing ?? "monthly");
  const [limit, setLimit] = useState(String(initial?.employee_limit ?? ""));
  const [featuresText, setFeaturesText] = useState((initial?.features ?? []).join("\n"));
  const [displayOrder, setDisplayOrder] = useState(String(initial?.display_order ?? "0"));
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (!price || isNaN(Number(price))) { toast.error("Enter a valid price"); return; }

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      price_inr: Number(price),
      billing,
      employee_limit: limit ? Number(limit) : null,
      features: featuresText.split("\n").map(s => s.trim()).filter(Boolean),
      display_order: Number(displayOrder) || 0,
      is_active: active,
    };

    setLoading(true);
    try {
      if (isEdit) {
        const { error } = await supabase.from("plans").update(payload).eq("id", initial!.id);
        if (error) throw error;
        toast.success("Plan updated");
      } else {
        const { error } = await supabase.from("plans").insert(payload);
        if (error) throw error;
        toast.success("Plan created");
      }
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit plan" : "New plan"}</DialogTitle>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label>Name *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Starter Monthly" required />
        </div>
        <div className="space-y-1">
          <Label>Price (₹) *</Label>
          <Input type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="999" required />
        </div>
        <div className="space-y-1">
          <Label>Billing</Label>
          <Select value={billing} onValueChange={setBilling}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
              <SelectItem value="lifetime">Lifetime</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Employee limit</Label>
          <Input type="number" min="1" value={limit} onChange={e => setLimit(e.target.value)} placeholder="Leave blank for unlimited" />
        </div>
        <div className="space-y-1">
          <Label>Display order</Label>
          <Input type="number" value={displayOrder} onChange={e => setDisplayOrder(e.target.value)} placeholder="0" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label>Description</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Best for small teams" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label>Features (one per line)</Label>
          <Textarea rows={5} value={featuresText} onChange={e => setFeaturesText(e.target.value)} placeholder={"GPS attendance\nSelfie capture\nPayroll"} />
        </div>
        <div className="col-span-2 flex items-center gap-2">
          <Switch checked={active} onCheckedChange={setActive} />
          <Label>{active ? "Active — visible on pricing page" : "Inactive — hidden from public"}</Label>
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={loading}>{loading ? "Saving…" : isEdit ? "Save changes" : "Create plan"}</Button>
      </DialogFooter>
    </form>
  );
}
