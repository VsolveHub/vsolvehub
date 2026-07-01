import Link from "next/link";
import { Search } from "lucide-react";
import { prisma, type Prisma, type PartnerStatus } from "@vsolve/db";
import { Badge, Card } from "@vsolve/ui";
import { requireAdmin } from "@/lib/auth";
import { STATUS_LABEL, STATUS_TONE, STATUS_TABS } from "@/lib/partner-status";

export const metadata = { title: "Partners" };

const PAGE_SIZE = 20;

function isPartnerStatus(value: string | undefined): value is PartnerStatus {
  return STATUS_TABS.some((t) => t.value === value);
}

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status: PartnerStatus = isPartnerStatus(sp.status) ? sp.status : "PENDING";
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.PartnerWhereInput = {
    status,
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };

  const [partners, total] = await Promise.all([
    prisma.partner.findMany({
      where,
      include: { trade: true, city: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.partner.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (overrides: Record<string, string | number>) => {
    const params = new URLSearchParams({ status, ...(q ? { q } : {}) });
    for (const [k, v] of Object.entries(overrides)) params.set(k, String(v));
    return `/partners?${params.toString()}`;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Partners</h1>
      <p className="mt-1 text-sm text-gray-500">Review onboarding applications and manage partner status.</p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <nav className="flex flex-wrap gap-1 rounded-lg border border-border bg-white p-1">
          {STATUS_TABS.map((tab) => (
            <Link
              key={tab.value}
              href={qs({ status: tab.value, page: 1 })}
              className={
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                (status === tab.value
                  ? "bg-brand-600 text-white"
                  : "text-gray-500 hover:bg-surface-muted hover:text-ink-900")
              }
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <form action="/partners" method="get" className="flex items-center gap-2">
          <input type="hidden" name="status" value={status} />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search name or phone"
              className="h-10 w-64 rounded-lg border border-border bg-white pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </form>
      </div>

      <Card className="mt-4 overflow-hidden p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-surface-muted text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Phone</th>
              <th className="px-5 py-3">Trade</th>
              <th className="px-5 py-3">City</th>
              <th className="px-5 py-3">Submitted</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-muted">
                <td className="px-5 py-3">
                  <Link href={`/partners/${p.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                    {p.fullName ?? "(no name)"}
                  </Link>
                </td>
                <td className="px-5 py-3 text-gray-600">{p.phone}</td>
                <td className="px-5 py-3 text-gray-600">{p.trade?.name ?? p.providerType}</td>
                <td className="px-5 py-3 text-gray-600">{p.city?.name ?? p.cityName ?? "—"}</td>
                <td className="px-5 py-3 text-gray-600">
                  {p.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </td>
                <td className="px-5 py-3">
                  <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                </td>
              </tr>
            ))}
            {partners.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">
                  No partners match this filter.
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
