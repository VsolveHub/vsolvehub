import { redirect } from "next/navigation";

/** Moved into a tab of its service's page; old links and bookmarks land there. */
export default function MovedPage() {
  redirect("/operations/home-services?tab=offers");
}
