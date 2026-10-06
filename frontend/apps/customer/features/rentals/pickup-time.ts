/**
 * Pickup and return times for a rental, worked out on the device.
 *
 * The owner publishes open days (Monday = 0), opening hours, a notice period
 * and how far ahead a pickup may be. These helpers turn that into the dates and
 * 30-minute slots the customer can choose. Django checks the same rules again
 * when the booking is made.
 */

export type PickupHours = {
  open_days: number[];
  opens_at: string;
  closes_at: string;
  min_notice_minutes: number;
  max_advance_days: number;
  slot_minutes?: number;
  summary?: string;
};

export const DEFAULT_PICKUP_HOURS: PickupHours = {
  open_days: [0, 1, 2, 3, 4, 5, 6],
  opens_at: "09:00",
  closes_at: "20:00",
  min_notice_minutes: 120,
  max_advance_days: 60,
  slot_minutes: 30,
  summary: "Every day, 9:00 AM - 8:00 PM",
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function pad(n: number): string {
  return `${n}`.padStart(2, "0");
}

export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDay(dayIso: string): Date {
  const [y, m, d] = dayIso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

export function addDays(dayIso: string, days: number): string {
  const date = parseDay(dayIso);
  date.setDate(date.getDate() + days);
  return isoDay(date);
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** The local moment for a day and an "HH:MM" clock. */
export function atLocal(dayIso: string, hhmm: string): Date {
  const date = parseDay(dayIso);
  date.setMinutes(minutesOf(hhmm));
  return date;
}

/** Monday = 0 … Sunday = 6, as the owner's open days are stored. */
export function weekdayIndex(dayIso: string): number {
  return (parseDay(dayIso).getDay() + 6) % 7;
}

export function isOpenDay(hours: PickupHours, dayIso: string): boolean {
  return hours.open_days.includes(weekdayIndex(dayIso));
}

export function closedDayName(dayIso: string): string {
  return DAY_NAMES[weekdayIndex(dayIso)] ?? "that day";
}

/** "HH:MM" slots on an open day, not before `notBefore` (exclusive of it when `after`). */
export function slotsForDay(
  hours: PickupHours,
  dayIso: string,
  notBefore?: Date,
  { after = false }: { after?: boolean } = {},
): string[] {
  if (!dayIso || !isOpenDay(hours, dayIso)) return [];
  const step = hours.slot_minutes || 30;
  const out: string[] = [];
  for (let m = minutesOf(hours.opens_at); m <= minutesOf(hours.closes_at); m += step) {
    const hhmm = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    if (notBefore) {
      const t = atLocal(dayIso, hhmm).getTime();
      if (after ? t <= notBefore.getTime() : t < notBefore.getTime()) continue;
    }
    out.push(hhmm);
  }
  return out;
}

export function earliestPickup(hours: PickupHours, now: Date): Date {
  return new Date(now.getTime() + hours.min_notice_minutes * 60 * 1000);
}

export function lastPickupDay(hours: PickupHours, now: Date): string {
  return addDays(isoDay(now), hours.max_advance_days);
}

/** The first pickup the owner can take, or null when nothing is open in range. */
export function firstPickup(hours: PickupHours, now: Date): { day: string; time: string } | null {
  const earliest = earliestPickup(hours, now);
  for (let i = 0; i <= hours.max_advance_days; i += 1) {
    const day = addDays(isoDay(now), i);
    const slots = slotsForDay(hours, day, earliest);
    if (slots[0]) return { day, time: slots[0] };
  }
  return null;
}

/** A return `days` after pickup at the same time, moved to the next open slot if needed. */
export function suggestedReturn(
  hours: PickupHours,
  pickupDay: string,
  pickupTime: string,
  days: number,
): { day: string; time: string } | null {
  const pickup = atLocal(pickupDay, pickupTime);
  for (let i = days; i <= days + 14; i += 1) {
    const day = addDays(pickupDay, i);
    const slots = slotsForDay(hours, day, pickup, { after: true });
    if (slots.includes(pickupTime)) return { day, time: pickupTime };
    if (slots[0]) return { day, time: slots[0] };
  }
  return null;
}

/** Started 24-hour periods after one hour's grace, never less than one — as Django bills. */
export function rentalDaysBetween(pickup: Date, ret: Date): number {
  const billable = Math.max(ret.getTime() - pickup.getTime() - HOUR_MS, 0);
  return Math.max(1, Math.ceil(billable / DAY_MS));
}

export function clockLabel(hhmm: string): string {
  const total = minutesOf(hhmm);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${suffix}`;
}

export function whenLabel(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  return `${day}, ${clockLabel(`${pad(date.getHours())}:${pad(date.getMinutes())}`)}`;
}

export function noticeLabel(minutes: number): string {
  if (minutes <= 0) return "any time";
  if (minutes % 1440 === 0) {
    const d = minutes / 1440;
    return d === 1 ? "1 day ahead" : `${d} days ahead`;
  }
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? "1 hour ahead" : `${h} hours ahead`;
  }
  return `${minutes} minutes ahead`;
}
