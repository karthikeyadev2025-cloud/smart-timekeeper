import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2 } from "lucide-react";
import type { BranchRow } from "@/hooks/useBranchFilter";

export function BranchFilter({
  value, onChange, branches, label = "Branch",
}: {
  value: string;
  onChange: (v: string) => void;
  branches: BranchRow[];
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[200px]"><SelectValue placeholder={label} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All {label.toLowerCase()}es</SelectItem>
          {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
