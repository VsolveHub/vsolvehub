/**
 * Remote hosts whose images go through Next's optimizer (`/_next/image`).
 *
 * `next.config.ts` turns this list into `images.remotePatterns`, and
 * `RemoteImage` reads it to decide whether a URL can be optimized at all. One
 * list, so the two can never disagree: a host the optimizer refuses would come
 * back as a broken image in production.
 *
 * Catalogue artwork is served from the R2 bucket's public `r2.dev` address.
 * That address speaks HTTP/1.1 only — six downloads at a time per phone — and
 * sends no `Cache-Control`, so an image straight from it is both queued and
 * barely cached. Through the optimizer the phone gets a resized AVIF/WebP from
 * the site's own origin over HTTP/2 instead. When the bucket moves to a custom
 * domain, add that host here.
 *
 * Plain module, no path aliases: `next.config.ts` imports it before any
 * bundler is running.
 */
export const OPTIMIZED_IMAGE_HOSTS = [
  // Catalogue artwork: category, subcategory and service-cover images.
  "pub-32e84da8140449ddbc61c13539728e0e.r2.dev",
  // Seed photography and the home hero.
  "images.unsplash.com",
] as const;

/** Whether `src` is something the optimizer will accept: a local path or a listed https host. */
export function isOptimizableImage(src: string): boolean {
  if (src.startsWith("/")) return !src.startsWith("//");
  try {
    const { protocol, hostname } = new URL(src);
    return (
      protocol === "https:" &&
      (OPTIMIZED_IMAGE_HOSTS as readonly string[]).includes(hostname)
    );
  } catch {
    return false;
  }
}
