/**
 * The time of day the crew reports, and how it rides on `requested_start`.
 *
 * `requested_start` is a date-time on the wire and has always been sent as
 * midnight local, because a helper crew is booked by the *day*. An event crew
 * is booked by the *shift* — guests arrive at seven, staff report at five — and
 * a lead offered "Saturday" cannot plan a 5pm reporting time from it. So the
 * same field carries the real time, built from local parts so a browser east of
 * UTC does not send the previous day.
 *
 * No new question kind and no new column: the catalogue has no `TIME` question
 * and the server already stores the instant. What is new is only that the
 * screen stops throwing the time away.
 */

/** Every half hour from six in the morning to half past eleven at night. */
export function reportingTimeOptions(): readonly string[] {
  const options: string[] = [];
  for (let hour = 6; hour <= 23; hour += 1) {
    for (const minute of [0, 30]) {
      options.push(`${`${hour}`.padStart(2, "0")}:${`${minute}`.padStart(2, "0")}`);
    }
  }
  return options;
}

function parseTime(time: string): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (match === null) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** "17:00" as "5:00 pm", in the customer's own locale. */
export function formatReportingTime(time: string): string {
  const parsed = parseTime(time);
  if (parsed === null) return time;
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(
    new Date(2000, 0, 1, parsed.hour, parsed.minute),
  );
}

/**
 * The chosen day at the chosen time — or at midnight when no time was asked for.
 *
 * Local date parts throughout, for the reason `startOfLocalDay` always gave: a
 * `new Date(iso)` in a browser east of UTC lands on the previous evening.
 */
export function combineStart(isoDate: string, time: string | null): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const parsed = time === null ? null : parseTime(time);
  return new Date(
    year ?? 0,
    (month ?? 1) - 1,
    day ?? 1,
    parsed?.hour ?? 0,
    parsed?.minute ?? 0,
    0,
    0,
  ).toISOString();
}

/**
 * The time of day a stored `requested_start` carries, as `HH:MM` local.
 *
 * Midnight reads as "no time chosen": every crew draft before this file was
 * saved at midnight, and offering 12:00 am as a reporting time nobody picked
 * would be the form answering for the customer.
 */
export function toLocalInputTime(iso: string | null): string | null {
  if (iso === null) return null;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  const hour = instant.getHours();
  const minute = instant.getMinutes();
  if (hour === 0 && minute === 0) return null;
  return `${`${hour}`.padStart(2, "0")}:${`${minute}`.padStart(2, "0")}`;
}
