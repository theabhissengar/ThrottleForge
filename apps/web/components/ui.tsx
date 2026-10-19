import type { ReactNode } from "react";

export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-3xl text-base leading-7 text-ink-dim">{description}</p>
    </header>
  );
}

export function Panel({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[10px] border border-line bg-panel p-4 md:p-5 ${className}`}>
      {title ? <h2 className="mb-3 text-base font-semibold">{title}</h2> : null}
      {children}
    </section>
  );
}

export function MetricSummary({
  label,
  value,
  unit,
  definition,
  source,
  note,
}: {
  label: string;
  value: string;
  unit: string;
  definition: string;
  source: string;
  note?: string;
}) {
  return (
    <article className="rounded-[10px] border border-line bg-panel p-4">
      <h2 className="text-sm font-medium text-ink-dim">{label}</h2>
      <p className="mt-2 font-mono text-3xl font-medium tabular-nums">
        {value} <span className="text-base text-ink-dim">{unit}</span>
      </p>
      <p className="mt-2 text-sm leading-6 text-ink-dim">{definition}</p>
      <p className="mt-1 text-sm text-ink">{source}</p>
      {note ? <p className="mt-1 text-sm text-ink-dim">{note}</p> : null}
    </article>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-panel p-4" aria-busy="true">
      <p className="text-sm text-ink-dim">{label}</p>
    </div>
  );
}

export function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="rounded-[10px] border border-amber/50 bg-panel px-4 py-3">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-1 text-sm leading-6 text-ink-dim">{children}</div>
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
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="mb-2 text-left text-ink-dim">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col" className="border-b border-line px-3 py-2 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.join("|")}-${index}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`} className="border-b border-line px-3 py-2 font-mono">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function presenceNote(presence: "reported" | "absent", value: number): string {
  if (presence === "absent") return "No sample, interpreted as 0";
  if (value === 0) return "Reported 0";
  return "Cumulative counter";
}
