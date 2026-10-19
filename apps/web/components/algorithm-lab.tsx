"use client";

import { useState } from "react";
import { CompareBarChart } from "@/components/charts";
import { DataTable, PageHeader, Panel } from "@/components/ui";
import { algorithmLabel, COMPARE_SCENARIOS, SCENARIO_INTENTS } from "@/lib/artifacts/labels";
import type { CompareReport } from "@/lib/artifacts/types";

export function AlgorithmLab({
  reports,
}: {
  reports: Record<(typeof COMPARE_SCENARIOS)[number], CompareReport>;
}) {
  const [scenario, setScenario] = useState<(typeof COMPARE_SCENARIOS)[number]>("boundary-burst");
  const report = reports[scenario];
  return (
    <>
      <PageHeader
        title="Algorithm Lab"
        description="One ordered trace, replayed from fresh state on the fixed window, the weighted sliding-window counter, and the token bucket. Unequal allow counts are expected."
      />
      <div className="mb-6">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Scenario</legend>
          <div className="grid gap-2 md:grid-cols-2">
            {COMPARE_SCENARIOS.map((id) => (
              <label key={id} className="flex gap-3 rounded-[10px] border border-line bg-panel px-3 py-2 text-sm">
                <input
                  type="radio"
                  name="scenario"
                  value={id}
                  checked={scenario === id}
                  onChange={() => setScenario(id)}
                />
                <span>
                  <span className="font-medium">{id}</span>
                  <span className="mt-1 block text-ink-dim">{SCENARIO_INTENTS[id]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <CompareView report={report} badge="Committed reference" />
    </>
  );
}

export function CompareView({ report, badge }: { report: CompareReport; badge: string }) {
  const points = report.results.map((result) => ({
    name: algorithmLabel(result.algorithm),
    allowed: result.correctness.allowed,
    rejected: result.correctness.rejected,
  }));
  return (
    <div className="grid gap-4">
      <p className="text-sm text-ink">
        <span className="rounded-full border border-signal px-2 py-1">{badge}</span>
        <span className="ml-3 font-mono">
          limit {report.limit}, windowMs {report.windowMs}, trace length {report.traceLength}
        </span>
      </p>
      <Panel title="Correctness">
        <p className="mb-3 text-sm text-ink-dim">
          Y axis: requests. The scale starts at zero and is shared across algorithms. Allowed and rejected are counts, not a score.
        </p>
        <CompareBarChart points={points} />
        <div className="mt-4">
          <DataTable
            caption="Correctness fields from the transcript."
            columns={["Algorithm", "Allowed", "Rejected", "Unexpected errors", "Store size after"]}
            rows={report.results.map((result) => [
              algorithmLabel(result.algorithm),
              String(result.correctness.allowed),
              String(result.correctness.rejected),
              String(result.correctness.unexpectedErrors),
              String(result.correctness.storeSizeAfter),
            ])}
          />
        </div>
      </Panel>
      <Panel title="Observational timings from this capture">
        <p className="mb-3 text-sm leading-6 text-ink-dim">
          Elapsed time, throughput, and percentiles come from this machine&apos;s capture. They are not a ranking and they are not comparable to load:http or load:core.
        </p>
        <DataTable
          caption="Observational measurements. Lower latency is not a recommendation."
          columns={["Algorithm", "Elapsed ms", "Throughput rps", "p50 ms", "p95 ms", "p99 ms"]}
          rows={report.results.map((result) => [
            algorithmLabel(result.algorithm),
            String(result.observational.elapsedMs),
            result.observational.throughputRps === null ? "unavailable" : String(result.observational.throughputRps),
            String(result.observational.latency.p50Ms),
            String(result.observational.latency.p95Ms),
            String(result.observational.latency.p99Ms),
          ])}
        />
      </Panel>
    </div>
  );
}
