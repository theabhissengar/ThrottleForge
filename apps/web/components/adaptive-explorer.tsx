"use client";

import { useState } from "react";
import { RegretChart, WindowChart } from "@/components/charts";
import { Badge, Callout, DataTable, PageHeader, Panel } from "@/components/ui";
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
    <div className="page-stack adaptive-explorer">
      {embedded ? (
        <h2 className="type-section">Adaptive transcript</h2>
      ) : (
        <PageHeader
          title="Adaptive Explorer"
          description="A recorded synthetic experiment. The controller is not on the HTTP request path, and these figures are not a production capacity, latency, or SLO result."
          about="adaptive"
        />
      )}
      <Callout title="Synthetic capacity">
        The plant capacity exists only in the load tool. Saturated means the window admitted exactly the limit in force. Congested means admitted work exceeded that synthetic capacity. Rejects are not congestion. On a congested window the controller halves the limit down to the floor and holds once. It increases by one, up to the ceiling, only when the window was saturated and not congested. The oracle is a reference equal to the scenario&apos;s initial capacity. It is not a deployable policy.
      </Callout>
      <p className="type-body adaptive-explorer-intro text-ink-dim">
        Normalized regret is regret divided by offered work. Floor and ceiling are the pass baselines. The oracle matches the scenario&apos;s initial synthetic capacity and is not a policy this API runs.
      </p>
      <p className="adaptive-explorer-meta type-body">
        <Badge tone={badge === "Committed reference" ? "reference" : "imported"}>{badge}</Badge>
        <span className="type-data-sm text-ink-dim">Conclusion: {report.correctness.conclusion}</span>
      </p>
      <Panel title="Pass-set means" titleClass="type-section" about="adaptive">
        <p className="type-body mb-4 text-ink-dim">
          Unweighted mean of regret/offered on the five-scenario pass set. Mixed is excluded.
        </p>
        <div className="adaptive-explorer-means">
          {MEAN_RUNNERS.map((runner) => (
            <article key={runner} className="stat-tile">
              <h3 className="type-secondary text-ink-dim">{runnerLabel(runner)}</h3>
              <p className="type-figure mt-2">{formatMean(report.correctness.means[runner])}</p>
            </article>
          ))}
        </div>
      </Panel>
      {scenario ? (
        <div className="page-stack">
          <section className="card adaptive-explorer-scenarios">
            <fieldset>
              <legend className="type-section mb-3">Selected scenario</legend>
              <div className="adaptive-explorer-scenario-grid">
                {scenarios.map((entry) => (
                  <label key={entry.scenario} className="choice-card adaptive-explorer-scenario type-control">
                    <input
                      type="radio"
                      name="adaptive-scenario"
                      value={entry.scenario}
                      checked={scenario.scenario === entry.scenario}
                      onChange={() => setScenarioId(entry.scenario)}
                    />
                    <span className="min-w-0">
                      <span className="type-card block">{entry.scenario}</span>
                      {entry.inPassSet ? null : (
                        <span className="type-data-sm mt-1 block text-ink-dim">Excluded from the mean</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>
          <Panel title="Selected scenario" titleClass="type-section" about="adaptive">
            <p className="type-body mb-4 text-ink-dim">
              Y axis: regret (shortfall + excess). The per-client reference is not a pass baseline.
            </p>
            <div className="adaptive-explorer-chart">
              <RegretChart
                points={scenario.runners.map((runner) => ({
                  name: runnerLabel(runner.runner),
                  regret: runner.regret,
                  fill: runnerColor(runner.runner),
                }))}
              />
            </div>
            <div className="mt-4 adaptive-explorer-table adaptive-explorer-runner-table">
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
          <Panel title="Parameters" titleClass="type-section">
            <div className="adaptive-explorer-table">
              <DataTable
                caption="Frozen parameters from the transcript. These are not editable."
                columns={["Parameter", "Value"]}
                rows={Object.entries(report.parameters).map(([key, value]) => [key, String(value)])}
                monoColumns={[1]}
                stack
              />
            </div>
          </Panel>
          <Panel title="Observational" titleClass="type-section" className="adaptive-explorer-observational">
            <p className="type-body text-ink-dim">
              Elapsed time for this capture: {report.observational.elapsedMs} ms. It is not part of the pass.
            </p>
          </Panel>
        </div>
      ) : null}
    </div>
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
    <div className="page-stack">
      <div className="adaptive-explorer-window-grid">
        <Panel title="Adaptive windows" titleClass="type-section">
          <p className="type-body mb-4 text-ink-dim">X axis: window index. Y axis: limit. Plant capacity is not in the transcript and is not drawn.</p>
          <div className="adaptive-explorer-chart">
            <WindowChart points={points} series={[{ key: "limit", name: "Limit in force", fill: "accent" }]} />
          </div>
          <div className="mt-4 adaptive-explorer-table">
            <DataTable
              caption="Adaptive limit in force by window index."
              columns={["Window", "Limit in force"]}
              rows={points.map((point) => [point.window, String(point.limit)])}
              stack
            />
          </div>
          <p className="type-secondary mt-3 text-ink-dim">
            Controller counts: increase {runner.outcomes.increase}, decrease {runner.outcomes.decrease}, hold {runner.outcomes.hold}.
          </p>
        </Panel>
        <Panel title="Admitted and offered" titleClass="type-section">
          <p className="type-body mb-4 text-ink-dim">X axis: window index. Y axis: requests.</p>
          <div className="adaptive-explorer-chart">
            <WindowChart
              points={points}
              series={[
                { key: "offered", name: "Offered", fill: "floor" },
                { key: "admitted", name: "Admitted", fill: "allow" },
              ]}
            />
          </div>
          <div className="mt-4 adaptive-explorer-table">
            <DataTable
              caption="Offered and admitted requests by window index."
              columns={["Window", "Offered", "Admitted"]}
              rows={points.map((point) => [point.window, String(point.offered), String(point.admitted)])}
              stack
            />
          </div>
        </Panel>
      </div>
      <Panel title="Per-client admits" titleClass="type-section" className="adaptive-explorer-per-client">
        <p className="type-body mb-4 text-ink-dim">Synthetic scenario keys from the transcript, not live client identifiers.</p>
        <div className="adaptive-explorer-table">
          <DataTable
            caption="perClientAdmitted for the adaptive runner."
            columns={["Scenario key", "Admitted"]}
            rows={Object.entries(runner.perClientAdmitted).map(([key, value]) => [key, String(value)])}
            monoColumns={[0]}
            stack
          />
        </div>
      </Panel>
    </div>
  );
}
