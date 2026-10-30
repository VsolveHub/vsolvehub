import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

/**
 * robots.txt. Public pages — the catalogue, rentals, stays, listings and the policies — are open.
 * Everything behind a sign-in, every booking and payment step, and the internal design gallery
 * stay out of search results: they are either personal or not real pages.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/account",
        "/activity",
        "/book/",
        "/bookings",
        "/cart",
        "/checkout",
        "/engagements",
        "/jobs",
        "/projects",
        "/requests",
        "/rentals/mine",
        "/stays/mine",
        "/listings/my-applications",
        "/listings/profile",
        "/login",
        "/signup",
        "/design",
        "/api/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
