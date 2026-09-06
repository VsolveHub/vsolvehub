import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMoney } from "@vsolve/ui";

import { getCategory, getService, getCategoryServices } from "@/features/catalog/queries";
import { bookCrewHref } from "@/lib/routes";
import { Breadcrumbs } from "@/features/catalog/components/breadcrumbs";
import { FitOutServicePicker } from "@/features/catalog/components/fit-out-service-picker";
import { ServiceJsonLd } from "@/features/catalog/components/service-json-ld";
import { VariantList } from "@/features/catalog/components/variant-list";
import { PolicyList } from "@/features/catalog/components/policy-list";
import { ProcessSteps } from "@/features/catalog/components/process-steps";
import { RecordServiceView } from "@/features/catalog/components/record-service-view";
import { ServiceCard } from "@/features/catalog/components/service-card";
import { AddToCartButton } from "@/features/catalog/components/add-to-cart-button";

type PageProps = { params: Promise<{ category: string; service: string }> };

/** Literal because Next statically analyses segment config; see catalog/page.tsx. */
export const revalidate = 300;

/** The archetype that can be booked at a published day rate. Never rendered. */
const A3_TIME_BLOCK = "A3_TIME_BLOCK";
const FIT_OUT_PICKER_SERVICE = "interior-fit-out-project";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category, service: slug } = await params;
  const service = await getService(slug);

  if (!service) return { title: "Service not found" };

  return {
    title: service.name,
    description: service.short_description,
    alternates: { canonical: `/catalog/${category}/${service.slug}` },
    openGraph: {
      title: `${service.name} — Vsolve Hub`,
      description: service.short_description,
      type: "website",
      images: service.cover ? [{ url: service.cover.url, alt: service.cover.alt_text }] : undefined,
    },
  };
}

export default async function ServiceDetailPage({ params }: PageProps) {
  const { category: categorySlug, service: serviceSlug } = await params;

  const [service, category, categoryServices] = await Promise.all([
    getService(serviceSlug),
    getCategory(categorySlug),
    getCategoryServices(categorySlug),
  ]);

  if (!service || !category) notFound();

  // A service reachable under the wrong category would be a duplicate URL for
  // the same content. 404 rather than render it twice.
  if (service.category_slug !== categorySlug) notFound();

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

  return (
    <main className="bg-[#FAF9F7] min-h-screen pt-4 pb-16">
      <div className="mx-auto max-w-[1216px] px-4 sm:px-6 lg:px-8">
        <ServiceJsonLd service={service} categorySlug={categorySlug} />
        <RecordServiceView
          slug={service.slug}
          name={service.name}
          href={`/catalog/${categorySlug}/${service.slug}`}
        />

        <div className="mb-6">
          <Link
            href={`/catalog/${categorySlug}`}
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
            { label: category.name, href: `/catalog/${category.slug}` },
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
                style={{ backgroundImage: `url('${service.cover?.url || "https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=2070&auto=format&fit=crop"}')` }} 
              />
            </div>
          </div>

          {/* Right: Title & Booking Action Card */}
          <div className="w-full lg:w-5/12 flex flex-col pt-2">
            <h1 className="text-balance text-[1.85rem] font-bold text-navy-900 sm:text-[2.25rem] leading-tight">{service.name}</h1>
            <p className="mt-4 text-[1rem] leading-relaxed text-text-secondary">{service.short_description}</p>
            
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
                    {service.request_archetypes.includes("A9_STAY") ? (
                      <>
                        <Link
                          href={`/catalog/rooms-pg-hostel?tile=${service.subcategory_slug || "rooms"}`}
                          className="flex h-[3.25rem] w-full items-center justify-center rounded-md bg-[#f87000] px-6 text-[0.95rem] font-bold text-white shadow-sm transition-all hover:bg-[#d65f1a] active:scale-[0.98]"
                        >
                          Browse Available Stays & Rooms <span aria-hidden="true" className="ml-2">&rarr;</span>
                        </Link>
                        <Link
                          href={`/catalog/${categorySlug}?tile=${service.subcategory_slug}`}
                          className="flex h-[3.25rem] w-full items-center justify-center rounded-md border-2 border-line bg-transparent px-6 text-[0.95rem] font-bold text-navy-900 transition-all hover:border-navy-900 active:scale-[0.98]"
                        >
                          View all in this subcategory
                        </Link>
                      </>
                    ) : service.request_archetypes.includes(A3_TIME_BLOCK) ? (
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
                  Background Checked
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Middle Section: Variants and Static Info */}
        <div className="mt-8 flex flex-col lg:flex-row gap-8 items-start">
          
          <div className="w-full lg:w-1/2">
            {service.variants.length > 0 ? (
              <section className="rounded-[1rem] bg-white p-7 sm:p-8 shadow-sm">
                <h2 className="inline-flex items-center gap-2.5 text-[1.05rem] font-medium text-navy-900 mb-2">
                  <svg className="size-[1.125rem] text-action" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  What you can book
                </h2>
                <VariantList variants={service.variants} serviceSlug={service.slug} />
              </section>
            ) : service.requirement_variants && service.requirement_variants.length > 0 ? (
              <section className="rounded-[1rem] bg-white p-7 sm:p-8 shadow-sm">
                <h2 className="inline-flex items-center gap-2.5 text-[1.05rem] font-medium text-navy-900 mb-2">
                  <svg className="size-[1.125rem] text-[#f87000]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  What you can book
                </h2>
                <ul className="mt-4 space-y-4">
                  {service.requirement_variants.map((variant) => (
                    <li key={variant.id} className="p-5 rounded-[0.75rem] bg-[#F4F2EE] border border-line/40">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div>
                          <p className="text-[1.05rem] font-bold text-navy-900">{variant.name}</p>
                          {variant.description ? (
                            <p className="mt-1 text-[0.9rem] leading-relaxed text-text-secondary">{variant.description}</p>
                          ) : null}
                        </div>
                        {service.request_archetypes.includes("A9_STAY") && (
                          <Link
                            href={`/catalog/rooms-pg-hostel?tile=${service.subcategory_slug || "rooms"}`}
                            className="inline-flex items-center justify-center rounded-md bg-[#f87000] px-4 py-2 text-xs font-bold text-white hover:bg-[#d65f1a] transition-colors shrink-0"
                          >
                            Browse Stays
                          </Link>
                        )}
                      </div>
                      {variant.questions && variant.questions.length > 0 && (
                        <div className="mt-3.5 pt-3 border-t border-line/40">
                          <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block mb-2">
                            Configurable Options & Specifications:
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {variant.questions.map((q) => (
                              <div key={q.id} className="rounded-lg bg-white p-2.5 border border-line/50 text-xs">
                                <span className="font-bold text-navy-900 block">{q.prompt}</span>
                                {q.options && q.options.length > 0 ? (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {q.options.map((opt) => (
                                      <span key={opt.id} className="rounded bg-warm-100 text-gray-700 px-1.5 py-0.5 text-[10px] font-medium">
                                        {opt.label}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-gray-500">Available</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ) : service.description ? (
              <section className="rounded-[1rem] bg-white p-7 sm:p-8 shadow-sm h-full">
                <h2 className="text-[1.05rem] font-medium text-navy-900 mb-4">About this service</h2>
                <p className="whitespace-pre-line text-[0.95rem] leading-relaxed text-text-secondary">{service.description}</p>
              </section>
            ) : null}
          </div>

          <div className="w-full lg:w-1/2">
            <section className="rounded-[1rem] bg-white p-7 sm:p-8 shadow-sm h-full">
              <h2 className="inline-flex items-center gap-2.5 text-[1.05rem] font-medium text-navy-900 mb-6">
                <svg className="size-[1.125rem] text-action" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                Why V Solve
              </h2>
              <ul className="space-y-6">
                <li className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-navy-900">
                    <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="font-medium text-navy-900">Upfront Pricing</h3>
                    <p className="mt-1 text-[0.875rem] text-text-secondary leading-relaxed">No hidden fees. Know the cost before work begins.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-navy-900">
                    <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="font-medium text-navy-900">Verified Pros</h3>
                    <p className="mt-1 text-[0.875rem] text-text-secondary leading-relaxed">Every technician undergoes strict background checks.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-navy-900">
                    <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="font-medium text-navy-900">Satisfaction Guaranteed</h3>
                    <p className="mt-1 text-[0.875rem] text-text-secondary leading-relaxed">We stand by our work. Your satisfaction is our priority.</p>
                  </div>
                </li>
              </ul>
            </section>
          </div>
        </div>

        {/* Bottom Section: Process Steps */}
        {processSteps.length > 0 ? (
          <section className="mt-8 rounded-[1rem] bg-white p-8 sm:p-10 shadow-sm">
            <div className="text-center mb-2">
              <h2 className="inline-flex items-center gap-2.5 text-[1.05rem] font-medium text-navy-900">
                <svg className="size-[1.125rem] text-action" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                The V Solve Process
              </h2>
            </div>
            <ProcessSteps steps={processSteps} />
          </section>
        ) : null}

        {/* Existing Policy List */}
        {service.policies.length > 0 && service.policies.filter((p) => p.kind !== "PROCESS").length > 0 ? (
          <section className="mt-8 rounded-[1rem] bg-white p-7 sm:p-8 shadow-sm">
            <PolicyList policies={service.policies.filter((p) => p.kind !== "PROCESS")} />
          </section>
        ) : null}

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
            href={`/catalog/${category.slug}`}
            className="group inline-flex h-12 items-center justify-center rounded-full bg-white px-7 text-[0.95rem] font-medium text-navy-900 shadow-sm transition-all duration-300 hover:-translate-y-[2px] hover:shadow-md border border-line/40 hover:border-navy-300 gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            <span aria-hidden="true" className="transition-transform group-hover:-translate-x-1">&larr;</span> 
            More {category.name.toLowerCase()} services
          </Link>
        </section>
      </div>
    </main>
  );
}
