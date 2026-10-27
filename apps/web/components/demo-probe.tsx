"use client";

import { useEffect, useRef, useState } from "react";
import { BrandLoader } from "@/components/brand-loader";
import { useLive } from "@/components/live-provider";
import { SkeletonTable } from "@/components/skeletons/primitives";
import { Callout, DataTable, Panel } from "@/components/ui";
import { headerCell, type ProbeSummary } from "@/lib/demo/classify";
import { exampleFixedWindowRows } from "@/lib/demo/example";
import type { PolicyRead } from "@/lib/demo/policy";
import { presentProbeHttp, scrapeFollowUp, scrapeNote, type ProbePresentation } from "@/lib/demo/present";

type PolicyView = PolicyRead | { state: "loading" };

export function DemoProbe({ policy, liveProbe }: { policy: PolicyView; liveProbe: boolean }) {
  if (!liveProbe) return <ExampleDemonstration policy={policy} />;
  return <LiveDemonstration policy={policy} />;
}

function ExampleDemonstration({ policy }: { policy: PolicyView }) {
  const rows = policy.state === "ok" ? exampleFixedWindowRows(policy.policy.limit) : null;
  return (
    <>
      <Panel title="Request demonstration" titleClass="type-section">
        <p className="type-body text-ink-dim">
          This deployment does not send live demonstration requests. Nothing in this section calls the API. The counters on this page stay unchanged.
        </p>
      </Panel>
      <Panel title="Example fixed-window outcomes" titleClass="type-section">
        <p className="type-body text-ink-dim">
          These rows illustrate the configured limit, were not sent, are not quota decisions, and are not in the counters or charts.
        </p>
        {policy.state === "loading" ? (
          <div className="mt-4" aria-busy="true" aria-label="Waiting for the policy reading">
            <p className="sr-only">Waiting for the policy reading.</p>
            <SkeletonTable rows={4} />
          </div>
        ) : null}
        {policy.state === "unavailable" ? (
          <p className="type-body mt-4">The example needs the policy reading. No example rows are shown.</p>
        ) : null}
        {rows ? (
          <div className="mt-4 max-h-80 overflow-y-auto">
            <DataTable
              stack
              caption="Configured limit."
              columns={["Example", "Status", "Limit", "Remaining", "Meaning"]}
              rows={rows.map((row) => [String(row.sequence), row.statusLabel, row.limit, row.remaining, row.meaning])}
              cellClass={(rowIndex, cellIndex) => (cellIndex === 1 ? (rows[rowIndex]?.statusLabel === "Example 429" ? "text-reject" : "text-allow") : undefined)}
            />
          </div>
        ) : null}
      </Panel>
    </>
  );
}

function LiveDemonstration({ policy }: { policy: PolicyView }) {
  const live = useLive();
  const lastSuccess = useRef(live.lastSuccessAt);
  useEffect(() => {
    lastSuccess.current = live.lastSuccessAt;
  }, [live.lastSuccessAt]);
  const [running, setRunning] = useState(false);
  const [presentation, setPresentation] = useState<ProbePresentation | null>(null);
  const [remembered, setRemembered] = useState<number | null | undefined>(undefined);

  async function run() {
    if (running) return;
    setRunning(true);
    try {
      const response = await fetch("/api/demo-probe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count: 10 }),
      });
      const body = (await response.json()) as unknown;
      const next = presentProbeHttp(response.status, body);
      setPresentation(next);
      if (next.kind === "batch") setRemembered(lastSuccess.current);
    } catch {
      setPresentation({ kind: "message", text: "The demonstration could not complete." });
    } finally {
      setRunning(false);
    }
  }

  const followUp = remembered === undefined ? null : scrapeFollowUp(remembered, live.lastSuccessAt);

  return (
    <Panel title="Request demonstration" titleClass="type-section">
      <div aria-busy={running}>
        <div className="demo-lead">
          <div>
            <p className="type-body text-ink-dim">
              You are using this page. This web server sends 10 requests to GET /api/demo on this ThrottleForge instance. The API counts the web server&apos;s address, not you, so visitors share one quota. This page does not give each visitor a separate limit.
            </p>
            {policy.state === "ok" && policy.policy.testClientOverrideEnabled ? (
              <p className="type-body mt-2 text-ink-dim">
                The API is configured to accept a development test client header from other callers. This demonstration does not send that header.
              </p>
            ) : null}
          </div>
          <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={running}>
            {running ? (
              <span className="inline-flex items-center gap-2">
                <BrandLoader variant="button" />
                Sending 10 requests
              </span>
            ) : (
              "Run demonstration"
            )}
          </button>
        </div>
        {running ? <p className="type-secondary mt-3 text-ink-dim">Sending 10 requests to this instance.</p> : null}
        {presentation?.kind === "message" ? <p className="type-body mt-4">{presentation.text}</p> : null}
        {presentation?.kind === "cooldown" ? (
          <div className="mt-4">
            <Callout title="Demo cooldown active" tone="info">
              You can run this demonstration again in {presentation.retryAfterSec} seconds. This is the demonstration cooldown, not a quota rejection, and it is not one of the ten results.
            </Callout>
          </div>
        ) : null}
        {presentation?.kind === "batch" ? (
          <div className="mt-4 grid gap-4">
            {presentation.envelope.error ? <p className="type-body">{stopText(presentation.envelope.error)}</p> : null}
            <p className="type-body">{summaryText(presentation.envelope.summary)}</p>
            <DataTable
              stack
              caption="Responses returned by this demonstration. These rows are not the Prometheus counters."
              columns={["Request", "Status", "Limit", "Remaining", "Reset", "Retry-After", "Mode", "Result"]}
              rows={presentation.envelope.results.map((result) => [
                String(result.sequence),
                result.status === null ? "None" : String(result.status),
                headerCell(result.headers.limit),
                headerCell(result.headers.remaining),
                headerCell(result.headers.reset),
                headerCell(result.headers.retryAfter),
                headerCell(result.headers.mode),
                result.description,
              ])}
            />
          </div>
        ) : null}
        {presentation?.kind === "batch" && followUp ? <p className="type-body mt-4 text-ink-dim">{scrapeNote(followUp)}</p> : null}
      </div>
    </Panel>
  );
}

function summaryText(summary: ProbeSummary): string {
  return `Responses in this demonstration: ${summary.allowed} allowed, ${summary.rateLimited} rate limited, ${summary.degraded} degraded, ${summary.storeUnavailable} store unavailable, ${summary.unexpected} unexpected, ${summary.failed} failed.`;
}

function stopText(error: "timeout" | "deadline" | "upstream"): string {
  if (error === "timeout") return "A request timed out. Earlier responses are listed below.";
  if (error === "deadline") return "The demonstration reached its time limit. Earlier responses are listed below.";
  return "A request failed. Earlier responses are listed below.";
}
