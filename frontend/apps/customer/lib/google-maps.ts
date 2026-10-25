/**
 * The Google Maps browser key: Maps JavaScript, Places (New) and Maps Embed.
 *
 * Public by design — it ships in the bundle — so it is restricted to this app's
 * HTTP referrers in Google Cloud. Empty means no map: the picker offers the
 * device's location only and read-only maps render nothing. Address text never
 * comes from this key; Django's server key answers that.
 */
export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
