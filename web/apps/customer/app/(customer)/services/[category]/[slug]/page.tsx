import { notFound } from "next/navigation";
import { getServiceBySlug, getServiceReviews, getServicesByCategory, serializeService, serviceInclude } from "@/lib/catalog/queries";
import { buildServiceDetailContent } from "@/lib/catalog/service-detail-content";
import { ServiceDetailView } from "@/components/customer/services/ServiceDetailView";
import { SubcategoryServicesView } from "@/components/customer/services/SubcategoryServicesView";
import { TrackRecentlyViewed } from "@/components/customer/services/TrackRecentlyViewed";
import { getSubcategoryIcon } from "@/lib/catalog/service-icons";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

type PageProps = {
  params: Promise<{ category: string; slug: string }>;
};

export default async function ServiceDetailPage({ params }: PageProps) {
  const { category, slug } = await params;

  // The slug may be a subcategory (e.g. "electrician") — if so, list its services.
  const subCategory = await prisma.serviceSubCategory.findFirst({
    where: { slug, category: { slug: category } },
    include: {
      category: true,
      services: { include: serviceInclude, orderBy: { name: "asc" } },
    },
  });

  if (subCategory) {
    return (
      <SubcategoryServicesView
        categorySlug={subCategory.category.slug}
        categoryName={subCategory.category.name}
        subCategoryName={subCategory.name}
        subCategoryIcon={getSubcategoryIcon(subCategory.slug)}
        services={subCategory.services.map(serializeService)}
      />
    );
  }

  const service = await getServiceBySlug(category, slug);
  if (!service) notFound();

  const detail = buildServiceDetailContent(service);

  // Real reviews (from completed bookings) + real sibling services — no dummy data.
  const [reviews, categoryServices] = await Promise.all([
    getServiceReviews(service.id),
    getServicesByCategory(category),
  ]);
  const related = categoryServices.filter((s) => s.id !== service.id).slice(0, 4);

  const session = await getServerSession();
  let isSaved = false;
  if (session) {
    const saved = await prisma.savedService.findUnique({
      where: {
        userId_serviceId: { userId: session.id, serviceId: service.id },
      },
    });
    isSaved = !!saved;
  }

  const shareUrl = `/services/${category}/${slug}`;

  return (
    <>
      <TrackRecentlyViewed serviceId={service.id} />
      <ServiceDetailView
        service={service}
        detail={detail}
        reviews={reviews}
        related={related}
        shareUrl={shareUrl}
        isSaved={isSaved}
        showSave={!!session}
      />
    </>
  );
}
