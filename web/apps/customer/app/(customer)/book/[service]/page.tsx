import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getServiceConfiguration } from "@/features/catalog/queries";
import { BookingWorkspaceBoot } from "@/features/booking/view/workspace-boot";

type PageProps = {
  params: Promise<{ service: string }>;
  searchParams: Promise<{ variant?: string }>;
};

/**
 * The booking workspace route.
 *
 * Deliberately not cached and not indexed. Unlike the catalog pages this is a
 * transactional surface: it depends on the signed-in customer's addresses and on
 * live availability, so a shared cache entry would be wrong for everyone after
 * the first visitor.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book a service",
  // A half-configured booking form is not a useful search result, and indexing
  // it would compete with the catalog page that is.
  robots: { index: false, follow: true },
};

export default async function BookingPage({ params, searchParams }: PageProps) {
  const { service: serviceSlug } = await params;
  const { variant: variantCode } = await searchParams;

  const service = await getServiceConfiguration(serviceSlug);
  if (!service) notFound();

  // A service with no configured variant cannot be booked. That is a catalog
  // problem, and 404 is more honest than an empty form the customer cannot
  // complete.
  const variant =
    (variantCode
      ? service.variants.find((candidate) => candidate.code === variantCode)
      : undefined) ?? service.variants[0];

  if (!variant) notFound();

  return <BookingWorkspaceBoot service={service} variant={variant} />;
}
