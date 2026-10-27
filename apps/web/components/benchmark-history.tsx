"use client";

import { AdaptiveExplorer } from "@/components/adaptive-explorer";
import { CompareView } from "@/components/algorithm-lab";
import { BrandLoader } from "@/components/brand-loader";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge, DataTable, PageHeader, Panel } from "@/components/ui";
import { artifactMetadata, parseArtifact } from "@/lib/artifacts/parse-report";
import type { ArtifactReport } from "@/lib/artifacts/types";

type ImportedFile = {
  id: string;
  fileName: string;
  report: ArtifactReport;
};

const NUMERIC_META = new Set(["requests", "limit", "windowMs"]);

export function BenchmarkHistory() {
  const [items, setItems] = useState<ImportedFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [importedName, setImportedName] = useState("");
  const [dragging, setDragging] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function accept(file: File) {
    setReading(true);
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseArtifact(text);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      const id = `${file.name}-${Date.now()}`;
      setItems((current) => [...current, { id, fileName: file.name, report: parsed.report }]);
      setSelectedId(id);
      setImportedName(file.name);
      setError(null);
    } finally {
      setReading(false);
      setDragging(false);
    }
  }

  return (
    <div className="page-stack benchmark-history">
      <PageHeader
        title="Benchmark History"
        description="Import a JSON file saved from an existing load-tool stdout. Nothing is stored after you leave this page."
        about="benchmarks"
      />
      <Panel
        title="Import a transcript"
        titleClass="type-section"
        about="benchmarks"
        aboutLabel="About this import"
        className="benchmark-history-import"
      >
        <label
          className={`import-drop benchmark-history-drop${dragging ? " is-dragging" : ""}${reading ? " is-reading" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!reading) setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!reading) setDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget === event.target) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file && !reading) void accept(file);
          }}
        >
          <span className="type-body block">
            {reading ? (
              <BrandLoader variant="inline" label="Reading file" status="Reading file…" />
            ) : (
              "Choose a JSON file or drop it here. The file picker works from the keyboard."
            )}
          </span>
          <input
            className="benchmark-history-file type-body mt-3 block w-full min-w-0"
            type="file"
            accept=".json,application/json"
            disabled={reading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void accept(file);
            }}
          />
          {selected ? (
            <p className="benchmark-history-filename type-data-sm mt-3 text-ink-dim" title={selected.fileName}>
              Viewing: <span className="text-ink">{selected.fileName}</span>{" "}
              <Badge tone="imported">Imported this session</Badge>
            </p>
          ) : importedName ? (
            <p className="benchmark-history-filename type-data-sm mt-3 text-ink-dim" title={importedName}>
              Last import: <span className="text-ink">{importedName}</span>
            </p>
          ) : null}
        </label>
        <p className="sr-only" aria-live="polite">
          {importedName ? `Imported ${importedName}` : ""}
        </p>
        {error ? (
          <p ref={errorRef} tabIndex={-1} className="notice notice-danger type-body mt-3" role="alert">
            {error}
          </p>
        ) : null}
        <div className="benchmark-history-guide type-body mt-4 text-ink-dim">
          <p>Accepted modes: core, http, compare, redis-compare, adaptive-compare.</p>
          <ul className="benchmark-history-commands mt-2">
            <li>
              <code className="type-data-sm">npm run load:core</code>
            </li>
            <li>
              <code className="type-data-sm">npm run load:http</code>
            </li>
            <li>
              <code className="type-data-sm">npm run load:compare</code>
            </li>
            <li>
              <code className="type-data-sm">npm run load:redis-compare</code>
            </li>
            <li>
              <code className="type-data-sm">npm run load:adaptive</code>
            </li>
          </ul>
          <p className="mt-3">Save stdout to a .json file. This page does not run benchmarks or keep files after you leave.</p>
          <p className="mt-2">Committed references stay on Algorithm Lab and Adaptive Explorer. They are not listed here as imports.</p>
        </div>
      </Panel>
      {items.length === 0 ? (
        <div className="empty-state benchmark-history-empty type-body">
          <p>No file imported in this visit.</p>
          <p className="mt-2">
            Committed comparisons stay on <Link className="text-link" href="/compare">Algorithm Lab</Link>.
          </p>
        </div>
      ) : (
        <div className="page-stack">
          <Panel title="Imported this session" titleClass="type-section">
            <ul className="grid gap-3 md:hidden">
              {items.map((item) => {
                const meta = new Map(artifactMetadata(item.report).map((row) => [row.label, row.value]));
                const isSelected = item.id === selectedId;
                return (
                  <li
                    key={item.id}
                    className={`benchmark-history-session-card${isSelected ? " is-selected" : ""}`}
                  >
                    <button
                      type="button"
                      className="text-link type-control benchmark-history-file-name"
                      title={item.fileName}
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => setSelectedId(item.id)}
                    >
                      {item.fileName}
                    </button>
                    <p className="type-secondary mt-2 text-ink-dim">
                      <Badge tone="imported">Imported this session</Badge>
                    </p>
                    <p className="type-data-sm mt-2 text-ink-dim">
                      {meta.get("mode") ?? ""} {meta.get("scenario") ?? ""}
                    </p>
                  </li>
                );
              })}
            </ul>
            <div className="hidden md:block">
              <div className="table-scroll benchmark-history-table">
                <table className="data-table benchmark-history-session">
                  <caption className="type-secondary mb-2 text-left text-ink-dim">
                    Metadata present on each imported object, plus the local file name.
                  </caption>
                  <thead>
                    <tr>
                      <th className="type-secondary is-text">File</th>
                      <th className="type-secondary is-text">Badge</th>
                      {["mode", "scenario", "algorithm", "pattern", "requests", "limit", "windowMs", "baseUrl"].map((column) => (
                        <th key={column} className={`type-secondary ${NUMERIC_META.has(column) ? "is-numeric" : "is-text"}`}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const meta = new Map(artifactMetadata(item.report).map((row) => [row.label, row.value]));
                      const isSelected = item.id === selectedId;
                      return (
                        <tr key={item.id} className={isSelected ? "is-selected" : undefined}>
                          <td className="is-text">
                            <button
                              type="button"
                              className="text-link benchmark-history-file-name"
                              title={item.fileName}
                              aria-current={isSelected ? "true" : undefined}
                              onClick={() => setSelectedId(item.id)}
                            >
                              {item.fileName}
                            </button>
                          </td>
                          <td className="is-text">
                            <Badge tone="imported">Imported this session</Badge>
                          </td>
                          {["mode", "scenario", "algorithm", "pattern", "requests", "limit", "windowMs", "baseUrl"].map((column) => (
                            <td
                              key={column}
                              className={NUMERIC_META.has(column) ? "type-data is-numeric" : "type-data-sm is-text"}
                            >
                              {meta.get(column) ?? ""}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Panel>
          {selected ? <ArtifactDetail item={selected} /> : null}
        </div>
      )}
    </div>
  );
}

function ArtifactDetail({ item }: { item: ImportedFile }) {
  const meta = artifactMetadata(item.report);
  const metaSummary = meta.map((row) => `${row.label} ${row.value}`).join(", ");

  if (item.report.mode === "compare") {
    return (
      <div className="benchmark-history-detail">
        <SelectedFileMeta fileName={item.fileName} summary={metaSummary} />
        <CompareView report={item.report} badge="Imported this session" />
      </div>
    );
  }
  if (item.report.mode === "adaptive-compare") {
    return (
      <div className="benchmark-history-detail">
        <SelectedFileMeta fileName={item.fileName} summary={metaSummary} />
        <AdaptiveExplorer report={item.report} badge="Imported this session" embedded />
      </div>
    );
  }
  if (item.report.mode === "core") {
    const report = item.report;
    return (
      <div className="benchmark-history-detail">
        <SelectedFileMeta fileName={item.fileName} summary={metaSummary} />
        <Panel title="Decisions" titleClass="type-section">
          <div className="benchmark-history-table">
            <DataTable
              caption="Decision counts from the core bench. Store sizes are included when the file printed them."
              columns={["Field", "Value"]}
              rows={[
                ["Allowed", String(report.allowed)],
                ["Rejected", String(report.rejected)],
                ["Errors", String(report.errors)],
                ["Store size before", String(report.storeSizeBefore)],
                ["Store size after", optional(report.storeSizeAfter)],
                ["Store size at boundary", optional(report.storeSizeAtBoundary)],
                ["Store size after traffic", optional(report.storeSizeAfterTraffic)],
                ["Store size after sweep", optional(report.storeSizeAfterWindowAdvanceAndSweep)],
              ]}
              stack
            />
          </div>
        </Panel>
        <TimingTable
          rows={[
            [
              String(report.elapsedMs),
              optionalNumber(report.throughputRps),
              String(report.latency.p50Ms),
              String(report.latency.p95Ms),
              String(report.latency.p99Ms),
            ],
          ]}
        />
      </div>
    );
  }
  if (item.report.mode === "http") {
    const report = item.report;
    return (
      <div className="benchmark-history-detail">
        <SelectedFileMeta fileName={item.fileName} summary={metaSummary} />
        <Panel title="Request outcomes" titleClass="type-section">
          <p className="mb-3 type-body text-ink-dim">
            HTTP 200 is success. HTTP 429 is expectedRateLimited and is not an unexpected error.
          </p>
          <div className="benchmark-history-table">
            <DataTable
              caption="HTTP bench outcome counts."
              columns={["Success (200)", "Expected 429", "Unexpected status", "Transport errors"]}
              rows={[
                [
                  String(report.success),
                  String(report.expectedRateLimited),
                  String(report.unexpectedStatus),
                  String(report.transportErrors),
                ],
              ]}
              stack
            />
          </div>
        </Panel>
        <TimingTable
          rows={[
            [
              String(report.elapsedMs),
              optionalNumber(report.throughputRps),
              String(report.latency.p50Ms),
              String(report.latency.p95Ms),
              String(report.latency.p99Ms),
            ],
          ]}
        />
        <Panel title="Post-run metrics scrape" titleClass="type-section">
          <div className="benchmark-history-table">
            <DataTable
              caption="observationalMetrics from the single scrape after the pool. A missing field is left blank."
              columns={["Field", "Value"]}
              rows={Object.entries(report.observationalMetrics).map(([key, value]) => [
                key,
                value === null ? "unavailable" : String(value),
              ])}
              stack
            />
          </div>
        </Panel>
      </div>
    );
  }
  const report = item.report;
  return (
    <div className="benchmark-history-detail">
      <SelectedFileMeta fileName={item.fileName} summary={metaSummary} />
      <Panel title="Correctness" titleClass="type-section">
        <p className="type-body">Matched: {report.correctness.matched ? "yes" : "no"}</p>
        <div className="mt-3 benchmark-history-table">
          <DataTable
            caption="Decision mismatches for allowed, remaining, and resetAt."
            columns={[
              "Index",
              "Memory allowed",
              "Redis allowed",
              "Memory remaining",
              "Redis remaining",
              "Memory resetAt",
              "Redis resetAt",
            ]}
            rows={report.correctness.mismatches.map((mismatch) => [
              String(mismatch.index),
              String(mismatch.memory.allowed),
              String(mismatch.redis.allowed),
              String(mismatch.memory.remaining),
              String(mismatch.redis.remaining),
              String(mismatch.memory.resetAt),
              String(mismatch.redis.resetAt),
            ])}
          />
        </div>
      </Panel>
      <Panel title="Observational timings from this capture" titleClass="type-section">
        <p className="mb-3 type-body text-ink-dim">Memory and Redis timings are machine-dependent and are not a ranking.</p>
        <div className="benchmark-history-table">
          <DataTable
            caption="Observational blocks printed by redis-compare."
            columns={["Side", "Elapsed ms", "Throughput rps", "p50 ms", "p95 ms", "p99 ms"]}
            rows={[timingRow("Memory", report.observational.memory), timingRow("Redis", report.observational.redis)]}
            stack
          />
        </div>
      </Panel>
    </div>
  );
}

function SelectedFileMeta({ fileName, summary }: { fileName: string; summary: string }) {
  return (
    <p className="benchmark-history-detail-meta type-body">
      <Badge tone="imported">Imported this session</Badge>
      <span className="type-data-sm text-ink-dim" title={fileName}>
        {fileName}
        {summary ? ` · ${summary}` : ""}
      </span>
    </p>
  );
}

function TimingTable({ rows }: { rows: string[][] }) {
  return (
    <Panel title="Observational timings from this capture" titleClass="type-section">
      <p className="mb-3 type-body text-ink-dim">These timings are machine-dependent and are not a ranking.</p>
      <div className="benchmark-history-table">
        <DataTable
          caption="Elapsed time, throughput, and latency percentiles from the file."
          columns={["Elapsed ms", "Throughput rps", "p50 ms", "p95 ms", "p99 ms"]}
          rows={rows}
          stack
        />
      </div>
    </Panel>
  );
}

function timingRow(
  side: string,
  block: { elapsedMs: number; throughputRps: number | null; latency: { p50Ms: number; p95Ms: number; p99Ms: number } },
): string[] {
  return [
    side,
    String(block.elapsedMs),
    optionalNumber(block.throughputRps),
    String(block.latency.p50Ms),
    String(block.latency.p95Ms),
    String(block.latency.p99Ms),
  ];
}

function optional(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function optionalNumber(value: number | null): string {
  return value === null ? "unavailable" : String(value);
}
