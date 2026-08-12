/**
 * The event kinds the request timeline knows how to draw.
 *
 * Re-declared rather than imported from `contract-pending/types.ts`, for the
 * reason `RequestStatus` gives in `./request-state.ts`: the quarantine's copy is
 * *a value the server sends*, this is *a case this build has copy and a tone
 * for*, and the two drift apart on purpose. The server's list is allowed to grow
 * without this one changing — that is precisely the situation
 * `isTimelineEventKind` exists to handle.
 *
 * ## Why an unknown kind is not an error
 *
 * Proposal 0012: a new event type the build does not recognise renders as a
 * neutral dated row rather than being dropped. This is the opposite of the
 * workspace-key rule, where an unknown key renders nothing, and deliberately so
 * — there the unknown thing is a navigation target and a broken one is a dead
 * end; here the unknown thing is a line in a record both parties argue from
 * during a dispute, and a silent gap in that record reads as "nothing happened".
 *
 * Narrowing to `null` rather than keeping the raw string is what makes the
 * distinction usable downstream: `null` means "drawn, undecorated, and carrying
 * no detail fields", and `../adapters/` relies on it to withhold every `detail`
 * key from an event nobody has reviewed.
 */

export const TIMELINE_EVENT_KINDS = [
  "REQUIREMENT_SUBMITTED",
  "REQUIREMENT_EDITED",
  "MATCHING_WAVE_SENT",
  "QUESTION_ASKED",
  "QUESTION_ANSWERED",
  "SITE_VISIT_REQUESTED",
  "SITE_VISIT_SCHEDULED",
  "QUOTE_RECEIVED",
  "SLA_BREACHED",
  "REQUIREMENT_CLOSED",
] as const;

export type TimelineEventKind = (typeof TIMELINE_EVENT_KINDS)[number];

export function isTimelineEventKind(value: unknown): value is TimelineEventKind {
  return typeof value === "string" && TIMELINE_EVENT_KINDS.includes(value as TimelineEventKind);
}
