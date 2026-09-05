"use client";

import { Button, Dialog, cn, useHydrated } from "@vsolve/ui";
import { Download, FileText, Share2, ShoppingCart } from "lucide-react";
import { useState } from "react";

import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

import type { QuoteMaterialListRowView } from "../adapters";
import { materialListText } from "./material-list-rows";

/**
 * "What you need to buy" as one card and one tap.
 *
 * The list itself is no longer printed on the estimate page (owner decision,
 * 2026-08-30): a 25-row table between the price and the payment plan is a
 * screen of scrolling for something the Customer reads at a shop counter, not
 * here. The card says how many items and which brand tier, and the CTA opens
 * the V Solve Hub-branded PDF in a viewer with Share and Download — the same
 * document the professional's name is on.
 *
 * Fetched with the session cookie (the estimate is private), held as a blob
 * URL for the viewer's `<iframe>` and for the download link, and revoked when
 * the viewer closes.
 */
export function ShoppingListCard({
  requirementId,
  proposalId,
  rows,
  brandTierLabel,
  vendorName,
  serviceName,
  className,
}: {
  requirementId: string;
  proposalId: string;
  rows: readonly QuoteMaterialListRowView[];
  brandTierLabel: string | null;
  vendorName: string | null;
  serviceName: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pdf, setPdf] = useState<PdfState>({ status: "idle" });
  const count = rows.length;
  if (count === 0) return null;

  const pdfUrl = `${PUBLIC_API_BASE_URL}/api/v1/requirements/${requirementId}/quotes/${proposalId}/shopping-list/download/`;
  const pdfName = `what-to-buy-${(vendorName ?? "estimate").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;

  // Fetched on the tap, not in an effect: the tap is the one moment the
  // Customer asked for the document, and the blob URL lives exactly as long
  // as the viewer is open.
  async function openViewer() {
    setOpen(true);
    setPdf({ status: "loading" });
    try {
      const response = await fetch(pdfUrl, { credentials: "include" });
      if (!response.ok) throw new Error(`PDF ${response.status}`);
      const blob = await response.blob();
      setPdf({ status: "ready", blob, url: URL.createObjectURL(blob) });
    } catch {
      setPdf({ status: "failed" });
    }
  }

  function closeViewer(next: boolean) {
    if (next) return;
    setOpen(false);
    setPdf((current) => {
      if (current.status === "ready") URL.revokeObjectURL(current.url);
      return { status: "idle" };
    });
  }

  return (
    <>
      <section
        className={cn(
          "rounded-[14px] border border-line bg-surface p-4 shadow-card",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-action-surface text-signal-700"
          >
            <ShoppingCart className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-text-muted">
              Materials you buy
            </p>
            <h2 className="mt-0.5 text-base font-extrabold leading-tight text-text">
              What you need to buy
            </h2>
            <p className="mt-0.5 text-sm text-text-secondary">
              {count} {count === 1 ? "item" : "items"}
              {brandTierLabel !== null ? ` · ${brandTierLabel}` : ""}
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          className="mt-3 w-full"
          onClick={() => void openViewer()}
          icon={<FileText className="h-4 w-4" aria-hidden />}
        >
          View the list (PDF)
        </Button>
        <p className="mt-2 text-xs leading-4 text-text-muted">
          Quantities and specs only — not inside the estimate total.
        </p>
      </section>

      <ShoppingListPdfViewer
        open={open}
        onOpenChange={closeViewer}
        pdf={pdf}
        pdfName={pdfName}
        shareText={materialListText({ serviceName, rows, brandTierLabel })}
        vendorName={vendorName}
      />
    </>
  );
}

type PdfState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; blob: Blob; url: string }
  | { status: "failed" };

/**
 * The PDF, in a dialog, with the two things a Customer does with it.
 *
 * Share hands the *file* to the device's share sheet where files are
 * supported (WhatsApp, Drive, mail) and falls back to sharing the list as
 * text. Download is a plain anchor with `download` on the blob URL. The
 * `<iframe>` is the browser's own viewer — no PDF library shipped to the
 * client.
 */
function ShoppingListPdfViewer({
  open,
  onOpenChange,
  pdf,
  pdfName,
  shareText,
  vendorName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdf: PdfState;
  pdfName: string;
  shareText: string;
  vendorName: string | null;
}) {
  const hydrated = useHydrated();
  const canShare = hydrated && typeof navigator.share === "function";
  const blob = pdf.status === "ready" ? pdf.blob : null;
  const blobUrl = pdf.status === "ready" ? pdf.url : null;
  const state = pdf.status;

  async function share() {
    try {
      const file = blob === null ? null : new File([blob], pdfName, { type: "application/pdf" });
      if (
        file !== null &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({ files: [file], title: "What to buy" });
        return;
      }
      await navigator.share({ title: "What to buy", text: shareText });
    } catch {
      // A dismissed share sheet is not an error.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="What you need to buy"
      description={vendorName === null ? "Prepared on your estimate." : `Prepared by ${vendorName}.`}
      className="sm:max-w-3xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {canShare ? (
            <Button
              variant="outline"
              onClick={() => void share()}
              disabled={state !== "ready"}
              icon={<Share2 className="h-4 w-4" aria-hidden />}
            >
              Share
            </Button>
          ) : null}
          {blobUrl !== null ? (
            <a
              href={blobUrl}
              download={pdfName}
              className="inline-flex min-h-11 items-center gap-2 rounded-control bg-action px-4 text-sm font-bold text-white"
            >
              <Download className="h-4 w-4" aria-hidden />
              Download
            </a>
          ) : (
            <Button variant="primary" disabled icon={<Download className="h-4 w-4" aria-hidden />}>
              Download
            </Button>
          )}
        </div>
      }
    >
      <div className="h-[65vh] min-h-72 w-full overflow-hidden rounded-[12px] border border-line bg-surface-sunken">
        {state === "ready" && blobUrl !== null ? (
          <iframe title="Shopping list PDF" src={blobUrl} className="h-full w-full" />
        ) : state === "failed" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm font-semibold text-text">We could not load the PDF.</p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close and try again
            </Button>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-sm text-text-secondary" aria-busy="true">
            Preparing your list…
          </div>
        )}
      </div>
    </Dialog>
  );
}
