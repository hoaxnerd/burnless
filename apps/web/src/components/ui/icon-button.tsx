"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type IconButtonVariant = "ghost" | "secondary" | "danger";
type IconButtonSize = "sm" | "md" | "lg";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** The icon to render. Icon-only buttons MUST be labelled for screen readers. */
  icon: ReactNode;
  /**
   * Required accessible name. Icon-only controls have no visible text, so an
   * aria-label is mandatory (A11Y-CTRL-01).
   */
  "aria-label": string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

const variantStyles: Record<IconButtonVariant, string> = {
  ghost:
    "text-surface-500 hover:bg-surface-100 hover:text-surface-700 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-200 focus-visible:ring-surface-400/40",
  secondary:
    "bg-surface-0 text-surface-700 border border-surface-300 hover:bg-surface-50 dark:bg-surface-900 dark:text-surface-50 dark:border-surface-700 dark:hover:bg-surface-800 focus-visible:ring-surface-400/40",
  danger:
    "text-danger-600 hover:bg-danger-50 dark:text-danger-400 dark:hover:bg-danger-950/40 focus-visible:ring-danger-500/40",
};

const sizeStyles: Record<IconButtonSize, string> = {
  sm: "h-7 w-7 rounded-lg [&_svg]:h-3.5 [&_svg]:w-3.5",
  md: "h-9 w-9 rounded-xl [&_svg]:h-4 [&_svg]:w-4",
  lg: "h-11 w-11 rounded-xl [&_svg]:h-5 [&_svg]:w-5",
};

/**
 * Icon-only button. The `aria-label` prop is required at the type level so an
 * accessible name can never be omitted (A11Y-CTRL-01).
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, variant = "ghost", size = "md", className = "", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`
        inline-flex items-center justify-center
        transition-all duration-200 ease-[var(--ease-smooth)]
        focus-visible:outline-none focus-visible:ring-2
        disabled:opacity-60 disabled:cursor-not-allowed
        press-effect
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `.trim()}
      {...props}
    >
      {icon}
    </button>
  );
});
