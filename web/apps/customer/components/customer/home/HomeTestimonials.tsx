"use client";

import { useEffect, useState } from "react";
import { HOME_TESTIMONIALS } from "@/lib/catalog/display-catalog";

export function HomeTestimonials() {
  const [active, setActive] = useState(0);
  const testimonial = HOME_TESTIMONIALS[active];

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % HOME_TESTIMONIALS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="home-testimonials-wrapper" aria-labelledby="home-reviews-heading">
      <h2 id="home-reviews-heading" className="home-section-title">
        What customers say
      </h2>
      <blockquote className="home-testimonial-card">
        <div className="home-testimonial-stars" aria-hidden>
          {"★".repeat(testimonial.rating)}
          {"☆".repeat(5 - testimonial.rating)}
        </div>
        <p>&ldquo;{testimonial.quote}&rdquo;</p>
        <footer>
          {testimonial.avatar && (
            <img src={testimonial.avatar} alt={testimonial.author} className="testimonial-avatar" />
          )}
          <div className="testimonial-author-info">
            <strong>{testimonial.author}</strong>
            <span>{testimonial.city}</span>
          </div>
        </footer>
      </blockquote>
      <div className="home-testimonial-dots">
        {HOME_TESTIMONIALS.map((t, i) => (
          <button
            key={t.author}
            type="button"
            className={`hero-dot ${i === active ? "active" : ""}`}
            onClick={() => setActive(i)}
            aria-label={`Show review from ${t.author}`}
          />
        ))}
      </div>
    </div>
  );
}
