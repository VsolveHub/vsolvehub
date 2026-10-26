"use client";

import { useState } from "react";
import { AlertCircle, Upload, X } from "lucide-react";

import { useCreateOpsStory } from "../queries";

export type UploadStoryDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".webm", ".mov"];

export function UploadStoryDialog({ isOpen, onClose, onSuccess }: UploadStoryDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [displayOrder, setDisplayOrder] = useState("0");
  const [isPublished, setIsPublished] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const createStory = useCreateOpsStory();

  const resetState = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setFile(null);
    setPreviewUrl(null);
    setIsVideo(false);
    setTitle("");
    setCaption("");
    setDisplayOrder("0");
    setIsPublished(true);
    setErrorMsg(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const selected = e.target.files?.[0];
    if (!selected) return;

    const fileType = selected.type.toLowerCase();
    const isVid = fileType.startsWith("video/") || selected.name.toLowerCase().endsWith(".mov");

    if (isVid) {
      if (selected.size > MAX_VIDEO_BYTES) {
        setErrorMsg("Video files must be 100 MB or smaller.");
        return;
      }
    } else {
      if (selected.size > MAX_IMAGE_BYTES) {
        setErrorMsg("Image files must be 15 MB or smaller.");
        return;
      }
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(selected);
    setIsVideo(isVid);
    setPreviewUrl(URL.createObjectURL(selected));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setErrorMsg("Please select an image or video file to upload.");
      return;
    }

    setErrorMsg(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title.trim());
    formData.append("caption", caption.trim());
    formData.append("display_order", String(parseInt(displayOrder, 10) || 0));
    formData.append("is_published", String(isPublished));

    try {
      await createStory.mutateAsync(formData);
      handleClose();
      onSuccess?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to upload safety story");
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upload Safety Story"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="relative w-full max-w-lg bg-surface border border-line rounded-card shadow-2xl p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-line">
          <div>
            <h2 className="text-lg font-bold text-navy-900">Upload Safety Story</h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Publish a 24-hour visual safety update to the customer homepage.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close dialog"
            className="p-1.5 text-text-secondary hover:text-navy-900 rounded-full hover:bg-surface-sunken transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          {/* File Picker & Preview */}
          <div>
            <label className="block text-xs font-bold text-navy-900 mb-1.5">
              Media File (Image or Video)
            </label>
            {previewUrl ? (
              <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black/5 border border-line flex items-center justify-center group">
                {isVideo ? (
                  <video
                    src={previewUrl}
                    controls
                    className="size-full object-contain"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="size-full object-contain"
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (previewUrl) URL.revokeObjectURL(previewUrl);
                    setFile(null);
                    setPreviewUrl(null);
                  }}
                  className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white p-1 rounded-full text-xs transition-colors"
                  aria-label="Remove selected file"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <label className="border-2 border-dashed border-line hover:border-action/60 bg-surface-sunken/40 hover:bg-surface-sunken/80 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors text-center">
                <div className="size-10 rounded-full bg-navy-50 flex items-center justify-center text-action mb-2">
                  <Upload className="size-5" />
                </div>
                <span className="text-xs font-bold text-navy-900">
                  Click or drag media to upload
                </span>
                <span className="text-[11px] text-text-secondary mt-1">
                  JPEG, PNG, WebP (up to 15MB) or MP4, WebM, QuickTime (up to 100MB)
                </span>
                <input
                  type="file"
                  accept={ALLOWED_EXTS.join(",")}
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>
            )}
          </div>

          {/* Title */}
          <div>
            <label htmlFor="story-title" className="block text-xs font-bold text-navy-900 mb-1">
              Title (optional, max 120 chars)
            </label>
            <input
              id="story-title"
              type="text"
              maxLength={120}
              placeholder="e.g. ID-Verified Technicians"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-action/20 focus:border-action text-navy-900"
            />
          </div>

          {/* Caption */}
          <div>
            <label htmlFor="story-caption" className="block text-xs font-bold text-navy-900 mb-1">
              Caption (optional, max 280 chars)
            </label>
            <textarea
              id="story-caption"
              rows={3}
              maxLength={280}
              placeholder="Describe the safety measure, verification, or protocol..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-action/20 focus:border-action text-navy-900 resize-none"
            />
            <span className="text-[10px] text-text-secondary float-right mt-0.5">
              {caption.length}/280
            </span>
          </div>

          {/* Display Order & Publish Immediately */}
          <div className="grid grid-cols-2 gap-4 items-center pt-1">
            <div>
              <label htmlFor="story-order" className="block text-xs font-bold text-navy-900 mb-1">
                Display Order
              </label>
              <input
                id="story-order"
                type="number"
                min={0}
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-action/20 focus:border-action text-navy-900"
              />
            </div>

            <div className="flex items-center gap-2 pt-5">
              <input
                id="story-published"
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="size-4 text-action rounded-sm border-line focus:ring-action"
              />
              <label htmlFor="story-published" className="text-xs font-bold text-navy-900 cursor-pointer">
                Publish immediately (active for 24h)
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-line mt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={createStory.isPending}
              className="px-4 py-2 text-xs font-bold text-text-secondary hover:text-navy-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createStory.isPending || !file}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-action hover:bg-action/90 rounded-xl disabled:opacity-50 transition-colors shadow-xs"
            >
              {createStory.isPending ? (
                <>
                  <span className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Uploading...
                </>
              ) : (
                "Publish Story"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
