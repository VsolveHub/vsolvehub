import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { serializeService, serviceInclude } from "@/lib/catalog/queries";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { CategorySlugPageClient } from "./CategorySlugPageClient";

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
    <div className="services-page">
      <header className="services-page__header">
        <Link href="/services" className="services-page__back">
          ← All categories
        </Link>
        <div className="flex-align gap-sm" style={{ marginTop: "1rem" }}>
          <span style={{ fontSize: "2rem" }}>{category.icon}</span>
          <h1 className="services-page__title" style={{ margin: 0 }}>
            {category.name}
          </h1>
        </div>
        <p className="services-page__meta">
          {category.tagline ?? "Quality home services at your doorstep."}
        </p>
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
