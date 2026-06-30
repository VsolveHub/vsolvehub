import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "@/lib/auth/session";
import { ProfileSubPage } from "@/components/customer/profile/ProfileSubPage";
import { ProfileSavedSummary } from "@/components/customer/profile/ProfileStats";
import { prisma } from "@/lib/db/client";
import { serializeService, serviceInclude } from "@/lib/catalog/queries";
import { ServiceCard } from "@/components/customer/services/ServiceCard";

export default async function ProfileSavedPage() {
  const session = await getServerSession();
  if (!session) redirect("/booking/otp?redirect=/profile/saved");

  const saved = await prisma.savedService.findMany({
    where: { userId: session.id },
    include: { service: { include: serviceInclude } },
    orderBy: { createdAt: "desc" },
  });

  const services = saved.map((s) => serializeService(s.service));

  return (
    <ProfileSubPage title="Saved services">
      <ProfileSavedSummary count={services.length} />
      {services.length === 0 ? (
        <div className="empty-state">
          <p>No saved services yet.</p>
          <Link href="/services" className="btn btn-primary">
            Explore services
          </Link>
        </div>
      ) : (
        <div className="grid-2">
          {services.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      )}
    </ProfileSubPage>
  );
}
