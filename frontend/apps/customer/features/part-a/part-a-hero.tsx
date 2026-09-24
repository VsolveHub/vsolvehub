"use client";

import type { FormEvent, ReactNode } from "react";

export function PartAHero({
  title,
  subtitle,
  image,
  children,
  aside,
}: {
  title: string;
  subtitle: string;
  image: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-[var(--radius-card)] bg-cover bg-center text-navy-950 shadow-raised"
      style={{ backgroundImage: `linear-gradient(90deg, rgba(255,255,255,0.92), rgba(255,255,255,0.72)), url(${image})` }}
    >
      <div className="relative z-10 flex flex-col gap-6 p-6 sm:p-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
            <p className="text-sm text-text-secondary sm:text-base">{subtitle}</p>
          </div>
          {aside}
        </div>
        {children}
      </div>
    </section>
  );
}

export function PartASearchForm({
  onSubmit,
  children,
}: {
  onSubmit: (event: FormEvent) => void;
  children: ReactNode;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 rounded-control bg-surface p-2.5 shadow-raised md:grid-cols-[1fr_220px_auto]"
    >
      {children}
    </form>
  );
}
