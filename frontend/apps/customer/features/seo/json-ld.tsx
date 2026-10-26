import { SUPPORT } from "@/lib/support";
import { SITE_NAME, SITE_URL, SERVICE_CITY, absoluteUrl } from "@/lib/site";

/**
 * A JSON-LD `<script>` for search engines.
 *
 * `<` is escaped so text from the catalogue can never close the script element early — the only
 * way a JSON-LD block becomes an injection point.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

/** The organisation behind the site, with the support channels the Contact page publishes. */
export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/icon.png"),
    email: SUPPORT.email,
    ...(SUPPORT.phone ? { telephone: SUPPORT.phone.e164 } : {}),
    areaServed: { "@type": "City", name: SERVICE_CITY },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: SUPPORT.email,
        ...(SUPPORT.phone ? { telephone: SUPPORT.phone.e164 } : {}),
        areaServed: "IN",
      },
    ],
  };
}

/** The site itself, with the catalogue search Google can offer as a sitelinks search box. */
export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    publisher: { "@id": `${SITE_URL}/#organization` },
    inLanguage: "en-IN",
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/catalog?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

/** Home › … › page, so results show the path instead of a bare URL. */
export function breadcrumbJsonLd(items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** A page's questions and answers, as plain text. */
export function faqJsonLd(faqs: { question: string; answer: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}
