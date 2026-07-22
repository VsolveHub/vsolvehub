import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@vsolve/db";
import { Card } from "@vsolve/ui";
import { requireAdmin } from "@/lib/auth";
import { ProductForm } from "../product-form";
import { QuickCreatePanel } from "../quick-create";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireAdmin();
  const [categories, brands] = await Promise.all([
    prisma.productCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-3xl">
      <Link href="/products" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" />
        Products
      </Link>
      <h1 className="text-2xl font-bold text-ink-900">New product</h1>
      <p className="mt-1 text-sm text-gray-500">
        The price and GST rate set here are the single source of truth across booking add-ons, technician parts, and the marketplace.
      </p>

      <Card className="mt-6 p-6">
        <ProductForm categories={categories} brands={brands} />
      </Card>

      <QuickCreatePanel />
    </div>
  );
}
