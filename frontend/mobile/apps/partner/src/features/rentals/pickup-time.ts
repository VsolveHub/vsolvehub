/** "Tue 7 Oct, 10:00 AM" in the device's time zone; empty for a missing value. */
export function whenLabel(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const time = date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${day}, ${time.toUpperCase()}`;
}

/** "Tue, 7 Oct" from "2026-10-07" or full ISO date. */
export function dateLabel(value: string | null | undefined): string {
  if (!value) return "";
  const parts = value.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3) return value;
  const [y, m, d] = parts;
  return new Date(y!, m! - 1, d!, 12).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** "10:00 AM" only. */
export function clockOf(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
}

/** Same calendar day on this device. Supports YYYY-MM-DD or ISO datetime. */
export function isSameLocalDay(value: string | null | undefined, day: Date): boolean {
  if (!value) return false;
  if (value.length === 10) {
    const m = String(day.getMonth() + 1).padStart(2, "0");
    const d = String(day.getDate()).padStart(2, "0");
    return value === `${day.getFullYear()}-${m}-${d}`;
  }
  const d = new Date(value);
  return (
    d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate()
  );
}
