import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

/**
 * robots.txt. The marketing pages (home, solutions, trades, pricing, about, blog, become-a pages
 * and the policies) are for search; the signed-in partner app is not. The list names the app's
 * real top-level routes — the previous one listed `/dashboard`, `/onboarding` and `/live`, none of
 * which exist any more, and left `/work`, `/money` and `/me` open.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/apply",
        "/home",
        "/work",
        "/money",
        "/me",
        "/listings",
        "/rentals",
        "/stays",
        "/login",
        "/design",
        "/api/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
