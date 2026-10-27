"use client";

import { useState } from "react";
import { CompareBarChart } from "@/components/charts";
import { Badge, DataTable, PageHeader, Panel } from "@/components/ui";
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
    <div className="page-stack algorithm-lab">
      <PageHeader
        title="Algorithm Lab"
        description="One ordered trace, replayed from fresh state on the fixed window, the weighted sliding-window counter, and the token bucket. Unequal allow counts are expected."
        about="algorithms"
      />
      <p className="type-body algorithm-lab-intro text-ink-dim">
        A fixed window resets on a boundary. The sliding-window counter still counts the previous window. The token bucket refills smoothly. Unequal allow counts are expected.
      </p>
      <section className="card algorithm-lab-scenarios">
        <fieldset>
          <legend className="type-section mb-3">Scenario</legend>
          <div className="algorithm-lab-scenario-grid">
            {COMPARE_SCENARIOS.map((id) => (
              <label key={id} className="choice-card algorithm-lab-scenario">
                <input type="radio" name="scenario" value={id} checked={scenario === id} onChange={() => setScenario(id)} />
                <span className="min-w-0">
                  <span className="type-card block">{SCENARIO_INTENTS[id]}</span>
                  <span className="type-data-sm mt-1 block text-ink-dim">{id}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>
      <CompareView report={report} badge="Committed reference" />
    </div>
  );
}

export function CompareView({ report, badge }: { report: CompareReport; badge: string }) {
  const points = report.results.map((result) => ({
    name: algorithmLabel(result.algorithm),
    allowed: result.correctness.allowed,
    rejected: result.correctness.rejected,
  }));
  return (
    <div className="page-stack algorithm-lab-results">
      <p className="algorithm-lab-meta type-body">
        <Badge tone={badge === "Committed reference" ? "reference" : "imported"}>{badge}</Badge>
        <span className="type-data-sm text-ink-dim">
          limit {report.limit}, windowMs {report.windowMs}, trace length {report.traceLength}
        </span>
      </p>
      <Panel title="Decisions" titleClass="type-section" about="algorithms" aboutLabel="About this comparison">
        <p className="type-body mb-4 text-ink-dim">
          Y axis: requests. The scale starts at zero and is shared across algorithms. Allowed and rejected are counts, not a score.
        </p>
        <CompareBarChart points={points} />
        <div className="mt-4 algorithm-lab-table">
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
            stack
          />
        </div>
      </Panel>
      <Panel title="Observational timings" titleClass="type-section" about="algorithms" aboutLabel="About this comparison">
        <p className="type-body mb-4 text-ink-dim">
          Elapsed time, throughput, and percentiles come from this machine&apos;s capture. They are not a ranking and they are not comparable to load:http or load:core.
        </p>
        <div className="algorithm-lab-table">
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
            stack
          />
        </div>
      </Panel>
    </div>
  );
}
