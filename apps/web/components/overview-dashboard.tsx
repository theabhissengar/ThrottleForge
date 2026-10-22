"use client";

import { useEffect, useState } from "react";
import { BucketChart, OutcomeTrendChart } from "@/components/charts";
import { DemoProbe } from "@/components/demo-probe";
import { requestLiveRefresh, useLive } from "@/components/live-provider";
import { Callout, DataTable, MetricSummary, PageHeader, Panel, presenceNote, SkeletonBlock } from "@/components/ui";
import { readPolicyPayload, redisFailureLabel, type PolicyRead } from "@/lib/demo/policy";
import { formatCount, formatSeconds } from "@/lib/metrics/format";

export function OverviewDashboard() {
  const live = useLive();
  const policy = usePolicy();
  const snapshot = live.snapshot;
  const idle =
    snapshot !== null &&
    snapshot.allowed.presence === "absent" &&
    snapshot.rejected.presence === "absent" &&
    snapshot.failures.presence === "absent" &&
    snapshot.degraded.presence === "absent";

  return (
    <div className="page-stack">
      <PageHeader
        title="Overview"
        description="Fixed-window decisions recorded by this API process. Figures are cumulative counters from the latest successful scrape."
        about="overview"
      />
      {live.sawReset ? (
        <Callout title="Counter reset">
          A cumulative counter decreased. The trend shows only the current segment, after a process restart or counter reset.
        </Callout>
      ) : null}
      <Panel title="Availability" about="overview">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Fact
            term="Health"
            value={
              !live.attempted
                ? "Checking"
                : live.health === "reachable"
                  ? live.healthDetail ?? "ok"
                  : live.healthDetail ?? "Unreachable"
            }
          />
          <Fact term="Metrics" value={!live.attempted ? "Checking" : live.metricsError ? live.metricsError : "Scrape parsed"} />
          <Fact term="Store" value={snapshot?.store ?? "Not observed yet"} />
          <Fact term="Algorithm" value={snapshot?.algorithm ?? "Not observed yet"} />
          <Fact term="Limit" value={policyFact(policy, (item) => String(item.limit))} unavailable={policy.state !== "ok"} />
          <Fact term="Window" value={policyFact(policy, (item) => `${item.windowMs} ms`)} unavailable={policy.state !== "ok"} />
          <Fact term="Redis failure mode" value={policyFact(policy, redisFailureLabel)} unavailable={policy.state !== "ok"} />
        </dl>
      </Panel>
      <DemoProbe policy={policy} />
      {!live.attempted ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonBlock label="Loading allowed decisions" kind="metric" />
          <SkeletonBlock label="Loading rejected decisions" kind="metric" />
          <SkeletonBlock label="Loading degraded admissions" kind="metric" />
          <SkeletonBlock label="Loading limiter operation time" kind="chart" />
        </div>
      ) : (
        <>
          {snapshot ? (
            <>
              {idle ? <p className="empty-state type-body">No limiter decisions recorded in this process.</p> : null}
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricSummary
                  label="Allowed"
                  tone="allow"
                  value={formatCount(snapshot.allowed.value)}
                  unit="decisions"
                  presence={snapshot.allowed.presence}
                  definition="Completed limiter decisions with result allowed."
                  source={presenceNote(snapshot.allowed.presence, snapshot.allowed.value)}
                  note={deltaNote(live.delta?.allowed)}
                />
                <MetricSummary
                  label="Rejected"
                  tone="reject"
                  value={formatCount(snapshot.rejected.value)}
                  unit="decisions"
                  presence={snapshot.rejected.presence}
                  definition="Completed limiter decisions with result rejected."
                  source={presenceNote(snapshot.rejected.presence, snapshot.rejected.value)}
                  note={deltaNote(live.delta?.rejected)}
                />
                <MetricSummary
                  label="Degraded admissions"
                  tone="warning"
                  value={formatCount(snapshot.degraded.value)}
                  unit="requests"
                  presence={snapshot.degraded.presence}
                  definition="Fail-open admissions after a store failure. A degraded request is not an allowed quota decision."
                  source={presenceNote(snapshot.degraded.presence, snapshot.degraded.value)}
                  note={deltaNote(live.delta?.degraded)}
                />
                <MetricSummary
                  label="Store failures"
                  tone="danger"
                  value={formatCount(snapshot.failures.value)}
                  unit="events"
                  presence={snapshot.failures.presence}
                  definition="Store operations that failed before a quota decision."
                  source={presenceNote(snapshot.failures.presence, snapshot.failures.value)}
                  note={deltaNote(live.delta?.failures)}
                />
              </section>
              <Panel title="Request outcomes" about="overview">
                <p className="type-body mb-4 text-ink-dim">
                  Y axis: decisions in the interval between scrapes. Counts start at zero. This series exists only in this browser session.
                </p>
                {live.trend.length < 1 ? (
                  <p className="empty-state type-body">Collecting the first interval. No trend yet.</p>
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
              <Panel title="Limiter operation time" about="overview">
                <p className="type-body mb-4 text-ink-dim">
                  Seconds spent inside one limiter consume. This is not handler latency, queue time, or end-to-end response time. The mean is the arithmetic mean from histogram sum divided by count. The bars are cumulative bucket counts, not an exact percentile.
                </p>
                {snapshot.histogram.meanSeconds === null ? (
                  <p className="type-body">Mean unavailable. No positive histogram count in this scrape.</p>
                ) : (
                  <p className="type-metric">
                    {formatSeconds(snapshot.histogram.meanSeconds)} <span className="type-secondary text-ink-dim">mean</span>
                  </p>
                )}
                {snapshot.histogram.buckets.length === 0 ? (
                  <p className="empty-state type-body mt-4">No histogram buckets in this scrape.</p>
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
              <Panel title="Recent scrapes" about="overview">
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
            <div className="empty-state" role="alert">
              <p className="type-body">
                Figures are omitted because this session has no successful metrics scrape.
                {live.metricsError ? ` ${live.metricsError}` : ""}
              </p>
              <button type="button" className="btn mt-4" onClick={() => requestLiveRefresh()}>
                Retry scrape
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function policyFact(policy: PolicyRead | { state: "loading" }, present: (policy: Extract<PolicyRead, { state: "ok" }>["policy"]) => string): string {
  if (policy.state === "loading") return "Loading";
  if (policy.state === "unavailable") return "Unavailable";
  return present(policy.policy);
}

function usePolicy(): PolicyRead | { state: "loading" } {
  const [policy, setPolicy] = useState<PolicyRead | { state: "loading" }>({ state: "loading" });
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/policy", { cache: "no-store" });
        const body = (await response.json()) as unknown;
        if (!cancelled) setPolicy(readPolicyPayload(body));
      } catch {
        if (!cancelled) setPolicy({ state: "unavailable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return policy;
}

function Fact({ term, value, unavailable = false }: { term: string; value: string; unavailable?: boolean }) {
  return (
    <div>
      <dt className="type-secondary text-ink-dim">{term}</dt>
      <dd className={`type-body mt-1 ${unavailable ? "text-ink-dim" : "text-ink"}`}>{value}</dd>
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
