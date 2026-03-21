import { generateOGImage } from "./_components/og-image-content";

export const runtime = "edge";
export const alt = "Burnless — AI Financial Planning for Startups";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage() {
  return generateOGImage();
}
