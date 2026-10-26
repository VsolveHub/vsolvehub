import type { MetadataRoute } from "next";

/** Admin console is internal; never indexed. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
