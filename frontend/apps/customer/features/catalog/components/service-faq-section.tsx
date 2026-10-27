import type { ServiceFaq } from "../service-faqs";

/**
 * Collapsible questions under a service, plus their FAQPage structured data.
 *
 * Native `<details>` so it works before hydration and without a client bundle;
 * the first answer starts open because it is the price, the question most people
 * scrolled down to ask.
 */
export function ServiceFaqSection({ faqs }: { faqs: ServiceFaq[] }) {
  if (faqs.length === 0) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <section aria-labelledby="service-faq-heading" className="mt-8 rounded-[1rem] bg-white p-4 sm:p-6 md:p-8 shadow-sm">
      <script
        type="application/ld+json"
        // Escaped so a "</script>" inside an answer cannot close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <h2 id="service-faq-heading" className="text-[1.15rem] font-bold text-navy-900">
        Frequently asked questions
      </h2>
      <div className="mt-4 divide-y divide-line/60 border-y border-line/60">
        {faqs.map((faq, index) => (
          <details key={faq.question} open={index === 0} className="group py-1">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3.5 text-[0.95rem] font-semibold text-navy-900 marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action [&::-webkit-details-marker]:hidden">
              {faq.question}
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="size-4 shrink-0 text-text-muted transition-transform group-open:rotate-180"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </summary>
            <p className="pb-4 pr-8 text-[0.9rem] leading-relaxed text-text-secondary">{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
