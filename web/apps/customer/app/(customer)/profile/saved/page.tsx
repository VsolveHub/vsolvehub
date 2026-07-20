import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "@/lib/auth/session";
import { ProfileSubPage } from "@/components/customer/profile/ProfileSubPage";
import { ProfileSavedSummary } from "@/components/customer/profile/ProfileStats";
import { prisma } from "@/lib/db/client";
import { serializeService, serviceInclude } from "@/lib/catalog/queries";
import { ServiceCard } from "@/components/customer/services/ServiceCard";
import { EmptyState } from "@/components/ui/primitives";

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
        <EmptyState
          icon="⭐"
          title="No saved services yet."
          action={
            <Link
              href="/services"
              className="inline-flex items-center justify-center rounded-[10px] bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-900"
            >
              Explore services
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {services.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      )}
    </ProfileSubPage>
  );
}
