import type { ReactNode } from "react";
import { Mark } from "@/components/logo";

type BrandLoaderVariant = "inline" | "route" | "button" | "section";

export function BrandLoader({
  variant = "inline",
  label,
  status,
  children,
  className = "",
}: {
  variant?: BrandLoaderVariant;
  /** Accessible name for the loading region. Omit for button when the control already names itself. */
  label?: string;
  status?: string;
  children?: ReactNode;
  className?: string;
}) {
  if (variant === "section") {
    return (
      <div className={className} aria-busy={label ? true : undefined} aria-label={label}>
        {label ? <p className="sr-only">{label}</p> : null}
        {children}
      </div>
    );
  }

  if (variant === "button") {
    return (
      <span className={`brand-loader brand-loader-button ${className}`.trim()} aria-hidden="true">
        <Mark activity className="brand-loader-mark brand-loader-mark-button" />
      </span>
    );
  }

  const markClass =
    variant === "route" ? "brand-loader-mark brand-loader-mark-route" : "brand-loader-mark brand-loader-mark-inline";

  const accessible = label ?? status ?? "Loading";

  return (
    <div
      className={`brand-loader brand-loader-${variant} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={accessible}
    >
      <Mark activity className={markClass} />
      {status ? (
        <span className="brand-loader-status type-secondary text-ink-dim" aria-hidden={label ? true : undefined}>
          {status}
        </span>
      ) : null}
    </div>
  );
}
