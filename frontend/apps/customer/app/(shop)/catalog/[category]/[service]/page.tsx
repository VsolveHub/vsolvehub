import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonStyles, formatMoney } from "@vsolve/ui";

import { getCategory, getService } from "@/features/catalog/queries";
import { Breadcrumbs } from "@/features/catalog/components/breadcrumbs";
import { ServiceJsonLd } from "@/features/catalog/components/service-json-ld";
import { VariantList } from "@/features/catalog/components/variant-list";
import { PolicyList } from "@/features/catalog/components/policy-list";
import { ProcessSteps } from "@/features/catalog/components/process-steps";

type PageProps = { params: Promise<{ category: string; service: string }> };

/** Literal because Next statically analyses segment config; see catalog/page.tsx. */
export const revalidate = 300;

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

  const [service, category] = await Promise.all([
    getService(serviceSlug),
    getCategory(categorySlug),
  ]);

  if (!service || !category) notFound();

  // A service reachable under the wrong category would be a duplicate URL for
  // the same content. 404 rather than render it twice.
  if (service.category_slug !== categorySlug) notFound();

  // Split out here rather than inside `PolicyList`, which groups the three kinds a customer
  // reads as bullet lists. A numbered sequence is a different shape and gets its own section.
  const processSteps = service.policies.filter((policy) => policy.kind === "PROCESS");

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <ServiceJsonLd service={service} categorySlug={categorySlug} />

      <Breadcrumbs
        trail={[
          { label: "Services", href: "/catalog" },
          { label: category.name, href: `/catalog/${category.slug}` },
          { label: service.name, href: `/catalog/${categorySlug}/${service.slug}` },
        ]}
      />

      <header className="pb-6 pt-3">
        <h1 className="text-balance text-2xl font-bold text-text sm:text-3xl">{service.name}</h1>
        <p className="mt-2 max-w-prose text-text-secondary">{service.short_description}</p>

        {service.starting_price !== null ? (
          <>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <div>
                <span className="block text-xs uppercase tracking-[0.08em] text-text-muted">
                  Starts at
                </span>
                <span data-numeric className="text-2xl font-bold text-text">
                  {formatMoney(service.starting_price.amount_paise)}
                </span>
              </div>
            </div>

            <p className="mt-2 text-sm text-text-secondary">
              The exact price is confirmed before you pay, once you have told us what the job
              involves.
            </p>
          </>
        ) : (
          // A service quoted per job. The sentence below is the honest version of the one above:
          // there is no starting price to confirm *from*, because nobody has seen the work yet.
          <p className="mt-4 text-sm text-text-secondary">
            This work is priced per job. Tell us what you need and verified professionals will send
            you their own quotes — describing the job costs nothing.
          </p>
        )}
      </header>

      {/*
        The one primary action on the page (plan 03), and **the archetype chooses it**.

        A priced service leads into the booking workspace, which owns scope, duration, slot and
        the real quote. A service you describe leads into the four-screen requirement flow, where
        vendors quote instead. `README.md` §"Customer, Partner and Operations surfaces" names both
        actions in exactly these words.

        This branch was missing until contract 1.27.0 published `request_archetypes`: there was no
        field to branch on, so every service — including workforce and project work that has no
        price and no bookable variant — offered "Check price and availability" and led to a
        booking workspace with nothing in it.

        A link rather than a button, so middle-click and "open in new tab" behave the way the
        browser promises.
      */}
      <div className="pb-8">
        {service.request_archetypes.length > 0 ? (
          <Link href={`/requests/new/${service.slug}`} className={buttonStyles({ size: "lg" })}>
            Tell us what you need
          </Link>
        ) : (
          <Link href={`/book/${service.slug}`} className={buttonStyles({ size: "lg" })}>
            Check price and availability
          </Link>
        )}
      </div>

      {service.description ? (
        <section className="border-t border-line py-6">
          <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-text-secondary">
            About this service
          </h2>
          <p className="mt-3 whitespace-pre-line text-text">{service.description}</p>
        </section>
      ) : null}

      {service.variants.length > 0 ? (
        <section className="border-t border-line py-6">
          <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-text-secondary">
            What you can book
          </h2>
          <VariantList variants={service.variants} serviceSlug={service.slug} />
        </section>
      ) : null}

      {/* Before the inclusions on purpose. "What happens, and when do I get to say no" is the
          question somebody has while deciding; "what does the price cover" is the one they have
          once they have decided to. */}
      {processSteps.length > 0 ? (
        <section className="border-t border-line py-6">
          <h2 className="text-sm font-bold uppercase tracking-[0.08em] text-text-secondary">
            Our process
          </h2>
          <ProcessSteps steps={processSteps} />
        </section>
      ) : null}

      {service.policies.length > 0 ? (
        <section className="border-t border-line py-6">
          <PolicyList policies={service.policies} />
        </section>
      ) : null}

      <section className="border-t border-line py-6">
        <Link
          href={`/catalog/${category.slug}`}
          className="text-sm font-medium text-text-link hover:underline"
        >
          More {category.name.toLowerCase()} services
        </Link>
      </section>
    </main>
  );
}
