import { breadcrumbJsonLd, JsonLd } from "@/features/seo/json-ld";
import { absoluteUrl, SERVICE_CITY, SITE_NAME, SITE_URL } from "@/lib/site";

import type { ServiceDetail } from "../queries";

/**
 * `Service` structured data for the detail page.
 *
 * Two rules keep this honest:
 *
 * 1. Every value comes from the API response. Structured data that claims a
 *    price, a rating or an availability the page cannot show is misrepresentation
 *    — and Google penalises it.
 *
 * 2. No `aggregateRating`. It is the most tempting field to invent and the one
 *    most likely to be fabricated, because rich results show stars. Ratings go in
 *    only once real completed-booking reviews exist, and then from the API.
 *
 * `offers` uses `lowPrice` with `priceSpecification` rather than a flat `price`,
 * because "starts at" is exactly what the catalogue promises: the minimum of the
 * active rates, with the real total confirmed at quote time.
 */
export function ServiceJsonLd({
  service,
  categorySlug,
  categoryName,
}: {
  service: ServiceDetail;
  categorySlug: string;
  categoryName: string;
}) {
  const path = `/catalog/${categorySlug}/${service.slug}`;
  const url = absoluteUrl(path);

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.name,
    description: service.description || service.short_description,
    serviceType: service.name,
    url,
    provider: {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
    },
    areaServed: {
      "@type": "City",
      name: SERVICE_CITY,
    },
    ...(service.cover ? { image: service.cover.url } : {}),
    // No `offers` block at all when the service has no price. Schema.org's `AggregateOffer`
    // requires a price, and a service quoted per job does not have one — emitting a zero or a
    // placeholder would put a fabricated price into Google's index, where it outlives any
    // correction we make on the page.
    ...(service.starting_price !== null
      ? {
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: service.starting_price.currency,
            // Schema.org expects a decimal string, and the contract carries paise.
            lowPrice: (service.starting_price.amount_paise / 100).toFixed(2),
            offerCount: Math.max(service.variants.length, 1),
            availability: "https://schema.org/InStock",
            url,
          },
        }
      : {}),
  };

  return (
    <JsonLd
      data={[
        structuredData,
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Services", path: "/catalog" },
          { name: categoryName, path: `/catalog/${categorySlug}` },
          { name: service.name, path },
        ]),
      ]}
    />
  );
}
