import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. Defaults to "primary". */
  variant?: ButtonVariant;
  /** Size affects height, padding, and font-size. Defaults to "md". */
  size?: ButtonSize;
  /** Shows a spinner and disables interaction. Button keeps its width. */
  loading?: boolean;
  /** Icon-only button — enforces a square shape and requires aria-label. */
  iconOnly?: boolean;
}

const baseStyles =
  "inline-flex items-center justify-center gap-2 font-medium " +
  "transition-colors duration-150 rounded-md " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg " +
  "disabled:opacity-50 disabled:pointer-events-none";

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover",
  secondary:
    "bg-surface text-text border border-border hover:bg-surface-hover",
  ghost: "bg-transparent text-text hover:bg-surface-hover",
  destructive: "bg-danger text-danger-fg hover:opacity-90",
};

// min-h-11 (44px) on sm enforces the mobile touch-target floor regardless
// of the visually smaller padding/font at that size.
const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-9 min-h-11 sm:min-h-9 px-3 text-sm",
  md: "h-10 min-h-11 px-4 text-sm",
  lg: "h-11 px-6 text-base",
};

const iconOnlySizeStyles: Record<ButtonSize, string> = {
  sm: "h-9 w-9 min-h-11 min-w-11 sm:min-h-9 sm:min-w-9",
  md: "h-10 w-10 min-h-11 min-w-11",
  lg: "h-11 w-11",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      iconOnly = false,
      disabled,
      className = "",
      children,
      ...rest
    },
    ref,
  ) => {
    const sizeClass = iconOnly ? iconOnlySizeStyles[size] : sizeStyles[size];

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={[baseStyles, variantStyles[variant], sizeClass, className]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        {loading && (
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
