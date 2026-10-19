"use client";

import { useState } from "react";
import { RegretChart, WindowChart } from "@/components/charts";
import { Callout, DataTable, PageHeader, Panel } from "@/components/ui";
import { formatMean, runnerColor, runnerLabel } from "@/lib/artifacts/labels";
import type { AdaptiveReport, AdaptiveRunner } from "@/lib/artifacts/types";

const MEAN_RUNNERS = ["adaptive", "static-floor", "static-ceiling", "static-oracle"] as const;

export function AdaptiveExplorer({
  report,
  badge,
  embedded = false,
}: {
  report: AdaptiveReport;
  badge: string;
  embedded?: boolean;
}) {
  const scenarios = report.correctness.scenarios;
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.scenario ?? "steady");
  const scenario = scenarios.find((entry) => entry.scenario === scenarioId) ?? scenarios[0];
  const adaptive = scenario?.runners.find((runner) => runner.runner === "adaptive");

  return (
    <>
      {embedded ? (
        <h2 className="mb-3 text-xl font-semibold">Adaptive transcript</h2>
      ) : (
        <PageHeader
          title="Adaptive Explorer"
          description="A recorded synthetic experiment. The controller is not on the HTTP request path, and these figures are not a production capacity, latency, or SLO result."
        />
      )}
      <div className="mb-4">
        <Callout title="Synthetic capacity">
          The plant capacity exists only in the load tool. Saturated means the window admitted exactly the limit in force. Congested means admitted work exceeded that synthetic capacity. Rejects are not congestion. On a congested window the controller halves the limit down to the floor and holds once. It increases by one, up to the ceiling, only when the window was saturated and not congested. The oracle is a reference equal to the scenario&apos;s initial capacity. It is not a deployable policy.
        </Callout>
      </div>
      <p className="mb-4 text-sm">
        <span className="rounded-full border border-signal px-2 py-1">{badge}</span>
        <span className="ml-3">Conclusion: {report.correctness.conclusion}</span>
      </p>
      <Panel title="Pass-set means">
        <p className="mb-3 text-sm text-ink-dim">
          Unweighted mean of regret/offered on the five-scenario pass set. Mixed is excluded.
        </p>
        <div className="grid gap-3 md:grid-cols-4">
          {MEAN_RUNNERS.map((runner) => (
            <article key={runner} className="rounded-[10px] border border-line bg-raised p-3">
              <h3 className="text-sm text-ink-dim">{runnerLabel(runner)}</h3>
              <p className="mt-2 break-all font-mono text-lg tabular-nums">
                {formatMean(runner, report.correctness.means[runner])}
              </p>
            </article>
          ))}
        </div>
      </Panel>
      {scenario ? (
        <div className="mt-4 grid gap-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Scenario</legend>
            <div className="flex flex-wrap gap-2">
              {scenarios.map((entry) => (
                <label key={entry.scenario} className="flex items-center gap-2 rounded-[10px] border border-line bg-panel px-3 py-2 text-sm">
                  <input
                    type="radio"
                    name="adaptive-scenario"
                    value={entry.scenario}
                    checked={scenario.scenario === entry.scenario}
                    onChange={() => setScenarioId(entry.scenario)}
                  />
                  <span>
                    {entry.scenario}
                    {entry.inPassSet ? "" : " · Excluded from the mean"}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Panel title="Scenario regret">
            <p className="mb-3 text-sm text-ink-dim">
              Y axis: regret (shortfall + excess). Adaptive is cyan, static floor and ceiling are slate, and the oracle is violet. The per-client reference is not a pass baseline.
            </p>
            <RegretChart
              points={scenario.runners.map((runner) => ({
                name: runnerLabel(runner.runner),
                regret: runner.regret,
                fill: runnerColor(runner.runner),
              }))}
            />
            <div className="mt-4">
              <DataTable
                caption="Runner totals for the selected scenario. Normalized regret is regret / offered."
                columns={["Runner", "Offered", "Admitted", "Rejected", "Shortfall", "Excess", "Regret", "regret / offered", "usesController", "Increase", "Decrease", "Hold"]}
                rows={scenario.runners.map((runner) => [
                  runnerLabel(runner.runner),
                  String(runner.offered),
                  String(runner.admitted),
                  String(runner.rejected),
                  String(runner.shortfall),
                  String(runner.excess),
                  String(runner.regret),
                  String(runner.normalizedRegret),
                  String(runner.usesController),
                  String(runner.outcomes.increase),
                  String(runner.outcomes.decrease),
                  String(runner.outcomes.hold),
                ])}
              />
            </div>
          </Panel>
          {adaptive ? <RunnerWindows runner={adaptive} /> : null}
          <Panel title="Parameters">
            <DataTable
              caption="Frozen parameters from the transcript. These are not editable."
              columns={["Parameter", "Value"]}
              rows={Object.entries(report.parameters).map(([key, value]) => [key, String(value)])}
            />
          </Panel>
          <Panel title="Observational">
            <p className="text-sm text-ink-dim">
              Elapsed time for this capture: {report.observational.elapsedMs} ms. It is not part of the pass.
            </p>
          </Panel>
        </div>
      ) : null}
    </>
  );
}

function RunnerWindows({ runner }: { runner: AdaptiveRunner }) {
  const points = runner.limitsInForce.map((limit, index) => ({
    window: String(index),
    limit,
    offered: runner.offeredByWindow[index] ?? 0,
    admitted: runner.admittedByWindow[index] ?? 0,
  }));
  return (
    <div className="grid gap-4">
      <Panel title="Adaptive limit in force">
        <p className="mb-3 text-sm text-ink-dim">X axis: window index. Y axis: limit. Plant capacity is not in the transcript and is not drawn.</p>
        <WindowChart points={points} series={[{ key: "limit", name: "Limit in force", fill: "#3EC6D8" }]} />
        <div className="mt-4">
          <DataTable
            caption="Adaptive limit in force by window index."
            columns={["Window", "Limit in force"]}
            rows={points.map((point) => [point.window, String(point.limit)])}
          />
        </div>
        <p className="mt-3 text-sm text-ink-dim">
          Controller counts: increase {runner.outcomes.increase}, decrease {runner.outcomes.decrease}, hold {runner.outcomes.hold}.
        </p>
      </Panel>
      <Panel title="Admitted and offered">
        <p className="mb-3 text-sm text-ink-dim">X axis: window index. Y axis: requests.</p>
        <WindowChart
          points={points}
          series={[
            { key: "offered", name: "Offered", fill: "#8EA0BE" },
            { key: "admitted", name: "Admitted", fill: "#3DDC97" },
          ]}
        />
        <div className="mt-4">
          <DataTable
            caption="Offered and admitted requests by window index."
            columns={["Window", "Offered", "Admitted"]}
            rows={points.map((point) => [point.window, String(point.offered), String(point.admitted)])}
          />
        </div>
      </Panel>
      <Panel title="Per-client admits">
        <p className="mb-3 text-sm text-ink-dim">Synthetic scenario keys from the transcript, not live client identifiers.</p>
        <DataTable
          caption="perClientAdmitted for the adaptive runner."
          columns={["Scenario key", "Admitted"]}
          rows={Object.entries(runner.perClientAdmitted).map(([key, value]) => [key, String(value)])}
        />
      </Panel>
    </div>
  );
}
