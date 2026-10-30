// Ported from frontend/apps/customer/features/notifications/queries.ts
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiRequestError, request, type Schemas } from "@vsolve/api-client";
import {
  M2_FRESHNESS,
  cursorFromNextUrl,
  m2QueryKeys,
  shouldRetryM2Read,
} from "@vsolve/query/native";

import { getApiClient } from "@vsolve/mobile-core";

/**
 * The in-app notification bell — contract 1.34.0.
 *
 * Three calls: a count every authenticated screen holds open, a feed read when
 * somebody opens the panel, and one command that marks a notice — or all of
 * them — read. They are separate keys because they are read on completely
 * different rhythms, which `m2-keys.ts` already argues at the key itself; this
 * file is where that split turns into two different query configurations.
 *
 * ## Why the count polls and the feed does not
 *
 * A notice arrives because *something else* happened — a vendor accepted, a
 * stage came up for review, a payment failed. Nothing on the screen the
 * Customer is looking at causes it, so there is no local event to invalidate on
 * and no moment this app can name at which the badge becomes wrong. That is the
 * definition of a read that has to be asked for on a timer.
 *
 * The feed is the opposite. It is read at a moment a person chooses — the press
 * that opens the panel — and the panel is closed the rest of the time. Polling
 * a list nobody is looking at is the pure-waste case `polling.ts` opens with.
 *
 * ## Why `boundedPoll` did not fit the count, and what is used instead
 *
 * `boundedPoll` requires an `isSettled` predicate, and its own docblock states
 * the rule that predicate enforces: *"A screen that cannot say when it is
 * finished should not be polling."* Every other poller in this app can — an
 * unlock reaches `ACTIVE`, a booking group reaches `BOOKED`, and the poll stops
 * because the server's answer can no longer change on its own.
 *
 * **A feed is never settled.** There is no value of `unread` that means "no
 * further notice will ever arrive", including zero — zero is the most likely
 * moment for the next one. Supplying `isSettled: () => false` to satisfy the
 * type would be writing a predicate that lies about the one thing the parameter
 * exists to state, and it would silently inherit the failure backoff too, so a
 * flapping endpoint would push the badge to a minute behind and nothing in the
 * call site would say so.
 *
 * So this is the one read in the app that takes a plain `refetchInterval`, and
 * it takes the interval `boundedPoll` would have capped at — `MAX_POLL_INTERVAL_MS`,
 * one minute — rather than a base it would have started from. A badge is an
 * ambient hint, not a countdown: nobody is waiting on it, so a notice that
 * appears up to a minute late costs nothing, while a ten-second poll running on
 * every authenticated screen for the whole session is a load source with no
 * reader.
 *
 * `refetchIntervalInBackground: false` for exactly the reason `polling.ts`
 * gives: a backgrounded tab cannot show anyone a badge, and it is the tab most
 * likely to be on a metered connection. `refetchOnWindowFocus` comes in with
 * the freshness tier, so returning to the tab is what makes the catch-up
 * immediate rather than one interval late.
 */

export type Notification = Schemas["Notification"];
export type NotificationPage = Schemas["NotificationPage"];
export type UnreadNotificationCount = Schemas["UnreadNotificationCount"];

/**
 * `404 notification_not_found` — this notice is not this person's, or is gone.
 *
 * Read rather than retried. The mark-read view resolves ownership through the
 * recipient, so a `404` is "never yours" as much as "no longer there", and
 * neither becomes true on a second attempt. A panel that hits it should re-read
 * the feed rather than keep offering the row.
 */
export function isNotificationNotFound(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.code === "notification_not_found" || error.status === 404)
  );
}

/**
 * The unread badge — the only polled read in this feature.
 *
 * `enabled` is the session gate and it is the caller's to supply: this hook has
 * no opinion about whether somebody is signed in, and the header must not start
 * a minute-long poll against a `403` for an anonymous visitor.
 *
 * Deliberately **not** `keepPreviousData` or a placeholder of `0`. While this is
 * pending the count is genuinely unknown, and `unreadBadgeLabel(null)` is what
 * renders that honestly. A placeholder zero would tell somebody nothing is
 * waiting during exactly the window in which we have not asked.
 */
export function useUnreadNotificationCount(enabled = true) {
  return useQuery({
    queryKey: m2QueryKeys.notifications.unreadCount(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/notifications/unread-count/")),
    enabled,
    ...M2_FRESHNESS.notificationCount,
    // See the module header: a feed is never settled, so `boundedPoll` and its
    // required `isSettled` predicate cannot describe this read truthfully.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: shouldRetryM2Read,
  });
}

/**
 * The notices themselves, page by page.
 *
 * Not polled — see the module header. `enabled` is what makes this a read that
 * happens when the panel opens rather than on every mount of the header, which
 * is the whole reason the count is a separate endpoint.
 *
 * Cursor-paged through the same pattern as `features/bookings/queries.ts`:
 * `next` is never raw-fetched, and `cursorFromNextUrl` is validated **while the
 * page is being accepted** rather than only in `getNextPageParam`. A contract
 * failure there would leave a truncated feed looking complete, which on this
 * surface means a notice about money the Customer never sees and has no reason
 * to suspect exists.
 */
export function useNotificationFeed(enabled = true) {
  return useInfiniteQuery({
    queryKey: m2QueryKeys.notifications.feed(),
    queryFn: async ({ pageParam }) => {
      const page = await request(() =>
        getApiClient().GET("/api/v1/notifications/", {
          params: { query: { ...(pageParam ? { cursor: pageParam } : {}) } },
        }),
      );
      cursorFromNextUrl(page.next);
      return page;
    },
    initialPageParam: "" as string,
    getNextPageParam: (lastPage) => cursorFromNextUrl(lastPage.next),
    enabled,
    ...M2_FRESHNESS.notificationFeed,
    retry: shouldRetryM2Read,
  });
}

/**
 * Marking one notice read, or every notice read.
 *
 * The two shapes are the wire body's own: `{notification_id}` names one notice,
 * `{all: true}` clears the lot. `all` is a required field on the request
 * schema, so the one-notice branch sends `all: false` explicitly rather than
 * relying on a default the contract does not promise.
 */
export type MarkNotificationReadInput =
  | { all: false; notificationId: string }
  | { all: true };

/**
 * Marks a notice read — `POST /api/v1/notifications/read/`.
 *
 * ## Why the response replaces the count rather than invalidating it
 *
 * The server answers with the authoritative `{unread}` *after* the write, so
 * writing it straight onto the count key is applying server truth, not
 * predicting it. An invalidation here would spend a round trip re-asking a
 * question the response just answered, and would leave the badge showing the
 * pre-write number for the width of that trip — the one moment a person is
 * looking at it, because they just acted.
 *
 * Nothing is optimistically decremented. A local guess at the new count is a
 * fake count the moment the request is refused, and this is the badge: the
 * number that tells somebody whether to keep looking.
 *
 * The feed **is** invalidated, because the row's `read_at` changed and that
 * value is not in this response.
 *
 * ## No auto-retry
 *
 * `retry: false` because the only refusal this command has is
 * `notification_not_found`, and it does not change on a resend — the notice is
 * gone or was never this person's either way. Retrying would delay the honest
 * outcome, which is to re-read the feed and stop offering the row.
 *
 * ## Why there is no idempotency key
 *
 * Because the endpoint does not need one, and sending one would claim a
 * guarantee that does not exist. `notification_mark_read` is published with
 * `header?: never` — Django reads no `Idempotency-Key` here — and it does not
 * have to: the command is idempotent **by state**. Marking one notice read
 * keeps the *first* `read_at` rather than moving it, and "mark all read" only
 * touches rows that are still unread. Pressing twice, or a retried request
 * landing twice, settles on exactly the same rows and the same timestamps.
 *
 * That is also why this takes no `newestNotificationId` bound. A key would have
 * needed one — a scope-stable key replays its first stored response, handing
 * back a stale count while newer notices sat unread — but that is a problem a
 * key creates, not one the server has.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MarkNotificationReadInput) =>
      request(() =>
        getApiClient().POST("/api/v1/notifications/read/", {
          body: input.all
            ? { all: true }
            : { all: false, notification_id: input.notificationId },
        }),
      ),
    onSuccess: (count: UnreadNotificationCount) => {
      queryClient.setQueryData(m2QueryKeys.notifications.unreadCount(), count);
      void queryClient.invalidateQueries({ queryKey: m2QueryKeys.notifications.feed() });
    },
    // A refused mark-read means the world moved — the notice was withdrawn, or
    // this session is not who we thought. Re-read rather than keep the row.
    onError: (err) => {
      console.warn("[notifications] Failed to mark as read, re-fetching feed:", err);
      void queryClient.invalidateQueries({ queryKey: m2QueryKeys.notifications.feed() });
    },
    retry: false,
  });
}
