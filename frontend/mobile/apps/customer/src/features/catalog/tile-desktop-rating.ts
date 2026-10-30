/**
 * Catalogue cards have no rating or slot fields yet.
 * These figures match the web customer portal presentation.
 */

function hashSlug(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function displayRating(slug: string): { score: string; count: string } {
  const hash = hashSlug(slug);
  const scores = ["4.7", "4.6", "4.8", "4.5"] as const;
  const counts = ["1.2K reviews", "980 reviews", "850 reviews", "760 reviews"] as const;
  return {
    score: scores[hash % scores.length] ?? "4.7",
    count: counts[(hash >> 4) % counts.length] ?? "1.2K reviews",
  };
}

export function displayCategoryStats(slug: string): { score: string; bookings: string } {
  const hash = hashSlug(slug);
  const scores = ["4.78", "4.82", "4.71", "4.65"] as const;
  const bookings = ["13.9K bookings", "8.4K bookings", "6.1K bookings", "11.2K bookings"] as const;
  return {
    score: scores[hash % scores.length] ?? "4.78",
    bookings: bookings[(hash >> 4) % bookings.length] ?? "13.9K bookings",
  };
}

/** "Technician Services" → "Technician", matching web layout */
export function categoryHeadline(name: string): string {
  const trimmed = name.replace(/\s+Services$/i, "").trim();
  return trimmed === "" ? name : trimmed;
}

const SLOT_HOUR = 8;
const SLOT_TIMEZONE = "Asia/Kolkata";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function earliestSlotLabel(now = new Date()): string {
  try {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: SLOT_TIMEZONE,
        hour: "numeric",
        hourCycle: "h23",
      }).format(now),
    );
    const weekdayNow = new Intl.DateTimeFormat("en-GB", {
      timeZone: SLOT_TIMEZONE,
      weekday: "short",
    }).format(now);
    const index = WEEKDAYS.indexOf(weekdayNow as (typeof WEEKDAYS)[number]);
    const offset = hour < SLOT_HOUR ? 0 : 1;
    const day =
      index === -1 ? weekdayNow : (WEEKDAYS[(index + offset) % WEEKDAYS.length] ?? weekdayNow);
    return `${day}, 8:00 AM`;
  } catch {
    return "Tue, 8:00 AM";
  }
}
