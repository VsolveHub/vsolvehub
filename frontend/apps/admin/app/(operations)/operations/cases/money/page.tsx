import { redirect } from "next/navigation";

/** Folded into the case queue; the old address still lands somewhere useful. */
export default function RetiredCasesTab() {
  redirect("/operations/cases");
}
