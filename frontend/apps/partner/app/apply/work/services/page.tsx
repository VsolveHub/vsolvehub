import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Your trades" };

/** Job types now live on the trades step; keep old links working. */
export default function WorkServicesPage() {
  redirect("/apply/work");
}
