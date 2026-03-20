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
        {/* Logo mark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 96,
            height: 96,
            borderRadius: 24,
            backgroundColor: "#2563eb",
            marginBottom: 32,
            border: "3px solid rgba(255,255,255,0.2)",
          }}
        >
          <span style={{ fontSize: 56, fontWeight: 800, color: "white" }}>B</span>
        </div>

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
