"use client";

import { useEffect, useState } from "react";
import { BucketChart, OutcomeTrendChart } from "@/components/charts";
import { DemoProbe } from "@/components/demo-probe";
import { requestLiveRefresh, useLive } from "@/components/live-provider";
import { Callout, DataTable, MetricSummary, PageHeader, Panel, presenceNote, SkeletonBlock } from "@/components/ui";
import { readPolicyPayload, redisFailureLabel, type PolicyRead } from "@/lib/demo/policy";
import type { IntervalDelta } from "@/lib/metrics/deltas";
import { formatCount, formatSeconds } from "@/lib/metrics/format";
import type { TrendPoint } from "@/components/live-provider";

export function OverviewDashboard({ liveProbe }: { liveProbe: boolean }) {
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
      <Panel title="Availability" titleClass="type-section">
        <div className="grid gap-4">
          <div>
            <h3 className="type-secondary text-ink-dim">Observed</h3>
            <dl className="mt-3 grid gap-4 sm:grid-cols-2">
              <Fact
                term="Health"
                value={
                  !live.attempted
                    ? "Checking"
                    : live.health === "reachable"
                      ? live.healthDetail ?? "ok"
                      : live.healthDetail ?? "Unreachable"
                }
                unavailable={!live.attempted}
              />
              <Fact
                term="Metrics"
                value={!live.attempted ? "Checking" : live.metricsError ? live.metricsError : "Scrape parsed"}
                unavailable={!live.attempted}
              />
              <Fact term="Observed store" value={snapshot?.store ?? "Not observed yet"} unavailable={!snapshot?.store} mono={Boolean(snapshot?.store)} />
              <Fact
                term="Observed algorithm"
                value={snapshot?.algorithm ?? "Not observed yet"}
                unavailable={!snapshot?.algorithm}
                mono={Boolean(snapshot?.algorithm)}
              />
            </dl>
          </div>
          <div className="border-t border-line pt-4">
            <h3 className="type-secondary text-ink-dim">Policy</h3>
            <dl className="mt-3 grid gap-4 sm:grid-cols-2">
              <Fact term="Configured store" value={policyFact(policy, (item) => item.store)} unavailable={policy.state !== "ok"} mono={policy.state === "ok"} />
              <Fact term="Limit" value={policyFact(policy, (item) => String(item.limit))} unavailable={policy.state !== "ok"} mono={policy.state === "ok"} />
              <Fact term="Window" value={policyFact(policy, (item) => `${item.windowMs} ms`)} unavailable={policy.state !== "ok"} mono={policy.state === "ok"} />
              <Fact term="Redis failure mode" value={policyFact(policy, redisFailureLabel)} unavailable={policy.state !== "ok"} />
            </dl>
          </div>
        </div>
      </Panel>
      <DemoProbe policy={policy} liveProbe={liveProbe} />
      {!live.attempted ? (
        <div className="metric-frame">
          <div className="metric-grid">
          <SkeletonBlock label="Loading allowed decisions" kind="metric" />
          <SkeletonBlock label="Loading rejected decisions" kind="metric" />
          <SkeletonBlock label="Loading degraded admissions" kind="metric" />
          <SkeletonBlock label="Loading limiter operation time" kind="chart" />
          </div>
        </div>
      ) : (
        <>
          {snapshot ? (
            <>
              {idle ? <p className="empty-state type-body">No limiter decisions recorded in this process.</p> : null}
              <div className="metric-frame">
              <section className="metric-grid" aria-label="Decision counters">
                <MetricSummary
                  label="Allowed"
                  tone="allow"
                  value={formatCount(snapshot.allowed.value)}
                  unit="decisions"
                  presence={snapshot.allowed.presence}
                  definition="Completed limiter decisions with result allowed."
                  source={presenceNote(snapshot.allowed.presence, snapshot.allowed.value)}
                  note={deltaNote(snapshot.allowed.presence, live.delta?.allowed)}
                />
                <MetricSummary
                  label="Rejected"
                  tone="reject"
                  value={formatCount(snapshot.rejected.value)}
                  unit="decisions"
                  presence={snapshot.rejected.presence}
                  definition="Completed limiter decisions with result rejected."
                  source={presenceNote(snapshot.rejected.presence, snapshot.rejected.value)}
                  note={deltaNote(snapshot.rejected.presence, live.delta?.rejected)}
                />
                <MetricSummary
                  label="Degraded admissions"
                  tone="warning"
                  value={formatCount(snapshot.degraded.value)}
                  unit="requests"
                  presence={snapshot.degraded.presence}
                  definition="Fail-open admissions after a store failure. A degraded request is not an allowed quota decision."
                  source={presenceNote(snapshot.degraded.presence, snapshot.degraded.value)}
                  note={deltaNote(snapshot.degraded.presence, live.delta?.degraded)}
                />
                <MetricSummary
                  label="Store failures"
                  tone="danger"
                  value={formatCount(snapshot.failures.value)}
                  unit="events"
                  presence={snapshot.failures.presence}
                  definition="Store operations that failed before a quota decision."
                  source={presenceNote(snapshot.failures.presence, snapshot.failures.value)}
                  note={deltaNote(snapshot.failures.presence, live.delta?.failures)}
                />
              </section>
              </div>
              <Panel title="Request outcomes" titleClass="type-section">
                <p className="type-body mb-4 text-ink-dim">
                  Y axis: decisions in the interval between scrapes. Counts start at zero. This series exists only in this browser session.
                </p>
                <OutcomePanel trend={live.trend} delta={live.delta} allowed={snapshot.allowed.presence} rejected={snapshot.rejected.presence} />
              </Panel>
              <Panel title="Limiter operation time" titleClass="type-section">
                <p className="type-body text-ink-dim">
                  Seconds inside one limiter consume. This is not handler latency, queue time, or end-to-end response time.
                </p>
                <p className="type-body mt-2 text-ink-dim">
                  The mean is the histogram sum divided by count. The bars are cumulative bucket counts, not a percentile.
                </p>
                {snapshot.histogram.meanSeconds === null ? (
                  <p className="type-body mt-4">Mean unavailable. No positive histogram count in this scrape.</p>
                ) : (
                  <p className="mt-4">
                    <span className="type-figure">{formatSeconds(snapshot.histogram.meanSeconds)}</span>{" "}
                    <span className="type-secondary text-ink-dim">mean</span>
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
                        monoColumns={[0]}
                        rows={snapshot.histogram.buckets.map((bucket) => [
                          bucket.openEnded ? "+Inf" : bucket.le,
                          String(bucket.cumulative),
                        ])}
                      />
                    </div>
                  </div>
                )}
              </Panel>
              <Panel title="Recent scrapes" titleClass="type-section">
                <DataTable
                  caption="This browser session. An em dash means this scrape has no interval yet. Unavailable means that series was missing or the scrape failed."
                  columns={["Scrape time", "Allowed delta", "Rejected delta", "Failures delta", "Degraded delta", "Result"]}
                  monoColumns={[0]}
                  rows={live.recent.map((row) => [
                    scrapeClock(row.at),
                    deltaCell(row.allowedDelta, row.scrape),
                    deltaCell(row.rejectedDelta, row.scrape),
                    deltaCell(row.failuresDelta, row.scrape),
                    deltaCell(row.degradedDelta, row.scrape),
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

function Fact({
  term,
  value,
  unavailable = false,
  mono = false,
}: {
  term: string;
  value: string;
  unavailable?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="type-secondary text-ink-dim">{term}</dt>
      <dd className={`mt-1 wrap-break-word ${mono ? "type-data" : "type-body"} ${unavailable ? "text-ink-dim" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

function OutcomePanel({
  trend,
  delta,
  allowed,
  rejected,
}: {
  trend: TrendPoint[];
  delta: IntervalDelta | null;
  allowed: "reported" | "absent";
  rejected: "reported" | "absent";
}) {
  const plotted = trend.some((point) => point.allowed !== null || point.rejected !== null);
  const outcomeReported = allowed === "reported" || rejected === "reported";
  const latestMissing = plotted && (delta === null || (delta.allowed === null && delta.rejected === null));
  const numbers = trend.flatMap((point) => [point.allowed, point.rejected].filter((value): value is number => value !== null));
  const allZero = numbers.length > 0 && numbers.every((value) => value === 0);
  if (!plotted) {
    return (
      <p className="empty-state type-body">
        {outcomeReported ? "Collecting the first interval. No trend yet." : "No usable interval sample."}
      </p>
    );
  }
  return (
    <>
      {allZero ? (
        <p className="type-body mb-4 text-ink-dim">No new decisions in these intervals. Cumulative totals above are unchanged.</p>
      ) : null}
      {latestMissing ? <p className="type-body mb-4 text-ink-dim">The latest scrape had no usable outcome sample.</p> : null}
      <OutcomeTrendChart
        points={trend.map((point) => ({
          label: clockLabel(point.at),
          atLabel: fullStamp(point.at),
          allowed: point.allowed,
          rejected: point.rejected,
        }))}
      />
      <div className="mt-4">
        <DataTable
          caption="Same interval counts as the chart. Unavailable means that series had no interval sample."
          columns={["Time", "Allowed", "Rejected"]}
          monoColumns={[0]}
          rows={trend.map((point) => [clockLabel(point.at), intervalCell(point.allowed), intervalCell(point.rejected)])}
        />
      </div>
    </>
  );
}

function clockLabel(at: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(at));
}

function fullStamp(at: number): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(at));
}

function deltaNote(presence: "reported" | "absent", value: number | null | undefined): string {
  if (presence === "absent") return "No interval sample for this counter.";
  if (value === undefined || value === null) return "Deltas unavailable until the next scrape.";
  return `Since previous scrape: ${value}`;
}

function intervalCell(value: number | null): string {
  return value === null ? "unavailable" : String(value);
}

function deltaCell(value: number | null, scrape: "baseline" | "delta" | "reset" | "error"): string {
  if (value !== null) return String(value);
  if (scrape === "baseline" || scrape === "reset") return "—";
  return "unavailable";
}

function scrapeClock(value: string): string {
  const at = Date.parse(value);
  if (Number.isNaN(at)) return value;
  return clockLabel(at);
}
