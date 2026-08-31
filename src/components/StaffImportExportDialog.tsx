import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Download, Upload, FileSpreadsheet, CheckCircle2, XCircle, KeyRound } from "lucide-react";
import { bulkImportStaff } from "@/lib/staff.functions";
import { downloadCsv } from "@/lib/csv";
import { toast } from "sonner";

const SAMPLE_ROWS = [
  { "Full Name": "Ravi Kumar", "Phone": "9876543210", "Designation": "Cashier", "Monthly Salary": 15000, "Branch Name": "Main Branch", "Shift Name": "Morning", "PIN (optional)": "1234" },
  { "Full Name": "Priya Singh", "Phone": "9876543211", "Designation": "Sales", "Monthly Salary": 18000, "Branch Name": "Main Branch", "Shift Name": "Morning", "PIN (optional)": "" },
];

export function StaffImportExportDialog({
  tenantId,
  staff,
  onDone,
}: {
  tenantId: string;
  staff: any[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; failed: number; results: any[] } | null>(null);
  const importFn = useServerFn(bulkImportStaff);

  const downloadSample = () => {
    const ws = XLSX.utils.json_to_sheet(SAMPLE_ROWS);
    ws["!cols"] = [{ wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Staff");
    XLSX.writeFile(wb, "punchly_staff_import_sample.xlsx");
  };

  const exportCurrentStaff = () => {
    const rows = staff.map((s) => ({
      "Staff ID": s.staff_id ?? "",
      "Full Name": s.full_name ?? "",
      "Phone": s.phone ?? "",
      "Designation": s.designation ?? "",
      "Monthly Salary": s.monthly_salary ?? 0,
      "Field Staff": s.is_field_staff ? "Yes" : "No",
      "Status": s.is_active === false ? "Disabled" : "Active",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Staff");
    XLSX.writeFile(wb, `staff_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`Exported ${rows.length} staff`);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw: any[] = XLSX.utils.sheet_to_json(sheet);

      if (raw.length === 0) { toast.error("No rows found in the file"); setImporting(false); return; }
      if (raw.length > 500) { toast.error("Max 500 staff per import. Split into smaller files."); setImporting(false); return; }

      const rows = raw.map((r) => ({
        full_name: String(r["Full Name"] ?? "").trim(),
        phone: String(r["Phone"] ?? "").replace(/\D/g, ""),
        designation: String(r["Designation"] ?? "").trim(),
        monthly_salary: Number(r["Monthly Salary"] ?? 0) || 0,
        branch_name: String(r["Branch Name"] ?? "").trim(),
        shift_name: String(r["Shift Name"] ?? "").trim(),
        pin: r["PIN (optional)"] ? String(r["PIN (optional)"]).trim() : undefined,
      })).filter((r) => r.full_name && r.phone);

      if (rows.length === 0) { toast.error("No valid rows — check Full Name and Phone columns"); setImporting(false); return; }

      const res = await importFn({ data: { tenant_id: tenantId, rows } });
      setResult(res);
      if (res.created > 0) {
        toast.success(`Imported ${res.created} of ${res.total} staff`);
        onDone();
      }
      if (res.failed > 0) {
        toast.error(`${res.failed} row${res.failed === 1 ? "" : "s"} failed — see details below`);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Could not read the file. Make sure it's a valid .xlsx file.");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setResult(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2"><FileSpreadsheet className="h-4 w-4" /> Import / Export</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk import / export staff</DialogTitle>
          <DialogDescription>Add many staff at once from Excel, or download your current list.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm font-semibold">1. Download the sample file</p>
            <p className="text-xs text-muted-foreground">Fill it in with your staff's details — keep the column headers exactly as they are.</p>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadSample}>
              <Download className="h-3.5 w-3.5" /> Download sample Excel
            </Button>
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm font-semibold">2. Upload your filled file</p>
            <p className="text-xs text-muted-foreground">
              Branch Name / Shift Name must match existing names exactly (case-insensitive). Leave blank to skip.
              If PIN is left blank, a random 4-digit PIN is generated and shown once after the
              import — save it then, as it can only be reset afterwards, not looked up.
            </p>
            <label className="inline-block">
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} disabled={importing} />
              <span className={`inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm cursor-pointer hover:bg-accent ${importing ? "opacity-50" : ""}`}>
                <Upload className="h-3.5 w-3.5" /> {importing ? "Importing…" : "Upload Excel file"}
              </span>
            </label>
          </div>

          {result && (
            <div className="rounded-lg border p-3 space-y-2 max-h-48 overflow-y-auto">
              <p className="text-sm font-semibold">
                {result.created} created, {result.failed} failed (of {result.created + result.failed})
              </p>
              {result.results.filter((r: any) => r.status === "failed").map((r: any) => (
                <div key={r.row} className="flex items-start gap-1.5 text-xs">
                  <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive mt-0.5" />
                  <span><strong>Row {r.row}</strong> ({r.name}): {r.error}</span>
                </div>
              ))}
              {result.results.filter((r: any) => r.status === "created").length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {result.results.filter((r: any) => r.status === "created").length} added successfully
                </div>
              )}

              {/* Generated PINs are shown exactly once — they are not stored
                  anywhere readable and cannot be recovered later, only reset.
                  Previously they were generated and silently discarded, so
                  those staff could never log in. */}
              {result.results.some((r: any) => r.generated_pin) && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-2">
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5" /> Generated PINs — save these now
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Shown once. They can't be looked up later, only reset from the staff member's profile.
                  </p>
                  <div className="space-y-0.5">
                    {result.results.filter((r: any) => r.generated_pin).map((r: any) => (
                      <div key={r.row} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">{r.name} · {r.phone}</span>
                        <span className="font-mono font-semibold tabular-nums">{r.generated_pin}</span>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 w-full"
                    onClick={() => {
                      const rows = result.results
                        .filter((r: any) => r.generated_pin)
                        .map((r: any) => ({ name: r.name, phone: r.phone, pin: r.generated_pin }));
                      downloadCsv(`staff_pins_${new Date().toISOString().slice(0, 10)}.csv`, rows);
                    }}
                  >
                    <Download className="h-3.5 w-3.5" /> Download PIN list (CSV)
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm font-semibold">Export current staff</p>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCurrentStaff}>
              <Download className="h-3.5 w-3.5" /> Export to Excel ({staff.length} staff)
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
