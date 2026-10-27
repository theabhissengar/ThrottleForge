import type { ReactNode } from "react";

const ROW_WIDTHS = ["w-full", "w-[92%]", "w-[78%]", "w-[88%]", "w-[64%]"] as const;

export function SkeletonLine({ className = "h-3 w-40" }: { className?: string }) {
  return <div className={`skeleton-block ${className}`} aria-hidden="true" />;
}

export function SkeletonHeading({ className = "h-7 w-48" }: { className?: string }) {
  return <div className={`skeleton-block ${className}`} aria-hidden="true" />;
}

export function SkeletonBadge({ className = "h-5 w-28" }: { className?: string }) {
  return <div className={`skeleton-block ${className}`} aria-hidden="true" />;
}

export function SkeletonMetric({ tone }: { tone?: "allow" | "reject" | "warning" | "danger" }) {
  const rule =
    tone === "allow"
      ? "border-l-allow"
      : tone === "reject"
        ? "border-l-reject"
        : tone === "warning"
          ? "border-l-warning"
          : tone === "danger"
            ? "border-l-danger"
            : "border-l-line";
  return (
    <article className={`card metric-card min-w-0 ${rule}`} aria-hidden="true">
      <SkeletonLine className="h-3 w-24" />
      <SkeletonLine className="metric-figure mt-2 w-28" />
      <SkeletonLine className="mt-2 h-3 w-full max-w-48" />
      <SkeletonLine className="mt-1 h-3 w-32" />
    </article>
  );
}

export function SkeletonPanel({
  titleWidth = "w-40",
  children,
  className = "",
}: {
  titleWidth?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`} aria-hidden="true">
      <SkeletonHeading className={`mb-3 h-5 ${titleWidth}`} />
      {children}
    </section>
  );
}

export function SkeletonChart({ className = "" }: { className?: string }) {
  return <div className={`skeleton-block h-(--chart-height) w-full ${className}`} aria-hidden="true" />;
}

export function SkeletonRow({ width = "w-full" }: { width?: string }) {
  return <div className={`skeleton-block h-4.5 ${width}`} aria-hidden="true" />;
}

export function SkeletonTable({ rows = 5, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`grid gap-2 ${className}`} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonRow key={index} width={ROW_WIDTHS[index % ROW_WIDTHS.length]} />
      ))}
    </div>
  );
}

export function SkeletonFactValue() {
  return <SkeletonLine className="mt-1 h-4 w-28" />;
}
