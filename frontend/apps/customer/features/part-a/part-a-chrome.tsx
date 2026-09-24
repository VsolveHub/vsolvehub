"use client";

import type { ReactNode } from "react";

export function PartAFilterBar({ children }: { children: ReactNode }) {
  return <section className="flex flex-wrap items-center gap-2">{children}</section>;
}

export function PartAPill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
        active
          ? "bg-action text-action-text shadow-xs"
          : "border border-line bg-surface text-text-secondary hover:border-line-strong"
      }`}
    >
      {label}
    </button>
  );
}

export function PartAResultHeader({
  count,
  place,
  noun,
  sort,
  onSort,
}: {
  count: number;
  place: string;
  noun: string;
  sort: string;
  onSort: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-semibold text-navy-900">
        Showing {count} {noun}
        {place ? ` in ${place}` : ""}
      </p>
      <label className="flex items-center gap-2 text-xs text-text-secondary">
        Sort by
        <select
          value={sort}
          onChange={(event) => onSort(event.target.value)}
          className="rounded-control border border-line bg-surface px-2 py-1 text-xs font-semibold text-navy-900"
        >
          <option value="latest">Latest</option>
        </select>
      </label>
    </div>
  );
}

export function PartADetailLayout({
  main,
  aside,
}: {
  main: ReactNode;
  aside: ReactNode;
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-6">{main}</div>
      <div className="lg:sticky lg:top-4">{aside}</div>
    </div>
  );
}

export function PartAImageGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  const slides = images.length > 0 ? images : [];
  if (slides.length === 0) {
    return (
      <div className="grid h-64 place-items-center rounded-card border border-line bg-surface-sunken text-sm text-text-muted">
        No photos yet
      </div>
    );
  }
  const [first, ...rest] = slides;
  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={first} alt={alt} className="h-72 w-full rounded-card object-cover" />
      {rest.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto">
          {rest.slice(0, 4).map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" className="h-16 w-20 rounded-control object-cover" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PartATrustList({ lines }: { lines: string[] }) {
  return (
    <ul className="space-y-1 text-[11px] text-success-text">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

export function SaveHeart({
  saved,
  onToggle,
}: {
  saved: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? "Remove saved item" : "Save item"}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      className={`grid size-8 place-items-center rounded-full border bg-surface text-sm ${
        saved ? "border-action text-action" : "border-line text-text-muted"
      }`}
    >
      {saved ? "♥" : "♡"}
    </button>
  );
}
