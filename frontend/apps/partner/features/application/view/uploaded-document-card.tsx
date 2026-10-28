"use client";

import type { Schemas } from "@vsolve/api-client";
import { Button, useT } from "@vsolve/ui";
import {
  AlertCircle,
  ExternalLink,
  Eye,
  File,
  FileImage,
  FileText,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";

import { formatBytes } from "../model/upload";
import { usePartnerDocumentAccess } from "../upload-queries";

type Document = Schemas["PartnerDocument"];

interface UploadedDocumentCardProps {
  document: Document;
  label: string;
  canReplace: boolean;
  onReplace: () => void;
}

function getFileIcon(contentType: string) {
  if (contentType.includes("pdf")) {
    return <FileText className="h-6 w-6 text-danger-text" />;
  }
  if (contentType.includes("image")) {
    return <FileImage className="h-6 w-6 text-signal-600" />;
  }
  return <File className="h-6 w-6 text-navy-600" />;
}

function getReadableMime(contentType: string, t: ReturnType<typeof useT>): string {
  if (contentType.includes("pdf")) return t("apply.uploadedCard.type.pdf");
  if (contentType.includes("png")) return t("apply.uploadedCard.type.png");
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return t("apply.uploadedCard.type.jpeg");
  return contentType || t("apply.uploadedCard.type.document");
}

export function UploadedDocumentCard({
  document,
  canReplace,
  onReplace,
}: UploadedDocumentCardProps) {
  const t = useT();
  const access = usePartnerDocumentAccess();
  const [accessError, setAccessError] = useState<string | null>(null);

  const isPdf = document.content_type?.includes("pdf");
  const ext = isPdf ? "pdf" : "jpg";
  const fileName = `${document.kind.toLowerCase()}_v${document.version}.${ext}`;
  const isRejected = document.status === "REJECTED" || document.scan_status === "REJECTED";

  async function handleViewDocument() {
    setAccessError(null);
    try {
      const response = await access.mutateAsync(document.id);
      if (response.access_url) {
        window.open(response.access_url, "_blank", "noopener,noreferrer");
      } else {
        setAccessError(t("apply.uploadedCard.noPreviewLink"));
      }
    } catch {
      setAccessError(t("apply.uploadedCard.openFailed"));
    }
  }

  return (
    <div className="mt-3 rounded-card border border-line bg-surface p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* File Information */}
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-surface-sunken border border-line">
            {getFileIcon(document.content_type || "")}
          </div>

          <div className="flex flex-col min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-navy-900 truncate">
                {fileName}
              </span>
              <span className="rounded bg-navy-100 px-1.5 py-0.5 text-[11px] font-semibold text-navy-800">
                v{document.version}
              </span>
            </div>

            <p className="mt-0.5 text-xs text-text-muted">
              {getReadableMime(document.content_type || "", t)} • {formatBytes(document.size_bytes)}
            </p>

            <p className="mt-0.5 text-xs text-text-muted">
              {t("apply.uploadedCard.uploaded")}{" "}
              <time dateTime={document.uploaded_at}>
                {new Intl.DateTimeFormat("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Kolkata",
                }).format(new Date(document.uploaded_at))}
              </time>
            </p>
          </div>
        </div>

        {/* Actions (status badge is rendered once in the parent section header) */}
        <div className="flex flex-wrap items-center gap-2 sm:self-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleViewDocument()}
            loading={access.isPending}
            loadingLabel={t("apply.uploadedCard.opening")}
            className="flex items-center gap-1.5 font-bold"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>{t("apply.uploadedCard.view")}</span>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </Button>

          {canReplace && !isRejected ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReplace}
              className="flex items-center gap-1.5 text-navy-700 hover:text-navy-900"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{t("apply.uploadedCard.replace")}</span>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Rejection / Review note banner if document needs replacing */}
      {isRejected ? (
        <div className="mt-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 rounded-xl bg-danger-bg p-3.5 border border-danger-border text-xs text-danger-text shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0 text-danger-text mt-0.5" />
            <div>
              <p className="font-bold text-sm text-danger-text">
                {document.scan_status === "REJECTED"
                  ? "Security scan failed"
                  : t("apply.uploadedCard.reviewerRequested")}
              </p>
              <p className="mt-0.5 text-xs text-danger-text/90 font-medium">
                {document.review_reason || t("apply.uploadedCard.rejectedFallback")}
              </p>
            </div>
          </div>

          {canReplace && (
            <Button
              variant="primary"
              size="sm"
              onClick={onReplace}
              className="inline-flex shrink-0 items-center justify-center gap-2 bg-danger hover:bg-danger-hover text-white font-bold px-3.5 py-2 text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{t("apply.upload.reupload")}</span>
            </Button>
          )}
        </div>
      ) : null}

      {/* Access Error message */}
      {accessError ? (
        <div className="mt-2 flex items-center justify-between text-xs text-danger-text bg-danger-bg p-2 rounded">
          <span>{accessError}</span>
          <button
            type="button"
            onClick={() => setAccessError(null)}
            className="font-bold underline ml-2 cursor-pointer"
          >
            {t("apply.uploadedCard.dismiss")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
