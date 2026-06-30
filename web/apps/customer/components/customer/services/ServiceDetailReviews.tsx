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
    <div className="sd-reviews-list">
      {reviews.map((review, index) => {
        const isLong = review.text.length > 120;
        const isExpanded = expanded[index];
        const displayText =
          isLong && !isExpanded ? `${review.text.slice(0, 120)}…` : review.text;

        return (
          <article key={`${review.name}-${index}`} className="sd-review-card">
            <div className="sd-review-header">
              <strong>{review.name}</strong>
              <span className="sd-review-badge">★ {review.rating}</span>
            </div>
            <p className="sd-review-meta">
              {review.date} • {review.serviceLabel}
            </p>
            <p className="sd-review-text">
              {displayText}
              {isLong && !isExpanded && (
                <button
                  type="button"
                  className="sd-read-more"
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
