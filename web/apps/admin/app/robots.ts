import type { MetadataRoute } from "next";

// The whole app is internal — never indexed, no sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
