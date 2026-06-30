import { FileText } from "lucide-react";
import { prisma } from "@vsolve/db";
import { Card, Badge } from "@vsolve/ui";
import { requirePartner } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/graphics";
import { ReuploadButton, UploadNewButton } from "./doc-uploader";

const DOC_LABELS: Record<string, string> = {
  SELFIE: "Profile Photo",
  AADHAAR: "Aadhaar Card",
  PAN: "PAN Card",
  TRADE_CERTIFICATE: "Trade Certificate",
  DRIVING_LICENCE: "Driving Licence",
  BANK_PASSBOOK: "Bank Passbook",
  OTHER: "Document",
};

function statusBadge(status: string) {
  if (status === "APPROVED") return <Badge tone="success">Verified</Badge>;
  if (status === "REJECTED") return <Badge tone="danger">Rejected</Badge>;
  return <Badge tone="warning">Pending</Badge>;
}

export default async function DocumentsPage() {
  const partner = await requirePartner();
  const docs = await prisma.document.findMany({
    where: { partnerId: partner.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle="Manage and update your compliance credentials securely."
        action={<UploadNewButton />}
      />

      {docs.length === 0 ? (
        <EmptyState
          icon={FileText}
          tone="sky"
          title="No documents yet"
          body="Upload your Aadhaar, photo, and bank proof to get verified faster."
        />
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-6 py-4 font-medium">Document</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Uploaded</th>
                  <th className="px-6 py-4 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-ink-900">{DOC_LABELS[d.type] ?? d.type}</p>
                      {d.reason ? <p className="text-xs text-danger">{d.reason}</p> : null}
                    </td>
                    <td className="px-6 py-4">{statusBadge(d.status)}</td>
                    <td className="px-6 py-4 text-gray-600">{shortDate(d.createdAt)}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end">
                        <ReuploadButton type={d.type} />
                      </div>
                    </td>
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
