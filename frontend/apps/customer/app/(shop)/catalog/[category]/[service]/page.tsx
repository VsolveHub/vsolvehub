import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatMoney } from "@vsolve/ui";

import {
  getCategory,
  getCategoryServices,
  getPromoBanners,
  getService,
} from "@/features/catalog/queries";
import { bookCrewHref, isCareerJobsCategory, listingsBrowseHref } from "@/lib/routes";
import { Breadcrumbs } from "@/features/catalog/components/breadcrumbs";
import { FitOutServicePicker } from "@/features/catalog/components/fit-out-service-picker";
import { ServiceJsonLd } from "@/features/catalog/components/service-json-ld";
import { VariantList } from "@/features/catalog/components/variant-list";
import { PolicyList } from "@/features/catalog/components/policy-list";
import { ProcessSteps } from "@/features/catalog/components/process-steps";
import { RecordServiceView } from "@/features/catalog/components/record-service-view";
import { ServiceCard } from "@/features/catalog/components/service-card";
import { AddToCartButton } from "@/features/catalog/components/add-to-cart-button";
import { ServiceFaqSection } from "@/features/catalog/components/service-faq-section";
import {
  ServiceAssurance,
  ServiceOptionDifferences,
  ServiceProfessionals,
} from "@/features/catalog/components/service-detail-sections";
import { ServiceOfferBanner } from "@/features/catalog/components/service-offer-banner";
import { PromoBanners } from "@/features/catalog/components/promo-banners";
import { categoryHeadline } from "@/features/catalog/components/tile-desktop-rating";
import { buildServiceFaqs } from "@/features/catalog/service-faqs";
import { addsToServiceCopy, durationLabel, warrantyText } from "@/features/catalog/service-facts";
import { clampDescription, SERVICE_CITY, SITE_NAME } from "@/lib/site";

type PageProps = { params: Promise<{ category: string; service: string }> };

/** Literal because Next statically analyses segment config; see catalog/page.tsx. */
export const revalidate = 300;

/** The archetype that can be booked at a published day rate. Never rendered. */
const A3_TIME_BLOCK = "A3_TIME_BLOCK";
const FIT_OUT_PICKER_SERVICE = "interior-fit-out-project";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category: categorySlug, service: slug } = await params;
  const service = await getService(slug);

  if (!service) return { title: "Service not found", robots: { index: false } };

  const title = `${service.name} in ${SERVICE_CITY}`;
  const priceSnippet = service.starting_price
    ? ` From ₹${(service.starting_price.amount_paise / 100).toLocaleString("en-IN")}.`
    : "";
  const rawDescription =
    (service.short_description || service.description || "") + priceSnippet ||
    `Book verified ${service.name.toLowerCase()} in ${SERVICE_CITY} on ${SITE_NAME}.`;
  const description = clampDescription(rawDescription);
  const canonical = `/catalog/${categorySlug}/${service.slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      type: "website",
      url: canonical,
      ...(service.cover ? [{ url: service.cover.url, alt: service.cover.alt_text || title }] : []),
    },
  };
}

export default async function ServiceDetailPage({ params }: PageProps) {
  const { category: categorySlug, service: serviceSlug } = await params;

  const [service, category, categoryServices, promoBanners] = await Promise.all([
    getService(serviceSlug),
    getCategory(categorySlug),
    getCategoryServices(categorySlug),
    getPromoBanners(categorySlug),
  ]);

  if (!service || !category) notFound();

  // A service reachable under the wrong category would be a duplicate URL for
  // the same content. 404 rather than render it twice.
  if (service.category_slug !== categorySlug) notFound();

  // A10 Career/Jobs roles are listing taxonomy, not bookable service detail pages.
  if (
    isCareerJobsCategory(categorySlug) ||
    service.request_archetypes.includes("A10_LISTING")
  ) {
    redirect(listingsBrowseHref(service.slug));
  }

  // Find related services: prioritize same subcategory, exclude current service
  const relatedServices = categoryServices
    ? categoryServices
        .filter((s) => s.slug !== service.slug)
        .sort((a, b) => {
          const aSameSub = a.subcategory_slug === service.subcategory_slug;
          const bSameSub = b.subcategory_slug === service.subcategory_slug;
          if (aSameSub && !bSameSub) return -1;
          if (!aSameSub && bSameSub) return 1;
          return 0;
        })
        .slice(0, 3)
    : [];

  // Split out here rather than inside `PolicyList`, which groups the three kinds a customer
  // reads as bullet lists. A numbered sequence is a different shape and gets its own section.
  const processSteps = service.policies.filter((policy) => policy.kind === "PROCESS");

  // Seeded descriptions often repeat the short one; print the long copy only when it says more.
  const showDescription = addsToServiceCopy(service.description ?? "", service.short_description);
  const faqs = buildServiceFaqs(service);
  const warranty = warrantyText(service.policies);
  const durations = service.variants.map(durationLabel).filter((label): label is string => label !== null);
  // Facts the server published, shown at a glance the way a rate card leads with them.
  const highlights = [
    service.variants.length > 1 ? `${service.variants.length} options` : null,
    // A duration chip speaks for the whole service, so only when every option shares it.
    durations.length === service.variants.length && new Set(durations).size === 1 ? durations[0] : null,
    warranty,
  ].filter((item): item is string => item !== null && item !== undefined);

  return (
    <main className="bg-[#FAF9F7] min-h-screen pt-4 pb-16">
      <div className="mx-auto max-w-[1216px] px-4 sm:px-6 lg:px-8">
        <ServiceJsonLd service={service} categorySlug={categorySlug} categoryName={category?.name} />
        <RecordServiceView
          slug={service.slug}
          name={service.name}
          href={`/catalog/${categorySlug}/${service.slug}`}
        />

        <div className="mb-6">
          <Link
            href={`/catalog/${categorySlug}?tile=${service.subcategory_slug}`}
            className="inline-flex items-center gap-2 text-xs font-black text-navy-900 bg-white border border-[#e7e2da] px-4 py-2.5 rounded-full shadow-2xs hover:shadow-sm hover:border-[#EA580C] hover:text-[#EA580C] transition-all duration-300 cursor-pointer"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5 rotate-180">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
            Back to {category.name}
          </Link>
        </div>

        <Breadcrumbs
          trail={[
            { label: "Services", href: "/catalog" },
            { label: category.name, href: `/catalog/${category.slug}?tile=${service.subcategory_slug}` },
            { label: service.name, href: `/catalog/${categorySlug}/${service.slug}` },
          ]}
        />

        {/* Top Hero Section */}
        <div className="mt-8 flex flex-col lg:flex-row gap-8 lg:gap-16">
          
          {/* Left: Featured Image */}
          <div className="w-full lg:w-7/12">
            <div className="aspect-[4/3] w-full rounded-[1.25rem] bg-surface-sunken overflow-hidden relative shadow-sm">
              <div 
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 hover:scale-105" 
                // No stock-photo fallback: a service without a cover shows the plain surface.
                style={service.cover ? { backgroundImage: `url('${service.cover.url}')` } : undefined}
                role={service.cover ? "img" : undefined}
                aria-label={service.cover ? service.cover.alt_text || service.name : undefined}
              />
            </div>
          </div>

          {/* Right: Title & Booking Action Card */}
          <div className="w-full lg:w-5/12 flex flex-col pt-2">
            <h1 className="text-balance text-[1.85rem] font-bold text-navy-900 sm:text-[2.25rem] leading-tight">{service.name}</h1>
            <p className="mt-4 text-[1rem] leading-relaxed text-text-secondary">{service.short_description}</p>
            {highlights.length > 0 ? (
              <ul aria-label="At a glance" className="mt-5 flex flex-wrap gap-2">
                {highlights.map((item) => (
                  <li
                    key={item}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line/70 bg-white px-3 py-1.5 text-[0.8rem] font-semibold text-navy-900"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5 text-action" aria-hidden>
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
            
            <div className="mt-8 rounded-[1rem] bg-white p-7 sm:p-8 shadow-card border border-transparent">
              {service.starting_price !== null ? (
                <>
                  <span className="block text-[0.7rem] uppercase tracking-wider font-bold text-text-muted">
                    Starts at
                  </span>
                  <span data-numeric className="mt-1.5 block text-2xl font-bold text-navy-900 tabular-nums">
                    {formatMoney(service.starting_price.amount_paise)}
                  </span>
                  <p className="mt-4 text-[0.9rem] leading-relaxed text-text-secondary">
                    The exact price is confirmed before you pay, once you have told us what the job involves.
                  </p>
                </>
              ) : (
                <p className="text-[0.9rem] leading-relaxed text-text-secondary">
                  This work is priced per job. Tell us what you need and verified professionals will send you their own quotes — describing the job costs nothing.
                </p>
              )}

              <div className="mt-7">
                {service.slug === FIT_OUT_PICKER_SERVICE ? (
                  <FitOutServicePicker serviceSlug={service.slug} />
                ) : (
                  <div className="flex flex-col gap-3">
                    {service.request_archetypes.includes(A3_TIME_BLOCK) ? (
                      <>
                        <Link href={bookCrewHref(service.slug)} className="flex h-[3.25rem] w-full items-center justify-center rounded-md bg-action px-6 text-[0.95rem] font-bold text-white shadow-sm transition-all hover:bg-[#d65f1a] active:scale-[0.98]">
                          Book a crew <span aria-hidden="true" className="ml-2">&rarr;</span>
                        </Link>
                        <Link href={`/requests/new/${service.slug}`} className="flex h-[3.25rem] w-full items-center justify-center rounded-md border-2 border-line bg-transparent px-6 text-[0.95rem] font-bold text-navy-900 transition-all hover:border-navy-900 active:scale-[0.98]">
                          Get quotes instead
                        </Link>
                      </>
                    ) : service.request_archetypes.length > 0 && service.bookable_variant_id ? (
                      <>
                        {/* The hybrid: a published fixed price AND a quote path. Both are
                            real ways to buy this and neither is hidden behind the other. */}
                        <Link href={`/book/${service.slug}`} className="flex h-[3.25rem] w-full items-center justify-center rounded-md bg-action px-6 text-[0.95rem] font-bold text-white shadow-sm transition-all hover:bg-[#d65f1a] active:scale-[0.98]">
                          Book at the fixed price <span aria-hidden="true" className="ml-2">&rarr;</span>
                        </Link>
                        <Link href={`/requests/new/${service.slug}`} className="flex h-[3.25rem] w-full items-center justify-center rounded-md border-2 border-line bg-transparent px-6 text-[0.95rem] font-bold text-navy-900 transition-all hover:border-navy-900 active:scale-[0.98]">
                          Get a free quote after a site visit
                        </Link>
                      </>
                    ) : service.request_archetypes.length > 0 ? (
                      <Link href={`/requests/new/${service.slug}`} className="flex h-[3.25rem] w-full items-center justify-center rounded-md bg-action px-6 text-[0.95rem] font-bold text-white shadow-sm transition-all hover:bg-[#d65f1a] active:scale-[0.98]">
                        Tell us what you need <span aria-hidden="true" className="ml-2">&rarr;</span>
                      </Link>
                    ) : (
                      service.bookable_variant_id && (
                        <AddToCartButton variantId={service.bookable_variant_id} />
                      )
                    )}
                  </div>
                )}
              </div>

              <div className="mt-7 pt-5 border-t border-line/60 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5 text-[0.875rem] font-medium text-text-secondary">
                  <svg className="size-[1.125rem] text-action" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Vetted Pros
                </div>
                <div className="flex items-center gap-2.5 text-[0.875rem] font-medium text-text-secondary">
                  <svg className="size-[1.125rem] text-action" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                  ID Verified
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section order follows how people compare a job: an offer they can use, the
            options, what separates them, what protects them, how the visit runs, what is
            and is not covered, who turns up, then questions. */}
        <PromoBanners banners={promoBanners} fallbackImageUrl={category.image_url} />
        <ServiceOfferBanner imageUrl={category.image_url} />

        {service.variants.length > 0 ? (
          <section className="mt-8 rounded-[1rem] bg-white p-7 sm:p-8 shadow-sm">
            <h2 className="text-[1.15rem] font-bold text-navy-900">What you can book</h2>
            <VariantList
              variants={service.variants}
              serviceSlug={service.slug}
              serviceCoverUrl={service.cover?.url}
              serviceIconKey={service.icon_key}
              serviceCopy={[service.short_description, service.description ?? ""]}
            />
          </section>
        ) : null}

        <ServiceOptionDifferences service={service} />

        {showDescription ? (
          <section className="mt-8 rounded-[1rem] bg-white p-7 sm:p-8 shadow-sm">
            <h2 className="text-[1.15rem] font-bold text-navy-900">About this service</h2>
            <p className="mt-3 whitespace-pre-line text-[0.95rem] leading-relaxed text-text-secondary">{service.description}</p>
          </section>
        ) : null}

        <ServiceAssurance service={service} />

        {processSteps.length > 0 ? (
          <section aria-labelledby="how-it-works-heading" className="mt-8 rounded-[1rem] bg-white p-7 sm:p-8 shadow-sm">
            <h2 id="how-it-works-heading" className="text-[1.15rem] font-bold text-navy-900">
              How it works
            </h2>
            <ProcessSteps steps={processSteps} />
          </section>
        ) : null}

        {service.policies.some((p) => p.kind !== "PROCESS") ? (
          <section className="mt-8 rounded-[1rem] bg-white p-7 sm:p-8 shadow-sm">
            <PolicyList policies={service.policies.filter((p) => p.kind !== "PROCESS")} />
          </section>
        ) : null}

        <ServiceProfessionals service={service} />

        <ServiceFaqSection faqs={faqs} />

        {/* Related Services Section */}
        {relatedServices.length > 0 && (
          <section className="mt-16">
            <div className="flex items-center gap-3 mb-8">
              <h2 className="text-[1.5rem] font-bold tracking-tight text-navy-900">
                Related Services
              </h2>
              <div className="h-px flex-1 bg-line/60" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {relatedServices.map((relatedService, index) => (
                <ServiceCard 
                  key={relatedService.id} 
                  service={relatedService} 
                  categorySlug={category.slug} 
                  index={index + 1} 
                />
              ))}
            </div>
          </section>
        )}

        <section className="mt-12 mb-4 flex justify-center">
          <Link
            href={`/catalog/${category.slug}?tile=${service.subcategory_slug}`}
            className="group inline-flex h-12 items-center justify-center rounded-full bg-white px-7 text-[0.95rem] font-medium text-navy-900 shadow-sm transition-all duration-300 hover:-translate-y-[2px] hover:shadow-md border border-line/40 hover:border-navy-300 gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            <span aria-hidden="true" className="transition-transform group-hover:-translate-x-1">&larr;</span> 
            More {categoryHeadline(category.name)} services
          </Link>
        </section>
      </div>
    </main>
  );
}
