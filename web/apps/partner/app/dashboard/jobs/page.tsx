import { redirect } from "next/navigation";
import { Briefcase } from "lucide-react";
import { prisma } from "@vsolve/db";
import { Card, Badge } from "@vsolve/ui";
import { requirePartner } from "@/lib/auth";
import { inr, timeAgo } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/graphics";

export default async function JobsPage() {
  const partner = await requirePartner();
  if (partner.providerType === "DRIVER") redirect("/dashboard/trips");

  const jobs = await prisma.earningRecord.findMany({
    where: { partnerId: partner.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader title="My Jobs" subtitle="Your completed and ongoing jobs." />
      {jobs.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          tone="brand"
          title="No jobs yet"
          body="Stay online in the Captain mobile app to start receiving jobs near you."
        />
      ) : (
        <div className="space-y-3">
          {jobs.map((j) => (
            <Card key={j.id} className="flex items-center justify-between py-4">
              <div>
                <p className="font-semibold text-brand-600">{j.ref}</p>
                <p className="text-xs text-gray-500">Completed · {timeAgo(j.createdAt)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-ink-900">{inr(j.amount)}</span>
                <Badge tone="success">Completed</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
