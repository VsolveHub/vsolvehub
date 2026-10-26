import { ChooseVisitsScreen } from "@/features/project-request/view/gallery/choose-visits-screen";
import { SlotSheet } from "@/features/project-request/view/gallery/slot-sheet";
import {
  SAMPLE_CHOSEN_PLAN,
  SAMPLE_SERVICE,
  SAMPLE_SITE,
  SAMPLE_VISITS,
  SAMPLE_VISIT_TIERS,
} from "@/lib/design-gallery/sample";

/**
 * `/design/m2/slot-sheet` — the visit-time sheet, open over step 3.
 *
 * A gallery page, not a route in the flow: the slot grid, the signed token and
 * the confirm all live under `/api/v1/partner/…`, so nothing here is fetched and
 * the day and window tiles are fixed sample values.
 *
 * Step 3 is drawn behind the scrim rather than a grey rectangle, because what
 * this artboard is really showing is the relationship between the two — the row
 * the customer tapped is the row the sheet is about to fill in. It is marked
 * `inert`, which is what a real modal does to the page under it: no pointer, no
 * tab stop, and out of the accessibility tree.
 */

/**
 * The visit being timed: the one row still outstanding on the screen behind.
 * Taken from the shared sample so the two artboards cannot disagree about which
 * visit is open, on which day, in which window.
 */
const OPEN_VISIT = SAMPLE_VISITS[SAMPLE_CHOSEN_PLAN.planSize - 1];

const SAMPLE_FACTS = "Two bathrooms · 12 fittings · Water supply working";
const SAMPLE_START_LINE = "From Tue, 2 September · ± a week";

const GALLERY_VISITS = SAMPLE_VISITS.map((visit) => ({
  index: visit.index,
  when: visit.index === OPEN_VISIT.index ? null : `${visit.day} · ${visit.window}`,
}));

/**
 * The days on offer. Short forms on the tile because it is a third of a phone
 * wide; the long form is what gets spoken, since an abbreviation read aloud is
 * worse than the word.
 */
const GALLERY_DAYS = [
  { id: "d1", name: "Today", dayNumber: "1", month: "Sep", spoken: "Today, 1 September" },
  { id: "d2", name: "Tomorrow", dayNumber: "2", month: "Sep", spoken: "Tomorrow, 2 September" },
  { id: "d3", name: "Wed", dayNumber: "3", month: "Sep", spoken: "Wednesday, 3 September" },
  { id: "d4", name: "Thu", dayNumber: "4", month: "Sep", spoken: "Thursday, 4 September" },
  { id: "d5", name: "Fri", dayNumber: "5", month: "Sep", spoken: "Friday, 5 September" },
  { id: "d6", name: "Sat", dayNumber: "6", month: "Sep", spoken: "Saturday, 6 September" },
];

/**
 * The two-hour windows.
 *
 * One of them covers nobody, deliberately. Partial supply is the case these
 * screens exist to handle honestly, and a sample where every window is
 * available would let a build ship that cannot render the empty one.
 */
const GALLERY_WINDOWS = [
  {
    id: "w1",
    label: "08:00 – 10:00",
    availability: "4 pros cover this area",
    available: true,
  },
  {
    id: "w2",
    label: OPEN_VISIT.window,
    availability: "6 pros cover this area",
    available: true,
  },
  {
    id: "w3",
    label: "12:00 – 14:00",
    availability: "None cover this area",
    available: false,
  },
  {
    id: "w4",
    label: "16:00 – 18:00",
    availability: "3 pros cover this area",
    available: true,
  },
];

// Matched rather than hardcoded: the selected tiles are whichever ones carry the
// sample visit's own day and window, so renaming an id or reordering the grid
// cannot leave the wrong tile lit.
const SELECTED_DAY_ID =
  GALLERY_DAYS.find(
    (day) => `${day.name} ${day.dayNumber} ${day.month}` === OPEN_VISIT.day,
  )?.id ?? null;

const SELECTED_WINDOW_ID =
  GALLERY_WINDOWS.find((slot) => slot.label === OPEN_VISIT.window)?.id ?? null;

export const metadata = { title: "Pick a slot — M2", robots: { index: false, follow: false } };

export default function SlotSheetGalleryPage() {

  // A `div`, not the `main` its sibling gallery pages use: the screen inside the
  // frame carries its own `main`, and nesting one inside another is a landmark a
  // screen reader cannot make sense of.
  return (
    <div className="min-h-[100dvh] bg-canvas p-6">
      <div className="mx-auto h-[844px] w-[390px] overflow-hidden border border-line">
        <div className="relative h-full w-full">
          <div inert className="h-full w-full">
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

          {/* `Sheet`'s own backdrop, as a plate: `backdrop:bg-navy-900/40`. */}
          <div aria-hidden className="absolute inset-0 bg-navy-900/40" />

          <SlotSheet
            className="absolute inset-x-0 bottom-0"
            title={`Visit ${OPEN_VISIT.index}`}
            description="The professional accepts or passes. They never move your time."
            days={GALLERY_DAYS}
            selectedDayId={SELECTED_DAY_ID}
            windows={GALLERY_WINDOWS}
            selectedWindowId={SELECTED_WINDOW_ID}
          />
        </div>
      </div>
    </div>
  );
}
