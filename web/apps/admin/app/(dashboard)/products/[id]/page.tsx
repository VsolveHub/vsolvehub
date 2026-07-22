import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { prisma } from "@vsolve/db";
import { Badge, Card } from "@vsolve/ui";
import { requireAdmin } from "@/lib/auth";
import { ProductForm } from "../product-form";
import { removeMapping } from "../actions";
import { AddMappingForm } from "./add-mapping-form";

export const metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      brand: true,
      productCategory: true,
      serviceMaps: {
        include: {
          service: { include: { category: true } },
          subCategory: { include: { category: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!product) notFound();

  const [categories, brands, serviceCategories] = await Promise.all([
    prisma.productCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.serviceCategory.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        subCategories: { orderBy: { sortOrder: "asc" } },
        services: { orderBy: { name: "asc" } },
      },
    }),
  ]);

  let specs: Record<string, string> = {};
  let images: string[] = [];
  try {
    specs = JSON.parse(product.specs);
  } catch {}
  try {
    images = JSON.parse(product.images);
  } catch {}

  return (
    <div className="max-w-3xl">
      <Link href="/products" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" />
        Products
      </Link>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-ink-900">{product.name}</h1>
        <Badge tone={product.isActive ? "success" : "neutral"}>{product.isActive ? "Active" : "Inactive"}</Badge>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        {product.sku} · {product.productCategory.name}
        {product.brand ? ` · ${product.brand.name}` : ""}
      </p>

      <Card className="mt-6 p-6">
        <ProductForm
          values={{
            id: product.id,
            name: product.name,
            sku: product.sku,
            description: product.description,
            productCategoryId: product.productCategoryId,
            brandId: product.brandId,
            mrpPaise: product.mrpPaise,
            pricePaise: product.pricePaise,
            gstRatePct: product.gstRatePct,
            stockQty: product.stockQty,
            isActive: product.isActive,
            images,
            specs,
          }}
          categories={categories}
          brands={brands}
        />
      </Card>

      <h2 className="mt-8 text-lg font-bold text-ink-900">Service mappings</h2>
      <p className="mt-1 text-sm text-gray-500">
        This product is only visible (to customers and technicians) on the services mapped below. Map a whole
        subcategory to cover every service in it, or a single service for precision.
      </p>

      <Card className="mt-4 p-5">
        {product.serviceMaps.length === 0 ? (
          <p className="text-sm text-gray-400">
            Not mapped to any service yet — this product only appears in the marketplace.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {product.serviceMaps.map((m) => {
              const label = m.service
                ? `${m.service.category.name} → ${m.service.name}`
                : m.subCategory
                  ? `${m.subCategory.category.name} → ${m.subCategory.name} (all services)`
                  : "—";
              return (
                <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge tone={m.service ? "brand" : "warning"}>{m.service ? "Service" : "Subcategory"}</Badge>
                    <span className="text-ink-900">{label}</span>
                    {m.featured ? <Badge tone="success">Featured</Badge> : null}
                  </div>
                  <form action={removeMapping}>
                    <input type="hidden" name="id" value={m.id} />
                    <button
                      type="submit"
                      title="Remove mapping"
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-5 border-t border-border pt-5">
          <AddMappingForm productId={product.id} serviceCategories={serviceCategories.map((c) => ({
            name: c.name,
            subCategories: c.subCategories.map((s) => ({ id: s.id, name: s.name })),
            services: c.services.map((s) => ({ id: s.id, name: s.name })),
          }))} />
        </div>
      </Card>
    </div>
  );
}
