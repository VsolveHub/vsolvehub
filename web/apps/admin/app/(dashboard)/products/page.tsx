import Link from "next/link";
import { Search, Plus } from "lucide-react";
import { prisma, type Prisma } from "@vsolve/db";
import { Badge, Card } from "@vsolve/ui";
import { requireAdmin } from "@/lib/auth";
import { toggleProductActive } from "./actions";

export const metadata = { title: "Products" };

const PAGE_SIZE = 20;

function formatPrice(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const category = sp.category ?? "";
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.ProductWhereInput = {
    ...(category ? { productCategory: { slug: category } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [products, total, categories] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { brand: true, productCategory: true, _count: { select: { serviceMaps: true } } },
      orderBy: [{ productCategory: { sortOrder: "asc" } }, { name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
    prisma.productCategory.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (overrides: Record<string, string | number>) => {
    const params = new URLSearchParams({
      ...(category ? { category } : {}),
      ...(q ? { q } : {}),
    });
    for (const [k, v] of Object.entries(overrides)) params.set(k, String(v));
    return `/products?${params.toString()}`;
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Products</h1>
          <p className="mt-1 text-sm text-gray-500">
            Central catalog powering booking add-ons, technician parts, and the marketplace. Prices set here apply everywhere.
          </p>
        </div>
        <Link
          href="/products/new"
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          New product
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <nav className="flex flex-wrap gap-1 rounded-lg border border-border bg-white p-1">
          <Link
            href={qs({ category: "", page: 1 })}
            className={
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
              (!category ? "bg-brand-600 text-white" : "text-gray-500 hover:bg-surface-muted hover:text-ink-900")
            }
          >
            All
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={qs({ category: c.slug, page: 1 })}
              className={
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                (category === c.slug
                  ? "bg-brand-600 text-white"
                  : "text-gray-500 hover:bg-surface-muted hover:text-ink-900")
              }
            >
              {c.name}
            </Link>
          ))}
        </nav>

        <form action="/products" method="get" className="flex w-full items-center gap-2 sm:w-auto">
          {category ? <input type="hidden" name="category" value={category} /> : null}
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search name or SKU"
              className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </form>
      </div>

      <Card className="mt-4 overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border bg-surface-muted text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3">Product</th>
              <th className="px-5 py-3">SKU</th>
              <th className="px-5 py-3">Category</th>
              <th className="px-5 py-3">Price</th>
              <th className="px-5 py-3">GST</th>
              <th className="px-5 py-3">Stock</th>
              <th className="px-5 py-3">Mappings</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-muted">
                <td className="px-5 py-3">
                  <Link href={`/products/${p.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                    {p.name}
                  </Link>
                  {p.brand ? <p className="text-xs text-gray-400">{p.brand.name}</p> : null}
                </td>
                <td className="px-5 py-3 text-gray-600">{p.sku}</td>
                <td className="px-5 py-3 text-gray-600">{p.productCategory.name}</td>
                <td className="px-5 py-3">
                  <span className="font-medium text-ink-900">{formatPrice(p.pricePaise)}</span>
                  {p.mrpPaise > p.pricePaise ? (
                    <span className="ml-1.5 text-xs text-gray-400 line-through">{formatPrice(p.mrpPaise)}</span>
                  ) : null}
                </td>
                <td className="px-5 py-3 text-gray-600">{p.gstRatePct}%</td>
                <td className="px-5 py-3">
                  <span className={p.stockQty === 0 ? "font-semibold text-red-600" : "text-gray-600"}>
                    {p.stockQty}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-600">{p._count.serviceMaps}</td>
                <td className="px-5 py-3">
                  <form action={toggleProductActive}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" title={p.isActive ? "Click to deactivate" : "Click to activate"}>
                      <Badge tone={p.isActive ? "success" : "neutral"}>{p.isActive ? "Active" : "Inactive"}</Badge>
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {products.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">
                  No products match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
        <p>
          {total === 0 ? "0 results" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
        </p>
        <div className="flex gap-2">
          <Link
            href={qs({ page: Math.max(1, page - 1) })}
            aria-disabled={page <= 1}
            className={
              "rounded-lg border border-border bg-white px-3 py-1.5 font-medium " +
              (page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-surface-muted")
            }
          >
            Previous
          </Link>
          <Link
            href={qs({ page: Math.min(totalPages, page + 1) })}
            aria-disabled={page >= totalPages}
            className={
              "rounded-lg border border-border bg-white px-3 py-1.5 font-medium " +
              (page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-surface-muted")
            }
          >
            Next
          </Link>
        </div>
      </div>
    </div>
  );
}
