"use client";

// Last-resort boundary: catches errors thrown in the root layout itself, where
// the normal error.tsx cannot render. Must ship its own <html>/<body>.
// Without this, an unhandled server error shows Next's raw
// "Application error: a server-side exception has occurred" screen.
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces in Vercel logs alongside the digest so it can be traced.
    console.error("[global-error]", error.digest, error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#f6f7f9",
          color: "#0f172a",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 20px" }}>
            We hit a snag loading this page. Please try again — your progress is saved.
          </p>
          <button
            onClick={reset}
            style={{
              appearance: "none",
              border: "none",
              borderRadius: 10,
              padding: "12px 20px",
              fontSize: 14,
              fontWeight: 600,
              color: "#fff",
              background: "#4f46e5",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 16 }}>
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
