import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoadingState } from "@/components/ui/LoadingState";
import { ServiceCatalogDb } from "@/components/customer/services/ServiceCatalogDb";
import { ServicesSearchResults } from "./ServicesSearchResults";

type PageProps = {
  searchParams: Promise<{ q?: string; category?: string }>;
};

export default async function ServicesRoute({ searchParams }: PageProps) {
  const { q, category } = await searchParams;

  if (category && !q) {
    redirect(`/services/${category}`);
  }

  if (q) {
    return (
      <Suspense fallback={<LoadingState label="Loading services…" />}>
        <ServicesSearchResults query={q} />
      </Suspense>
    );
  }

  return <ServiceCatalogDb />;
}
