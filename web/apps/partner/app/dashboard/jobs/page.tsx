import { redirect } from "next/navigation";

// Jobs live in the app's Home/Jobs tabs at /dashboard.
export default function JobsRedirect() {
  redirect("/dashboard");
}
