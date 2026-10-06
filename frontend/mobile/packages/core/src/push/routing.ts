export interface PushTarget {
  kind: string;
  id: string;
}

export interface PushData {
  notification_id?: string;
  purpose?: string;
  target?: PushTarget | null;
}

/**
 * The app supplies `resolveHref`, which is the same mapping as the web feed.
 * A missing or unknown target opens the fallback (the notification panel).
 */
export function routePushData(
  data: PushData | null | undefined,
  resolveHref: (target: PushTarget) => string | null,
  fallback: string,
): string {
  if (!data?.target) return fallback;
  return resolveHref(data.target) ?? fallback;
}
