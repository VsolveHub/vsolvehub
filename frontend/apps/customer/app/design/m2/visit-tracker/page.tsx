import type { Metadata } from "next";

import {
  VisitTrackerScreen,
  type VisitTimelineEventView,
} from "@/features/access/view/gallery/visit-tracker-screen";
import {
  SAMPLE_ARRIVAL_CODE,
  SAMPLE_PARTNER,
  SAMPLE_SITE,
  SAMPLE_VISITS,
} from "@/lib/design-gallery/sample";

/**
 * `VisitTrackerScreen` at artboard size.
 *
 * No auth and no app chrome of its own: there is no session to gate on and the
 * screen supplies its own header and scroll region.
 *
 * The visit is the first sample slot — the one that was held at
 * `/design/m2/matching` and paid for at `/design/m2/visit-checkout` — which is
 * why this is the only one of the three screens showing the full site address
 * and the word "Booked". The timeline lives here rather than in the component
 * because it is this visit's record, not the screen's furniture; the timestamps
 * are the fixture's, and the two events that have not happened carry no time at
 * all rather than an invented one.
 *
 * NEVER import the sample from a real route. It is sample data, not a fallback.
 */

export const metadata: Metadata = {
  title: "Visit tracker — M2",
  robots: { index: false, follow: false },
};

const BOOKED_VISIT = SAMPLE_VISITS[0];

/** "Ravi", as the timeline and the partner's own app address him. */
const FIRST_NAME = SAMPLE_PARTNER.name.split(" ")[0];

const TIMELINE: readonly VisitTimelineEventView[] = [
  { id: "requested", title: "Request sent", timestamp: "Sun, 9:12 pm", tone: "success" },
  {
    id: "accepted",
    title: `${FIRST_NAME} accepted your time`,
    timestamp: "Sun, 9:15 pm",
    tone: "success",
  },
  {
    id: "booked",
    title: "Visit booked",
    timestamp: "Sun, 9:16 pm",
    tone: "active",
    detail: `Your address has been shared with ${FIRST_NAME}.`,
  },
  { id: "on-the-way", title: `${FIRST_NAME} is on the way`, timestamp: "", tone: "neutral" },
  { id: "estimate", title: "Estimate received", timestamp: "", tone: "neutral" },
];

export default function VisitTrackerGalleryPage() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-canvas px-4 py-8">
      <div className="mx-auto h-[844px] w-[390px] overflow-hidden border border-line">
        <VisitTrackerScreen
          visitIndex={BOOKED_VISIT.index}
          visitCount={SAMPLE_VISITS.length}
          day={BOOKED_VISIT.day}
          window={BOOKED_VISIT.window}
          professional={{
            name: SAMPLE_PARTNER.name,
            initials: SAMPLE_PARTNER.initials,
            trade: SAMPLE_PARTNER.trade,
            rating: SAMPLE_PARTNER.rating,
            idVerified: true,
          }}
          arrivalCode={SAMPLE_ARRIVAL_CODE}
          siteAddress={SAMPLE_SITE.full}
          siteLandmark={SAMPLE_SITE.landmark}
          timeline={TIMELINE}
        />
      </div>
    </div>
  );
}
