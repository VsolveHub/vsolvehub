import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { serializeService, serviceInclude } from "@/lib/catalog/queries";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { CategorySlugPageClient } from "./CategorySlugPageClient";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";

type PageProps = {
  params: Promise<{ category: string }>;
};

export default async function CategoryPage({ params }: PageProps) {
  const { category: categorySlug } = await params;

  // Fetch the category, its subcategories and services
  const category = await prisma.serviceCategory.findUnique({
    where: { slug: categorySlug },
    include: {
      subCategories: {
        orderBy: { sortOrder: "asc" },
        include: {
          services: {
            include: serviceInclude,
            orderBy: { name: "asc" },
          },
        },
      },
      services: {
        where: { subCategoryId: null },
        include: serviceInclude,
        orderBy: { name: "asc" },
      },
    },
  });

  if (!category) {
    notFound();
  }

  // Map database model to serialized props
  const serializedSubCategories = category.subCategories.map((sub) => ({
    id: sub.id,
    name: sub.name,
    slug: sub.slug,
    services: sub.services.map(serializeService),
  }));

  const serializedStandaloneServices = category.services.map(serializeService);

  return (
    <div className="cat-page-v3">
      {/* Breadcrumbs */}
      <div className="cat-breadcrumbs-container">
        <div className="cat-breadcrumbs">
          <Link href="/">Home</Link>
          <span>›</span>
          <Link href="/services">Services</Link>
          <span>›</span>
          <span className="current">{category.name}</span>
        </div>
      </div>

      {/* Dark Hero Banner */}
      <header className="cat-hero-dark">
        <div className="cat-hero-content">
          <div className="cat-hero-text-area">
            <div className="cat-hero-title-row">
              <span className="cat-hero-icon" aria-hidden="true">
                <FlaticonIcon name="broom" size={32} color="#fff" />
              </span>
              <h1 className="cat-hero-title">{category.name}</h1>
            </div>
            <p className="cat-hero-desc">
              {category.tagline ?? "Cleaning, pest control, laundry and home care on demand. Expertly managed solutions for a pristine and comfortable living space."}
            </p>
          </div>
          <div className="cat-hero-watermark">
            <FlaticonIcon name="home" size={240} color="rgba(255,255,255,0.05)" />
          </div>
        </div>
      </header>

      <CategorySlugPageClient
        categorySlug={category.slug}
        categoryName={category.name}
        subCategories={serializedSubCategories}
        standaloneServices={serializedStandaloneServices}
      />
    </div>
  );
}
