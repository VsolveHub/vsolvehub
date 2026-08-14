"use client";

import { Badge, Card, EmptyState, Timeline, TimelineEvent, type TimelineTone } from "@vsolve/ui";

import { maskId } from "@/features/shared/identifiers";
import {
  eventContextPairs,
  eventCopy,
  evidencePartyLabel,
  evidenceRail,
  formatMoment,
  type CaseEvent,
  type CaseEvidence,
  type Tone,
} from "../model/cases";

/**
 * What was said, what was shown, and when — the two read-only halves of a case.
 *
 * ## Fourteen event kinds, fourteen sentences
 *
 * `eventCopy` is exhaustive over the published enum and falls back to the code itself for one it
 * has never seen. Wave C6 added six kinds whose meaning lives entirely in `context` rather than
 * `body` — a response deadline, an appeal, an override, a payout-hold movement — so this renders
 * the context pairs too. A trail that read only `body` showed those six as blank rows, which is
 * the specific defect 1.32.0 warns about.
 *
 * ## Evidence is a reference. There is no uploader here and there will not be one
 *
 * `POST /cases/{case_id}/evidence/` has no file field. Evidence points at a requirement
 * attachment or a stage-evidence record that already came through one of the two scanned upload
 * rails, so there is one scan pipeline and one place a malware verdict can be forgotten. A file a
 * party has not uploaded yet is uploaded there first — by them, in their own app.
 *
 * This screen therefore shows the reference and the statement, and deliberately mints no link to
 * the bytes: a signed URL from here would be a second door into somebody's file with none of the
 * first door's object-level checks.
 */

const TIMELINE_TONE: Record<Tone, TimelineTone> = {
  neutral: "neutral",
  info: "active",
  success: "success",
  warning: "warning",
  danger: "danger",
};

export function CaseEvidencePanel({ evidence }: { evidence: readonly CaseEvidence[] }) {
  if (evidence.length === 0) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-text">Evidence</h3>
        <EmptyState
          compact
          className="mt-2"
          title="Nothing has been put in front of this decision"
          description="Either party can attach a statement and point at a file they already uploaded. Ask them to add it from their own app — files are not uploaded here."
        />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-text">Evidence</h3>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        Each item points at a file that already came through a scanned upload rail. Open it from
        the record that owns it — this console holds no copy and mints no link.
      </p>
      <ul className="mt-3 list-none space-y-3 p-0">
        {evidence.map((item) => {
          const rail = evidenceRail(item);
          return (
            <li key={item.id} className="rounded-control border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{evidencePartyLabel(item.party)}</Badge>
                <span className="text-xs text-text-muted">{formatMoment(item.created_at)}</span>
              </div>
              {item.statement ? (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text">
                  {item.statement}
                </p>
              ) : (
                <p className="mt-2 text-sm italic text-text-secondary">
                  A file with no statement beside it. Ask what it is meant to show.
                </p>
              )}
              {rail === null ? (
                <p className="mt-2 text-xs text-text-secondary">
                  A statement only — no file was attached to it.
                </p>
              ) : (
                <p className="mt-2 text-xs text-text-secondary">
                  {rail === "requirement attachment" ? "Requirement attachment" : "Stage evidence"}
                  {" · "}
                  {maskId(item.requirement_attachment_id ?? item.stage_evidence_id ?? "")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function CaseEventTrail({ events }: { events: readonly CaseEvent[] }) {
  if (events.length === 0) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-text">History</h3>
        <p className="mt-2 text-sm text-text-secondary">
          No events on this case yet. Every case opens with one, so an empty trail means this
          record has not finished loading rather than that nothing happened.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-text">History</h3>
      <div className="mt-3">
        <Timeline label="Case history">
          {events.map((event) => {
            const copy = eventCopy(event.kind);
            const pairs = eventContextPairs(event.context);
            return (
              <TimelineEvent
                key={event.id}
                title={copy.title}
                tone={TIMELINE_TONE[copy.tone]}
                timestamp={formatMoment(event.created_at)}
                actor={event.actor_id ? `Operator ${maskId(event.actor_id)}` : undefined}
              >
                {event.body ? <p className="whitespace-pre-wrap">{event.body}</p> : null}
                {pairs.length > 0 ? (
                  <dl className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-[auto_1fr]">
                    {pairs.map((pair) => (
                      <div key={pair.key} className="contents">
                        <dt className="text-xs font-semibold text-text-secondary">{pair.key}</dt>
                        <dd className="m-0 text-xs text-text-secondary">{pair.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </TimelineEvent>
            );
          })}
        </Timeline>
      </div>
    </Card>
  );
}
