"use client";

import { ApiRequestError, request, type Schemas } from "@vsolve/api-client";
import { M2_FRESHNESS, m2QueryKeys } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The in-app notification feed and its badge (contract 1.34.0).
 *
 * Three reads and one command, all of them user-scoped rather than
 * Partner-scoped: `GET /api/v1/notifications/` answers for whoever the session
 * belongs to, so nothing here passes a partner id and nothing here is workspace
 * gated. What a notice is *about* may be an A3 booking or an A5 project; who it
 * is *for* is a person.
 *
 * ## Two keys for one feature, and why they are not one
 *
 * `m2QueryKeys.notifications.unreadCount()` and `.feed()` sit under the same root
 * and are never fetched together. The badge is live on every authenticated screen
 * for the whole session; the list is read once, when somebody opens the panel. A
 * single key would make the cheap read pay the expensive read's cost on every
 * poll — twenty rendered rows fetched to draw one digit — and it would make the
 * panel's own refetch reset the badge's interval.
 *
 * ## Why there is no second `EventSource` here
 *
 * The A1 offer inbox already holds one open (`features/offers/live-events.ts`),
 * and each SSE stream pins a WSGI worker thread for up to five minutes. A second
 * stream per Partner tab would double that cost to make a badge one minute
 * fresher, which is not a trade this feature earns. If notifications ever want to
 * be live, the honest path is a *purpose* multiplexed onto the existing offer
 * stream, not a second connection beside it.
 *
 * ## The command has no idempotency key, and does not need one
 *
 * `POST /notifications/read/` sets `read_at` — a one-way move to a value that is
 * already set on the second call. It is naturally idempotent, which is exactly
 * why `retry: false` below is still correct: a retry would be *safe*, but a
 * failure here is not worth re-driving automatically, because the honest recovery
 * is to re-read the feed and see what is actually unread.
 */

export type Notification = Schemas["Notification"];
export type NotificationPage = Schemas["NotificationPage"];
export type UnreadNotificationCount = Schemas["UnreadNotificationCount"];

/* ---------------------------------------------------------------------------
   Reads
   --------------------------------------------------------------------------- */

/**
 * A read that a lapsed session must not keep re-driving.
 *
 * Shared by both reads below rather than written twice. `401` and `403` are
 * answers, not failures: the session ended or this account cannot read the feed,
 * and asking twice more walks into the same refusal while the shell is already
 * navigating to login. Everything else gets two attempts, because a badge that
 * gives up on one flaky request stays blank for the rest of the session.
 */
function retryUnlessRefused(failureCount: number, error: unknown): boolean {
  return error instanceof ApiRequestError && [401, 403].includes(error.status)
    ? false
    : failureCount < 2;
}

/**
 * The unread badge. **The polled one**, and the only poll this feature runs.
 *
 * `VOLATILE_STATE` through `M2_FRESHNESS.notificationCount`: nothing about a
 * count expires server-side, so treating it as immediately stale and refetching
 * on focus is the whole freshness requirement.
 *
 * ## Why this is a bare `refetchInterval` and not `boundedPoll`
 *
 * `boundedPoll` is the shared policy and it is the right default everywhere it
 * fits. It does not fit here, for the reason its own `isSettled` contract states:
 * *"A screen that cannot say when it is finished should not be polling."* A feed
 * has no finished. Every other M2 poller watches one aggregate converge on a
 * terminal status — an offer is answered, a payment clears, a stage is approved —
 * and stops. A notification count is not converging on anything: it goes back up
 * whenever anyone else in the system does something, and the arrival that matters
 * most is the one that lands while the Partner is staring at the screen.
 *
 * There is no honest `isSettled` to supply. `unread === 0` is the tempting one
 * and it is precisely backwards: zero unread is the *most* likely state and the
 * one where a new notice is most worth seeing, so a poller that stopped there
 * would be silent for exactly the Partners who are up to date. Passing
 * `() => false` instead would satisfy the type and defeat the abstraction — a
 * "bounded" poll that is documented as finite and provably is not, which is a
 * worse lie than not using it.
 *
 * What is deliberately kept from that module: `refetchIntervalInBackground: false`,
 * for its reason unchanged — a backgrounded tab cannot show anyone anything, and
 * on a phone it is the tab most likely to be polling on a metered connection. It
 * catches up on focus, and the tier's `refetchOnWindowFocus` makes that catch-up
 * immediate rather than a minute late.
 *
 * Sixty seconds, not fifteen. Nothing in this feed carries a clock the Partner
 * answers against — every deadline-bearing surface (crew offers, enquiries,
 * stages) already polls itself at its own rate. This is a "you have mail" light
 * on every screen in the app for the whole session, so the interval is the
 * ceiling `boundedPoll` backs failures off to rather than the base it starts from.
 */
export function useUnreadNotificationCount(enabled = true) {
  return useQuery({
    queryKey: m2QueryKeys.notifications.unreadCount(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/notifications/unread-count/")),
    enabled,
    ...M2_FRESHNESS.notificationCount,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: retryUnlessRefused,
  });
}

/**
 * The feed itself. **Not polled** — fetched when the panel opens.
 *
 * `enabled` is the panel's open state, so a Partner who never opens the bell
 * never pays for this request. The badge is what tells them whether opening it is
 * worth anything.
 *
 * Polling it would be waste with a sharp edge: the panel is a modal sheet, and a
 * list refetching underneath somebody's thumb re-orders rows between the tap
 * starting and landing. `refetchOnWindowFocus` from `VOLATILE_STATE` still
 * applies, which covers the one case that matters — coming back to a tab left
 * open with the panel on screen.
 *
 * ## Page one only, and the panel says so
 *
 * The endpoint is cursor-paginated and publishes a `cursor` parameter, but this
 * is a `useQuery` rather than a `useInfiniteQuery` on purpose: a bell panel is a
 * recent-activity surface, not an archive. The newest notices are on the first
 * page, so nothing waiting on the Partner is behind the cursor — and the panel
 * renders the truncation honestly when `next` is non-null rather than letting a
 * capped list read as a complete history.
 */
export function useNotificationFeed(enabled = true) {
  return useQuery({
    queryKey: m2QueryKeys.notifications.feed(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/notifications/")),
    enabled,
    ...M2_FRESHNESS.notificationFeed,
    retry: retryUnlessRefused,
  });
}

/* ---------------------------------------------------------------------------
   The one command
   --------------------------------------------------------------------------- */

/**
 * Either one notice, or the whole inbox. Never both, never neither.
 *
 * A union rather than two optional fields, because the serializer refuses
 * "neither" and "both" with a `400` — `MarkNotificationReadRequestSerializer`
 * validates exactly that — and a shape that can express a refused request is a
 * shape a caller can build by accident.
 */
export type MarkNotificationReadInput =
  | { readonly notificationId: string }
  | { readonly all: true };

/**
 * Mark a notice read, or all of them.
 *
 * ## The response is written straight onto the badge, and that is not a cache lie
 *
 * `POST /notifications/read/` answers with the recomputed `{unread}` — the same
 * body the count endpoint sends — so `setQueryData` here is not the client
 * *guessing* a decremented number, it is storing the server's own answer under
 * the key that answer belongs to. Doing it any other way costs a visible wrong
 * badge: invalidating the count instead leaves the old digit on screen for a
 * round trip after the Partner watched the row go read, which reads as the tap
 * not having worked and is how somebody taps it again.
 *
 * The feed is invalidated rather than patched, because the response says nothing
 * about the rows. `read_at` is a server timestamp and the ordering is the
 * server's; writing a locally invented one in would put two authorities on one
 * field.
 *
 * ## `retry: false`
 *
 * Not for the usual reason — this command *is* naturally idempotent, so a replay
 * would be safe. It is off because an automatic retry would hide the one failure
 * worth showing: if marking read did not land, the badge and the row must stay
 * as they were, so the Partner's next read of the feed is the truth rather than
 * an optimistic screen that quietly disagrees with the server.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MarkNotificationReadInput) =>
      request(() =>
        getApiClient().POST("/api/v1/notifications/read/", {
          // `all` is required by the serializer at both ends of the union, so the
          // false is sent explicitly rather than left to a default this client
          // cannot see.
          body:
            "all" in input
              ? { all: true }
              : { notification_id: input.notificationId, all: false },
        }),
      ),
    onSuccess: async (count) => {
      queryClient.setQueryData(m2QueryKeys.notifications.unreadCount(), count);
      await queryClient.invalidateQueries({ queryKey: m2QueryKeys.notifications.feed() });
    },
    retry: false,
  });
}

/* ---------------------------------------------------------------------------
   Refusals worth naming
   --------------------------------------------------------------------------- */

/**
 * The notice is not this person's, or no longer exists.
 *
 * Mapped to `retry` in the frozen `errors.ts` table, and the reasoning there is
 * the reasoning here: the only ways to meet this are a notice belonging to
 * somebody else and a notice that has since been removed, and re-reading the feed
 * is the entire fix in both cases. Support has nothing to add, so this must not
 * be worded as an account problem — it is a stale row on screen, and the panel
 * says so and refetches.
 */
export function isNotificationNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "notification_not_found";
}
