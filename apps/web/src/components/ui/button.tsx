"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2, Check } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type ButtonSize = "sm" | "md" | "lg";
type ButtonState = "idle" | "loading" | "success";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  state?: ButtonState;
  icon?: ReactNode;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 focus-visible:ring-brand-500/40",
  secondary:
    "bg-surface-0 text-surface-700 border border-surface-300 hover:bg-surface-50 active:bg-surface-100 focus-visible:ring-surface-400/40",
  ghost:
    "text-surface-600 hover:bg-surface-100 active:bg-surface-200 focus-visible:ring-surface-400/40",
  danger:
    "bg-danger-600 text-white hover:bg-danger-700 active:bg-danger-800 focus-visible:ring-danger-500/40",
  success:
    "bg-success-600 text-white hover:bg-success-700 active:bg-success-800 focus-visible:ring-success-500/40",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5 rounded-lg",
  md: "px-4 py-2.5 text-sm gap-2 rounded-xl",
  lg: "px-6 py-3 text-base gap-2.5 rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    state = "idle",
    icon,
    iconPosition = "left",
    fullWidth = false,
    disabled,
    children,
    className = "",
    ...props
  },
  ref,
) {
  const isDisabled = disabled || state === "loading";

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center font-medium
        transition-all duration-200 ease-[var(--ease-smooth)]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        press-effect
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? "w-full" : ""}
        ${state === "success" ? "bg-success-600 text-white hover:bg-success-600" : ""}
        ${className}
      `.trim()}
      {...props}
    >
      {state === "loading" && (
        <Loader2 className="h-4 w-4 animate-spin" />
      )}
      {state === "success" && (
        <Check className="h-4 w-4" />
      )}
      {state === "idle" && icon && iconPosition === "left" && icon}
      {state === "success" ? "Done" : children}
      {state === "idle" && icon && iconPosition === "right" && icon}
    </button>
  );
});
