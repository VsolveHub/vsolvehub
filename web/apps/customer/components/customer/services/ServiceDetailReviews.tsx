"use client";

import { useState } from "react";

type Review = {
  name: string;
  date: string;
  rating: number;
  text: string;
  serviceLabel: string;
};

type Props = {
  reviews: Review[];
};

export function ServiceDetailReviews({ reviews }: Props) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  return (
    <div className="flex flex-col gap-4">
      {reviews.map((review, index) => {
        const isLong = review.text.length > 120;
        const isExpanded = expanded[index];
        const displayText =
          isLong && !isExpanded ? `${review.text.slice(0, 120)}…` : review.text;

        return (
          <article
            key={`${review.name}-${index}`}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <strong className="text-sm font-bold text-gray-900">{review.name}</strong>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                ★ {review.rating}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {review.date} • {review.serviceLabel}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              {displayText}
              {isLong && !isExpanded && (
                <button
                  type="button"
                  className="ml-1 font-semibold text-[var(--color-brand)] hover:underline"
                  onClick={() => setExpanded((prev) => ({ ...prev, [index]: true }))}
                >
                  read more
                </button>
              )}
            </p>
          </article>
        );
      })}
    </div>
  );
}
