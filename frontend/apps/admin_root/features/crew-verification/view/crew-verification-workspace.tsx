"use client";

import { describeError } from "@vsolve/query";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Spinner,
  useToast,
} from "@vsolve/ui";
import { useMemo, useState } from "react";

import {
  useCorrectCrewGender,
  useCrewVerificationQueue,
  useVerifyCrewDocuments,
  type CrewVerificationRow,
  type QueueState,
} from "../queries";
import { CrewDocumentReviewPanel } from "./crew-document-review-panel";
import { CrewGenderCorrectionDialog } from "./crew-gender-correction-dialog";

/**
 * Crew document review: the screen behind `PartnerCrewMembership.documents_verified_at`.
 *
 * ## Why this exists as a reviewed surface and not a toggle
 *
 * That column decides whether a named person may be sent to a stranger's home. `assign_crew`
 * refuses an unverified worker outright and `verified_roster_size` counts only verified
 * memberships when it sizes a vendor's roster against a customer's headcount — so this screen is
 * simultaneously a safety gate and the reason a vendor does or does not get offered work.
 *
 * ## Two tabs, because two different jobs arrive here
 *
 * **Waiting** is the backlog. **Checked** exists because `verify_crew_documents` has always been
 * able to withdraw a verification and no screen could reach a verified membership to do it — a
 * supported operation with no way in is an operation that does not exist. Withdrawing takes a
 * named person off jobs they may already be assigned to, so it asks for a reason and says so.
 *
 * ## Approving a document, not a person
 *
 * The primary action is on the *document*: approving the last required kind verifies the
 * membership server-side, through the same audited command. The direct "record a check" button
 * survives for the offline path — a review completed in person is a real thing that happened —
 * but it is secondary now, and a row with a file waiting on it says so.
 */
const ADDED_DATE = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

const GENDER_LABELS: Record<string, string> = {
  "": "Gender not recorded",
  MAN: "Man",
  WOMAN: "Woman",
  OTHER: "Other",
  UNDISCLOSED: "Prefers not to say",
};

const TABS: { state: QueueState; label: string }[] = [
  { state: "PENDING", label: "Waiting" },
  { state: "VERIFIED", label: "Checked" },
];

export function CrewVerificationWorkspace() {
  const [tab, setTab] = useState<QueueState>("PENDING");
  const queue = useCrewVerificationQueue(tab);
  const verify = useVerifyCrewDocuments();
  const correctGender = useCorrectCrewGender();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [reviewing, setReviewing] = useState<CrewVerificationRow | null>(null);
  const [correcting, setCorrecting] = useState<CrewVerificationRow | null>(null);
  const [withdrawing, setWithdrawing] = useState<CrewVerificationRow | null>(null);
  const [withdrawReason, setWithdrawReason] = useState("");

  const allRows = useMemo(() => queue.data?.memberships ?? [], [queue.data?.memberships]);
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("en-IN");
    if (term === "") return allRows;
    return allRows.filter(
      (row) =>
        row.crew_member_name.toLocaleLowerCase("en-IN").includes(term) ||
        row.partner_name.toLocaleLowerCase("en-IN").includes(term),
    );
  }, [allRows, search]);

  return (
    <section aria-labelledby="crew-document-queue-title">
      <Card className="border-info-line bg-info-surface p-4">
        <h2 className="text-sm font-semibold text-info-text">Who checks these</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          Operations does. A partner uploads their crew member’s identity documents and cannot mark
          them as checked. Approving the required government ID clears the person for assignment;
          rejecting it takes the clearance away and sends your reason back to the partner.
        </p>
      </Card>

      <div
        role="tablist"
        aria-label="Crew document queues"
        className="mt-6 flex gap-1 border-b border-line"
      >
        {TABS.map((entry) => (
          <button
            key={entry.state}
            type="button"
            role="tab"
            aria-selected={tab === entry.state}
            onClick={() => {
              setTab(entry.state);
              setSearch("");
            }}
            className={
              tab === entry.state
                ? "-mb-px min-h-11 border-b-2 border-action px-4 text-sm font-semibold text-text"
                : "-mb-px min-h-11 border-b-2 border-transparent px-4 text-sm text-text-secondary hover:text-text"
            }
          >
            {entry.label}
          </button>
        ))}
      </div>

      {queue.isPending ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-text-secondary" aria-live="polite">
          <Spinner size="sm" />
          Loading crew records…
        </p>
      ) : queue.isError ? (
        <ErrorState
          className="mt-6"
          title="We could not load the crew document queue"
          message="Nothing has changed. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void queue.refetch()}
        />
      ) : (
        <>
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="crew-document-queue-title" className="text-base font-bold text-text">
                {tab === "PENDING" ? "Waiting for document checks" : "Already checked"}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                {tab === "PENDING"
                  ? `${allRows.length} ${allRows.length === 1 ? "person" : "people"} waiting, oldest first.`
                  : `${allRows.length} ${allRows.length === 1 ? "person" : "people"} cleared, most recent first.`}
              </p>
            </div>
            {allRows.length > 0 ? (
              <Field label="Search" className="w-full sm:w-72">
                <Input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Person or partner"
                  autoComplete="off"
                />
              </Field>
            ) : null}
          </div>

          {allRows.length === 0 ? (
            <EmptyState
              className="mt-4"
              title={
                tab === "PENDING"
                  ? "No crew documents are waiting"
                  : "Nobody has been checked yet"
              }
              description={
                tab === "PENDING"
                  ? "New active crew members appear here until an Operations reviewer checks them."
                  : "People cleared by Operations appear here, so a check that turns out to be wrong can be withdrawn."
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState
              compact
              className="mt-4"
              title="No matching crew members"
              description="Try a different person or partner name."
              action={
                <Button variant="outline" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <ul className="mt-4 grid list-none grid-cols-1 gap-3 p-0 lg:grid-cols-2">
              {rows.map((row) => (
                <li key={row.membership_id}>
                  <QueueCard
                    row={row}
                    tab={tab}
                    onReview={() => setReviewing(row)}
                    onCorrectGender={() => {
                      correctGender.reset();
                      setCorrecting(row);
                    }}
                    onWithdraw={() => {
                      verify.reset();
                      setWithdrawReason("");
                      setWithdrawing(row);
                    }}
                    onRecordOffline={() => {
                      verify.reset();
                      verify.mutate(
                        { membershipId: row.membership_id, verified: true, reason: "" },
                        {
                          onSuccess: () =>
                            toast.notify(`${row.crew_member_name}’s check is recorded.`),
                        },
                      );
                    }}
                    recording={verify.isPending}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <CrewDocumentReviewPanel
        row={reviewing}
        open={reviewing !== null}
        onOpenChange={(open) => {
          if (!open) setReviewing(null);
        }}
      />

      <CrewGenderCorrectionDialog
        key={correcting?.membership_id ?? "none"}
        row={correcting}
        open={correcting !== null}
        onOpenChange={(open) => {
          if (!open && !correctGender.isPending) {
            correctGender.reset();
            setCorrecting(null);
          }
        }}
        pending={correctGender.isPending}
        error={
          correctGender.isError ? describeError(correctGender.error, "mutation").message : null
        }
        onSubmit={(gender, reason) => {
          if (correcting === null) return;
          correctGender.mutate(
            { membershipId: correcting.membership_id, gender, reason },
            {
              onSuccess: () => {
                toast.notify(`${correcting.crew_member_name} is recorded as ${GENDER_LABELS[gender]?.toLowerCase() ?? gender}.`);
                setCorrecting(null);
              },
            },
          );
        }}
      />

      {/* Withdrawal is a reason-first dialog rather than a confirm, because the reason is not
          optional and a `ConfirmAction` whose primary button is disabled until a textarea is
          filled reads as broken. */}
      {withdrawing !== null ? (
        <Card className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-lg border-danger-line p-4 shadow-lg sm:inset-x-auto sm:right-6">
          <h2 className="text-sm font-bold text-text">
            Withdraw {withdrawing.crew_member_name}’s check?
          </h2>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            They stop being eligible for crew assignment immediately. If they are already named on
            an upcoming shift, {withdrawing.partner_name} will have to replace them. Your reason is
            recorded and sent to the partner.
          </p>
          <Field label="Why are you withdrawing it?" className="mt-3" required>
            <Input
              value={withdrawReason}
              onChange={(event) => setWithdrawReason(event.target.value)}
              placeholder="Their ID expired last month"
              autoComplete="off"
            />
          </Field>
          {verify.isError ? (
            <ErrorState
              inline
              severity="error"
              className="mt-3"
              title="We could not withdraw this check"
              message={describeError(verify.error, "mutation").message}
            />
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant="danger"
              loading={verify.isPending}
              loadingLabel="Withdrawing"
              disabled={withdrawReason.trim() === ""}
              onClick={() =>
                verify.mutate(
                  {
                    membershipId: withdrawing.membership_id,
                    verified: false,
                    reason: withdrawReason.trim(),
                  },
                  {
                    onSuccess: () => {
                      toast.notify(`${withdrawing.crew_member_name}’s check is withdrawn.`);
                      setWithdrawing(null);
                    },
                  },
                )
              }
            >
              Withdraw check
            </Button>
            <Button
              variant="ghost"
              disabled={verify.isPending}
              onClick={() => setWithdrawing(null)}
            >
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}
    </section>
  );
}

function QueueCard({
  row,
  tab,
  onReview,
  onCorrectGender,
  onWithdraw,
  onRecordOffline,
  recording,
}: {
  row: CrewVerificationRow;
  tab: QueueState;
  onReview: () => void;
  onCorrectGender: () => void;
  onWithdraw: () => void;
  onRecordOffline: () => void;
  recording: boolean;
}) {
  const hasFiles = row.documents_pending > 0 || row.documents_approved > 0;

  return (
    <Card className="flex h-full flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-text">{row.crew_member_name}</p>
          <p className="mt-0.5 text-sm text-text-secondary">{row.partner_name}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {tab === "VERIFIED" ? (
            <Badge tone="success">Checked</Badge>
          ) : row.documents_pending > 0 ? (
            <Badge tone="info">{row.documents_pending} to review</Badge>
          ) : (
            <Badge tone="warning">Nothing uploaded</Badge>
          )}
          {row.is_supervisor ? <Badge tone="neutral">Supervisor</Badge> : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
        <span>
          Added <time dateTime={row.added_at}>{ADDED_DATE.format(new Date(row.added_at))}</time>
        </span>
        <span>{GENDER_LABELS[row.gender] ?? row.gender}</span>
      </div>

      {/* The distinction the queue could not draw before. "Nothing uploaded" is the partner's
          move and no amount of reviewing will produce a document; a pending count is ours. */}
      {tab === "PENDING" && !hasFiles ? (
        <p className="text-xs leading-5 text-text-secondary">
          {row.partner_name} has not sent any identity documents for this person yet.
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2">
        {hasFiles ? (
          <Button variant="outline" onClick={onReview}>
            Open documents
          </Button>
        ) : null}
        {tab === "PENDING" && !hasFiles ? (
          <Button variant="ghost" loading={recording} loadingLabel="Recording" onClick={onRecordOffline}>
            Record an offline check
          </Button>
        ) : null}
        {tab === "VERIFIED" ? (
          <Button variant="ghost" onClick={onWithdraw}>
            Withdraw
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onCorrectGender}>
          Correct gender
        </Button>
      </div>
    </Card>
  );
}
