"use client";

import { useState } from "react";
import { AdaptiveExplorer } from "@/components/adaptive-explorer";
import { CompareView } from "@/components/algorithm-lab";
import { DataTable, PageHeader, Panel } from "@/components/ui";
import { artifactMetadata, parseArtifact } from "@/lib/artifacts/parse-report";
import type { ArtifactReport } from "@/lib/artifacts/types";

type ImportedFile = {
  id: string;
  fileName: string;
  report: ArtifactReport;
};

export function BenchmarkHistory() {
  const [items, setItems] = useState<ImportedFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  async function accept(file: File) {
    const text = await file.text();
    const parsed = parseArtifact(text);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const id = `${file.name}-${Date.now()}`;
    setItems((current) => [...current, { id, fileName: file.name, report: parsed.report }]);
    setSelectedId(id);
    setError(null);
  }

  return (
    <>
      <PageHeader
        title="Benchmark History"
        description="Import a JSON file saved from an existing load-tool stdout. Nothing is stored after you leave this page."
      />
      <Panel title="Import a transcript">
        <label
          className="block rounded-[10px] border border-dashed border-line px-4 py-6"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) void accept(file);
          }}
        >
          <span className="block text-sm">Choose a JSON file or drop it here. The file picker works from the keyboard.</span>
          <input
            className="mt-3 block text-sm"
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void accept(file);
            }}
          />
        </label>
        {error ? (
          <p className="mt-3 text-sm text-ink" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 text-sm leading-6 text-ink-dim">
          <p>Accepted modes: core, http, compare, redis-compare, adaptive-compare.</p>
          <ul className="mt-2 list-disc pl-5">
            <li>npm run load:core</li>
            <li>npm run load:http</li>
            <li>npm run load:compare</li>
            <li>npm run load:redis-compare</li>
            <li>npm run load:adaptive</li>
          </ul>
          <p className="mt-2">Save stdout to a .json file. This page does not invent timestamps or historical runs.</p>
          <p className="mt-2">Committed references stay on Algorithm Lab and Adaptive Explorer. They are not listed here as imports.</p>
        </div>
      </Panel>
      {items.length === 0 ? (
        <p className="mt-4 rounded-[10px] border border-dashed border-line bg-panel px-4 py-8 text-sm text-ink-dim">
          No file imported in this visit.
        </p>
      ) : (
        <div className="mt-4 grid gap-4">
          <Panel title="Imported this session">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="mb-2 text-left text-ink-dim">Metadata present on each imported object, plus the local file name.</caption>
                <thead>
                  <tr>
                    <th className="border-b border-line px-3 py-2">File</th>
                    <th className="border-b border-line px-3 py-2">Badge</th>
                    {["mode", "scenario", "algorithm", "pattern", "requests", "limit", "windowMs", "baseUrl"].map((column) => (
                      <th key={column} className="border-b border-line px-3 py-2">{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const meta = new Map(artifactMetadata(item.report).map((row) => [row.label, row.value]));
                    return (
                      <tr key={item.id}>
                        <td className="border-b border-line px-3 py-2">
                          <button type="button" className="underline" onClick={() => setSelectedId(item.id)}>
                            {item.fileName}
                          </button>
                        </td>
                        <td className="border-b border-line px-3 py-2">Imported this session</td>
                        {["mode", "scenario", "algorithm", "pattern", "requests", "limit", "windowMs", "baseUrl"].map((column) => (
                          <td key={column} className="border-b border-line px-3 py-2 font-mono">
                            {meta.get(column) ?? ""}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
          {selected ? <ArtifactDetail item={selected} /> : null}
        </div>
      )}
    </>
  );
}

function ArtifactDetail({ item }: { item: ImportedFile }) {
  if (item.report.mode === "compare") {
    return <CompareView report={item.report} badge="Imported this session" />;
  }
  if (item.report.mode === "adaptive-compare") {
    return <AdaptiveExplorer report={item.report} badge="Imported this session" embedded />;
  }
  if (item.report.mode === "core") {
    const report = item.report;
    return (
      <div className="grid gap-4">
        <Panel title="Decisions">
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
          />
        </Panel>
        <TimingTable
          rows={[[
            String(report.elapsedMs),
            optionalNumber(report.throughputRps),
            String(report.latency.p50Ms),
            String(report.latency.p95Ms),
            String(report.latency.p99Ms),
          ]]}
        />
      </div>
    );
  }
  if (item.report.mode === "http") {
    const report = item.report;
    return (
      <div className="grid gap-4">
        <Panel title="Request outcomes">
          <p className="mb-3 text-sm text-ink-dim">HTTP 200 is success. HTTP 429 is expectedRateLimited and is not an unexpected error.</p>
          <DataTable
            caption="HTTP bench outcome counts."
            columns={["Success (200)", "Expected 429", "Unexpected status", "Transport errors"]}
            rows={[[
              String(report.success),
              String(report.expectedRateLimited),
              String(report.unexpectedStatus),
              String(report.transportErrors),
            ]]}
          />
        </Panel>
        <TimingTable
          rows={[[
            String(report.elapsedMs),
            optionalNumber(report.throughputRps),
            String(report.latency.p50Ms),
            String(report.latency.p95Ms),
            String(report.latency.p99Ms),
          ]]}
        />
        <Panel title="Post-run metrics scrape">
          <DataTable
            caption="observationalMetrics from the single scrape after the pool. A missing field is left blank."
            columns={["Field", "Value"]}
            rows={Object.entries(report.observationalMetrics).map(([key, value]) => [
              key,
              value === null ? "unavailable" : String(value),
            ])}
          />
        </Panel>
      </div>
    );
  }
  const report = item.report;
  return (
    <div className="grid gap-4">
      <Panel title="Correctness">
        <p className="text-sm">Matched: {report.correctness.matched ? "yes" : "no"}</p>
        <div className="mt-3">
          <DataTable
            caption="Decision mismatches for allowed, remaining, and resetAt."
            columns={["Index", "Memory allowed", "Redis allowed", "Memory remaining", "Redis remaining", "Memory resetAt", "Redis resetAt"]}
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
      <Panel title="Observational timings from this capture">
        <p className="mb-3 text-sm text-ink-dim">Memory and Redis timings are machine-dependent and are not a ranking.</p>
        <DataTable
          caption="Observational blocks printed by redis-compare."
          columns={["Side", "Elapsed ms", "Throughput rps", "p50 ms", "p95 ms", "p99 ms"]}
          rows={[
            timingRow("Memory", report.observational.memory),
            timingRow("Redis", report.observational.redis),
          ]}
        />
      </Panel>
    </div>
  );
}

function TimingTable({ rows }: { rows: string[][] }) {
  return (
    <Panel title="Observational timings from this capture">
      <p className="mb-3 text-sm text-ink-dim">These timings are machine-dependent and are not a ranking.</p>
      <DataTable
        caption="Elapsed time, throughput, and latency percentiles from the file."
        columns={["Elapsed ms", "Throughput rps", "p50 ms", "p95 ms", "p99 ms"]}
        rows={rows}
      />
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
