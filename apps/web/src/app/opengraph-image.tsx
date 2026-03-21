import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Burnless — AI Financial Planning for Startups";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0a0e1a 0%, #1e3a8a 50%, #2563eb 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Logo mark — flame SVG rendered inline for OG image compatibility */}
        <svg
          viewBox="0 0 32 32"
          width="96"
          height="96"
          style={{ marginBottom: 32 }}
        >
          <defs>
            <linearGradient id="og-grad" x1="8" y1="28" x2="24" y2="4" gradientUnits="userSpaceOnUse">
              <stop stopColor="#60a5fa" />
              <stop offset="1" stopColor="#93c5fd" />
            </linearGradient>
          </defs>
          <path
            d="M16 2C16 2 10 10 10 16C10 19.3 12.7 22 16 22C19.3 22 22 19.3 22 16C22 10 16 2 16 2Z"
            fill="url(#og-grad)"
          />
          <path
            d="M16 12C16 12 13 16 13 18.5C13 20.2 14.3 21.5 16 21.5C17.7 21.5 19 20.2 19 18.5C19 16 16 12 16 12Z"
            fill="#1e3a8a"
          />
          <circle cx="16" cy="28" r="2" fill="url(#og-grad)" opacity="0.6" />
        </svg>

        {/* Title */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: "white",
            letterSpacing: "-0.02em",
            marginBottom: 16,
          }}
        >
          Burnless
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 28,
            color: "rgba(255,255,255,0.8)",
            maxWidth: 700,
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          AI Financial Planning for Startups
        </div>

        {/* Bottom accent */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            display: "flex",
            gap: 8,
            alignItems: "center",
            color: "rgba(255,255,255,0.5)",
            fontSize: 18,
          }}
        >
          burnless.app
        </div>
      </div>
    ),
    { ...size },
  );
}
