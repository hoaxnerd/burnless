import { ImageResponse } from "next/og";

const size = { width: 1200, height: 630 };

export function generateOGImage() {
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
        <svg
          viewBox="0 0 32 32"
          width="96"
          height="96"
          style={{ marginBottom: 32 }}
        >
          <defs>
            <linearGradient id="og-grad" x1="16" y1="30" x2="16" y2="2" gradientUnits="userSpaceOnUse">
              <stop stopColor="#60a5fa" />
              <stop offset="1" stopColor="#93c5fd" />
            </linearGradient>
          </defs>
          <path
            d="M16 2L19 10L22 5L25 14C26.5 20 24 28 16 30C8 28 5.5 20 7 14L10 6L13 10Z"
            fill="url(#og-grad)"
          />
          <path
            d="M12 16L16 19.5L20 16M13 20L16 23L19 20"
            stroke="white"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity="0.4"
          />
        </svg>

        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: "white",
            letterSpacing: "-0.02em",
            marginBottom: 16,
          }}
        >
          burnless
        </div>

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
