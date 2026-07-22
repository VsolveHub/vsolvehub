import Link from "next/link";
import { prisma } from "@vsolve/db";
import { Card } from "@vsolve/ui";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [actions, total] = await Promise.all([
    prisma.adminAction.findMany({
      include: { admin: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.adminAction.count(),
  ]);

  // AdminAction.partnerId is a loose reference (no FK) — resolve names separately.
  const partnerIds = [...new Set(actions.map((a) => a.partnerId))];
  const partners = await prisma.partner.findMany({
    where: { id: { in: partnerIds } },
    select: { id: true, fullName: true, phone: true },
  });
  const partnerById = new Map(partners.map((p) => [p.id, p]));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Audit log</h1>
      <p className="mt-1 text-sm text-gray-500">Every status change and document decision, most recent first.</p>

      <Card className="mt-6 overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-surface-muted text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3">When</th>
              <th className="px-5 py-3">Admin</th>
              <th className="px-5 py-3">Action</th>
              <th className="px-5 py-3">Partner</th>
              <th className="px-5 py-3">Reason</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((a) => {
              const partner = partnerById.get(a.partnerId);
              // Catalog/marketplace actions reuse the loose partnerId column for
              // their own subject id — they are not about a partner at all.
              const isCatalogAction = /^(PRODUCT|BRAND|MAPPING)/.test(a.action);
              return (
                <tr key={a.id} className="border-b border-border last:border-0 hover:bg-surface-muted">
                  <td className="whitespace-nowrap px-5 py-3 text-gray-500">{a.createdAt.toLocaleString("en-IN")}</td>
                  <td className="px-5 py-3 text-gray-600">{a.admin.email}</td>
                  <td className="px-5 py-3 font-medium text-ink-900">{a.action.replaceAll("_", " ")}</td>
                  <td className="px-5 py-3">
                    {partner ? (
                      <Link href={`/partners/${a.partnerId}`} className="text-brand-600 hover:text-brand-700">
                        {partner.fullName ?? partner.phone}
                      </Link>
                    ) : isCatalogAction ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <span className="text-gray-400">(deleted)</span>
                    )}
                  </td>
                  <td className="max-w-xs truncate px-5 py-3 text-gray-500" title={a.reason ?? undefined}>
                    {a.reason ?? "—"}
                  </td>
                </tr>
              );
            })}
            {actions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">
                  No admin actions yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
        <p>{total === 0 ? "0 results" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}</p>
        <div className="flex gap-2">
          <Link
            href={`/audit?page=${Math.max(1, page - 1)}`}
            aria-disabled={page <= 1}
            className={
              "rounded-lg border border-border bg-white px-3 py-1.5 font-medium " +
              (page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-surface-muted")
            }
          >
            Previous
          </Link>
          <Link
            href={`/audit?page=${Math.min(totalPages, page + 1)}`}
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
