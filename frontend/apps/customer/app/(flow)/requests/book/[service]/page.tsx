import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, buttonStyles } from "@vsolve/ui";

import { getServiceConfiguration } from "@/features/catalog/queries";
import { BookCrewScreen } from "@/features/crew/view/book-crew-screen";

/**
 * The A3 preset — `M2-FE-425`, `M2-FE-426` (revision 4, ADR-0009).
 *
 * ## Why `book` is a static segment here
 *
 * This level already carries `/requests/[requirementId]` and `/requests/new`.
 * Next.js refuses two different dynamic slug names at one path level — the build
 * fails — so a second dynamic segment was never available, and a static one is
 * the shape the information architecture specifies. A static segment also wins
 * the match over its dynamic sibling, so `/requests/[requirementId]` is
 * untouched. This is the same lesson `/bookings/workforce` was built on after
 * `/bookings/[groupId]` blocked `/bookings/[engagementId]`.
 *
 * ## The variant is resolved on the server, before anything is offered
 *
 * Only an **A3** variant has a rate card behind it: the instant path is refused
 * outright on anything else, and the four-screen flow remains the A5 shape.
 * Resolving that here means a Customer who followed `Book a crew` onto a service
 * that cannot be booked instantly is told so before the first field, and is
 * given the route that does work.
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
    title: service ? `Book a ${service.name} crew` : "Book a crew",
    robots: { index: false, follow: false },
  };
}

/** The one archetype this route serves. A5 belongs to `/requests/new/[service]`. */
const A3 = "A3_TIME_BLOCK";

export default async function BookCrewPage({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  const { service: serviceSlug } = await params;
  const service = await getServiceConfiguration(serviceSlug);

  if (service === null) notFound();

  // `requirement_variants`, not `variants`: the latter is the A1 *task* list and
  // never contained an M2 variant. See the note on `/requests/new/[service]`.
  const variant = service.requirement_variants.find(
    (entry) => entry.fulfilment_archetype === A3,
  );

  if (variant === undefined) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-10">
        <EmptyState
          title="We do not book crews for this at a published rate"
          description={`${service.name} is not set up for instant crew booking. Nothing has been sent and nothing is charged — you can describe the job instead and professionals will quote for it.`}
          action={
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/requests/new/${service.slug}`}
                className={buttonStyles({ variant: "primary" })}
              >
                Tell us what you need
              </Link>
              <Link href="/catalog" className={buttonStyles({ variant: "outline" })}>
                Browse other services
              </Link>
            </div>
          }
        />
      </main>
    );
  }

  return (
    <main>
      {/* No route props. They would be functions, and a Server Component cannot
          hand a function to a Client Component — see `@/lib/routes`, which both
          sides import instead. */}
      <BookCrewScreen service={service} variant={variant} />
    </main>
  );
}
