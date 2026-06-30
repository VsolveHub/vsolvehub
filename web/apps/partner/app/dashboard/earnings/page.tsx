import { Wallet, TrendingUp } from "lucide-react";
import { prisma } from "@vsolve/db";
import { Card, Badge } from "@vsolve/ui";
import { requirePartner } from "@/lib/auth";
import { inr, timeAgo } from "@/lib/format";
import { AreaChart, Medallion } from "@/components/graphics";
import { RangeTabs } from "./range-tabs";
import { WithdrawButton } from "./withdraw-button";

type Range = "today" | "week" | "month" | "all";

function since(range: Range): Date | null {
  const d = new Date();
  if (range === "today") {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (range === "week") return new Date(Date.now() - 7 * 864e5);
  if (range === "month") return new Date(Date.now() - 30 * 864e5);
  return null;
}

export default async function EarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: Range }>;
}) {
  const partner = await requirePartner();
  const { range = "all" } = await searchParams;
  
  const isDriver = partner.providerType === "DRIVER";

  const [earnings, trips, payout] = await Promise.all([
    prisma.earningRecord.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: "desc" } }),
    prisma.trip.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: "desc" } }),
    prisma.payoutDetail.findUnique({ where: { partnerId: partner.id } }),
  ]);

  const serviceName = partner.trade?.name ?? "";

  const all = isDriver
    ? trips.map((t) => ({ id: t.id, amount: t.fare, ref: t.ref, createdAt: t.createdAt, title: `${t.fromArea} → ${t.toArea}` }))
    : earnings.map((e) => ({ id: e.id, amount: e.amount, ref: e.ref, createdAt: e.createdAt, title: serviceName || "Service job" }));

  // Ensure they are sorted by descending order
  all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const from = since(range);
  const rows = from ? all.filter((e) => e.createdAt >= from) : all;
  const total = rows.reduce((s, e) => s + e.amount, 0);

  // Last 7-day trend.
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const trend = days.map((d) => {
    const next = new Date(d.getTime() + 864e5);
    const sum = all.filter((e) => e.createdAt >= d && e.createdAt < next).reduce((s, e) => s + e.amount, 0);
    return { label: d.toLocaleDateString("en-IN", { weekday: "short" }), sum };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Earnings Overview</h1>
          <p className="mt-1 text-sm text-gray-500">Track your financial progress.</p>
        </div>
        <RangeTabs active={range} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <Medallion icon={Wallet} tone="amber" size={48} />
          <p className="mt-3 text-sm font-medium text-gray-500">Total Earnings</p>
          <p className="mt-1 text-3xl font-bold text-accent-600">{inr(total)}</p>
          <p className="mt-1 text-xs text-gray-400">{range === "all" ? "All time" : `This ${range}`}</p>
          <WithdrawButton balance={all.reduce((s, e) => s + e.amount, 0)} bankLast4={payout?.accountLast4 ?? null} />
          <p className="mt-2 text-center text-xs text-gray-400">Next scheduled payout: Tomorrow</p>
        </Card>

        <Card className="lg:col-span-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <TrendingUp className="h-4 w-4 text-brand-600" /> Earnings Trend
          </p>
          <div className="mt-4">
            <AreaChart data={trend.map((t) => ({ label: t.label, value: t.sum }))} tone="brand" />
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-ink-900">Completed Jobs</h2>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No earnings in this period yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="pb-3 font-medium">Job ID</th>
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Amount</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td className="py-3 font-semibold text-brand-600">{e.ref}</td>
                    <td className="py-3 text-gray-600">{timeAgo(e.createdAt)}</td>
                    <td className="py-3 font-semibold text-ink-900">{inr(e.amount)}</td>
                    <td className="py-3">
                      <Badge tone="success">Paid</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
