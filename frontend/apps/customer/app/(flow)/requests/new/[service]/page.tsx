import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, buttonStyles } from "@vsolve/ui";

import { getServiceConfiguration } from "@/features/catalog/queries";
import { RequirementFlow } from "@/features/requirement/view/requirement-flow";

/**
 * The three-screen requirement — `M2-FE-201..212`, as revised by the M2-revamp.
 *
 * ## One route for three screens
 *
 * The screens are deliberately not mounted as separate routes, on the
 * precedent of `/book/[service]` and `/checkout`: the flow is one reducer,
 * back is a *screen change* rather than a navigation, and nothing is lost or
 * refetched crossing a step. Separate URLs would need the reducer's screen to
 * be readable from the address bar, and `canNavigateTo` exists precisely to
 * refuse a forward jump — a pasted deep link to the last screen would either
 * skip every guard or bounce, and neither is a route worth having. The
 * flow-weight budget is about screens the Customer walks through, and it is
 * enforced by `SCREENS.length === 3` rather than by a folder count.
 *
 * ## The variant is resolved on the server, before anything is offered
 *
 * `POST /requirements/` takes a `variant_id`, and only a variant whose
 * `fulfilment_archetype` is A3 or A5 has an M2 configuration behind it —
 * anything else is refused with `m2_lifecycle_not_supported`. Resolving that
 * here means a Customer is told before the first screen rather than after the
 * fourth, and it is why this page fetches at all.
 */
export const dynamic = "force-dynamic";

/** Names the service in the tab; the `cache`d read is shared with the page. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ service: string }>;
}): Promise<Metadata> {
  const { service: serviceSlug } = await params;
  const service = await getServiceConfiguration(serviceSlug).catch(() => null);
  return {
    title: service ? `Describe your ${service.name} job` : "Describe a job",
    robots: { index: false, follow: false },
  };
}

/** The two lifecycles this flow can produce. Never rendered — see `WhatScreen`. */
const M2_ARCHETYPES = ["A3_TIME_BLOCK", "A5_CUSTOM_PROJECT"];

export default async function NewRequestForServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ service: string }>;
  searchParams?: Promise<{ selected_service?: string | string[] }>;
}) {
  const { service: serviceSlug } = await params;
  const query = await searchParams;
  const selectedService =
    typeof query?.selected_service === "string"
      ? query.selected_service
      : (query?.selected_service?.[0] ?? null);
  const service = await getServiceConfiguration(serviceSlug);

  if (service === null) notFound();

  // Read from `requirement_variants`, not `variants`. `variants` is the A1 *task* list — the
  // booking workspace turns each row into a priced task line — and it is built from a selector
  // that filters `booking_archetype=A1_TASK_VISIT`, so an A3 or A5 variant was never in it. This
  // page therefore found nothing on every M2 service and rendered "we do not take requests for
  // this yet" over a service that was fully configured to take them. Contract 1.28.0 publishes
  // the other half of the same service.
  //
  // First match rather than a chooser. A service with two M2 variants is a catalogue shape
  // nothing has produced yet, and offering a pick between "time block" and "custom project" is
  // exactly the archetype question `GAP-006` forbids asking. If it ever happens, the choice has
  // to be expressed in the Customer's own words, which is a product decision rather than a
  // dropdown.
  const variant = service.requirement_variants.find((entry) =>
    M2_ARCHETYPES.includes(entry.fulfilment_archetype),
  );

  if (variant === undefined) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-10">
        <EmptyState
          title="We do not take requests for this yet"
          description={`${service.name} is not open for workforce or project requests at the moment. Nothing has been sent and nothing is charged. You may be able to book it as a single visit instead.`}
          action={
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/book/${service.slug}`}
                className={buttonStyles({ variant: "primary" })}
              >
                Book a visit instead
              </Link>
              <Link href="/requests/new" className={buttonStyles({ variant: "outline" })}>
                Choose something else
              </Link>
            </div>
          }
        />
      </main>
    );
  }

  return (
    <main>
      {/* No route props. They were functions, and a Server Component cannot hand
          a function to a Client Component — see `@/lib/routes`, which both sides
          import instead. */}
      <RequirementFlow service={service} variant={variant} initialSelection={selectedService} />
    </main>
  );
}
