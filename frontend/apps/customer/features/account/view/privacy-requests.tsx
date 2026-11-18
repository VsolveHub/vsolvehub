"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { describeError, useLogout } from "@vsolve/query";
import { Badge, Button, Dialog, ErrorState, Skeleton } from "@vsolve/ui";
import { useState } from "react";

import { getApiClient } from "@/lib/api/browser";

import {
  isRequestOpen,
  useCreatePrivacyRequest,
  usePrivacyRequests,
  type PrivacyRequest,
  type PrivacyRequestKind,
  type PrivacyStatus,
} from "../queries";
import { Moment } from "./chrome";

/**
 * Access and erasure requests.
 *
 * ## Status is read, never derived
 *
 * Django publishes `status` and `completed_at` separately, and it would be easy
 * to render one from the other — a `completed_at` obviously means completed, a
 * null one obviously means pending. It is the same mistake as inferring a
 * booking's `recovery_action` from its `status`: a second implementation of a
 * rule the server owns, which is wrong the first time they disagree. `REJECTED`
 * is exactly that case — it is finished, and it has no completion.
 *
 * ## Erasure closes the account, and the confirmation says so
 *
 * Filing an erasure request closes the account at once: Django signs the person
 * out everywhere and keeps this session only for a few minutes, and the account
 * is erased 30 days later unless they sign in again
 * (`backend/apps/identity/account_deletion.py`). So a success is followed by the
 * date and a sign-out, never by the page carrying on as if nothing happened.
 */

const KIND_COPY: Record<PrivacyRequestKind, { label: string; description: string }> = {
  ACCESS: {
    label: "Get a copy of my data",
    description:
      "We put together everything held against your account — your bookings, addresses, payments and the consents on record — and send it to you.",
  },
  ERASURE: {
    label: "Delete my account",
    description:
      "Your account closes now and is deleted after 30 days. Sign in again before then to keep it. Invoices and payment records that tax and consumer law require are kept, without your name.",
  },
};

const STATUS_TONE: Record<PrivacyStatus, "info" | "warning" | "success" | "danger"> = {
  RECEIVED: "info",
  IN_REVIEW: "warning",
  COMPLETED: "success",
  REJECTED: "danger",
  CANCELLED: "info",
};

const STATUS_LABEL: Record<PrivacyStatus, string> = {
  RECEIVED: "Received",
  IN_REVIEW: "In review",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

const STATUS_MEANING: Record<PrivacyStatus, string> = {
  RECEIVED: "We have your request and will start on it.",
  IN_REVIEW: "Someone is working through it now.",
  COMPLETED: "Finished. Check your messages for what we sent.",
  REJECTED: "We could not act on this one. Contact support and we will explain why.",
  CANCELLED: "You signed in again, so we kept your account.",
};

/** "18 Dec 2026", in India's time zone. */
function deletionDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(
    new Date(value),
  );
}

function RequestRow({ privacyRequest }: { privacyRequest: PrivacyRequest }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line py-4 last:border-b-0">
      <div className="min-w-0 max-w-prose">
        <h3 className="text-sm font-semibold text-text">
          {KIND_COPY[privacyRequest.kind]?.label ?? privacyRequest.kind}
        </h3>
        <p className="mt-0.5 text-sm text-text-secondary">
          {STATUS_MEANING[privacyRequest.status]}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Asked for <Moment value={privacyRequest.requested_at} />
          {privacyRequest.completed_at ? (
            <>
              {" · Finished "}
              <Moment value={privacyRequest.completed_at} />
            </>
          ) : null}
        </p>
      </div>
      <Badge tone={STATUS_TONE[privacyRequest.status]}>
        {STATUS_LABEL[privacyRequest.status]}
      </Badge>
    </li>
  );
}

export function PrivacyRequests() {
  const requestsQuery = usePrivacyRequests();
  const createRequest = useCreatePrivacyRequest();
  const logout = useLogout(getApiClient());
  const [confirming, setConfirming] = useState<PrivacyRequestKind | null>(null);
  // Set once a deletion is filed: the account is closed, so the person is told the date and
  // signed out from here.
  const [closedUntil, setClosedUntil] = useState<string | null>(null);

  const requests = requestsQuery.data ?? [];

  /**
   * An open request of the same kind blocks a second one.
   *
   * Django does not refuse a duplicate, so this is the client being considerate
   * rather than enforcing a rule: somebody who does not see a result yet will
   * press the button again, and three identical erasure requests in the queue
   * help nobody. The reason is shown next to the disabled control.
   */
  function openRequestOf(kind: PrivacyRequestKind): PrivacyRequest | undefined {
    return requests.find((item) => item.kind === kind && isRequestOpen(item));
  }

  async function file(kind: PrivacyRequestKind) {
    try {
      const created = await createRequest.mutateAsync(kind);
      setConfirming(null);
      if (kind === "ERASURE") setClosedUntil(created.scheduled_for ?? created.requested_at);
    } catch {
      // The dialog stays open and shows the reason.
    }
  }

  if (requestsQuery.isPending) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (requestsQuery.isError) {
    return (
      <ErrorState
        title="We could not load your privacy requests"
        message={describeError(requestsQuery.error, "read").message}
        actionLabel="Try again"
        onAction={() => void requestsQuery.refetch()}
        reference={describeError(requestsQuery.error, "read").reference}
      />
    );
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(KIND_COPY) as PrivacyRequestKind[]).map((kind) => {
          const open = openRequestOf(kind);

          return (
            <div
              key={kind}
              className="flex flex-col justify-between rounded-card border border-line bg-surface-sunken p-4"
            >
              <div>
                <h3 className="text-sm font-semibold text-text">{KIND_COPY[kind].label}</h3>
                <p className="mt-1 text-sm text-text-secondary">
                  {KIND_COPY[kind].description}
                </p>
              </div>
              <div className="mt-4">
                <Button
                  variant={kind === "ERASURE" ? "outline" : "secondary"}
                  disabled={Boolean(open)}
                  onClick={() => setConfirming(kind)}
                >
                  {KIND_COPY[kind].label}
                </Button>
                {open ? (
                  <p className="mt-2 text-xs text-text-muted">
                    Already asked for on <Moment value={open.requested_at} dateOnly />. We
                    will come back to you.
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-text">Requests you have made</h3>
        {requests.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">
            You have not asked for anything yet. Requests you make will be listed
            here with their progress.
          </p>
        ) : (
          <ul className="mt-1 flex flex-col">
            {requests.map((privacyRequest) => (
              <RequestRow key={privacyRequest.id} privacyRequest={privacyRequest} />
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && !createRequest.isPending) {
            setConfirming(null);
            createRequest.reset();
          }
        }}
        title={confirming ? KIND_COPY[confirming].label : ""}
        description={
          confirming === "ERASURE"
            ? "Your account closes now: you are signed out everywhere. We delete it 30 days later, unless you sign in again before then."
            : "We will put your data together and send it to you."
        }
        dismissable={!createRequest.isPending}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirming(null);
                createRequest.reset();
              }}
              disabled={createRequest.isPending}
            >
              Cancel
            </Button>
            <Button
              variant={confirming === "ERASURE" ? "danger" : "primary"}
              onClick={() => confirming && void file(confirming)}
              loading={createRequest.isPending}
              loadingLabel="Sending your request"
            >
              {confirming === "ERASURE" ? "Delete my account" : "Request my data"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          {confirming === "ERASURE"
            ? "Bookings that are still going ahead must be finished or cancelled first. Wallet money left over is settled before deletion."
            : "This usually takes a few days. We will message you when it is ready."}
        </p>

        {createRequest.isError ? (
          <p role="alert" className="mt-3 text-sm font-medium text-danger-text">
            {createRequest.error instanceof ApiRequestError &&
            createRequest.error.code === "account_deletion_open_work"
              ? "You have bookings that are still going ahead. Finish or cancel them first, then delete your account."
              : describeError(createRequest.error, "mutation").message}
          </p>
        ) : null}
      </Dialog>

      <Dialog
        open={closedUntil !== null}
        onOpenChange={() => logout.mutate()}
        title="Your account is closed"
        footer={
          <Button onClick={() => logout.mutate()} loading={logout.isPending} loadingLabel="Signing out">
            Sign out
          </Button>
        }
      >
        <p className="text-sm text-text-secondary">
          {closedUntil
            ? `We will delete it on ${deletionDate(closedUntil)}. Changed your mind? Sign in again before then and your account stays.`
            : null}
        </p>
      </Dialog>
    </div>
  );
}
