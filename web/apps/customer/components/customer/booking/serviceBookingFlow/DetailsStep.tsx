import type { Selections } from "@/lib/catalog/pricing";
import { RequirementSheet } from "@/components/customer/booking/RequirementSheet";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import { ProductAddOns, type ProductSelections } from "./ProductAddOns";
import type { FlowService, ServiceConfig } from "./types";

const SECTION_TITLE = "mb-4 text-[0.8rem] font-bold tracking-[0.05em] text-gray-600";

export function DetailsStep({
  service,
  config,
  detailValues,
  onDetailChange,
  fieldErrors,
  note,
  onNoteChange,
  photos,
  uploading,
  onPhotoUpload,
  productSelections,
  onProductChange,
  submitting,
  onSubmit,
}: {
  service: FlowService | null;
  config: ServiceConfig;
  detailValues: Selections;
  onDetailChange: (v: Selections) => void;
  fieldErrors: Record<string, boolean>;
  note: string;
  onNoteChange: (v: string) => void;
  photos: string[];
  uploading: boolean;
  onPhotoUpload: (files: FileList | null) => void;
  productSelections: ProductSelections;
  onProductChange: (v: ProductSelections) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="rounded-[16px] bg-white p-6 sm:p-8 shadow-[0_4px_16px_rgba(15,23,42,0.08)]">
      {/* Title Header with Step 3 of 3 badge */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-5 mb-6">
        <h2 className="font-heading text-xl font-bold tracking-tight text-[#0b1c30]">Select requirements</h2>
        <span className="rounded-full bg-[#f8f9ff] px-3 py-1 text-xs font-semibold text-[#45464d] border border-slate-200/80">
          Step 3 of 3
        </span>
      </div>

      {config.detailFields.length > 0 && service && (
        <RequirementSheet
          serviceName={service.name}
          durationMins={service.duration}
          fields={config.detailFields}
          value={detailValues}
          onChange={onDetailChange}
          fieldErrors={fieldErrors}
          showFooter={false}
        />
      )}

      {service && (
        <ProductAddOns serviceId={service.id} value={productSelections} onChange={onProductChange} />
      )}

      {/* Visual Context (Optional) */}
      <div className="mt-8 mb-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#45464d]">
            VISUAL CONTEXT (OPTIONAL)
          </h3>
          <span className="rounded-full bg-[#fff7ed] px-3 py-0.5 text-xs font-bold text-[#ea580c]">
            Highly Recommended
          </span>
        </div>

        {/* Uploaded photos preview */}
        {photos.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-3">
            {photos.map((url) => (
              <img key={url} src={url} alt="Uploaded reference" className="h-20 w-20 rounded-[8px] object-cover border border-slate-200" />
            ))}
          </div>
        )}

        {/* Dashed upload box */}
        {photos.length < 5 && (
          <label
            className="flex flex-col items-center justify-center rounded-[16px] border-2 border-dashed border-[#c6c6cd] bg-[#f8f9ff] p-8 text-center cursor-pointer transition-colors hover:bg-slate-100/50"
            aria-busy={uploading}
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#fff7ed] text-[#ea580c]">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="font-heading text-base font-bold text-[#0b1c30]">
              {uploading ? "Uploading..." : "Tap to add photos"}
            </span>
            <span className="mt-1 text-xs text-[#45464d]">
              Help our technicians understand the problem better
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={uploading}
              onChange={(e) => onPhotoUpload(e.target.files)}
            />
          </label>
        )}
      </div>

      {/* Additional Notes (Optional) */}
      <div className="mt-6 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#45464d]">
            ADDITIONAL NOTES
          </h3>
          <span className="text-xs text-[#76777d]">{note.length}/250 characters</span>
        </div>
        <textarea
          value={note}
          maxLength={250}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="e.g., Gate code is 1234, the leak is under the sink..."
          className="h-[110px] w-full resize-none rounded-[8px] border border-[#c6c6cd] bg-white p-4 text-sm text-slate-900 outline-none transition-colors focus:border-[#ea580c] placeholder:text-slate-400"
        />
      </div>

      {/* Primary CTA Button for Form */}
      <div className="mt-8 pt-4 border-t border-slate-100 flex justify-end">
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-[#ea580c] hover:bg-[#c2410c] px-8 text-sm font-bold text-white shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>{submitting ? "Adding to cart…" : "Confirm and proceed"}</span>
          <span>→</span>
        </button>
      </div>
    </div>
  );
}
