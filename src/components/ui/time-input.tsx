import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * 12-hour AM/PM time picker that stores its value as a 24-hour "HH:MM" string —
 * compatible with Postgres `time` and the existing schema.
 *
 *   <TimeInput12h value={start} onChange={setStart} />
 *
 * Input/Output format:
 *   - value:    "09:00", "13:30", "00:00", "23:45"
 *   - onChange: same shape
 *   - "HH:MM:SS" coming back from Postgres is auto-trimmed
 */
export function TimeInput12h({
  value,
  onChange,
  required,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  className?: string;
}) {
  // Parse incoming 24h value
  const parsed = useMemo(() => {
    const raw = (value ?? "").slice(0, 5);
    const m = /^([0-9]{1,2}):([0-9]{2})$/.exec(raw);
    if (!m) return { hour12: "", minute: "", period: "AM" as "AM" | "PM" };
    const h24 = Math.max(0, Math.min(23, parseInt(m[1], 10)));
    const mins = m[2];
    const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return { hour12: String(h12).padStart(2, "0"), minute: mins, period };
  }, [value]);

  const [hour12, setHour12] = useState(parsed.hour12 || "09");
  const [minute, setMinute] = useState(parsed.minute || "00");
  const [period, setPeriod] = useState<"AM" | "PM">(parsed.period);

  // Re-sync local state if parent changes value externally
  useEffect(() => {
    setHour12(parsed.hour12 || "09");
    setMinute(parsed.minute || "00");
    setPeriod(parsed.period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = (h: string, m: string, p: "AM" | "PM") => {
    const hh = Math.max(1, Math.min(12, parseInt(h || "0", 10) || 0));
    const mm = Math.max(0, Math.min(59, parseInt(m || "0", 10) || 0));
    let h24 = hh % 12;
    if (p === "PM") h24 += 12;
    const out = `${String(h24).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    onChange(out);
  };

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <Input
        type="number"
        min={1}
        max={12}
        value={hour12}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
          setHour12(v);
          commit(v, minute, period);
        }}
        required={required}
        aria-label="Hour"
        className="w-16 text-center font-mono"
      />
      <span className="text-muted-foreground">:</span>
      <Input
        type="number"
        min={0}
        max={59}
        value={minute}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
          setMinute(v);
          commit(hour12, v, period);
        }}
        required={required}
        aria-label="Minute"
        className="w-16 text-center font-mono"
      />
      <Select
        value={period}
        onValueChange={(p) => {
          setPeriod(p as "AM" | "PM");
          commit(hour12, minute, p as "AM" | "PM");
        }}
      >
        <SelectTrigger className="w-[72px]" aria-label="AM or PM">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="AM">AM</SelectItem>
          <SelectItem value="PM">PM</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Format a 24h "HH:MM" or "HH:MM:SS" string into a human "9:00 AM" string for display.
 */
export function formatTime12h(value?: string | null): string {
  if (!value) return "";
  const m = /^([0-9]{1,2}):([0-9]{2})/.exec(value);
  if (!m) return value;
  const h24 = parseInt(m[1], 10);
  const mins = m[2];
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mins} ${period}`;
}
