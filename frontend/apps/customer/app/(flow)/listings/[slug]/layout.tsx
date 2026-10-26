import type { Metadata } from "next";
import type { ReactNode } from "react";

import { LISTINGS_DESCRIPTION, listingMeta } from "@/lib/detail-titles";

/**
 * Names and describes the job in the tab and the search result.
 *
 * The page is a client component and cannot export metadata, so the title is
 * read here from the same public detail endpoint. A 404 is kept out of search;
 * any other failed read falls back to "Job opening". The page still renders its
 * own not-found state.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = await listingMeta(slug);
  if (meta === "missing") return { title: "Job opening not found", robots: { index: false } };
  return {
    title: meta?.title ?? "Job opening",
    description: meta?.description ?? LISTINGS_DESCRIPTION,
  };
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
