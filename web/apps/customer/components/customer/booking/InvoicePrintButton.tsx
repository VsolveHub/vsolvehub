"use client";

/** Triggers the browser's print dialog → the user saves the invoice as a PDF. */
export function InvoicePrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.75rem 1.25rem",
        background: "#5b1a8a",
        color: "#fff",
        fontWeight: 700,
        fontSize: "0.85rem",
        border: "none",
        borderRadius: "999px",
        cursor: "pointer",
      }}
    >
      ⬇ Download / Print invoice
    </button>
  );
}
