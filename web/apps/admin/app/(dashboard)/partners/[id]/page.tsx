import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { prisma } from "@vsolve/db";
import { Badge, Card } from "@vsolve/ui";
import { serviceBySlug } from "@vsolve/config";
import { requireAdmin } from "@/lib/auth";
import { STATUS_LABEL, STATUS_TONE, ALLOWED_FROM, parseJsonArray, type PartnerDecision } from "@/lib/partner-status";
import { resolveDocPreview } from "@/lib/kyc-storage";
import { DecisionButton } from "@/components/decision-button";
import { DocumentCard } from "@/components/doc-card";

export const metadata = { title: "Partner detail" };

const DECISIONS: {
  decision: PartnerDecision;
  label: string;
  helpText: string;
  variant: "primary" | "accent" | "outline" | "ghost";
  requireReason: boolean;
}[] = [
  {
    decision: "APPROVED",
    label: "Approve",
    helpText: "Activates the partner immediately — they can start receiving jobs.",
    variant: "primary",
    requireReason: false,
  },
  {
    decision: "REQUESTED_CHANGES",
    label: "Request changes",
    helpText: "Marks the application as action-required. Reject the specific document(s) below too, so the reason shows on the partner's app.",
    variant: "outline",
    requireReason: true,
  },
  {
    decision: "REJECTED",
    label: "Reject",
    helpText: "Ends this application. The partner can be re-reviewed later if they reapply.",
    variant: "outline",
    requireReason: true,
  },
  {
    decision: "SUSPENDED",
    label: "Suspend",
    helpText: "Immediately stops this partner from receiving new jobs.",
    variant: "outline",
    requireReason: false,
  },
  {
    decision: "REACTIVATED",
    label: "Reactivate",
    helpText: "Restores the partner to active.",
    variant: "primary",
    requireReason: false,
  },
];

export default async function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const partner = await prisma.partner.findUnique({
    where: { id },
    include: {
      trade: true,
      city: true,
      documents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!partner) notFound();

  const [actions, docPreviews] = await Promise.all([
    prisma.adminAction.findMany({
      where: { partnerId: id },
      include: { admin: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
    }),
    Promise.all(partner.documents.map((d) => resolveDocPreview(d.url))),
  ]);

  const services = parseJsonArray(partner.servicesOffered);
  const tagline = partner.trade ? serviceBySlug(partner.trade.slug)?.tagline : undefined;
  const availableDecisions = DECISIONS.filter((d) => ALLOWED_FROM[d.decision].includes(partner.status));
  const mapsHref =
    partner.lat != null && partner.lng != null
      ? `https://www.google.com/maps?q=${partner.lat},${partner.lng}`
      : null;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/partners" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Back to partners
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-ink-900">{partner.fullName ?? "(no name)"}</h1>
            <Badge tone={STATUS_TONE[partner.status]}>{STATUS_LABEL[partner.status]}</Badge>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {partner.phone} · Submitted{" "}
            {partner.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {availableDecisions.map((d) => (
            <DecisionButton
              key={d.decision}
              partnerId={partner.id}
              decision={d.decision}
              label={d.label}
              helpText={d.helpText}
              variant={d.variant}
              requireReason={d.requireReason}
            />
          ))}
          {availableDecisions.length === 0 ? (
            <p className="self-center text-sm text-gray-400">No actions available in this status.</p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Profile</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-gray-400">Gender</dt>
              <dd className="font-medium text-ink-900">{partner.gender ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Phone</dt>
              <dd className="font-medium text-ink-900">{partner.phone}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Trade</dt>
              <dd className="font-medium text-ink-900">
                {partner.trade?.name ?? partner.providerType}
                {tagline ? <span className="block text-xs font-normal text-gray-400">{tagline}</span> : null}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400">Aadhaar</dt>
              <dd className="font-medium text-ink-900">
                {partner.aadhaarLast4 ? `•••• ${partner.aadhaarLast4}` : "Not provided"}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-gray-400">Service area</dt>
              <dd className="flex items-center gap-1.5 font-medium text-ink-900">
                {[partner.area, partner.cityName ?? partner.city?.name, partner.pincode].filter(Boolean).join(", ") || "—"}
                {mapsHref ? (
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
                  >
                    <MapPin className="h-3.5 w-3.5" /> Map
                  </a>
                ) : null}
              </dd>
            </div>
            {services.length ? (
              <div className="col-span-2">
                <dt className="text-gray-400">Services offered</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {services.map((s) => (
                    <Badge key={s} tone="neutral">
                      {s}
                    </Badge>
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Timeline</h2>
          <ol className="mt-3 space-y-4">
            <li className="text-sm">
              <p className="font-medium text-ink-900">Application submitted</p>
              <p className="text-xs text-gray-400">{partner.createdAt.toLocaleString("en-IN")}</p>
            </li>
            {actions.map((a) => (
              <li key={a.id} className="text-sm">
                <p className="font-medium text-ink-900">{a.action.replaceAll("_", " ")}</p>
                <p className="text-xs text-gray-400">
                  {a.admin.email} · {a.createdAt.toLocaleString("en-IN")}
                </p>
                {a.reason ? <p className="mt-0.5 text-xs text-gray-600">{a.reason}</p> : null}
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">KYC documents</h2>
        {partner.documents.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">No documents uploaded yet.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {partner.documents.map((doc, i) => (
              <DocumentCard key={doc.id} doc={doc} preview={docPreviews[i]!} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
