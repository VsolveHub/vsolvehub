/**
 * The site's identity for search engines and link previews.
 *
 * One module, so the title template, canonical URLs, the sitemap, robots.txt and every JSON-LD
 * block agree on the brand spelling and the canonical host. `www` is the canonical host: the apex
 * redirects to it on Vercel, so a fallback to the apex would publish URLs that redirect.
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.vsolvehub.com").replace(
  /\/$/,
  "",
);

export const SITE_NAME = "V Solve Hub";

/** Where the service operates today. Named in titles because people search "… in Hyderabad". */
export const SERVICE_CITY = "Hyderabad";

/** The home page's title, used as-is (no template): brand first, then what and where. */
export const HOME_TITLE = `${SITE_NAME} — Verified Home Services in ${SERVICE_CITY}`;

/** ~155 characters: what Google shows under the title when a page has nothing better. */
export const DEFAULT_DESCRIPTION =
  `Book verified electricians, plumbers, AC technicians, cleaners and more in ${SERVICE_CITY}. ` +
  "See the price before you book and pay only after a professional accepts.";

/** Absolute URL for a site path, for JSON-LD and anywhere a crawler needs the full address. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Trim to `max` characters on a word boundary, for meta descriptions built from content. */
export function clampDescription(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : cut.length)}…`;
}
