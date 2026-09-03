"use client";

import { describeError } from "@vsolve/query";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Sheet,
  Spinner,
  useToast,
} from "@vsolve/ui";
import { useState } from "react";

import {
  useCrewDocuments,
  useReviewCrewDocument,
  type CrewDocumentRow,
  type CrewVerificationRow,
} from "../queries";

/**
 * Looking at one worker's identity documents and deciding on them.
 *
 * ## The link is signed, short-lived and opens in a new tab
 *
 * The bucket is private and nothing stores a URL, because a stored URL is a stored expiry — the
 * link is minted per read. `review_url` can come back null when storage is unavailable; that is
 * published as a state rather than an error, so an outage costs one missing preview instead of
 * hiding everybody else in the queue. The decision buttons are disabled while it is null: a
 * reviewer must not approve a document they were unable to open.
 *
 * ## Rejecting asks for a reason before it will proceed
 *
 * The reason is the only thing that tells the partner whether to re-photograph the same card or
 * find a different document, and it is what withdraws the person's clearance if the document was
 * a required one. The server refuses a blank reason and the model constrains it too; this asks
 * first so the refusal is never how a reviewer finds out.
 */
const SIZE = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const UPLOADED = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

const STATUS_BADGE: Record<string, { tone: "success" | "info" | "danger"; label: string }> = {
  APPROVED: { tone: "success", label: "Approved" },
  PENDING: { tone: "info", label: "Waiting for you" },
  REJECTED: { tone: "danger", label: "Rejected" },
};

export interface CrewDocumentReviewPanelProps {
  readonly row: CrewVerificationRow | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function CrewDocumentReviewPanel({
  row,
  open,
  onOpenChange,
}: CrewDocumentReviewPanelProps) {
  const documents = useCrewDocuments(open && row ? row.membership_id : null);
  const review = useReviewCrewDocument();
  const toast = useToast();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (row === null) return null;

  const decide = (document: CrewDocumentRow, approved: boolean, why: string) => {
    review.mutate(
      {
        membershipId: row.membership_id,
        documentId: document.document_id,
        approved,
        reason: why,
      },
      {
        onSuccess: () => {
          toast.notify(
            approved
              ? `${document.kind_label} approved for ${row.crew_member_name}.`
              : `${document.kind_label} rejected for ${row.crew_member_name}.`,
          );
          setRejecting(null);
          setReason("");
        },
      },
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!review.isPending) onOpenChange(next);
      }}
      title={row.crew_member_name}
      description={`Identity documents from ${row.partner_name}`}
    >
      {documents.isPending ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary" aria-live="polite">
          <Spinner size="sm" />
          Loading documents…
        </p>
      ) : documents.isError ? (
        <ErrorState
          title="We could not load these documents"
          message="Nothing has changed. Try again."
          actionLabel="Try again"
          onAction={() => void documents.refetch()}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {documents.data && documents.data.missing_required_kinds.length > 0 ? (
            <Card className="border-warning-line bg-warning-surface p-3 text-sm leading-6 text-text-secondary">
              Still needed before this person can be assigned:{" "}
              <strong className="font-semibold text-warning-text">
                {documents.data.missing_required_kinds.join(", ").toLowerCase().replace(/_/g, " ")}
              </strong>
              .
            </Card>
          ) : (
            <Card className="border-success-line bg-success-surface p-3 text-sm leading-6 text-text-secondary">
              Every required document is approved. This person is cleared for assignment.
            </Card>
          )}

          {(documents.data?.documents ?? []).length === 0 ? (
            <p className="text-sm text-text-secondary">
              Nothing has been uploaded for this person yet.
            </p>
          ) : null}

          {(documents.data?.documents ?? []).map((document) => {
            const badge = STATUS_BADGE[document.status];
            const openable = document.review_url !== null;
            return (
              <Card key={document.document_id} className="flex flex-col gap-3 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text">{document.kind_label}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      v{document.version} · {SIZE.format(document.size_bytes / 1024 / 1024)} MB ·
                      uploaded{" "}
                      <time dateTime={document.uploaded_at}>
                        {UPLOADED.format(new Date(document.uploaded_at))}
                      </time>
                    </p>
                  </div>
                  {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
                </div>

                {document.status === "REJECTED" && document.review_reason ? (
                  <p className="rounded-control bg-danger-surface px-2.5 py-2 text-xs leading-5 text-danger-text">
                    {document.review_reason}
                  </p>
                ) : null}

                {openable ? (
                  <a
                    href={document.review_url ?? undefined}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-11 w-fit items-center rounded-control border border-line px-3 text-sm font-semibold text-text hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    Open the file
                  </a>
                ) : (
                  <p className="text-xs leading-5 text-warning-text">
                    The file store is not reachable right now, so this cannot be opened — and
                    therefore cannot be decided. Try again shortly.
                  </p>
                )}

                {rejecting === document.document_id ? (
                  <div className="flex flex-col gap-3">
                    <Field label="Why are you rejecting it?" required>
                      <Input
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="The photo is too blurred to read the number"
                        autoComplete="off"
                      />
                    </Field>
                    <p className="text-xs leading-5 text-text-secondary">
                      This goes back to {row.partner_name} as written. If this is a required
                      document, rejecting it also withdraws this person’s clearance.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="danger"
                        loading={review.isPending}
                        loadingLabel="Rejecting"
                        disabled={reason.trim() === ""}
                        onClick={() => decide(document, false, reason.trim())}
                      >
                        Reject
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={review.isPending}
                        onClick={() => {
                          setRejecting(null);
                          setReason("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : document.status !== "REJECTED" ? (
                  <div className="flex flex-wrap gap-2">
                    {document.status !== "APPROVED" ? (
                      <Button
                        loading={review.isPending}
                        loadingLabel="Approving"
                        disabled={!openable}
                        onClick={() => decide(document, true, "")}
                      >
                        Approve
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      disabled={!openable || review.isPending}
                      onClick={() => {
                        review.reset();
                        setReason("");
                        setRejecting(document.document_id);
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                ) : null}
              </Card>
            );
          })}

          {review.isError ? (
            <ErrorState
              inline
              severity="error"
              title="We could not record that decision"
              message={describeError(review.error, "mutation").message}
            />
          ) : null}
        </div>
      )}
    </Sheet>
  );
}
