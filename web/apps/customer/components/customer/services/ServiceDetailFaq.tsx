"use client";

import { useState } from "react";

type Props = {
  items: { question: string; answer: string }[];
};

export function ServiceDetailFaq({ items }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="sd-faq-list">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={item.question} className="sd-faq-item">
            <button
              type="button"
              className="sd-faq-question"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              aria-expanded={isOpen}
            >
              <span>{item.question}</span>
              <ChevronIcon open={isOpen} />
            </button>
            {isOpen && <p className="sd-faq-answer">{item.answer}</p>}
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
      className={open ? "sd-chevron open" : "sd-chevron"}
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
