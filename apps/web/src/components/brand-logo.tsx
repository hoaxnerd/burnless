let counter = 0;

export function BrandLogo({ className = "" }: { className?: string }) {
  const gradId = `brand-logo-grad-${counter++}`;
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="8" y1="28" x2="24" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563eb" />
          <stop offset="1" stopColor="#60a5fa" />
        </linearGradient>
      </defs>
      <path
        d="M16 2C16 2 10 10 10 16C10 19.3 12.7 22 16 22C19.3 22 22 19.3 22 16C22 10 16 2 16 2Z"
        fill={`url(#${gradId})`}
      />
      <path
        d="M16 12C16 12 13 16 13 18.5C13 20.2 14.3 21.5 16 21.5C17.7 21.5 19 20.2 19 18.5C19 16 16 12 16 12Z"
        fill="#0f1729"
      />
      <circle cx="16" cy="28" r="2" fill={`url(#${gradId})`} opacity="0.6" />
    </svg>
  );
}
