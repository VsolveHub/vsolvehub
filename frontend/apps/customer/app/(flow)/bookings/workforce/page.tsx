import { redirect } from "next/navigation";

import { activityTabHref } from "@/features/activity/model/routes";

export default function BookingsWorkforcePage(): never {
  redirect(activityTabHref("booked"));
}
