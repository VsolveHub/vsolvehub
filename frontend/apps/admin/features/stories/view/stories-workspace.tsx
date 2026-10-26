"use client";

import { useMemo, useState } from "react";
import {
  Clock,
  Eye,
  Film,
  Image as ImageIcon,
  MoreVertical,
  Pencil,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import {
  useDeleteOpsStory,
  useOpsStories,
  useUpdateOpsStory,
  type OpsSafetyStory,
} from "../queries";
import { EditStoryDialog } from "./edit-story-dialog";
import { StoryPreviewModal } from "./story-preview-modal";
import { UploadStoryDialog } from "./upload-story-dialog";

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCountdown(story: OpsSafetyStory): { label: string; tone: "active" | "expired" | "draft" } {
  if (!story.is_published) {
    return { label: "Draft", tone: "draft" };
  }
  const now = Date.now();
  const expires = new Date(story.expires_at).getTime();
  if (expires <= now) {
    const expiredHoursAgo = Math.max(1, Math.round((now - expires) / (1000 * 60 * 60)));
    return { label: `Expired ${expiredHoursAgo}h ago`, tone: "expired" };
  }
  const hoursLeft = Math.max(1, Math.round((expires - now) / (1000 * 60 * 60)));
  return { label: `Active (${hoursLeft}h left)`, tone: "active" };
}

export function StoriesWorkspace() {
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "expired" | "draft">("all");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [editingStory, setEditingStory] = useState<OpsSafetyStory | null>(null);
  const [previewStory, setPreviewStory] = useState<OpsSafetyStory | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: stories = [], isLoading, error, refetch } = useOpsStories(statusFilter);
  const updateStory = useUpdateOpsStory();
  const deleteStory = useDeleteOpsStory();

  // Compute stats across all stories
  const { data: allStories = [] } = useOpsStories("all");
  const stats = useMemo(() => {
    const now = Date.now();
    let active = 0;
    let expired = 0;
    let drafts = 0;

    for (const story of allStories) {
      if (!story.is_published) {
        drafts++;
      } else if (new Date(story.expires_at).getTime() > now) {
        active++;
      } else {
        expired++;
      }
    }

    return {
      total: allStories.length,
      active,
      expired,
      drafts,
    };
  }, [allStories]);

  const handleTogglePublished = async (story: OpsSafetyStory) => {
    try {
      await updateStory.mutateAsync({
        id: story.id,
        payload: { is_published: !story.is_published },
      });
    } catch {
      alert("Failed to toggle publish status");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteStory.mutateAsync(id);
      setDeleteConfirmId(null);
    } catch {
      alert("Failed to delete story");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-surface border border-line rounded-card p-4 shadow-card">
          <span className="text-xs font-semibold text-text-secondary">Total Stories</span>
          <p className="text-2xl font-extrabold text-navy-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-surface border border-emerald-200/60 rounded-card p-4 shadow-card">
          <span className="text-xs font-semibold text-emerald-700">Live (Active Now)</span>
          <p className="text-2xl font-extrabold text-emerald-600 mt-1">{stats.active}</p>
        </div>
        <div className="bg-surface border border-line rounded-card p-4 shadow-card">
          <span className="text-xs font-semibold text-text-secondary">Expired (24h Window)</span>
          <p className="text-2xl font-extrabold text-navy-700 mt-1">{stats.expired}</p>
        </div>
        <div className="bg-surface border border-amber-200/60 rounded-card p-4 shadow-card">
          <span className="text-xs font-semibold text-amber-700">Drafts / Hidden</span>
          <p className="text-2xl font-extrabold text-amber-600 mt-1">{stats.drafts}</p>
        </div>
      </div>

      {/* Action Bar & Filter Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-surface border border-line rounded-card p-3 shadow-card">
        {/* Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {(["all", "active", "expired", "draft"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors ${
                statusFilter === tab
                  ? "bg-navy-900 text-white"
                  : "text-text-secondary hover:text-navy-900 hover:bg-surface-sunken"
              }`}
            >
              {tab === "draft" ? "Drafts" : tab}
            </button>
          ))}
        </div>

        {/* Upload Button */}
        <button
          type="button"
          onClick={() => setIsUploadOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-action hover:bg-action/90 text-white text-xs font-bold rounded-xl transition-all shadow-xs"
        >
          <Plus className="size-4" />
          Upload Safety Story
        </button>
      </div>

      {/* Stories List */}
      {isLoading ? (
        <div className="p-12 text-center text-text-secondary bg-surface border border-line rounded-card">
          <span className="size-6 border-2 border-action border-t-transparent rounded-full animate-spin inline-block mb-2" />
          <p className="text-xs font-medium">Loading safety stories...</p>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-rose-700 bg-rose-50 border border-rose-200 rounded-card">
          <p className="text-sm font-bold">Failed to load stories</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold"
          >
            Retry
          </button>
        </div>
      ) : stories.length === 0 ? (
        <div className="p-12 text-center bg-surface border border-line rounded-card shadow-card flex flex-col items-center">
          <div className="size-12 rounded-full bg-navy-50 flex items-center justify-center text-navy-400 mb-3">
            <ShieldAlert className="size-6" />
          </div>
          <h3 className="text-sm font-bold text-navy-900">No safety stories found</h3>
          <p className="text-xs text-text-secondary mt-1 max-w-sm">
            {statusFilter === "all"
              ? "No safety stories have been uploaded yet. Click Upload Safety Story to add the first post."
              : `There are currently no stories matching the '${statusFilter}' status.`}
          </p>
          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            className="mt-4 px-4 py-2 bg-action text-white text-xs font-bold rounded-xl hover:bg-action/90 transition-colors"
          >
            Upload Story
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stories.map((story) => {
            const { label: statusLabel, tone } = formatCountdown(story);

            return (
              <div
                key={story.id}
                className="bg-surface border border-line rounded-card shadow-card overflow-hidden flex flex-col justify-between hover:border-line-strong transition-all"
              >
                {/* Media Preview Box */}
                <div className="relative aspect-video w-full bg-navy-950 flex items-center justify-center overflow-hidden group">
                  {story.media_type === "IMAGE" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={story.media_url}
                      alt={story.title}
                      className="size-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <video
                      src={story.media_url}
                      muted
                      playsInline
                      className="size-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  )}

                  {/* Media Type Badge */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-white text-[10px] font-bold">
                    {story.media_type === "IMAGE" ? (
                      <ImageIcon className="size-3" />
                    ) : (
                      <Film className="size-3" />
                    )}
                    <span>{story.media_type}</span>
                  </div>

                  {/* Status Countdown Badge */}
                  <div
                    className={`absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-xs shadow-xs ${
                      tone === "active"
                        ? "bg-emerald-500/90 text-white"
                        : tone === "expired"
                          ? "bg-gray-700/90 text-gray-200"
                          : "bg-amber-500/90 text-white"
                    }`}
                  >
                    {statusLabel}
                  </div>

                  {/* Overlay Preview Action */}
                  <button
                    type="button"
                    onClick={() => setPreviewStory(story)}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white text-xs font-bold"
                  >
                    <Eye className="size-4" />
                    Preview Story
                  </button>
                </div>

                {/* Content Body */}
                <div className="p-4 flex flex-col gap-2 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-navy-900 leading-snug line-clamp-1">
                      {story.title || "Untitled Story"}
                    </h3>
                    <span className="text-[10px] font-semibold text-text-secondary shrink-0 bg-surface-sunken px-1.5 py-0.5 rounded">
                      Order: {story.display_order}
                    </span>
                  </div>

                  <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
                    {story.caption || "No caption provided."}
                  </p>

                  <div className="mt-auto pt-3 border-t border-line flex items-center justify-between text-[11px] text-text-secondary">
                    <span>{formatFileSize(story.size_bytes)}</span>
                    <span className="truncate max-w-[150px]">
                      {new Date(story.published_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="px-4 py-2.5 bg-surface-sunken/40 border-t border-line flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleTogglePublished(story)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                      story.is_published
                        ? "text-navy-800 hover:bg-surface-sunken border border-line"
                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                    }`}
                  >
                    {story.is_published ? "Unpublish" : "Publish"}
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingStory(story)}
                      aria-label="Edit story"
                      className="p-1.5 text-text-secondary hover:text-navy-900 rounded-lg hover:bg-surface-sunken transition-colors"
                    >
                      <Pencil className="size-4" />
                    </button>

                    {deleteConfirmId === story.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDelete(story.id)}
                          className="px-2 py-1 bg-rose-600 text-white text-[10px] font-bold rounded"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-1.5 py-1 text-text-secondary text-[10px] rounded hover:bg-surface-sunken"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(story.id)}
                        aria-label="Delete story"
                        className="p-1.5 text-text-secondary hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <UploadStoryDialog
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={() => void refetch()}
      />

      <EditStoryDialog
        isOpen={Boolean(editingStory)}
        story={editingStory}
        onClose={() => setEditingStory(null)}
        onSuccess={() => void refetch()}
      />

      <StoryPreviewModal
        isOpen={Boolean(previewStory)}
        story={previewStory}
        onClose={() => setPreviewStory(null)}
      />
    </div>
  );
}
