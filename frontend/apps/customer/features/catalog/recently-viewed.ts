/**
 * The services this browser has looked at, most recent first.
 *
 * ## Why the browser and not the server
 *
 * Browsing is the one part of this app that works signed out, and it is where
 * most people arrive. A server-side history would mean either asking someone to
 * sign in before the catalogue is useful, or minting a tracking identity for a
 * visitor who has not asked for an account. Neither is worth a convenience
 * strip. `localStorage` keeps the list on the device that made it, ends when
 * the person clears their browser, and never reaches Vsolve.
 *
 * ## What it is allowed to hold
 *
 * Slug, name and href — enough to render a link, and nothing that goes stale
 * into a lie. Deliberately **not** the price: a stored `starting_price` is a
 * number the catalogue has since changed, and quoting yesterday's rate from a
 * cache on the device is exactly the drift the contract boundary exists to
 * prevent. The strip links to the service; the service page prices it.
 */

const STORAGE_KEY = "vsolve:recently-viewed-services";

/**
 * Six. Two rows on a phone, one on a desktop — enough to be a shortcut and
 * short enough that the strip never competes with the catalogue itself.
 */
export const RECENTLY_VIEWED_LIMIT = 6;

export interface ViewedService {
  slug: string;
  name: string;
  href: string;
}

/** Whether a parsed value is a record this module wrote. */
function isViewedService(value: unknown): value is ViewedService {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.slug === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.href === "string"
  );
}

/**
 * Moves `entry` to the front, de-duplicating on slug and trimming to the limit.
 *
 * Pure, and separate from storage, because the ordering is the only part with a
 * rule worth testing: viewing something already in the list must move it rather
 * than add a second copy.
 */
export function withViewed(
  history: readonly ViewedService[],
  entry: ViewedService,
  limit: number = RECENTLY_VIEWED_LIMIT,
): ViewedService[] {
  const rest = history.filter((viewed) => viewed.slug !== entry.slug);
  return [entry, ...rest].slice(0, limit);
}

/**
 * Parses a stored value, tolerating anything.
 *
 * Storage is shared with every other script on the origin and survives deploys,
 * so the value can be absent, truncated, from an older shape, or simply not
 * ours. Every one of those is "no history" — a browse convenience must never be
 * able to throw on a page someone is trying to read.
 */
function parseViewed(raw: string | null): ViewedService[] {
  if (raw === null) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const entries = parsed.filter(isViewedService).slice(0, RECENTLY_VIEWED_LIMIT);
    return entries.length === 0 ? EMPTY : entries;
  } catch {
    return EMPTY;
  }
}

/**
 * One shared empty list.
 *
 * `useSyncExternalStore` compares snapshots by identity and re-renders forever
 * if a snapshot is a fresh object each time. A new `[]` per read is exactly that
 * bug, and it only shows up for readers with no history — which is most of
 * them.
 */
const EMPTY: ViewedService[] = [];

/**
 * The last raw string read, and what it parsed to.
 *
 * Same reason as `EMPTY`: the snapshot has to be referentially stable while the
 * underlying string is unchanged, so parsing is memoised on the raw value
 * rather than repeated per render.
 */
let cachedRaw: string | null = null;
let cachedSnapshot: ViewedService[] = EMPTY;

/**
 * Fired on this tab after a write.
 *
 * The `storage` event only reaches *other* tabs, so without this the strip does
 * not react to its own Clear button. Named on the same origin-scoped pattern as
 * the app's other cross-tab signals.
 */
const CHANGE_EVENT = "vsolve:recently-viewed-changed";

function announce(): void {
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Nothing to tell, and nothing that depends on having told it.
  }
}

/**
 * The current list, stable between changes.
 *
 * A private window can throw on access rather than return null, which is why
 * the read is inside the `try`.
 */
export function readViewed(): ViewedService[] {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY;
  }

  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedSnapshot = parseViewed(raw);
  }
  return cachedSnapshot;
}

/** What the server renders: nothing, because the server cannot see the device. */
export function readViewedOnServer(): ViewedService[] {
  return EMPTY;
}

/**
 * Subscribes to changes from this tab and from any other.
 *
 * Cross-tab is not a flourish: opening a service in a new tab is ordinary
 * browsing, and a strip that ignored it would be visibly stale on the tab the
 * reader comes back to.
 */
export function subscribeViewed(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Records a view. Silent on failure, for the reasons in `parseViewed`. */
export function recordViewed(entry: ViewedService): void {
  try {
    const next = withViewed(readViewed(), entry);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A full or disabled store costs the shortcut, not the page.
    return;
  }
  announce();
}

/** Forgets everything. Behind an explicit control — never automatic. */
export function clearViewed(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
  announce();
}
