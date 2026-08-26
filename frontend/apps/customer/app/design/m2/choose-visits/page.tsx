import { ChooseVisitsScreen } from "@/features/project-request/view/gallery/choose-visits-screen";
import {
  SAMPLE_CHOSEN_PLAN,
  SAMPLE_SERVICE,
  SAMPLE_SITE,
  SAMPLE_VISITS,
  SAMPLE_VISIT_TIERS,
} from "@/lib/design-gallery/sample";

/**
 * `/design/m2/choose-visits` — the step 3 artboard, at phone size.
 *
 * A gallery page, not a route in the flow. Contract 1.43.0 exposes `plan_size`
 * and nothing else, so there is nothing to fetch here and nothing is fetched:
 * the screen is a pure component and every value on it comes from
 * `lib/design-gallery/sample`, which is where the numbers five parallel screen
 * builds share live so they cannot drift apart.
 *
 * `AppChrome` steps aside for every `/design/` path, so the artboard is shown
 * against a bare canvas rather than under the site header and above the tab
 * bar. That is a path check rather than a `claimViewport()` call, which keeps
 * this a server component and lets it export `metadata` — a client page cannot.
 */

/** The answered details from step 1, as the recap prints them. */
const SAMPLE_FACTS = "Two bathrooms · 12 fittings · Water supply working";

/** The start window from step 2. */
const SAMPLE_START_LINE = "From Tue, 2 September · ± a week";

/**
 * One row per requested estimate.
 *
 * The last one is deliberately empty. This screen exists at the moment before
 * sending, and the state worth drawing is the incomplete one — a screen built
 * only against three filled rows is a screen that cannot show the customer what
 * is still missing, or keep the send button honestly disabled while it is.
 */
const GALLERY_VISITS = SAMPLE_VISITS.map((visit) => ({
  index: visit.index,
  when:
    visit.index === SAMPLE_CHOSEN_PLAN.planSize
      ? null
      : `${visit.day} · ${visit.window}`,
}));

export const metadata = { robots: { index: false, follow: false } };

export default function ChooseVisitsGalleryPage() {

  // A `div`, not the `main` its sibling gallery pages use: the screen inside the
  // frame carries its own `main`, and nesting one inside another is a landmark a
  // screen reader cannot make sense of.
  return (
    <div className="min-h-[100dvh] bg-canvas p-6">
      <div className="mx-auto h-[844px] w-[390px] overflow-hidden border border-line">
        <ChooseVisitsScreen
          recap={{
            serviceName: SAMPLE_SERVICE,
            facts: SAMPLE_FACTS,
            site: SAMPLE_SITE.approximate,
            startLine: SAMPLE_START_LINE,
          }}
          tiers={SAMPLE_VISIT_TIERS}
          planSize={SAMPLE_CHOSEN_PLAN.planSize}
          chosenPriceLabel={SAMPLE_CHOSEN_PLAN.priceLabel}
          visits={GALLERY_VISITS}
        />
      </div>
    </div>
  );
}
