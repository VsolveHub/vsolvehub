import type { Metadata } from "next";
import type { ReactNode } from "react";

import { STAYS_DESCRIPTION, stayMeta } from "@/lib/detail-titles";
import { SITE_NAME } from "@/lib/site";

/**
 * Names and describes the property in the tab and the search result.
 *
 * The page is a client component and cannot export metadata, so the title is
 * read here from the same public detail endpoint. A 404 is kept out of search;
 * any other failed read falls back to "Stay". The page still renders its
 * own not-found state.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = await stayMeta(slug);
  if (meta === "missing") return { title: "Stay not found", robots: { index: false } };
  const title = meta?.title ?? "Stay";
  const description = meta?.description ?? STAYS_DESCRIPTION;
  return {
    title,
    description,
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      type: "website",
      ...(meta?.image_url ? { images: [{ url: meta.image_url, alt: title }] } : {}),
    },
  };
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
