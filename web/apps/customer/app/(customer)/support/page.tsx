"use client";

import { useState } from "react";
import Link from "next/link";
import { HOME_FAQ } from "@/lib/catalog/display-catalog";

export default function SupportPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="support-page">
      {/* Hero Banner */}
      <section className="support-hero">
        <div className="support-hero-content">
          <h1>How can we help you?</h1>
          <p>Find answers to common questions or reach out to our team directly. We're here for you 24/7.</p>
        </div>
      </section>

      <div className="support-container">
        {/* Contact Grid */}
        <div className="support-contact-grid">
          <Link href="#" className="support-contact-card">
            <div className="support-contact-icon">💬</div>
            <h3>Live Chat</h3>
            <p>Chat with our support team in real-time. Typical reply in under 5 minutes.</p>
            <span className="support-contact-btn">Start Chat →</span>
          </Link>
          
          <Link href="tel:+18001234567" className="support-contact-card">
            <div className="support-contact-icon">📞</div>
            <h3>Call Us</h3>
            <p>Prefer to talk? Reach our support team by phone anytime, 24/7.</p>
            <span className="support-contact-btn">1-800-123-4567 →</span>
          </Link>
          
          <Link href="mailto:support@vsolvehub.com" className="support-contact-card">
            <div className="support-contact-icon">📧</div>
            <h3>Email Us</h3>
            <p>Send us an email and we'll get back to you within 24 hours.</p>
            <span className="support-contact-btn">support@vsolvehub.com →</span>
          </Link>
        </div>

        {/* FAQs */}
        <section className="support-faq-section">
          <h2>Frequently Asked Questions</h2>
          <div className="support-faq-container">
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
          </div>
        </section>
      </div>
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
      className={open ? "home-faq-chevron open" : "home-faq-chevron"}
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
