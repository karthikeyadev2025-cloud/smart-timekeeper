/**
 * Date string in the DEVICE's local timezone, formatted YYYY-MM-DD.
 *
 * Why this exists: `new Date().toISOString().slice(0, 10)` returns the UTC
 * date, not the local one. For India (UTC+5:30) every punch between
 * midnight and 5:30 AM got attributed to the PREVIOUS day — wrong
 * attendance_date on the record, wrong "today's records" query (so the
 * check-in/check-out state machine started from the wrong position), and
 * wrong day in streaks/reports. Night-shift staff hit this every single day.
 */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
