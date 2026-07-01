import { redirect } from "next/navigation";
import { Car } from "lucide-react";
import { prisma } from "@vsolve/db";
import { Card, Badge } from "@vsolve/ui";
import { requirePartner } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { ReuploadButton, UploadNewButton } from "../documents/doc-uploader";

const DOC_LABELS: Record<string, string> = {
  AADHAAR: "Aadhaar Card",
  DRIVING_LICENCE: "Driving Licence",
  RC: "Registration Certificate",
  SELFIE: "Profile Photo",
  OTHER: "Document",
};

export default async function VehiclePage() {
  const partner = await requirePartner();
  if (partner.providerType !== "DRIVER") redirect("/dashboard/documents");

  const [vehicle, docs] = await Promise.all([
    prisma.vehicle.findUnique({ where: { partnerId: partner.id } }),
    prisma.document.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vehicle & Documents"
        subtitle="Keep your vehicle details and paperwork up to date."
        action={<UploadNewButton />}
      />

      <Card>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Car className="h-6 w-6" />
          </span>
          <div>
            <h2 className="font-semibold text-ink-900">
              {vehicle ? `${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim() || vehicle.type : "No vehicle added"}
            </h2>
            <p className="text-sm text-gray-500">
              {vehicle ? `${vehicle.type} · ${vehicle.regNumber}` : "Add your vehicle to start driving."}
            </p>
          </div>
        </div>
      </Card>

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
                  <td className="px-6 py-4 font-semibold text-ink-900">{DOC_LABELS[d.type] ?? d.type}</td>
                  <td className="px-6 py-4">
                    {d.status === "APPROVED" ? (
                      <Badge tone="success">Verified</Badge>
                    ) : d.status === "REJECTED" ? (
                      <Badge tone="danger">Rejected</Badge>
                    ) : (
                      <Badge tone="warning">Pending</Badge>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-600">{shortDate(d.createdAt)}</td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end">
                      <ReuploadButton type={d.type} />
                    </div>
                  </td>
                </tr>
              ))}
              {docs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-500">
                    No documents uploaded yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
