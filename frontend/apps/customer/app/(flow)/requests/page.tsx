import { redirect } from "next/navigation";

import { activityTabHref } from "@/features/activity/model/routes";

export default function RequestsPage(): never {
  redirect(activityTabHref("requests"));
}
