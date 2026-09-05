import { permanentRedirect } from "next/navigation";

/**
 * `/work` is no longer a screen — it is an address that still gets visited.
 *
 * The home moved to `/home` and the full list to `/work/all`, because `/work`
 * had been doing both jobs and the list was winning. This route stays because
 * plenty of things point at it: bookmarks, browser history, the `/dashboard`
 * redirect chain, notification deep links, and `next.config.ts`'s own redirect
 * table. Deleting the file would turn every one of those into a 404 to save a
 * few lines.
 *
 * ## Why it lands on `/home` rather than `/work/all`
 *
 * Both are defensible and the tie goes to what the address meant. `/work` was
 * where signing in landed, so everything holding that URL is holding "take me
 * to the app", not "take me to a list". A vendor following a stale bookmark
 * should arrive where a vendor signing in arrives.
 *
 * The Work *tab* is a different question and answers it differently — it points
 * straight at `/work/all`, because there the intent is explicit.
 *
 * `permanentRedirect` (308) rather than temporary: this is an
 * information-architecture decision, not a maintenance window, and it lets
 * browsers stop asking.
 */
export default function RedirectToAllWork(): never {
  permanentRedirect("/work/all");
}
