"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
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
        {thumbs.map((t) => (
          <li
            key={t.key}
            className="relative size-20 overflow-hidden rounded-control border border-line bg-surface-sunken"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.url} alt="" className={`size-full object-cover ${t.busy ? "opacity-50" : ""}`} />
            {t.onRemove ? (
              <button
                type="button"
                aria-label="Remove photo"
                disabled={t.busy}
                onClick={t.onRemove}
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
            Uploading…
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
              <span className="text-[11px] font-semibold">Add photo</span>
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
    if (result.failed) setError(`${result.failed} photo(s) could not be uploaded.`);
  }

  return (
    <div className="flex flex-col gap-1">
      <ThumbGrid
        label="Room photos"
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
        Show the bed, the bathroom and the view. Guests search by room, and a room type without
        a photo is not shown to them.
      </p>
      {error ? <p className="text-xs text-danger-text">{error}</p> : null}
    </div>
  );
}

/** Photos of a saved room type: adding or removing one saves straight away. */
export function RoomPhotosLive({ unit }: { unit: StayUnit }) {
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
      if (result.failed) setError(`${result.failed} photo(s) could not be uploaded.`);
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
        label={media.length ? `Room photos (${media.length})` : "Room photos"}
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
          Hidden from guests until you add a photo of this room.
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
      if (result.failed) setError(`${result.failed} photo(s) could not be uploaded.`);
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
        label={label ?? (media.length ? `Photos (${media.length})` : "Photos")}
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
          Guests won&rsquo;t see this look until you add a photo.
        </p>
      ) : null}
      {error ? <p className="text-xs text-danger-text">{error}</p> : null}
    </div>
  );
}
