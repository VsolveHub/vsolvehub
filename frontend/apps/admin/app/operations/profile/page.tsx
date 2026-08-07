import type { Metadata } from "next";

import { ProfileView } from "@/features/profile/profile-view";
import { OperationsShell } from "@/features/session/operations-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profile",
};

export default function OperatorProfilePage() {
  return (
    <OperationsShell>
      <ProfileView />
    </OperationsShell>
  );
}
