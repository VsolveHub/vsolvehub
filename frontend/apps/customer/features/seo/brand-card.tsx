import { ImageResponse } from "next/og";

import { SERVICE_CITY, SITE_NAME } from "@/lib/site";

export const BRAND_CARD_SIZE = { width: 1200, height: 630 };
export const BRAND_CARD_ALT = `${SITE_NAME} — verified home services in ${SERVICE_CITY}`;

/**
 * The link preview for any page without a picture of its own (WhatsApp, X, LinkedIn, Slack).
 *
 * Drawn rather than a static file so the brand line and the city stay in step with `lib/site`.
 * Text only, in the system font, so rendering needs no network fetch.
 */
export function brandCard(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #041227 0%, #0B2A55 100%)",
          color: "#FFFFFF",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "#EA580C",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              fontWeight: 800,
            }}
          >
            V
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 800 }}>{SITE_NAME}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 68, fontWeight: 800, lineHeight: 1.05 }}>
            {`Verified home services in ${SERVICE_CITY}`}
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#A9B9D1" }}>
            Electricians · Plumbers · AC repair · Cleaning · Beauty · Pet care
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 28, color: "#FDBA74" }}>
          See the price first. Pay only after a professional accepts.
        </div>
      </div>
    ),
    BRAND_CARD_SIZE,
  );
}
