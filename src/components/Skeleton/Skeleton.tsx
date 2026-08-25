import { forwardRef, type HTMLAttributes } from "react";

export type SkeletonShape = "text" | "circle" | "rect";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** The visual form of the placeholder. Defaults to a text line. */
  shape?: SkeletonShape;
  /** Announces that the surrounding content is loading when supplied. */
  label?: string;
}

const shapeStyles: Record<SkeletonShape, string> = {
  text: "h-4 w-full rounded-sm",
  circle: "aspect-square rounded-full",
  rect: "rounded-md",
};

/** A decorative, animated placeholder for content that has not loaded yet. */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ shape = "text", label, className = "", ...rest }, ref) => (
    <div
      ref={ref}
      {...rest}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "status" : undefined}
      className={[
        "animate-pulse bg-surface-hover motion-reduce:animate-none",
        shapeStyles[shape],
        className,
      ].filter(Boolean).join(" ")}
    />
  ),
);

Skeleton.displayName = "Skeleton";
