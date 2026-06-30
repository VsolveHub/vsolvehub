"use client";

import Link from "next/link";
import { useState } from "react";
import { HOME_FAQ } from "@/lib/catalog/display-catalog";

export function HomeFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="home-section home-faq" aria-labelledby="home-faq-heading">
      <div className="section-header-row">
        <h2 id="home-faq-heading" className="home-section-title">
          Frequently asked questions
        </h2>
        <Link href="/profile/help" className="section-link">
          View all →
        </Link>
      </div>

      <div className="home-faq-list">
        {HOME_FAQ.map((item, index) => {
          const isOpen = openIndex === index;

          return (
            <div key={item.question} className={`home-faq-item${isOpen ? " is-open" : ""}`}>
              <button
                type="button"
                className="home-faq-question"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                aria-expanded={isOpen}
              >
                <span>{item.question}</span>
                <ChevronIcon open={isOpen} />
              </button>
              {isOpen && <p className="home-faq-answer">{item.answer}</p>}
            </div>
          );
        })}
      </div>
    </section>
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
      className={open ? "home-faq-chevron open" : "home-faq-chevron"}
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
