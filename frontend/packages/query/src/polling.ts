/**
 * Bounded observation polling.
 *
 * ## What polling is for here, and what it is not for
 *
 * Celery owns every deadline in this system: offer expiry, the Partner undo
 * window, the group search timeout, payment holds. A browser that polls is
 * *watching* that happen — it never causes it. This distinction is the whole
 * reason this module exists rather than a bare `refetchInterval`:
 *
 *  - A poll that stops does not stop the booking. Closing the tab, losing the
 *    network, backgrounding the app on a phone — none of these change what the
 *    server does next, so pausing aggressively costs nothing but load.
 *  - A poll that keeps running forever is pure waste. Terminal state is terminal;
 *    asking again cannot change the answer.
 *  - A poll that hammers a failing endpoint turns one outage into two. Backoff is
 *    not politeness, it is what stops a recovering server being re-flattened by
 *    every client that was waiting on it.
 *
 * ## Why this is not `refetchInterval` on its own
 *
 * TanStack's `refetchInterval` accepts a function, so the pieces are all there;
 * what it does not give you is a shared *policy*. Written inline at each call
 * site, one screen ends up polling a settled booking every five seconds forever
 * and nobody notices, because nothing about it looks wrong. Naming the policy
 * once makes "does this stop?" a question with one answer.
 */

import { RECOVERY_POLL_INTERVAL } from "./freshness";

/** Ceiling for backed-off intervals. Past this, a person will refresh. */
const MAX_POLL_INTERVAL_MS = 60_000;

export interface PollPolicyInput<TData> {
  /** Base interval when everything is healthy. */
  intervalMs?: number;
  /**
   * True once the server's answer can no longer change on its own.
   *
   * Returning true here is what makes a poller finite. A screen that cannot say
   * when it is finished should not be polling.
   */
  isSettled: (data: TData) => boolean;
  /** Consecutive failures, from TanStack's query state. */
  failureCount: number;
}

/**
 * Milliseconds until the next poll, or `false` to stop.
 *
 * Backoff doubles per consecutive failure and is capped, so a server that is
 * down sees each client fall back to once a minute rather than every client
 * retrying in lockstep at the base interval.
 */
export function nextPollDelay<TData>(
  data: TData | undefined,
  input: PollPolicyInput<TData>,
): number | false {
  const base = input.intervalMs ?? RECOVERY_POLL_INTERVAL;

  if (data !== undefined && input.isSettled(data)) return false;
  if (input.failureCount === 0) return base;

  return Math.min(base * 2 ** input.failureCount, MAX_POLL_INTERVAL_MS);
}

export interface BoundedPollOptions<TData> {
  intervalMs?: number;
  isSettled: (data: TData) => boolean;
}

/**
 * The polling half of a query's options.
 *
 * Spread into `useQuery` alongside a freshness tier:
 *
 * ```ts
 * useQuery({
 *   queryKey: …,
 *   queryFn: …,
 *   ...EXPIRING_STATE,
 *   ...boundedPoll({ isSettled: (group) => isTerminal(group.status) }),
 * });
 * ```
 *
 * `refetchIntervalInBackground` is deliberately `false`. A backgrounded tab
 * cannot show anyone anything, and on a phone it is the tab most likely to be
 * polling on a metered connection. It catches up on focus, which is exactly when
 * someone is there to read it — and `refetchOnWindowFocus` from the freshness
 * tier is what makes that catch-up immediate rather than one interval late.
 */
export function boundedPoll<TData>(options: BoundedPollOptions<TData>) {
  return {
    refetchInterval: (query: {
      state: { data: TData | undefined; fetchFailureCount: number };
    }) =>
      nextPollDelay(query.state.data, {
        intervalMs: options.intervalMs,
        isSettled: options.isSettled,
        failureCount: query.state.fetchFailureCount,
      }),
    refetchIntervalInBackground: false,
  } as const;
}
