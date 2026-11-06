import { ApplicationOverview } from "@/features/application/view/application-overview";

/**
 * The application overview, as on the website's `/apply`: the choice of how to join for a
 * partner who has not chosen yet, then the checklist. It used to jump straight to About you,
 * which put every new partner on the Services form without asking.
 */
export default function ApplyPage() {
  return <ApplicationOverview />;
}
