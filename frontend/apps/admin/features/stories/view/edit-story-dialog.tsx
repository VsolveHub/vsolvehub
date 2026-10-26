"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Clock, X } from "lucide-react";

import { useUpdateOpsStory, type OpsSafetyStory } from "../queries";

export type EditStoryDialogProps = {
  isOpen: boolean;
  story: OpsSafetyStory | null;
  onClose: () => void;
  onSuccess?: () => void;
};

export function EditStoryDialog({ isOpen, story, onClose, onSuccess }: EditStoryDialogProps) {
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [displayOrder, setDisplayOrder] = useState("0");
  const [isPublished, setIsPublished] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const updateStory = useUpdateOpsStory();

  useEffect(() => {
    if (story) {
      setTitle(story.title || "");
      setCaption(story.caption || "");
      setDisplayOrder(String(story.display_order ?? 0));
      setIsPublished(story.is_published ?? true);
      setErrorMsg(null);
    }
  }, [story]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!story) return;

    setErrorMsg(null);

    try {
      await updateStory.mutateAsync({
        id: story.id,
        payload: {
          title: title.trim(),
          caption: caption.trim(),
          display_order: parseInt(displayOrder, 10) || 0,
          is_published: isPublished,
        },
      });
      onClose();
      onSuccess?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update safety story");
    }
  };

  if (!isOpen || !story) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit Safety Story"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="relative w-full max-w-lg bg-surface border border-line rounded-card shadow-2xl p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-line">
          <div>
            <h2 className="text-lg font-bold text-navy-900">Edit Safety Story</h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Update story content or visibility status.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 text-text-secondary hover:text-navy-900 rounded-full hover:bg-surface-sunken transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* 24-hour Expiration Notice */}
        <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
          <Clock className="size-4 shrink-0 text-amber-600 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <span className="font-bold">24-Hour Expiration Preservation</span>
            <span className="text-amber-800/90 leading-relaxed">
              Editing title or caption maintains the original expiration deadline (
              {new Date(story.expires_at).toLocaleString()}) and does not reset the clock.
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          {/* Title */}
          <div>
            <label htmlFor="edit-story-title" className="block text-xs font-bold text-navy-900 mb-1">
              Title (max 120 chars)
            </label>
            <input
              id="edit-story-title"
              type="text"
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-action/20 focus:border-action text-navy-900"
            />
          </div>

          {/* Caption */}
          <div>
            <label htmlFor="edit-story-caption" className="block text-xs font-bold text-navy-900 mb-1">
              Caption (max 280 chars)
            </label>
            <textarea
              id="edit-story-caption"
              rows={3}
              maxLength={280}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-action/20 focus:border-action text-navy-900 resize-none"
            />
            <span className="text-[10px] text-text-secondary float-right mt-0.5">
              {caption.length}/280
            </span>
          </div>

          {/* Display Order & Publish status */}
          <div className="grid grid-cols-2 gap-4 items-center pt-1">
            <div>
              <label htmlFor="edit-story-order" className="block text-xs font-bold text-navy-900 mb-1">
                Display Order
              </label>
              <input
                id="edit-story-order"
                type="number"
                min={0}
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-action/20 focus:border-action text-navy-900"
              />
            </div>

            <div className="flex items-center gap-2 pt-5">
              <input
                id="edit-story-published"
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="size-4 text-action rounded-sm border-line focus:ring-action"
              />
              <label htmlFor="edit-story-published" className="text-xs font-bold text-navy-900 cursor-pointer">
                Is Published
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-line mt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={updateStory.isPending}
              className="px-4 py-2 text-xs font-bold text-text-secondary hover:text-navy-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateStory.isPending}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-action hover:bg-action/90 rounded-xl disabled:opacity-50 transition-colors shadow-xs"
            >
              {updateStory.isPending ? (
                <>
                  <span className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
