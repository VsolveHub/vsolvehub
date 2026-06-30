import Link from "next/link";
import { searchServices } from "@/lib/catalog/queries";
import { ServiceCardList } from "@/components/customer/services/ServiceCard";

type Props = {
  query?: string;
};

export async function ServicesSearchResults({ query }: Props) {
  const services = query ? await searchServices(query) : [];

  return (
    <div className="services-page">
      <header className="services-page__header">
        <Link href="/services" className="services-page__back">
          ← All categories
        </Link>
        <p className="services-page__eyebrow" style={{ marginTop: "1rem" }}>Search results</p>
        <h1 className="services-page__title" style={{ margin: 0 }}>{query ? `"${query}"` : "Services"}</h1>
        <p className="services-page__meta">
          {services.length} service{services.length === 1 ? "" : "s"} found
        </p>
      </header>
      <ServiceCardList services={services} />
    </div>
  );
}
