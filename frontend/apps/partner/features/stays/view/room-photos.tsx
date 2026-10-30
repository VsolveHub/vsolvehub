"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { useT } from "@vsolve/ui";
import { Camera, X } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";

import {
  MAX_ROOM_PHOTOS,
  addPartnerStayLookMedia,
  addPartnerStayUnitMedia,
  deletePartnerStayUnitMedia,
  uploadPartnerStayPhoto,
  type StayLook,
  type StayUnit,
} from "@/features/stays/queries";

type Thumb = { key: string; url: string; busy?: boolean; onRemove?: () => void };

function ThumbGrid({
  thumbs,
  canAdd,
  uploading,
  onPick,
  label,
}: {
  thumbs: Thumb[];
  canAdd: boolean;
  uploading: number;
  onPick: (files: FileList | null) => void;
  label: string;
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-semibold text-text">{label}</p>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onPick(event.target.files);
          event.target.value = "";
        }}
      />
      <ul className="flex flex-wrap gap-2">
        {thumbs.map((thumb) => (
          <li
            key={thumb.key}
            className="relative size-20 overflow-hidden rounded-control border border-line bg-surface-sunken"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb.url} alt="" className={`size-full object-cover ${thumb.busy ? "opacity-50" : ""}`} />
            {thumb.onRemove ? (
              <button
                type="button"
                aria-label={t("stays.photos.remove")}
                disabled={thumb.busy}
                onClick={thumb.onRemove}
                className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full bg-white/95 text-navy-900 shadow-xs"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </li>
        ))}
        {Array.from({ length: uploading }, (_, i) => (
          <li
            key={`up-${i}`}
            className="flex size-20 items-center justify-center rounded-control border border-line bg-surface-sunken text-[11px] text-text-secondary"
          >
            {t("stays.photos.uploading")}
          </li>
        ))}
        {canAdd ? (
          <li>
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex size-20 flex-col items-center justify-center gap-1 rounded-control border-2 border-dashed border-line-strong bg-surface-sunken text-text-secondary transition hover:border-action hover:text-navy-900"
            >
              <Camera className="size-5" />
              <span className="text-[11px] font-semibold">{t("stays.photos.add")}</span>
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

async function uploadAll(files: FileList, room: number): Promise<{ urls: string[]; failed: number }> {
  const chosen = Array.from(files).slice(0, Math.max(room, 0));
  const results = await Promise.allSettled(chosen.map((file) => uploadPartnerStayPhoto(file)));
  const urls = results.flatMap((r) => (r.status === "fulfilled" ? [r.value.url] : []));
  return { urls, failed: results.length - urls.length };
}

/** Photos for a room type that is not saved yet: uploaded now, attached when it is created. */
export function RoomPhotosDraft({ urls, onChange }: { urls: string[]; onChange: (next: string[]) => void }) {
  const t = useT();
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_ROOM_PHOTOS - urls.length;
    setUploading(Math.min(files.length, room));
    setError(null);
    const result = await uploadAll(files, room);
    setUploading(0);
    onChange([...urls, ...result.urls]);
    if (result.failed) setError(t("stays.photos.uploadFailed", { count: result.failed }));
  }

  return (
    <div className="flex flex-col gap-1">
      <ThumbGrid
        label={t("stays.photos.roomPhotos")}
        uploading={uploading}
        canAdd={urls.length + uploading < MAX_ROOM_PHOTOS}
        onPick={(files) => void pick(files)}
        thumbs={urls.map((url) => ({
          key: url,
          url,
          onRemove: () => onChange(urls.filter((u) => u !== url)),
        }))}
      />
      <p className="text-xs text-text-secondary">
        {t("stays.photos.draftHint")}
      </p>
      {error ? <p className="text-xs text-danger-text">{error}</p> : null}
    </div>
  );
}

/** Photos of a saved room type: adding or removing one saves straight away. */
export function RoomPhotosLive({ unit }: { unit: StayUnit }) {
  const t = useT();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const media = unit.media ?? [];
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["partner-stays"] });

  const remove = useMutation({
    mutationFn: (mediaId: string) => deletePartnerStayUnitMedia(unit.id, mediaId),
    onSuccess: invalidate,
    onError: (err: unknown) => setError(friendlyErrorMessage(err)),
  });

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_ROOM_PHOTOS - media.length;
    setUploading(Math.min(files.length, room));
    setError(null);
    try {
      const result = await uploadAll(files, room);
      for (const url of result.urls) {
        await addPartnerStayUnitMedia(unit.id, url);
      }
      if (result.failed) setError(t("stays.photos.uploadFailed", { count: result.failed }));
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setUploading(0);
      invalidate();
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <ThumbGrid
        label={
          media.length
            ? t("stays.photos.roomPhotosCount", { n: media.length })
            : t("stays.photos.roomPhotos")
        }
        uploading={uploading}
        canAdd={media.length + uploading < MAX_ROOM_PHOTOS}
        onPick={(files) => void pick(files)}
        thumbs={media.map((m) => ({
          key: m.id,
          url: m.url,
          busy: remove.isPending && remove.variables === m.id,
          onRemove: () => remove.mutate(m.id),
        }))}
      />
      {media.length === 0 && uploading === 0 ? (
        <p className="rounded-control bg-warning-surface px-2.5 py-1.5 text-xs font-semibold text-warning-text">
          {t("stays.photos.roomHidden")}
        </p>
      ) : null}
      {error ? <p className="text-xs text-danger-text">{error}</p> : null}
    </div>
  );
}

/**
 * Photos of one look of a room type: adding or removing one saves straight away. Guests see
 * these on that look's own card.
 */
export function LookPhotosLive({ unit, look, label }: { unit: StayUnit; look: StayLook; label?: string }) {
  const t = useT();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const media = look.media ?? [];
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["partner-stays"] });

  const remove = useMutation({
    mutationFn: (mediaId: string) => deletePartnerStayUnitMedia(unit.id, mediaId),
    onSuccess: invalidate,
    onError: (err: unknown) => setError(friendlyErrorMessage(err)),
  });

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_ROOM_PHOTOS - media.length;
    setUploading(Math.min(files.length, room));
    setError(null);
    try {
      const result = await uploadAll(files, room);
      for (const url of result.urls) {
        await addPartnerStayLookMedia(look.id, url);
      }
      if (result.failed) setError(t("stays.photos.uploadFailed", { count: result.failed }));
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setUploading(0);
      invalidate();
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <ThumbGrid
        label={
          label ??
          (media.length ? t("stays.photos.photosCount", { n: media.length }) : t("stays.photos.photos"))
        }
        uploading={uploading}
        canAdd={media.length + uploading < MAX_ROOM_PHOTOS}
        onPick={(files) => void pick(files)}
        thumbs={media.map((m) => ({
          key: m.id,
          url: m.url,
          busy: remove.isPending && remove.variables === m.id,
          onRemove: () => remove.mutate(m.id),
        }))}
      />
      {media.length === 0 && uploading === 0 ? (
        <p className="rounded-control bg-warning-surface px-2.5 py-1.5 text-xs font-semibold text-warning-text">
          {t("stays.photos.lookHidden")}
        </p>
      ) : null}
      {error ? <p className="text-xs text-danger-text">{error}</p> : null}
    </div>
  );
}
