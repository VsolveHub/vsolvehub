import type { Metadata } from "next";

import { ProfilePreview } from "@/features/application/view/profile-preview";
import { getWorkCatalog } from "@/features/catalog/queries";

export const metadata: Metadata = { title: "Your profile" };

/** Read-only preview of the application, opened from Profile in the account menu. */
export default async function ProfilePage() {
  // Job-type names, loaded on the server once, as `/apply/work` does.
  const { services } = await getWorkCatalog();
  return <ProfilePreview services={services} />;
}
