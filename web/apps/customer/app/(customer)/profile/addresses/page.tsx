import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { ProfileSubPage } from "@/components/customer/profile/ProfileSubPage";
import { ProfileAddressesSummary } from "@/components/customer/profile/ProfileStats";
import { prisma } from "@/lib/db/client";
import { AddressManager } from "@/components/customer/profile/AddressManager";

export default async function ProfileAddressesPage() {
  const session = await getServerSession();
  if (!session) redirect("/booking/otp?redirect=/profile/addresses");

  const addresses = await prisma.address.findMany({
    where: { userId: session.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  return (
    <ProfileSubPage title="Manage addresses">
      <ProfileAddressesSummary count={addresses.length} />
      <AddressManager initialAddresses={addresses} />
    </ProfileSubPage>
  );
}
