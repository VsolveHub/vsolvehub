import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://partner.vsolvehub.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Auth-gated areas: keep out of the index.
      disallow: ["/live", "/dashboard", "/onboarding", "/login", "/verify"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
