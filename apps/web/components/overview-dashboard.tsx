"use client";

import { BucketChart, OutcomeTrendChart } from "@/components/charts";
import { useLive } from "@/components/live-provider";
import { Callout, DataTable, LoadingBlock, MetricSummary, PageHeader, Panel, presenceNote } from "@/components/ui";
import { formatCount, formatSeconds } from "@/lib/metrics/format";

export function OverviewDashboard() {
  const live = useLive();
  const snapshot = live.snapshot;
  const idle =
    snapshot !== null &&
    snapshot.allowed.presence === "absent" &&
    snapshot.rejected.presence === "absent" &&
    snapshot.failures.presence === "absent" &&
    snapshot.degraded.presence === "absent";

  return (
    <>
      <PageHeader
        title="Overview"
        description="Fixed-window decisions recorded by this API process. Figures are cumulative counters from the latest successful scrape."
      />
      {live.sawReset ? (
        <div className="mb-4">
          <Callout title="Counter reset">
            A cumulative counter decreased. The trend shows only the current segment, after a process restart or counter reset.
          </Callout>
        </div>
      ) : null}
      {!live.attempted ? (
        <div className="grid gap-4 md:grid-cols-2">
          <LoadingBlock label="Loading API availability" />
          <LoadingBlock label="Loading allowed decisions" />
          <LoadingBlock label="Loading rejected decisions" />
          <LoadingBlock label="Loading limiter operation time" />
        </div>
      ) : (
        <div className="grid gap-4">
          <Panel title="Availability">
            <dl className="grid gap-3 text-sm md:grid-cols-2">
              <Fact term="Health" value={live.health === "reachable" ? live.healthDetail ?? "ok" : live.healthDetail ?? "Unreachable"} />
              <Fact term="Metrics" value={live.metricsError ? live.metricsError : "Scrape parsed"} />
              <Fact term="Store" value={snapshot?.store ?? "Not observed yet"} />
              <Fact term="Algorithm" value={snapshot?.algorithm ?? "Not observed yet"} />
              <Fact term="Limit" value="Not published by the API" />
              <Fact term="Window" value="Not published by the API" />
              <Fact term="Redis failure mode" value="Not published by the API" />
            </dl>
          </Panel>
          {snapshot ? (
            <>
              {idle ? (
                <p className="text-sm text-ink-dim">No limiter decisions recorded in this process.</p>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                <MetricSummary
                  label="Allowed"
                  value={formatCount(snapshot.allowed.value)}
                  unit="decisions"
                  definition="Completed limiter decisions with result allowed."
                  source={presenceNote(snapshot.allowed.presence, snapshot.allowed.value)}
                  note={deltaNote(live.delta?.allowed)}
                />
                <MetricSummary
                  label="Rejected"
                  value={formatCount(snapshot.rejected.value)}
                  unit="decisions"
                  definition="Completed limiter decisions with result rejected."
                  source={presenceNote(snapshot.rejected.presence, snapshot.rejected.value)}
                  note={deltaNote(live.delta?.rejected)}
                />
                <MetricSummary
                  label="Store failures"
                  value={formatCount(snapshot.failures.value)}
                  unit="events"
                  definition="Store operations that failed before a quota decision."
                  source={presenceNote(snapshot.failures.presence, snapshot.failures.value)}
                  note={deltaNote(live.delta?.failures)}
                />
                <MetricSummary
                  label="Degraded admissions"
                  value={formatCount(snapshot.degraded.value)}
                  unit="requests"
                  definition="Fail-open admissions after a store failure. A degraded request is not an allowed quota decision."
                  source={presenceNote(snapshot.degraded.presence, snapshot.degraded.value)}
                  note={deltaNote(live.delta?.degraded)}
                />
              </div>
              <Panel title="Request outcomes">
                <p className="mb-3 text-sm text-ink-dim">
                  Y axis: decisions in the interval between scrapes. Counts start at zero. This series exists only in this browser session.
                </p>
                {live.trend.length < 1 ? (
                  <p className="rounded-[10px] border border-dashed border-line px-4 py-8 text-sm text-ink-dim">
                    Collecting the first interval. No trend yet.
                  </p>
                ) : (
                  <>
                    <OutcomeTrendChart
                      points={live.trend.map((point) => ({
                        label: new Date(point.at).toLocaleTimeString(),
                        allowed: point.allowed,
                        rejected: point.rejected,
                      }))}
                    />
                    <div className="mt-4">
                      <DataTable
                        caption="Same interval counts as the chart."
                        columns={["Time", "Allowed", "Rejected"]}
                        rows={live.trend.map((point) => [
                          new Date(point.at).toLocaleTimeString(),
                          String(point.allowed),
                          String(point.rejected),
                        ])}
                      />
                    </div>
                  </>
                )}
              </Panel>
              <Panel title="Limiter operation time">
                <p className="mb-3 text-sm leading-6 text-ink-dim">
                  Seconds spent inside one limiter consume. This is not handler latency, queue time, or end-to-end response time.
                  The mean is the arithmetic mean from histogram sum divided by count. The bars are cumulative bucket counts, not an exact percentile.
                </p>
                {snapshot.histogram.meanSeconds === null ? (
                  <p className="text-sm text-ink">Mean unavailable. No positive histogram count in this scrape.</p>
                ) : (
                  <p className="font-mono text-2xl tabular-nums">
                    {formatSeconds(snapshot.histogram.meanSeconds)}{" "}
                    <span className="text-sm text-ink-dim">mean</span>
                  </p>
                )}
                {snapshot.histogram.buckets.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-dim">No histogram buckets in this scrape.</p>
                ) : (
                  <div className="mt-4">
                    <BucketChart
                      points={snapshot.histogram.buckets.map((bucket) => ({
                        label: bucket.openEnded ? "+Inf" : bucket.le,
                        cumulative: bucket.cumulative,
                      }))}
                    />
                    <div className="mt-4">
                      <DataTable
                        caption="Cumulative observations at each le bound, in seconds. +Inf is the open-ended bucket."
                        columns={["le (seconds)", "Cumulative observations"]}
                        rows={snapshot.histogram.buckets.map((bucket) => [
                          bucket.openEnded ? "+Inf" : bucket.le,
                          String(bucket.cumulative),
                        ])}
                      />
                    </div>
                  </div>
                )}
              </Panel>
              <Panel title="Recent scrapes">
                <DataTable
                  caption="This browser session. Delta cells stay blank until a second scrape in the segment."
                  columns={["Scrape time", "Allowed delta", "Rejected delta", "Failures delta", "Degraded delta", "Result"]}
                  rows={live.recent.map((row) => [
                    row.at,
                    cell(row.allowedDelta),
                    cell(row.rejectedDelta),
                    cell(row.failuresDelta),
                    cell(row.degradedDelta),
                    row.scrape,
                  ])}
                />
              </Panel>
            </>
          ) : (
            <p className="rounded-[10px] border border-dashed border-line bg-panel px-4 py-8 text-sm text-ink-dim" role="alert">
              Figures are omitted because this session has no successful metrics scrape.
              {live.metricsError ? ` ${live.metricsError}` : ""}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-dim">{term}</dt>
      <dd className="mt-1 text-ink">{value}</dd>
    </div>
  );
}

function deltaNote(value: number | undefined): string {
  if (value === undefined) return "Deltas unavailable until the next scrape.";
  return `Since previous scrape: ${value}`;
}

function cell(value: number | null): string {
  return value === null ? "unavailable" : String(value);
}
