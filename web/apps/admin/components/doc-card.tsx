import Image from "next/image";
import { FileWarning, ExternalLink } from "lucide-react";
import { Badge } from "@vsolve/ui";
import type { Document } from "@vsolve/db";
import type { DocPreview } from "@/lib/kyc-storage";
import { DocumentActions } from "./document-actions";

const DOC_LABELS: Record<string, string> = {
  SELFIE: "Profile Photo",
  AADHAAR: "Aadhaar Card",
  PAN: "PAN Card",
  TRADE_CERTIFICATE: "Trade Certificate",
  DRIVING_LICENCE: "Driving Licence",
  BANK_PASSBOOK: "Bank Passbook",
  RC: "Registration Certificate",
  OTHER: "Document",
};

const STATUS_TONE = { PENDING: "warning", APPROVED: "success", REJECTED: "danger" } as const;

export function DocumentCard({ doc, preview }: { doc: Document; preview: DocPreview }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="relative flex aspect-video items-center justify-center bg-surface-muted">
        {preview.kind === "signed" ? (
          <Image src={preview.url} alt={DOC_LABELS[doc.type] ?? doc.type} unoptimized fill className="h-full w-full object-cover" />
        ) : preview.kind === "legacy" ? (
          <a
            href={preview.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            <ExternalLink className="h-6 w-6" />
            Open document
          </a>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-xs text-gray-400">
            <FileWarning className="h-6 w-6" />
            Preview unavailable
          </div>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink-900">{DOC_LABELS[doc.type] ?? doc.type}</p>
          <Badge tone={STATUS_TONE[doc.status]}>{doc.status}</Badge>
        </div>
        {doc.reason ? <p className="text-xs text-danger">{doc.reason}</p> : null}
        {preview.kind === "legacy" ? <p className="text-xs text-gray-400">Legacy upload</p> : null}
        <DocumentActions docId={doc.id} />
      </div>
    </div>
  );
}
