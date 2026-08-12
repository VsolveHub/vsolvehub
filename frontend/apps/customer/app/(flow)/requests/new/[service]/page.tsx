import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, buttonStyles } from "@vsolve/ui";

import { getServiceConfiguration } from "@/features/catalog/queries";
import { RequirementFlow } from "@/features/requirement/view/requirement-flow";

/**
 * The four-screen requirement — `M2-FE-201..212`.
 *
 * ## One route for four screens
 *
 * The information architecture lists `/requests/new/what`, `/where-when`,
 * `/details` and `/review` as four routes. They are deliberately not mounted as
 * four, on the precedent of `/book/[service]` and `/checkout`: the flow is one
 * reducer, back is a *screen change* rather than a navigation, and nothing is
 * lost or refetched crossing a step. Four URLs would need the reducer's screen
 * to be readable from the address bar, and `canNavigateTo` exists precisely to
 * refuse a forward jump — a pasted `/requests/new/review` would either skip
 * every guard or bounce, and neither is a route worth having. The flow-weight
 * budget is about screens the Customer walks through, and it is enforced by
 * `SCREENS.length === 4` rather than by a folder count. Recorded in the
 * execution plan §7 so the IA table can be corrected rather than quietly
 * disagreed with.
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

export const metadata: Metadata = {
  title: "Describe a job",
  robots: { index: false, follow: false },
};

/** The two lifecycles this flow can produce. Never rendered — see `WhatScreen`. */
const M2_ARCHETYPES = ["A3_TIME_BLOCK", "A5_CUSTOM_PROJECT"];

export default async function NewRequestForServicePage({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  const { service: serviceSlug } = await params;
  const service = await getServiceConfiguration(serviceSlug);

  if (service === null) notFound();

  // First match rather than a chooser. A service with two M2 variants is a
  // catalogue shape nothing has produced yet, and offering a pick between
  // "time block" and "custom project" is exactly the archetype question
  // `GAP-006` forbids asking. If it ever happens, the choice has to be
  // expressed in the Customer's own words, which is a product decision rather
  // than a dropdown.
  const variant = service.variants.find((entry) =>
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
      <RequirementFlow
        service={service}
        variant={variant}
        requestHrefFor={(requirementId) => `/requests/${requirementId}`}
        browseHref="/catalog"
      />
    </main>
  );
}
