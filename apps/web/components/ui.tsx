"use client";

import type { ReactNode } from "react";
import { useHelp } from "@/components/help-dialog";

export function PageHeader({ title, description, about }: { title: string; description: string; about?: string }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="type-display">{title}</h1>
        <p className="type-body mt-2 text-ink-dim">{description}</p>
      </div>
      {about ? <AboutButton topic={about} label="About this page" /> : null}
    </header>
  );
}

export function Panel({
  title,
  children,
  about,
  aboutLabel = "About these figures",
  className = "",
}: {
  title?: string;
  children: ReactNode;
  about?: string;
  aboutLabel?: string;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="type-card">{title}</h2>
          {about ? <AboutButton topic={about} label={aboutLabel} /> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function AboutButton({ topic, label }: { topic: string; label: string }) {
  const help = useHelp();
  return (
    <button type="button" className="type-secondary text-link" onClick={() => help.open(topic)}>
      {label}
    </button>
  );
}

export function Badge({ children, tone }: { children: string; tone: "reference" | "imported" }) {
  return <span className={tone === "reference" ? "badge-reference type-meta" : "badge-imported type-meta"}>{children}</span>;
}

export function MetricSummary({
  label,
  value,
  unit,
  definition,
  source,
  note,
  presence,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  definition: string;
  source: string;
  note?: string;
  presence?: "reported" | "absent";
  tone?: "allow" | "reject" | "warning" | "danger";
}) {
  const absent = presence === "absent";
  const rule = tone === "allow" ? "border-l-allow" : tone === "reject" ? "border-l-reject" : tone === "warning" ? "border-l-warning" : tone === "danger" ? "border-l-danger" : "border-l-line";
  return (
    <article className={`card border-l-[3px] ${rule}`}>
      <h2 className="type-secondary text-ink-dim">{label}</h2>
      <p className="type-metric mt-2">
        {absent ? "No sample" : value}{" "}
        {absent ? null : <span className="type-secondary text-ink-dim">{unit}</span>}
      </p>
      <p className="type-body mt-2 text-ink-dim">{definition}</p>
      <p className="type-secondary mt-1 text-ink">{source}</p>
      {note ? <p className="type-secondary mt-1 text-ink-dim">{note}</p> : null}
    </article>
  );
}

export function SkeletonBlock({ label, kind }: { label: string; kind: "metric" | "chart" | "table" }) {
  return (
    <div className="card" aria-busy="true">
      <p className="sr-only">{label}</p>
      {kind === "metric" ? (
        <div className="grid gap-3">
          <div className="skeleton-block h-3 w-24" />
          <div className="skeleton-block metric-figure w-32" />
          <div className="skeleton-block h-3 w-40" />
        </div>
      ) : null}
      {kind === "chart" ? <div className="skeleton-block h-(--chart-height) w-full" /> : null}
      {kind === "table" ? (
        <div className="grid gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="skeleton-block h-4.5 w-full" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Callout({ title, tone = "warning", children }: { title: string; tone?: "info" | "warning" | "danger" | "success"; children: ReactNode }) {
  const toneClass = tone === "warning" ? "notice-warning" : tone === "danger" ? "notice-danger" : tone === "success" ? "notice-success" : "";
  return (
    <aside className={`notice ${toneClass}`}>
      <h2 className="type-card">{title}</h2>
      <div className="type-body mt-1 text-ink-dim">{children}</div>
    </aside>
  );
}

export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: string[][];
}) {
  const stack = columns.length <= 4;
  const wide = columns.length > 4;
  const numeric = columns.map((_, columnIndex) => columnIndex > 0 && rows.every((row) => isNumeric(row[columnIndex] ?? "")));
  return (
    <div>
      {wide ? <p className="type-secondary mb-2 text-ink-dim md:sr-only">More columns</p> : null}
      <div className={wide ? "table-scroll" : undefined}>
        <table className={`data-table ${stack ? "stack-narrow" : ""}`}>
          <caption className="type-secondary mb-2 text-left text-ink-dim">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column, columnIndex) => (
                <th key={column} scope="col" className={`type-secondary ${numeric[columnIndex] ? "is-numeric" : "is-text"}`}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.join("|")}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${columns[cellIndex]}-${index}`}
                    data-label={columns[cellIndex]}
                    className={`${numeric[cellIndex] ? "type-data is-numeric" : "type-body is-text"}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function isNumeric(cell: string): boolean {
  return cell === "" || cell === "unavailable" || /^-?\d+(\.\d+)?$/.test(cell);
}

export function presenceNote(presence: "reported" | "absent", value: number): string {
  if (presence === "absent") return "No sample, interpreted as 0";
  if (value === 0) return "Reported 0";
  return "Cumulative counter";
}
