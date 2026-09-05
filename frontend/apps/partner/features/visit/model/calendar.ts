import type { SiteVisit } from "./visit-state";

/**
 * A confirmed visit as a calendar file.
 *
 * The one action worth offering the day *before* a visit. A vendor who has just
 * been told "Tomorrow, 8:00 am" is not going to open this app again at 7:15 —
 * their phone's calendar is where a time they must keep actually belongs, and
 * it is the only place that will alarm.
 *
 * ## Why a file and not a Google Calendar link
 *
 * A `calendar.google.com/render` URL is one vendor's calendar. `.ics` is the
 * interchange format every phone calendar on both platforms already handles,
 * including the ones a vendor actually has. It is also entirely local: nothing
 * about this visit leaves the device to produce it.
 *
 * ## What it deliberately does not carry
 *
 * No customer name and no phone number. The exact address is included because
 * the vendor has already been shown it on this screen and has to navigate to it
 * — but an `.ics` gets synced, shared and backed up in ways this app does not
 * control, so nothing goes in that the address does not already imply.
 */

/** `20260902T080000Z` — the only date form RFC 5545 accepts for a UTC stamp. */
function icsStamp(epochMs: number): string {
  return `${new Date(epochMs).toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/**
 * Escapes a value for an iCalendar property.
 *
 * Commas, semicolons and backslashes are structural in RFC 5545 — an address
 * line reading "Flat 2, Maple PG" would otherwise split one property into two
 * and produce a file the phone silently refuses.
 */
function icsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export interface VisitCalendarEvent {
  readonly serviceName: string;
  readonly destination: string;
}

/**
 * Builds the `.ics` body, or null when the visit has no fixed time to put in a
 * calendar — a held slot is not an appointment.
 */
export function visitCalendarFile(
  visit: SiteVisit,
  event: VisitCalendarEvent,
): string | null {
  if (visit.scheduled_for === null || visit.scheduled_for === "") return null;
  const startMs = Date.parse(visit.scheduled_for);
  if (!Number.isFinite(startMs)) return null;

  const minutes = visit.duration_minutes ?? 60;
  const title = event.serviceName.trim() === "" ? "Vsolve site visit" : event.serviceName.trim();

  // CRLF line endings, not "\n": RFC 5545 requires them, and iOS is the strict
  // reader that rejects the file rather than repairing it.
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vsolve Hub//Partner//EN",
    "BEGIN:VEVENT",
    `UID:visit-${visit.id}@vsolvehub.com`,
    `DTSTAMP:${icsStamp(Date.now())}`,
    `DTSTART:${icsStamp(startMs)}`,
    `DTEND:${icsStamp(startMs + minutes * 60_000)}`,
    `SUMMARY:${icsText(`Vsolve visit — ${title}`)}`,
    ...(event.destination.trim() === "" ? [] : [`LOCATION:${icsText(event.destination)}`]),
    "DESCRIPTION:" +
      icsText("Confirm your arrival in the Vsolve Partner app and write the estimate on site."),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** A filename a vendor can recognise in their downloads. */
export function visitCalendarFilename(visit: SiteVisit): string {
  return `vsolve-visit-${visit.id.slice(0, 8)}.ics`;
}
