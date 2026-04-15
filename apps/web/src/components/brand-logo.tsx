"use client";

import { useId } from "react";

export function BrandLogo({ className = "" }: { className?: string }) {
  const gradId = useId();
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="16" y1="30" x2="16" y2="2" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1d4ed8" />
          <stop offset="1" stopColor="#60a5fa" />
        </linearGradient>
      </defs>
      <path
        d="M16 2L19 10L22 5L25 14C26.5 20 24 28 16 30C8 28 5.5 20 7 14L10 6L13 10Z"
        fill={`url(#${gradId})`}
      />
      <path
        d="M12 16L16 19.5L20 16M13 20L16 23L19 20"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.4"
      />
    </svg>
  );
}
