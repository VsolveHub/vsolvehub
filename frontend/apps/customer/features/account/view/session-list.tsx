"use client";

import { describeError, useRevokeSession, useSessionDevices } from "@vsolve/query";
import type { UserSession } from "@vsolve/query";
import { Badge, Button, Dialog, EmptyState, ErrorState, Skeleton } from "@vsolve/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { getApiClient } from "@/lib/api/browser";

import { Moment } from "./chrome";

/**
 * Where this account is signed in, and how to end a session.
 *
 * The hooks come from `@vsolve/query` rather than a local copy: `useRevokeSession`
 * already knows the one thing that makes this screen dangerous to reimplement —
 * revoking *your own* session is a sign-out, so it clears the cache and tells
 * sibling tabs, while revoking another device only invalidates the list. Writing
 * that again here would eventually get it wrong in the direction where a person
 * signs themselves out of a tab that keeps rendering their data.
 *
 * ## Signing yourself out is a different question, so it is asked differently
 *
 * Both actions are a `DELETE` on the same path, but "end this session on my
 * phone" and "sign me out right now" are not the same decision. The current
 * session is set apart, labelled, and its confirmation says what will actually
 * happen — otherwise the first person to tidy up their device list ends up
 * logged out with no idea why.
 */

function deviceName(session: UserSession): string {
  // `device_label` is nullable and, in practice, often a user-agent string we
  // did not parse. An unlabelled session is still a real session, so it gets an
  // honest name rather than being hidden.
  return session.device_label?.trim() || "Unrecognised device";
}

function SessionRow({
  session,
  onRevoke,
}: {
  session: UserSession;
  onRevoke: () => void;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-line py-4 last:border-b-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-text">{deviceName(session)}</h3>
          {session.is_current ? <Badge tone="info">This device</Badge> : null}
          {session.active_role ? (
            <Badge tone="neutral">Acting as {session.active_role}</Badge>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-text-muted">
          Signed in <Moment value={session.created_at} /> · Last used{" "}
          <Moment value={session.last_seen_at} />
        </p>
        <p className="text-xs text-text-muted">
          Ends <Moment value={session.expires_at} />
        </p>
      </div>

      <Button variant={session.is_current ? "outline" : "ghost"} onClick={onRevoke}>
        {session.is_current ? "Sign out here" : "End session"}
      </Button>
    </li>
  );
}

export function SessionList() {
  const apiClient = getApiClient();
  const sessionsQuery = useSessionDevices(apiClient);
  const revokeSession = useRevokeSession(apiClient);
  const router = useRouter();
  const [confirming, setConfirming] = useState<UserSession | null>(null);

  async function confirmRevoke() {
    if (!confirming) return;
    try {
      await revokeSession.mutateAsync({
        sessionId: confirming.id,
        // Drives the difference between "sign out and clear everything" and
        // "drop one row". Read from the server's own flag, never guessed.
        isCurrent: confirming.is_current,
      });
      setConfirming(null);
      if (confirming.is_current) {
        router.replace("/login");
        router.refresh();
      }
    } catch {
      // Kept open with the reason. A dialog that closes on failure claims the
      // session ended when it did not.
    }
  }

  if (sessionsQuery.isPending) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 2 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (sessionsQuery.isError) {
    return (
      <ErrorState
        title="We could not load your devices"
        message={describeError(sessionsQuery.error, "read").message}
        actionLabel="Try again"
        onAction={() => void sessionsQuery.refetch()}
        reference={describeError(sessionsQuery.error, "read").reference}
      />
    );
  }

  const sessions = sessionsQuery.data ?? [];

  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No other sessions"
        description="You are signed in on this device only."
      />
    );
  }

  // The current device first: it is the one being read from, and it is the one
  // whose action needs the most care.
  const ordered = [...sessions].sort((left, right) =>
    left.is_current === right.is_current ? 0 : left.is_current ? -1 : 1,
  );

  return (
    <div>
      <ul className="flex flex-col">
        {ordered.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            onRevoke={() => setConfirming(session)}
          />
        ))}
      </ul>

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && !revokeSession.isPending) {
            setConfirming(null);
            revokeSession.reset();
          }
        }}
        title={confirming?.is_current ? "Sign out on this device?" : "End this session?"}
        description={
          confirming?.is_current
            ? "You will be signed out here straight away and will need to log in again."
            : "That device will be signed out. Anything in progress there stops."
        }
        dismissable={!revokeSession.isPending}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirming(null);
                revokeSession.reset();
              }}
              disabled={revokeSession.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => void confirmRevoke()}
              loading={revokeSession.isPending}
              loadingLabel="Ending session"
            >
              {confirming?.is_current ? "Sign out" : "End session"}
            </Button>
          </>
        }
      >
        {confirming ? (
          <div className="rounded-control border border-line bg-surface-sunken px-3 py-2.5">
            <p className="text-sm font-semibold text-text">{deviceName(confirming)}</p>
            <p className="mt-0.5 text-xs text-text-muted">
              Last used <Moment value={confirming.last_seen_at} />
            </p>
          </div>
        ) : null}

        {revokeSession.isError ? (
          <p role="alert" className="mt-3 text-sm font-medium text-danger-text">
            {describeError(revokeSession.error, "mutation").message}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
