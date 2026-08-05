import { isConsentPurpose, isUuid } from "@/features/shared/identifiers";

/**
 * A Partner's working week, as Operations may rewrite it.
 *
 * ## This is a replace, not an edit
 *
 * `PUT /operations/partners/{id}/availability/` deletes every existing rule and
 * exception for the Partner and writes what it is given
 * (`_replace_schedule_for_application`). Whatever is not in the request is gone.
 *
 * ## And there is nothing to read first
 *
 * The contract publishes no Operations read of a Partner's schedule — only the
 * Partner's own `GET /partner/availability/`. So this console cannot load the
 * current week, and an editor that opened empty and submitted would silently
 * erase somebody's working hours.
 *
 * Everything in this module follows from those two facts: the editor states the
 * replace in plain words, submitting an empty week is treated as its own
 * deliberate act rather than a side effect of an empty form, and the operator
 * confirms against a written summary of what the week will become.
 */

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** Django's convention, stated once: `weekday` is 0 for Monday, 6 for Sunday. */
export function weekdayLabel(weekday: number): string {
  return WEEKDAYS[weekday] ?? "Unknown day";
}

export interface RuleDraft {
  /** Local row identity. Never sent — the server assigns real ids. */
  key: string;
  serviceAreaId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  endsNextDay: boolean;
}

export interface ExceptionDraft {
  key: string;
  serviceAreaId: string;
  date: string;
  isAvailable: boolean;
  startsAt: string;
  endsAt: string;
  endsNextDay: boolean;
  reason: string;
}

export interface ScheduleDraft {
  partnerId: string;
  consentPurpose: string;
  consentVersion: string;
  rules: RuleDraft[];
  exceptions: ExceptionDraft[];
}

const MINUTES_PER_DAY = 24 * 60;

function minutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

/**
 * Absolute start and end minute within a week, for one rule.
 *
 * Mirrors `_validate_schedule_rules`. A window marked as ending the next day is
 * pushed a full day forward, which is what makes an overnight shift comparable
 * to the windows around it.
 */
function span(rule: RuleDraft): { start: number; end: number } | null {
  const start = minutes(rule.startsAt);
  const end = minutes(rule.endsAt);
  if (start === null || end === null) return null;

  const absoluteStart = rule.weekday * MINUTES_PER_DAY + start;
  let absoluteEnd = rule.weekday * MINUTES_PER_DAY + end;
  if (rule.endsNextDay) absoluteEnd += MINUTES_PER_DAY;

  return { start: absoluteStart, end: absoluteEnd };
}

export interface ScheduleProblems {
  /** Keyed by draft row key, so a message lands on the row that caused it. */
  rules: Record<string, string>;
  exceptions: Record<string, string>;
  /** Problems with the request as a whole. */
  form: Record<string, string>;
}

/**
 * Everything the client can check without guessing.
 *
 * Deliberately excluded: whether the Partner exists, whether they are approved,
 * whether the service areas are ones they were granted, and whether an active
 * consent receipt is on file. All four are server facts, all four have named
 * refusals, and inventing local answers to them would block legitimate changes.
 */
export function validateSchedule(draft: ScheduleDraft): ScheduleProblems {
  const problems: ScheduleProblems = { rules: {}, exceptions: {}, form: {} };

  if (!isUuid(draft.partnerId)) {
    problems.form.partnerId = "Paste the Partner's id.";
  }
  if (!isConsentPurpose(draft.consentPurpose)) {
    problems.form.consentPurpose =
      "Use the consent purpose exactly as recorded — letters, numbers, hyphens and underscores only.";
  }
  if (draft.consentVersion.trim() === "" || draft.consentVersion.trim().length > 80) {
    problems.form.consentVersion = "Name the version of the consent the Partner gave.";
  }

  for (const rule of draft.rules) {
    if (!isUuid(rule.serviceAreaId)) {
      problems.rules[rule.key] = "Paste a service area id.";
      continue;
    }
    const bounds = span(rule);
    if (bounds === null) {
      problems.rules[rule.key] = "Give a start and end time.";
      continue;
    }
    if (bounds.end <= bounds.start) {
      // Django refuses this rather than assuming an overnight shift, and it is
      // right to: guessing would silently publish a window nobody chose.
      problems.rules[rule.key] =
        "This window ends before it starts. Tick “ends the next day” if that is an overnight shift.";
    }
  }

  // Overlap, per service area, across the week boundary — the same comparison
  // `_validate_schedule_rules` makes. Checked here so an operator fixes it in
  // the row that caused it rather than reading one sentence about the whole week.
  const byArea = new Map<string, { key: string; start: number; end: number }[]>();
  for (const rule of draft.rules) {
    if (problems.rules[rule.key]) continue;
    const bounds = span(rule);
    if (bounds === null) continue;
    const area = rule.serviceAreaId.trim().toLowerCase();
    const list = byArea.get(area) ?? [];
    list.push({ key: rule.key, ...bounds });
    byArea.set(area, list);
  }

  const week = 7 * MINUTES_PER_DAY;
  for (const intervals of byArea.values()) {
    const expanded = [
      ...intervals,
      // A Monday-morning window is also the window that a Sunday overnight shift
      // can run into, so it is compared a second time a week later.
      ...intervals
        .filter((entry) => entry.start < MINUTES_PER_DAY)
        .map((entry) => ({ ...entry, start: entry.start + week, end: entry.end + week })),
    ].sort((a, b) => a.start - b.start);

    for (let index = 1; index < expanded.length; index += 1) {
      const previous = expanded[index - 1]!;
      const current = expanded[index]!;
      if (current.start < previous.end) {
        problems.rules[current.key] =
          "This window overlaps another one in the same service area.";
      }
    }
  }

  for (const exception of draft.exceptions) {
    if (!isUuid(exception.serviceAreaId)) {
      problems.exceptions[exception.key] = "Paste a service area id.";
      continue;
    }
    if (exception.date.trim() === "") {
      problems.exceptions[exception.key] = "Give the date this applies to.";
      continue;
    }
    if (exception.isAvailable) {
      const start = minutes(exception.startsAt);
      const end = minutes(exception.endsAt);
      if (start === null || end === null) {
        problems.exceptions[exception.key] =
          "An extra working day needs a start and an end time.";
      } else if (!exception.endsNextDay && end <= start) {
        problems.exceptions[exception.key] =
          "This window ends before it starts. Tick “ends the next day” if that is an overnight shift.";
      }
    }
    if (exception.reason.trim().length > 200) {
      problems.exceptions[exception.key] = "Keep the reason under 200 characters.";
    }
  }

  return problems;
}

export function hasProblems(problems: ScheduleProblems): boolean {
  return (
    Object.keys(problems.rules).length > 0 ||
    Object.keys(problems.exceptions).length > 0 ||
    Object.keys(problems.form).length > 0
  );
}

/**
 * True when submitting would leave the Partner with no availability at all.
 *
 * The single most damaging thing this screen can do, and the easiest to do by
 * accident: the editor starts empty because there is no read, so an operator who
 * fills in the Partner id and presses save clears their week. It is offered as
 * an explicit choice with its own wording, never as the default outcome of an
 * untouched form.
 */
export function clearsTheSchedule(draft: ScheduleDraft): boolean {
  return draft.rules.length === 0 && draft.exceptions.length === 0;
}

/** A plain-language summary of the week the Partner will be left with. */
export function describeWeek(draft: ScheduleDraft): string[] {
  if (clearsTheSchedule(draft)) {
    return ["No working hours at all. The Partner will receive no offers."];
  }

  const lines = draft.rules
    .slice()
    .sort((a, b) => a.weekday - b.weekday || a.startsAt.localeCompare(b.startsAt))
    .map(
      (rule) =>
        `${weekdayLabel(rule.weekday)} ${rule.startsAt}–${rule.endsAt}${
          rule.endsNextDay ? " (ends the next day)" : ""
        }`,
    );

  for (const exception of draft.exceptions) {
    lines.push(
      exception.isAvailable
        ? `${exception.date}: working ${exception.startsAt}–${exception.endsAt}`
        : `${exception.date}: not working`,
    );
  }

  return lines;
}
