import type { Metadata } from "next";
import type { ReactNode } from "react";

import { RENTALS_DESCRIPTION, rentalMeta } from "@/lib/detail-titles";
import { SITE_NAME } from "@/lib/site";

/**
 * Names and describes the item in the tab and the search result.
 *
 * The page is a client component and cannot export metadata, so the title is
 * read here from the same public detail endpoint. A 404 is kept out of search;
 * any other failed read falls back to "Rental". The page still renders its
 * own not-found state.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = await rentalMeta(slug);
  if (meta === "missing") return { title: "Rental not found", robots: { index: false } };
  const title = meta?.title ?? "Rental";
  const description = meta?.description ?? RENTALS_DESCRIPTION;
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
