import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, MessageCircle, Pencil, Landmark, IdCard, CalendarHeart,
  Wallet, Download, ReceiptIndianRupee, Save,
} from "lucide-react";
import { openWhatsapp } from "@/lib/whatsapp";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";
import { updateStaff } from "@/lib/staff.functions";
import { recordSalaryPayment, deleteSalaryPayment } from "@/lib/payments.functions";
import { downloadPayslipPdf } from "@/lib/payslip-pdf";

export const Route = createFileRoute("/_authenticated/staff/$staffId")({
  component: StaffDetailsPage,
});

function StaffDetailsPage() {
  const { staffId } = Route.useParams();
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const tenantId = user?.tenant?.id;

  const { data: staff, isLoading } = useQuery({
    queryKey: ["staff-detail", staffId],
    enabled: !!staffId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", staffId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: branch } = useQuery({
    queryKey: ["branch", (staff as any)?.branch_id],
    enabled: !!(staff as any)?.branch_id,
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id,name").eq("id", (staff as any).branch_id).maybeSingle();
      return data;
    },
  });

  if (!tenantId) return <AppShell><Card className="p-6">You need a company to manage staff.</Card></AppShell>;
  if (isLoading) return <AppShell><Card className="p-6 text-muted-foreground">Loading…</Card></AppShell>;
  if (!staff || (staff as any).tenant_id !== tenantId) {
    return (
      <AppShell>
        <Card className="p-6">
          <p className="text-muted-foreground">Staff member not found.</p>
          <Button variant="link" className="px-0" onClick={() => navigate({ to: "/team" })}>← Back to staff</Button>
        </Card>
      </AppShell>
    );
  }

  const s = staff as any;
  const initials = (s.full_name ?? "?").split(" ").map((p: string) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <AppShell>
      <div className="space-y-6">
        <Link to="/team" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to staff
        </Link>

        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="text-lg font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{s.full_name ?? "—"}</h1>
                <Badge variant={s.is_active ? "default" : "secondary"}>{s.is_active ? "Active" : "Disabled"}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {s.staff_id ? `${s.staff_id} · ` : ""}{s.designation || "No designation"}{branch ? ` · ${branch.name}` : ""}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="gap-2"
            disabled={!s.phone}
            onClick={() => openWhatsapp(s.phone, `Hi ${s.full_name ?? "there"}, this is a notification from ${user?.tenant?.name ?? "your team"}.`)}
          >
            <MessageCircle className="h-4 w-4 text-success" /> WhatsApp
          </Button>
        </header>

        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="bank">Bank & account</TabsTrigger>
            <TabsTrigger value="salary">Salary & payments</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-4">
            <ProfileTab tenantId={tenantId} staff={s} onSaved={() => qc.invalidateQueries({ queryKey: ["staff-detail", staffId] })} />
          </TabsContent>

          <TabsContent value="bank" className="mt-4">
            <BankTab tenantId={tenantId} staff={s} onSaved={() => qc.invalidateQueries({ queryKey: ["staff-detail", staffId] })} />
          </TabsContent>

          <TabsContent value="salary" className="mt-4">
            <SalaryTab tenantId={tenantId} staff={s} companyName={user?.tenant?.name} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

/* ───────────────────────── PROFILE TAB ───────────────────────── */

function ProfileTab({ tenantId, staff, onSaved }: { tenantId: string; staff: any; onSaved: () => void }) {
  const updateStaffFn = useServerFn(updateStaff);
  const [form, setForm] = useState({
    full_name: staff.full_name ?? "",
    designation: staff.designation ?? "",
    monthly_salary: staff.monthly_salary?.toString() ?? "",
    date_of_birth: staff.date_of_birth ?? "",
    gender: staff.gender ?? "",
    date_of_joining: staff.date_of_joining ?? "",
    address: staff.address ?? "",
    emergency_contact_name: staff.emergency_contact_name ?? "",
    emergency_contact_phone: staff.emergency_contact_phone ?? "",
    id_proof_type: staff.id_proof_type ?? "",
    id_proof_number: staff.id_proof_number ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await updateStaffFn({
        data: {
          tenant_id: tenantId,
          user_id: staff.id,
          full_name: form.full_name.trim() || undefined,
          designation: form.designation,
          monthly_salary: Number(form.monthly_salary) || 0,
          date_of_birth: form.date_of_birth || null,
          gender: (form.gender || null) as any,
          date_of_joining: form.date_of_joining || null,
          address: form.address || null,
          emergency_contact_name: form.emergency_contact_name || null,
          emergency_contact_phone: form.emergency_contact_phone || null,
          id_proof_type: (form.id_proof_type || null) as any,
          id_proof_number: form.id_proof_number || null,
        },
      });
      toast.success("Profile updated");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5 space-y-4">
        <h3 className="flex items-center gap-2 font-semibold"><Pencil className="h-4 w-4" /> Basic details</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2"><Label>Full name</Label><Input value={form.full_name} onChange={(e) => set("full_name")(e.target.value)} /></div>
          <div className="space-y-1"><Label>Designation</Label><Input value={form.designation} onChange={(e) => set("designation")(e.target.value)} /></div>
          <div className="space-y-1"><Label>Monthly salary (₹)</Label><Input type="number" min={0} value={form.monthly_salary} onChange={(e) => set("monthly_salary")(e.target.value)} /></div>
          <div className="space-y-1 col-span-2 text-xs text-muted-foreground font-mono">{staff.phone} {staff.email ? `· ${staff.email}` : ""}</div>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <h3 className="flex items-center gap-2 font-semibold"><CalendarHeart className="h-4 w-4" /> Personal details</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Date of birth</Label><Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth")(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Gender</Label>
            <Select value={form.gender || "unset"} onValueChange={(v) => set("gender")(v === "unset" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">—</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 col-span-2"><Label>Date of joining</Label><Input type="date" value={form.date_of_joining} onChange={(e) => set("date_of_joining")(e.target.value)} /></div>
          <div className="space-y-1 col-span-2"><Label>Address</Label><Textarea value={form.address} onChange={(e) => set("address")(e.target.value)} rows={2} /></div>
          <div className="space-y-1"><Label>Emergency contact name</Label><Input value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name")(e.target.value)} /></div>
          <div className="space-y-1"><Label>Emergency contact phone</Label><Input value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone")(e.target.value.replace(/[^0-9]/g, ""))} className="font-mono" /></div>
        </div>
      </Card>

      <Card className="p-5 space-y-4 lg:col-span-2">
        <h3 className="flex items-center gap-2 font-semibold"><IdCard className="h-4 w-4" /> ID proof</h3>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div className="space-y-1">
            <Label>Proof type</Label>
            <Select value={form.id_proof_type || "unset"} onValueChange={(v) => set("id_proof_type")(v === "unset" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">—</SelectItem>
                <SelectItem value="aadhaar">Aadhaar</SelectItem>
                <SelectItem value="pan">PAN</SelectItem>
                <SelectItem value="voter_id">Voter ID</SelectItem>
                <SelectItem value="driving_license">Driving licence</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Proof number</Label><Input value={form.id_proof_number} onChange={(e) => set("id_proof_number")(e.target.value)} className="font-mono" /></div>
        </div>
      </Card>

      <div className="lg:col-span-2">
        <Button onClick={save} disabled={saving} className="gap-2"><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save profile"}</Button>
      </div>
    </div>
  );
}

/* ───────────────────────── BANK TAB ───────────────────────── */

function BankTab({ tenantId, staff, onSaved }: { tenantId: string; staff: any; onSaved: () => void }) {
  const updateStaffFn = useServerFn(updateStaff);
  const [form, setForm] = useState({
    bank_account_holder: staff.bank_account_holder ?? "",
    bank_account_number: staff.bank_account_number ?? "",
    bank_ifsc: staff.bank_ifsc ?? "",
    bank_name: staff.bank_name ?? "",
    upi_id: staff.upi_id ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await updateStaffFn({
        data: {
          tenant_id: tenantId,
          user_id: staff.id,
          bank_account_holder: form.bank_account_holder || null,
          bank_account_number: form.bank_account_number || null,
          bank_ifsc: form.bank_ifsc || null,
          bank_name: form.bank_name || null,
          upi_id: form.upi_id || null,
        },
      });
      toast.success("Bank details saved");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="max-w-xl p-5 space-y-4">
      <h3 className="flex items-center gap-2 font-semibold"><Landmark className="h-4 w-4" /> Bank account for salary transfer</h3>
      <p className="text-xs text-muted-foreground">Used when paying salary via bank transfer. Stored same as other staff details — visible only to company admins and the staff member.</p>
      <div className="space-y-3">
        <div className="space-y-1"><Label>Account holder name</Label><Input value={form.bank_account_holder} onChange={(e) => set("bank_account_holder")(e.target.value)} placeholder="As per bank passbook" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Account number</Label><Input value={form.bank_account_number} onChange={(e) => set("bank_account_number")(e.target.value.replace(/[^0-9]/g, ""))} className="font-mono" /></div>
          <div className="space-y-1"><Label>IFSC code</Label><Input value={form.bank_ifsc} onChange={(e) => set("bank_ifsc")(e.target.value.toUpperCase())} className="font-mono" maxLength={11} placeholder="SBIN0001234" /></div>
        </div>
        <div className="space-y-1"><Label>Bank name & branch</Label><Input value={form.bank_name} onChange={(e) => set("bank_name")(e.target.value)} placeholder="State Bank of India, MG Road" /></div>
        <div className="space-y-1"><Label>UPI ID (optional)</Label><Input value={form.upi_id} onChange={(e) => set("upi_id")(e.target.value)} className="font-mono" placeholder="name@upi" /></div>
      </div>
      <Button onClick={save} disabled={saving} className="gap-2"><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save bank details"}</Button>
    </Card>
  );
}

/* ───────────────────────── SALARY & PAYMENTS TAB ───────────────────────── */

function SalaryTab({ tenantId, staff, companyName }: { tenantId: string; staff: any; companyName?: string }) {
  const qc = useQueryClient();
  const [payFor, setPayFor] = useState<any | null>(null);
  const deletePaymentFn = useServerFn(deleteSalaryPayment);

  const { data: payslips } = useQuery({
    queryKey: ["staff-payslips", staff.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("payslips")
        .select("*")
        .eq("user_id", staff.id)
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .limit(12);
      return data ?? [];
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["staff-payments", staff.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("salary_payments")
        .select("*")
        .eq("user_id", staff.id)
        .order("paid_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const removePayment = async (id: string) => {
    if (!confirm("Remove this payment record? The payslip balance will be recalculated.")) return;
    try {
      await deletePaymentFn({ data: { tenant_id: tenantId, payment_id: id } });
      toast.success("Payment removed");
      qc.invalidateQueries({ queryKey: ["staff-payments", staff.id] });
      qc.invalidateQueries({ queryKey: ["staff-payslips", staff.id] });
      qc.invalidateQueries({ queryKey: ["payslips"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not remove");
    }
  };

  const statusBadge = (status: string) => {
    if (status === "paid") return <Badge>Paid</Badge>;
    if (status === "partial") return <Badge variant="secondary">Partial</Badge>;
    return <Badge variant="outline">Unpaid</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-x-auto">
        <div className="flex items-center justify-between p-4 pb-0">
          <h3 className="flex items-center gap-2 font-semibold"><ReceiptIndianRupee className="h-4 w-4" /> Recent payslips</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Net pay</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(payslips ?? []).map((p: any) => {
              const balance = Number(p.net_pay) - Number(p.amount_paid ?? 0);
              return (
                <TableRow key={p.id}>
                  <TableCell>{new Date(p.period_year, p.period_month - 1).toLocaleString("en-IN", { month: "short", year: "numeric" })}</TableCell>
                  <TableCell>₹{Number(p.net_pay).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-success">₹{Number(p.amount_paid ?? 0).toLocaleString("en-IN")}</TableCell>
                  <TableCell className={balance > 0 ? "text-destructive font-medium" : "text-muted-foreground"}>₹{balance.toLocaleString("en-IN")}</TableCell>
                  <TableCell>{statusBadge(p.payment_status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => downloadPayslipPdf(p, { employeeName: staff.full_name ?? "Employee", companyName, staffId: staff.staff_id })}>
                        <Download className="h-4 w-4" />
                      </Button>
                      {balance > 0 && (
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => setPayFor(p)}>
                          <Wallet className="h-4 w-4" /> Record payment
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {(payslips ?? []).length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No payslips generated yet for this staff member.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <div className="p-4 pb-0"><h3 className="font-semibold">Payment history</h3></div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(payments ?? []).map((p: any) => (
              <TableRow key={p.id}>
                <TableCell>{new Date(p.paid_at).toLocaleDateString("en-IN")}</TableCell>
                <TableCell className="font-medium">₹{Number(p.amount).toLocaleString("en-IN")}</TableCell>
                <TableCell className="capitalize">{p.method.replace("_", " ")}</TableCell>
                <TableCell className="font-mono text-xs">{p.reference || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{p.note || "—"}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => removePayment(p.id)} className="text-destructive">Undo</Button>
                </TableCell>
              </TableRow>
            ))}
            {(payments ?? []).length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No payments recorded yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!payFor} onOpenChange={(v) => !v && setPayFor(null)}>
        <DialogContent>
          {payFor && (
            <RecordPaymentForm
              tenantId={tenantId}
              staff={staff}
              payslip={payFor}
              onDone={() => {
                setPayFor(null);
                qc.invalidateQueries({ queryKey: ["staff-payslips", staff.id] });
                qc.invalidateQueries({ queryKey: ["staff-payments", staff.id] });
                qc.invalidateQueries({ queryKey: ["payslips"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RecordPaymentForm({ tenantId, staff, payslip, onDone }: { tenantId: string; staff: any; payslip: any; onDone: () => void }) {
  const recordFn = useServerFn(recordSalaryPayment);
  const balance = Number(payslip.net_pay) - Number(payslip.amount_paid ?? 0);
  const [amount, setAmount] = useState(balance.toString());
  const [method, setMethod] = useState<"cash" | "bank_transfer" | "upi" | "cheque" | "other">(
    staff.bank_account_number ? "bank_transfer" : "cash",
  );
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (amt > balance + 0.01) { toast.error(`Amount exceeds remaining balance (₹${balance.toFixed(0)})`); return; }
    setLoading(true);
    try {
      await recordFn({
        data: {
          tenant_id: tenantId,
          payslip_id: payslip.id,
          user_id: staff.id,
          amount: amt,
          method,
          reference: reference.trim() || null,
          note: note.trim() || null,
        },
      });
      toast.success("Payment recorded");
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not record payment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <DialogHeader>
        <DialogTitle>Record salary payment</DialogTitle>
        <p className="text-sm text-muted-foreground">
          {new Date(payslip.period_year, payslip.period_month - 1).toLocaleString("en-IN", { month: "long", year: "numeric" })} ·
          {" "}Balance due: <strong>₹{balance.toLocaleString("en-IN")}</strong>
        </p>
      </DialogHeader>

      {staff.bank_account_number && (
        <div className="rounded-md bg-muted/50 p-2.5 text-xs space-y-0.5">
          <p><span className="text-muted-foreground">A/c:</span> <span className="font-mono">{staff.bank_account_number}</span> · {staff.bank_ifsc}</p>
          {staff.bank_name && <p className="text-muted-foreground">{staff.bank_name}</p>}
          {staff.upi_id && <p><span className="text-muted-foreground">UPI:</span> <span className="font-mono">{staff.upi_id}</span></p>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>Amount (₹)</Label><Input type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
        <div className="space-y-1">
          <Label>Method</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bank_transfer">Bank transfer</SelectItem>
              <SelectItem value="upi">UPI</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1"><Label>Reference (txn ID / cheque no.)</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" className="font-mono" /></div>
      <div className="space-y-1"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional, e.g. advance against next month" /></div>

      <DialogFooter>
        <Button type="submit" disabled={loading} className="gap-2"><Wallet className="h-4 w-4" /> {loading ? "Saving…" : `Mark ₹${amount || 0} paid`}</Button>
      </DialogFooter>
    </form>
  );
}
