import { redirect } from "next/navigation";

// The partner app lives at /dashboard now. Keep /live as a redirect for old links.
export default function LiveRedirect() {
  redirect("/dashboard");
}
