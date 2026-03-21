import type { PasswordStrength as PasswordStrengthType } from "./types";

interface PasswordStrengthProps {
  strength: NonNullable<PasswordStrengthType>;
}

export function PasswordStrength({ strength }: PasswordStrengthProps) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex-1 flex gap-1">
        <div
          className={`h-1 flex-1 rounded-full transition-colors ${
            strength === "weak"
              ? "bg-danger-500"
              : strength === "fair"
                ? "bg-warning-500"
                : "bg-success-500"
          }`}
        />
        <div
          className={`h-1 flex-1 rounded-full transition-colors ${
            strength === "fair"
              ? "bg-warning-500"
              : strength === "strong"
                ? "bg-success-500"
                : "bg-surface-200"
          }`}
        />
        <div
          className={`h-1 flex-1 rounded-full transition-colors ${
            strength === "strong"
              ? "bg-success-500"
              : "bg-surface-200"
          }`}
        />
      </div>
      <span
        className={`text-xs font-medium ${
          strength === "weak"
            ? "text-danger-600"
            : strength === "fair"
              ? "text-warning-600"
              : "text-success-600"
        }`}
      >
        {strength === "weak"
          ? "Weak"
          : strength === "fair"
            ? "Fair"
            : "Strong"}
      </span>
    </div>
  );
}
