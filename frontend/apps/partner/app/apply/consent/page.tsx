import { redirect } from "next/navigation";

/** The agreements are accepted on the step that sends the application. */
export default function ConsentPage() {
  redirect("/apply/review");
}
