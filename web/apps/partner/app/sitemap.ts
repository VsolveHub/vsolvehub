import type { MetadataRoute } from "next";
import { SERVICE_CATALOG, PARTNER_ROLES } from "@vsolve/config";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://partner.vsolvehub.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/solutions`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    ...PARTNER_ROLES.map((r) => ({
      url: `${base}/become/${r.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...SERVICE_CATALOG.map((s) => ({
      url: `${base}/become-a/${s.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
