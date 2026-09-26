"use client";

import { Badge, Card, ErrorState, Sheet, Spinner } from "@vsolve/ui";

import {
  useServiceFeedbackNotes,
  type FeedbackWindow,
  type ServiceFeedbackRow,
} from "../queries";

/**
 * The written notes behind one service's numbers.
 *
 * ## Why each note carries the partner rating
 *
 * `platform 2 / partner 5` is the pattern worth acting on — the crew did everything right and the
 * customer still had a bad time — and it is invisible when the two scores are read on separate
 * screens. So the same customer's rating of the partner on that job sits beside their note about
 * us, resolved server-side by matching on customer *and* job.
 *
 * ## Why the chips are repeated here
 *
 * The histogram on the previous screen says how often something was said; this says what was said
 * alongside it. "Pricing wasn't clear" plus a sentence explaining which price is a fixable report;
 * either half alone is a guess.
 */
const WHEN = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

export interface ServiceFeedbackNotesPanelProps {
  readonly row: ServiceFeedbackRow | null;
  readonly days: FeedbackWindow;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function ServiceFeedbackNotesPanel({
  row,
  days,
  open,
  onOpenChange,
}: ServiceFeedbackNotesPanelProps) {
  const notes = useServiceFeedbackNotes(row?.variant_id ?? null, days, open && row !== null);

  if (row === null) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={row.variant_name}
      description={
        row.variant_id === null
          ? "Notes from jobs that covered more than one service"
          : `${row.note_count} written ${row.note_count === 1 ? "note" : "notes"}`
      }
    >
      {notes.isPending ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary" aria-live="polite">
          <Spinner size="sm" />
          Loading notes…
        </p>
      ) : notes.isError ? (
        <ErrorState
          title="We could not load these notes"
          message="Nothing has changed. Try again."
          actionLabel="Try again"
          onAction={() => void notes.refetch()}
        />
      ) : (notes.data?.notes ?? []).length === 0 ? (
        <p className="text-sm text-text-secondary">
          Customers answered with chips only — nobody wrote anything in this period.
        </p>
      ) : (
        <ul className="flex list-none flex-col gap-3 p-0">
          {(notes.data?.notes ?? []).map((note) => (
            <li key={note.feedback_id}>
              <Card className="p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {note.score === null ? (
                    <Badge tone="neutral">No score</Badge>
                  ) : (
                    <Badge tone={note.score <= 2 ? "danger" : note.score === 3 ? "warning" : "success"}>
                      Vsolve ★ {note.score}
                    </Badge>
                  )}
                  {note.tags.map((tag) => (
                    <span key={tag.code} className="text-xs text-text-secondary">
                      {tag.label}
                    </span>
                  ))}
                </div>

                <p className="mt-2 text-sm leading-6 text-text">“{note.comment}”</p>

                <p className="mt-2 text-xs text-text-muted">
                  <time dateTime={note.created_at}>{WHEN.format(new Date(note.created_at))}</time>
                  {note.partner_name ? ` · ${note.partner_name}` : ""}
                  {/* The same customer's verdict on the partner, on this job. The contrast is the
                      finding: a five-star crew behind a two-star experience is ours to fix. */}
                  {note.partner_score !== null ? ` · partner ★ ${note.partner_score}` : ""}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
