"use client";

import { describeError } from "@vsolve/query";
import { Badge, Button, Dialog, ErrorState, Skeleton } from "@vsolve/ui";
import { useState } from "react";

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
 * ## Erasure is confirmed, and the confirmation says what it costs
 *
 * Filing an erasure request is not itself destructive, but it starts something
 * the customer cannot take back from this screen, and the honest thing is to say
 * what happens next rather than to make it feel like a toggle.
 */

const KIND_COPY: Record<PrivacyRequestKind, { label: string; description: string }> = {
  ACCESS: {
    label: "Get a copy of my data",
    description:
      "We put together everything held against your account — your bookings, addresses, payments and the consents on record — and send it to you.",
  },
  ERASURE: {
    label: "Delete my data",
    description:
      "We remove what we are not required to keep. Records tax and consumer law require us to hold, such as invoices for completed work, stay until they expire.",
  },
};

const STATUS_TONE: Record<PrivacyStatus, "info" | "warning" | "success" | "danger"> = {
  RECEIVED: "info",
  IN_REVIEW: "warning",
  COMPLETED: "success",
  REJECTED: "danger",
};

const STATUS_LABEL: Record<PrivacyStatus, string> = {
  RECEIVED: "Received",
  IN_REVIEW: "In review",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
};

const STATUS_MEANING: Record<PrivacyStatus, string> = {
  RECEIVED: "We have your request and will start on it.",
  IN_REVIEW: "Someone is working through it now.",
  COMPLETED: "Finished. Check your messages for what we sent.",
  REJECTED: "We could not act on this one. Contact support and we will explain why.",
};

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
  const [confirming, setConfirming] = useState<PrivacyRequestKind | null>(null);

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
      await createRequest.mutateAsync(kind);
      setConfirming(null);
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
            ? "We will start removing what we are not required to keep. You cannot cancel this from here."
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
              {confirming === "ERASURE" ? "Request deletion" : "Request my data"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          {confirming === "ERASURE"
            ? "Bookings that are still going ahead are not cancelled by this. Cancel those first if that is what you want."
            : "This usually takes a few days. We will message you when it is ready."}
        </p>

        {createRequest.isError ? (
          <p role="alert" className="mt-3 text-sm font-medium text-danger-text">
            {describeError(createRequest.error, "mutation").message}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
