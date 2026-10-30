/**
 * The partner site's identity for search engines and link previews.
 *
 * One fallback for every place that needs the canonical host. It is the partner subdomain: the
 * old fallback pointed at the customer domain, so a build without `NEXT_PUBLIC_SITE_URL` published
 * canonical URLs and a sitemap for the wrong site.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://partner.vsolvehub.com").replace(
  /\/$/,
  "",
);

export const SITE_NAME = "V Solve Hub Partners";
