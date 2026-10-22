"use client";

import { useEffect, useRef, useState } from "react";
import { useLive } from "@/components/live-provider";
import { Callout, DataTable, Panel } from "@/components/ui";
import { headerCell, type ProbeSummary } from "@/lib/demo/classify";
import type { PolicyRead } from "@/lib/demo/policy";
import { presentProbeHttp, scrapeFollowUp, scrapeNote, type ProbePresentation } from "@/lib/demo/present";

type PolicyView = PolicyRead | { state: "loading" };

export function DemoProbe({ policy }: { policy: PolicyView }) {
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
    <Panel title="Request demonstration" about="overview" aboutLabel="About this demonstration">
      <div aria-busy={running}>
        <p className="type-body text-ink-dim">
          You are using this page. This web server sends 10 requests to GET /api/demo on this ThrottleForge instance. The API counts the web server&apos;s address, not you, so visitors share one quota. This page does not give each visitor a separate limit.
        </p>
        {policy.state === "ok" && policy.policy.testClientOverrideEnabled ? (
          <p className="type-body mt-2 text-ink-dim">
            The API is configured to accept a development test client header from other callers. This demonstration does not send that header.
          </p>
        ) : null}
        <button type="button" className="btn mt-4" onClick={() => void run()} disabled={running}>
          {running ? "Sending 10 requests" : "Run demonstration"}
        </button>
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
