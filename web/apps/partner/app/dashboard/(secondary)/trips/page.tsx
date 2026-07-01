import { redirect } from "next/navigation";
import { Navigation } from "lucide-react";
import { prisma } from "@vsolve/db";
import { Card } from "@vsolve/ui";
import { requirePartner } from "@/lib/auth";
import { inr, timeAgo } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/graphics";

export default async function TripsPage() {
  const partner = await requirePartner();
  if (partner.providerType !== "DRIVER") redirect("/dashboard");

  const trips = await prisma.trip.findMany({
    where: { partnerId: partner.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader title="My Trips" subtitle="Your recent trip history." />
      {trips.length === 0 ? (
        <EmptyState
          icon={Navigation}
          tone="violet"
          title="No trips yet"
          body="Go online in the Driver app to start receiving trips and earning."
        />
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-6 py-4 font-medium">Trip ID</th>
                  <th className="px-6 py-4 font-medium">Route</th>
                  <th className="px-6 py-4 font-medium">When</th>
                  <th className="px-6 py-4 font-medium">Fare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {trips.map((t) => (
                  <tr key={t.id}>
                    <td className="px-6 py-4 font-semibold text-brand-600">{t.ref}</td>
                    <td className="px-6 py-4 text-gray-700">
                      {t.fromArea} → {t.toArea}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{timeAgo(t.createdAt)}</td>
                    <td className="px-6 py-4 font-semibold text-ink-900">{inr(t.fare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
