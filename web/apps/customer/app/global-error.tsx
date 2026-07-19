"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary that catches errors thrown in the root layout itself
 * (where the segment-level error.tsx cannot run). Must render its own <html>
 * and <body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "system-ui, sans-serif",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Something went wrong</h2>
        <p style={{ color: "#6b7280", maxWidth: "28rem" }}>
          The app ran into an unexpected error. Please reload the page.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            background: "#1e3a8a",
            color: "#fff",
            border: "none",
            borderRadius: "10px",
            padding: "0.65rem 1.5rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
