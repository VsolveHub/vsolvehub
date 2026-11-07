import { redirect } from "next/navigation";

/** Crew documents are a tab on Applications now; old links land there. */
export default function CrewDocumentsPage() {
  redirect("/reviews?tab=crew-documents");
}
