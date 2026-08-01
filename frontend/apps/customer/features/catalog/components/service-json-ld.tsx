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
}: {
  service: ServiceDetail;
  categorySlug: string;
}) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vsolvehub.com";
  const url = `${siteUrl}/catalog/${categorySlug}/${service.slug}`;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.name,
    description: service.description || service.short_description,
    serviceType: service.name,
    url,
    provider: {
      "@type": "Organization",
      name: "Vsolve Hub",
      url: siteUrl,
    },
    areaServed: {
      "@type": "City",
      name: "Hyderabad",
    },
    ...(service.cover ? { image: service.cover.url } : {}),
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: service.starting_price.currency,
      // Schema.org expects a decimal string, and the contract carries paise.
      lowPrice: (service.starting_price.amount_paise / 100).toFixed(2),
      offerCount: Math.max(service.variants.length, 1),
      availability: "https://schema.org/InStock",
      url,
    },
  };

  return (
    <script
      type="application/ld+json"
      // Content is our own catalogue copy from Django, not user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
