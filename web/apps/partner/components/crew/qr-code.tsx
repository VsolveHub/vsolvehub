"use client";

import { QRCodeSVG } from "qrcode.react";

/**
 * Thin wrapper around qrcode.react so the dependency lives in exactly one place.
 * Renders an accessible, print-friendly QR for an invite/clock URL.
 */
export function QrCode({ value, size = 200, label }: { value: string; size?: number; label?: string }) {
  return (
    <div className="inline-flex flex-col items-center gap-2">
      <div className="rounded-xl border border-border bg-white p-3">
        <QRCodeSVG value={value} size={size} level="M" marginSize={0} role="img" aria-label={label ?? "QR code"} />
      </div>
      {label ? <span className="text-xs font-medium text-gray-500">{label}</span> : null}
    </div>
  );
}
