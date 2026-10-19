"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { deriveFreshness, POLL_INTERVAL_MS, stepCumulative, type Cumulative, type Freshness } from "@/lib/metrics/deltas";
import type { LivePayload, MetricsSnapshot } from "@/lib/metrics/types";

export type TrendPoint = {
  at: number;
  allowed: number;
  rejected: number;
};

export type RecentRow = {
  id: string;
  at: string;
  allowedDelta: number | null;
  rejectedDelta: number | null;
  failuresDelta: number | null;
  degradedDelta: number | null;
  scrape: "baseline" | "delta" | "reset" | "error";
};

type HealthState = "unknown" | "reachable" | "unreachable";

type LiveState = {
  attempted: boolean;
  health: HealthState;
  healthDetail?: string;
  metricsError?: string;
  snapshot: MetricsSnapshot | null;
  lastSuccessAt: number | null;
  previous: Cumulative | null;
  delta: Cumulative | null;
  sawReset: boolean;
  trend: TrendPoint[];
  recent: RecentRow[];
};

type Action =
  | { type: "success"; payload: LivePayload; at: number }
  | { type: "failure"; at: number; message: string };

const LiveContext = createContext<LiveState | null>(null);
let refreshLive: (() => void) | null = null;

export function requestLiveRefresh(): void {
  refreshLive?.();
}

export function LiveProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    attempted: false,
    health: "unknown",
    snapshot: null,
    lastSuccessAt: null,
    previous: null,
    delta: null,
    sawReset: false,
    trend: [],
    recent: [],
  });

  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    const schedule = () => {
      if (cancelled || document.hidden) return;
      timer = window.setTimeout(() => {
        void poll();
      }, POLL_INTERVAL_MS);
    };

    const poll = async () => {
      if (cancelled || document.hidden) return;
      try {
        const response = await fetch("/api/live", { cache: "no-store" });
        const body = (await response.json()) as LivePayload & { error?: string };
        if (cancelled) return;
        if (!response.ok || !body.health || !body.metrics) {
          dispatch({
            type: "failure",
            at: Date.now(),
            message: body.error ?? `Live proxy returned HTTP ${response.status}`,
          });
        } else {
          dispatch({ type: "success", payload: body, at: Date.now() });
        }
      } catch (error) {
        if (!cancelled) {
          dispatch({
            type: "failure",
            at: Date.now(),
            message: error instanceof Error ? error.message : "Live proxy request failed",
          });
        }
      } finally {
        schedule();
      }
    };

    const onVisibility = () => {
      if (document.hidden) return;
      window.clearTimeout(timer);
      void poll();
    };

    document.addEventListener("visibilitychange", onVisibility);
    refreshLive = () => {
      window.clearTimeout(timer);
      void poll();
    };
    void poll();
    return () => {
      cancelled = true;
      refreshLive = null;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveState {
  const value = useContext(LiveContext);
  if (!value) throw new Error("useLive must be used inside LiveProvider");
  return value;
}

export function useFreshness(now: number): Freshness {
  const live = useLive();
  return deriveFreshness({
    attempted: live.attempted,
    hasSnapshot: live.snapshot !== null,
    metricsError: Boolean(live.metricsError),
    lastSuccessAt: live.lastSuccessAt,
    now,
  });
}

function reducer(state: LiveState, action: Action): LiveState {
  if (action.type === "failure") {
    return {
      ...state,
      attempted: true,
      health: "unreachable",
      healthDetail: action.message,
      metricsError: action.message,
      recent: pushRecent(state.recent, {
        id: `error-${action.at}`,
        at: new Date(action.at).toISOString(),
        allowedDelta: null,
        rejectedDelta: null,
        failuresDelta: null,
        degradedDelta: null,
        scrape: "error",
      }),
    };
  }

  const { payload, at } = action;
  const healthDetail = payload.health.error ?? payload.health.status;
  if (payload.metrics.state !== "ok" || !payload.metrics.snapshot) {
    return {
      ...state,
      attempted: true,
      health: payload.health.state,
      healthDetail,
      metricsError: payload.metrics.error ?? "Metrics scrape failed",
      recent: pushRecent(state.recent, {
        id: `metrics-${at}`,
        at: payload.fetchedAt,
        allowedDelta: null,
        rejectedDelta: null,
        failuresDelta: null,
        degradedDelta: null,
        scrape: "error",
      }),
    };
  }

  const snapshot = payload.metrics.snapshot;
  const cumulative: Cumulative = {
    allowed: snapshot.allowed.value,
    rejected: snapshot.rejected.value,
    failures: snapshot.failures.value,
    degraded: snapshot.degraded.value,
  };
  const step = stepCumulative(state.previous, cumulative);
  if (step.kind === "baseline") {
    return {
      ...state,
      attempted: true,
      health: payload.health.state,
      healthDetail,
      metricsError: undefined,
      snapshot,
      lastSuccessAt: at,
      previous: step.cumulative,
      delta: null,
      recent: pushRecent(state.recent, emptyRow(`base-${at}`, payload.fetchedAt, "baseline")),
    };
  }
  if (step.kind === "reset") {
    return {
      ...state,
      attempted: true,
      health: payload.health.state,
      healthDetail,
      metricsError: undefined,
      snapshot,
      lastSuccessAt: at,
      previous: step.cumulative,
      delta: null,
      sawReset: true,
      trend: [],
      recent: pushRecent(state.recent, emptyRow(`reset-${at}`, payload.fetchedAt, "reset")),
    };
  }
  return {
    ...state,
    attempted: true,
    health: payload.health.state,
    healthDetail,
    metricsError: undefined,
    snapshot,
    lastSuccessAt: at,
    previous: step.cumulative,
    delta: step.delta,
    trend: [
      ...state.trend,
      { at, allowed: step.delta.allowed, rejected: step.delta.rejected },
    ].slice(-24),
    recent: pushRecent(state.recent, {
      id: `delta-${at}`,
      at: payload.fetchedAt,
      allowedDelta: step.delta.allowed,
      rejectedDelta: step.delta.rejected,
      failuresDelta: step.delta.failures,
      degradedDelta: step.delta.degraded,
      scrape: "delta",
    }),
  };
}

function emptyRow(id: string, at: string, scrape: "baseline" | "reset"): RecentRow {
  return {
    id,
    at,
    allowedDelta: null,
    rejectedDelta: null,
    failuresDelta: null,
    degradedDelta: null,
    scrape,
  };
}

function pushRecent(rows: RecentRow[], row: RecentRow): RecentRow[] {
  return [...rows, row].slice(-8);
}
