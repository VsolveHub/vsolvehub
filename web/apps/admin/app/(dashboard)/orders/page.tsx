import Link from "next/link";
import { prisma, type ProductOrderStatus, type Prisma } from "@vsolve/db";
import { Badge, Card } from "@vsolve/ui";
import { requireAdmin } from "@/lib/auth";
import { setOrderStatus } from "./actions";

export const metadata = { title: "Store orders" };

const PAGE_SIZE = 20;

const STATUS_TABS: { value: ProductOrderStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PLACED", label: "Placed" },
  { value: "PACKED", label: "Packed" },
  { value: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
];

const STATUS_TONE: Record<ProductOrderStatus, "success" | "warning" | "danger" | "brand" | "neutral"> = {
  CART: "neutral",
  PLACED: "warning",
  PACKED: "brand",
  OUT_FOR_DELIVERY: "brand",
  DELIVERED: "success",
  CANCELLED: "danger",
};

const NEXT_ACTIONS: Partial<Record<ProductOrderStatus, { status: ProductOrderStatus; label: string }[]>> = {
  PLACED: [
    { status: "PACKED", label: "Mark packed" },
    { status: "CANCELLED", label: "Cancel" },
  ],
  PACKED: [
    { status: "OUT_FOR_DELIVERY", label: "Out for delivery" },
    { status: "CANCELLED", label: "Cancel" },
  ],
  OUT_FOR_DELIVERY: [{ status: "DELIVERED", label: "Mark delivered" }],
};

function formatPrice(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const statusFilter = STATUS_TABS.some((t) => t.value === sp.status) && sp.status !== "ALL"
    ? (sp.status as ProductOrderStatus)
    : null;
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.ProductOrderWhereInput = statusFilter
    ? { status: statusFilter }
    : { status: { not: "CART" } };

  const [orders, total] = await Promise.all([
    prisma.productOrder.findMany({
      where,
      include: {
        user: { select: { name: true, phone: true } },
        address: { select: { fullAddress: true } },
        items: { include: { product: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.productOrder.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (overrides: Record<string, string | number>) => {
    const params = new URLSearchParams(statusFilter ? { status: statusFilter } : {});
    for (const [k, v] of Object.entries(overrides)) params.set(k, String(v));
    return `/orders?${params.toString()}`;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Store orders</h1>
      <p className="mt-1 text-sm text-gray-500">Marketplace product orders — advance each order through fulfilment.</p>

      <nav className="mt-6 flex flex-wrap gap-1 rounded-lg border border-border bg-white p-1">
        {STATUS_TABS.map((tab) => {
          const active = tab.value === "ALL" ? !statusFilter : statusFilter === tab.value;
          return (
            <Link
              key={tab.value}
              href={tab.value === "ALL" ? "/orders" : `/orders?status=${tab.value}`}
              className={
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                (active ? "bg-brand-600 text-white" : "text-gray-500 hover:bg-surface-muted hover:text-ink-900")
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 space-y-3">
        {orders.map((o) => (
          <Card key={o.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-ink-900">{o.orderRef}</p>
                  <Badge tone={STATUS_TONE[o.status]}>{o.status.replaceAll("_", " ")}</Badge>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {o.user.name ?? o.user.phone} ·{" "}
                  {o.createdAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                </p>
                {o.address ? <p className="mt-0.5 max-w-xl text-xs text-gray-400">{o.address.fullAddress}</p> : null}
              </div>
              <p className="text-lg font-bold text-ink-900">{formatPrice(o.totalPaise)}</p>
            </div>

            <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm text-gray-600">
              {o.items.map((i) => (
                <li key={i.id} className="flex justify-between">
                  <span>
                    {i.product.name} <span className="text-gray-400">×{i.qty}</span>
                  </span>
                  <span>{formatPrice(i.totalPaise)}</span>
                </li>
              ))}
            </ul>

            {NEXT_ACTIONS[o.status] ? (
              <div className="mt-3 flex gap-2 border-t border-border pt-3">
                {NEXT_ACTIONS[o.status]!.map((a) => (
                  <form key={a.status} action={setOrderStatus}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="status" value={a.status} />
                    <button
                      type="submit"
                      className={
                        "rounded-lg px-3.5 py-1.5 text-sm font-semibold " +
                        (a.status === "CANCELLED"
                          ? "border border-red-200 text-red-600 hover:bg-red-50"
                          : "bg-brand-600 text-white hover:bg-brand-700")
                      }
                    >
                      {a.label}
                    </button>
                  </form>
                ))}
              </div>
            ) : null}
          </Card>
        ))}
        {orders.length === 0 ? (
          <Card className="p-10 text-center text-sm text-gray-400">No orders match this filter.</Card>
        ) : null}
      </div>

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
