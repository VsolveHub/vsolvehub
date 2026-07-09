import Link from "next/link";
import { searchServices } from "@/lib/catalog/queries";
import { ServiceCardList } from "@/components/customer/services/ServiceCard";

type Props = {
  query?: string;
};

export async function ServicesSearchResults({ query }: Props) {
  const services = query ? await searchServices(query) : [];

  return (
    <div className="services-page services-catalog-v2">
      <header className="services-page__hero">
        <Link href="/services" className="services-page__back">
          ← All categories
        </Link>
        <p className="services-page__eyebrow">Search results</p>
        <h1 className="services-page__title">{query ? `"${query}"` : "Services"}</h1>
        <p className="services-page__meta">
          {services.length} service{services.length === 1 ? "" : "s"} found
        </p>
      </header>
      <div className="services-page__body">
        <ServiceCardList services={services} />
      </div>
    </div>
  );
}
