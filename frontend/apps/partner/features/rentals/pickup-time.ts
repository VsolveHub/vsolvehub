/** "Tue 7 Oct, 10:00 AM" in the device's time zone; empty for a missing value. */
export function whenLabel(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const time = date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${day}, ${time.toUpperCase()}`;
}

/** "10:00 AM" only. */
export function clockOf(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
}

/** Same calendar day on this device. */
export function isSameLocalDay(value: string | null | undefined, day: Date): boolean {
  if (!value) return false;
  const d = new Date(value);
  return (
    d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate()
  );
}
