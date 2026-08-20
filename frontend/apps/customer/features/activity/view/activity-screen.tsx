import { SegmentedTrack, segmentStyles } from "@vsolve/ui";
import Link from "next/link";

import { BookingGroupList } from "@/features/bookings/view/group-list";
import { EngagementListScreen } from "@/features/engagement/view/engagement-list-screen";
import { MyRequestsScreen } from "@/features/requirement/view/my-requests-screen";

/**
 * The three segments of the Activity hub, and how a URL turns into one.
 *
 * Exported from the screen rather than from a module of their own: the route,
 * the four redirects and the screen all need the same three answers, and the
 * parsing is still testable without rendering anything because it is a pure
 * function that happens to live beside its only consumer.
 */

export const ACTIVITY_TABS = ["booked", "requests", "projects"] as const;

export type ActivityTab = (typeof ACTIVITY_TABS)[number];

export const DEFAULT_ACTIVITY_TAB: ActivityTab = "booked";

/**
 * What each segment is called, and what it promises.
 *
 * The three descriptions are not decoration. They are the sentence that keeps
 * the money promises apart now that the three lists share one screen: platform
 * bookings are paid through us, crew wages are not, projects are funded stage
 * by stage. Merging the lists is only defensible because these stay.
 */
export const ACTIVITY_TAB_COPY: Record<ActivityTab, { label: string; description: string }> = {
  booked: {
    label: "Booked",
    description: "Work that is arranged — both jobs booked through us and crew you hired directly.",
  },
  requests: {
    label: "Requests",
    description: "Jobs you have described and what is happening to each one.",
  },
  projects: {
    label: "Projects",
    description: "Work you are funding through V Solve Hub, one stage at a time.",
  },
};

/**
 * Narrow an untrusted `?tab=` to a segment.
 *
 * A query parameter is user input and arrives as `string | string[] | undefined`
 * from Next. Anything that is not one of the three is the default rather than an
 * error: a stale bookmark or a truncated share link should land somebody on the
 * hub, not on a 404.
 */
export function toActivityTab(value: string | string[] | undefined): ActivityTab {
  const first = Array.isArray(value) ? value[0] : value;
  return ACTIVITY_TABS.includes(first as ActivityTab)
    ? (first as ActivityTab)
    : DEFAULT_ACTIVITY_TAB;
}

/** The canonical href for a segment. One place, so links and redirects agree. */
export function activityTabHref(tab: ActivityTab): string {
  return tab === DEFAULT_ACTIVITY_TAB ? "/activity" : `/activity?tab=${tab}`;
}

/**
 * Everything the Customer has going, in one place.
 *
 * ## Why this screen exists
 *
 * `My bookings`, `My requests` and `My projects` were three top-level
 * destinations, plus `/bookings/workforce` reachable only from a sentence at the
 * bottom of one of them. Four places, and which one holds the thing you are
 * looking for depends on knowing our vocabulary: that a job you described is a
 * "request" until somebody quotes it, that hiring a crew produces a "booking"
 * but funding a renovation produces a "project". A Customer who wants "the
 * bathroom job" knows none of that and should not have to.
 *
 * So there is one door, and the distinctions become segments behind it.
 *
 * ## What the merge must not cost, and does not
 *
 * The three lists say different things about who holds the money, and that is
 * not a detail — it is the difference between work V Solve Hub is accountable
 * for and work it merely introduced. `engagement-list-screen.tsx` refuses to put
 * one noun over both, and it is right to. Nothing here overrules that:
 *
 * - Each segment carries its own description, above its own list.
 * - The A3 direct-payment reminder still renders above the crew rows, in the
 *   `Booked` segment, exactly as it does on the standalone page.
 * - The two halves of `Booked` are separate sections with separate headings,
 *   not one merged list, because one of them is money we hold and the other is
 *   money we never touch.
 *
 * ## Why this is a Server Component
 *
 * It renders headings, links and three client lists that fetch their own data.
 * There is nothing here to hydrate: the segments are `<Link>`s, so the current
 * segment lives in the URL, the back button works, and a segment is shareable.
 * That is also why they are not a `SegmentedControl` — that control is for view
 * state, and which record set you are looking at is a place.
 *
 * ## Why there are no counts on the segments
 *
 * A count is the most useful thing a segment can carry and the easiest to get
 * wrong. Bookings and engagements are both cursor-paginated, so what this screen
 * could count is "rows on the first page", and a `2` beside a segment holding
 * twenty is worse than no number at all. Real counts need a summary the server
 * publishes; until it does, the segments say what they hold and not how much.
 */
export function ActivityScreen({ tab }: { tab: ActivityTab }) {
  const copy = ACTIVITY_TAB_COPY[tab];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 pb-16 pt-6 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-text">Activity</h1>

      <SegmentedTrack label="Your work" className="mt-4">
        {ACTIVITY_TABS.map((candidate) => (
          <Link
            key={candidate}
            href={activityTabHref(candidate)}
            aria-current={candidate === tab ? "page" : undefined}
            className={segmentStyles({ selected: candidate === tab })}
          >
            {ACTIVITY_TAB_COPY[candidate].label}
          </Link>
        ))}
      </SegmentedTrack>

      <p className="mt-3 text-sm leading-6 text-text-secondary">{copy.description}</p>

      <div className="mt-5">
        {tab === "booked" ? <BookedSegment /> : null}
        {tab === "requests" ? <MyRequestsScreen /> : null}
        {tab === "projects" ? (
          <EngagementListScreen
            mode="managed"
            chrome="embedded"
            newRequestHref="/requests/new"
            requestsHref={activityTabHref("requests")}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Two lists under one segment, and why they are not one list.
 *
 * A job booked through the catalog and a crew hired off the rate card are both
 * "booked" in the only sense a Customer cares about — somebody is coming. But we
 * hold the money for the first and never touch it for the second, so a single
 * list would need one set of words for two different promises. Two sections with
 * their own headings costs a little vertical space and keeps the promise exact.
 */
function BookedSegment() {
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="activity-bookings-heading">
        <h2
          id="activity-bookings-heading"
          className="text-xs font-bold uppercase tracking-[0.08em] text-text-secondary"
        >
          Booked through V Solve Hub
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Every visit in a booking is confirmed together.
        </p>
        <div className="mt-3">
          <BookingGroupList />
        </div>
      </section>

      <section aria-labelledby="activity-crew-heading">
        <h2
          id="activity-crew-heading"
          className="text-xs font-bold uppercase tracking-[0.08em] text-text-secondary"
        >
          Crew you have hired
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Jobs where you agreed a rate with a professional and pay them directly.
        </p>
        <div className="mt-3">
          <EngagementListScreen
            mode="lead_only"
            chrome="embedded"
            newRequestHref="/requests/new"
            requestsHref={activityTabHref("requests")}
          />
        </div>
      </section>
    </div>
  );
}
