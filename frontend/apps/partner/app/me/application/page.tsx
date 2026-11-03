import { redirect } from "next/navigation";

/** The application and its documents live on one page. */
export default function PartnerApplicationPage() {
  redirect("/me/documents");
}
