import type { Selections } from "@/lib/catalog/pricing";
import { RequirementSheet } from "@/components/customer/booking/RequirementSheet";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
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
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <div>
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

      <div className="mb-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Photos (optional) */}
        <div>
          <h3 className={SECTION_TITLE}>ADD PHOTOS (OPTIONAL)</h3>
          <div className="mb-4 flex flex-wrap gap-4">
            {photos.map((url) => (
              <img key={url} src={url} alt="Uploaded reference" className="h-20 w-20 rounded-lg object-cover" />
            ))}
            {photos.length < 5 && (
              <label
                className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50"
                aria-busy={uploading}
              >
                <span className="text-2xl text-gray-400">{uploading ? "…" : "+"}</span>
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
          <p className="text-[0.8rem] text-gray-500">Add images of rooms or specific problem areas.</p>
        </div>

        {/* Note (optional) */}
        <div>
          <div className="flex justify-between">
            <h3 className={SECTION_TITLE}>ADD A NOTE (OPTIONAL)</h3>
            <span className="text-xs text-gray-400">{note.length}/250</span>
          </div>
          <textarea
            value={note}
            maxLength={250}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Access instructions, problem areas, or preferences..."
            className="h-[120px] w-full resize-none rounded-lg border border-gray-200 p-4 text-[0.9rem] outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-col-reverse items-stretch gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-center gap-2 text-sm font-semibold text-green-800 sm:justify-start">
          <FlaticonIcon name="shield" size={16} />
          <span>Safe &amp; Professional Services</span>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="rounded-xl bg-[var(--color-brand)] px-8 py-3.5 text-base font-bold text-white transition-colors hover:bg-blue-900 disabled:opacity-60"
        >
          {submitting ? "Adding…" : "Add to cart ›"}
        </button>
      </div>
    </div>
  );
}
