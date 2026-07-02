import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vsolvehub.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Auth-gated / token areas: keep out of the index.
      disallow: ["/dashboard", "/onboarding", "/login", "/verify", "/live", "/crew"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
