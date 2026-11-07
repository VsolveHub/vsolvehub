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

/**
 * The app screen a pushed website link points at, when this app has that screen.
 *
 * Django sends the web page's link (`https://partner.vsolvehub.com/dispatch/123`); the apps mirror
 * the web's routes, so its path is the app's path. Only paths under one of `appRoots` (the app's
 * top-level routes) count, so a link to a page the app lacks opens the notification panel instead
 * of a "not found" screen.
 */
export function pushedAppPath(url: unknown, appRoots: readonly string[]): string | null {
  if (typeof url !== "string" || url.trim() === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(url, "https://app.invalid");
  } catch {
    return null;
  }
  const root = `/${parsed.pathname.split("/")[1] ?? ""}`;
  return appRoots.includes(root) ? `${parsed.pathname}${parsed.search}` : null;
}
