import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import type { AccommodationBookingDraft } from "@/lib/accommodation/types";

type Props = {
  draft: AccommodationBookingDraft;
  setDraft: (updater: (d: AccommodationBookingDraft) => AccommodationBookingDraft) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  uploadError: string;
  onUploadIdProof: (files: FileList | null) => void;
  onNext: () => void;
};

export function RequirementsStep({ draft, setDraft, fileRef, uploadError, onUploadIdProof, onNext }: Props) {
  return (
    <>
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Stay requirements</h2>
        {draft.bookingType === "move_in" ? (
          <Input
            label="Move-in date"
            type="date"
            value={draft.moveInDate}
            onChange={(e) => setDraft((d) => ({ ...d, moveInDate: e.target.value }))}
          />
        ) : (
          <Input
            label="Visit date"
            type="date"
            value={draft.visitDate}
            onChange={(e) => setDraft((d) => ({ ...d, visitDate: e.target.value }))}
          />
        )}
        {draft.bookingType === "move_in" && (
          <Input
            label="Duration of stay (months)"
            type="number"
            min={1}
            max={24}
            value={draft.durationMonths}
            onChange={(e) =>
              setDraft((d) => ({ ...d, durationMonths: Number(e.target.value) || 1 }))
            }
          />
        )}
        <Input
          label="Number of people"
          type="number"
          min={1}
          max={10}
          value={draft.numberOfPeople}
          onChange={(e) =>
            setDraft((d) => ({ ...d, numberOfPeople: Number(e.target.value) || 1 }))
          }
        />
        <Input
          label="Occupation"
          placeholder="Student, IT professional, etc."
          value={draft.occupation}
          onChange={(e) => setDraft((d) => ({ ...d, occupation: e.target.value }))}
        />
        <Textarea
          label="Special requirements"
          placeholder="Dietary needs, accessibility, etc."
          value={draft.specialRequirements}
          onChange={(e) => setDraft((d) => ({ ...d, specialRequirements: e.target.value }))}
        />
        <div>
          <p className="mb-4 text-lg font-semibold text-gray-900">ID proof upload</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf"
            hidden
            onChange={(e) => onUploadIdProof(e.target.files)}
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            Upload ID proof
          </Button>
          {uploadError && <p className="rounded-xl px-4 py-3 text-sm bg-red-50 text-[var(--color-danger)]">{uploadError}</p>}
          {draft.idProofUrls.length > 0 && (
            <p className="text-sm text-gray-500">{draft.idProofUrls.length} file(s) uploaded</p>
          )}
        </div>
      </div>
      <Button block onClick={onNext}>
        Next
      </Button>
    </>
  );
}
