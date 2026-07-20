"use client";

import { useState } from "react";

type Props = {
  items: { question: string; answer: string }[];
};

export function ServiceDetailFaq({ items }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div
            key={item.question}
            className="overflow-hidden rounded-2xl border border-gray-200 bg-white"
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-bold text-gray-900"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              aria-expanded={isOpen}
            >
              <span>{item.question}</span>
              <ChevronIcon open={isOpen} />
            </button>
            {isOpen && (
              <p className="px-5 pb-4 text-sm leading-relaxed text-gray-600">{item.answer}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
