"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { LiveProvider, useFreshness, useLive } from "@/components/live-provider";
import { formatAge } from "@/lib/metrics/format";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/compare", label: "Algorithm Lab" },
  { href: "/benchmarks", label: "Benchmark History" },
  { href: "/adaptive", label: "Adaptive Explorer" },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  return (
    <LiveProvider>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[10px] focus:bg-panel focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="flex min-h-full">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-panel px-4 py-6 md:flex">
          <Wordmark />
          <nav aria-label="Dashboard" className="mt-8 flex flex-col gap-1">
            <NavLinks />
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileBar />
          <StatusStrip />
          <main id="content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
            {children}
          </main>
        </div>
      </div>
    </LiveProvider>
  );
}

function Wordmark() {
  return (
    <div className="flex items-center gap-3">
      <svg aria-hidden="true" width="28" height="16" viewBox="0 0 28 16">
        <rect x="0" y="8" width="4" height="8" fill="#3EC6D8" />
        <rect x="8" y="5" width="4" height="11" fill="#3EC6D8" />
        <rect x="16" y="2" width="4" height="14" fill="#3EC6D8" />
        <rect x="24" y="0" width="4" height="16" fill="#E6A23C" />
      </svg>
      <div>
        <p className="text-sm font-semibold tracking-tight">ThrottleForge</p>
        <p className="text-xs text-ink-dim">Traffic control</p>
      </div>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <>
      {NAV.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={(event) => {
              if (!onNavigate) return;
              event.preventDefault();
              onNavigate();
              router.push(item.href);
            }}
            className={`rounded-[10px] border-l-2 px-3 py-2 text-sm transition-colors ${
              active
                ? "border-signal bg-raised text-ink"
                : "border-transparent text-ink-dim hover:bg-raised hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

function MobileBar() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const titleId = useId();

  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  return (
    <div className="flex items-center justify-between border-b border-line bg-panel px-4 py-3 md:hidden">
      <Wordmark />
      <button
        type="button"
        className="rounded-[10px] border border-line px-3 py-2 text-sm"
        onClick={() => dialogRef.current?.showModal()}
      >
        Menu
      </button>
      <dialog ref={dialogRef} aria-labelledby={titleId}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-base font-semibold">
            Menu
          </h2>
          <button
            type="button"
            className="rounded-[10px] border border-line px-3 py-1 text-sm"
            onClick={() => dialogRef.current?.close()}
          >
            Close
          </button>
        </div>
        <nav aria-label="Dashboard" className="flex flex-col gap-1">
          <NavLinks onNavigate={() => dialogRef.current?.close()} />
        </nav>
      </dialog>
    </div>
  );
}

function StatusStrip() {
  const live = useLive();
  const [now, setNow] = useState<number | null>(null);
  const freshness = useFreshness(now ?? live.lastSuccessAt ?? 0);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const freshnessText =
    freshness === "collecting"
      ? "Collecting"
      : freshness === "live"
        ? "Live"
        : freshness === "stale"
          ? "Stale"
          : "Unreachable";
  const age =
    live.lastSuccessAt === null || now === null
      ? "no scrape yet"
      : formatAge(now - live.lastSuccessAt);

  return (
    <div className="sticky top-0 z-20 border-t-2 border-t-signal border-b border-line bg-panel px-4 py-3 md:px-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p className="text-sm" aria-live="polite">
          <span className="text-ink-dim">API </span>
          <StatusWord
            tone={live.health === "reachable" ? "allow" : live.health === "unreachable" ? "reject" : "mute"}
            label={live.health === "unknown" ? "Checking" : live.health === "reachable" ? "Reachable" : "Unreachable"}
          />
          <span className="mx-2 text-line">/</span>
          <span className="text-ink-dim">Metrics </span>
          <StatusWord
            tone={freshness === "live" ? "signal" : freshness === "stale" ? "amber" : freshness === "unreachable" ? "reject" : "mute"}
            label={freshnessText}
          />
          <span className="ml-2 font-mono text-ink-dim">{age}</span>
        </p>
        <p className="max-w-xl text-sm text-ink-dim">
          Metrics are this Node process only. They are not a cluster total.
        </p>
      </div>
    </div>
  );
}

function StatusWord({
  label,
  tone,
}: {
  label: string;
  tone: "allow" | "reject" | "mute" | "signal" | "amber";
}) {
  const mark = {
    allow: "bg-allow",
    reject: "bg-reject",
    mute: "bg-mute",
    signal: "bg-signal",
    amber: "bg-amber",
  }[tone];
  return (
    <span className="inline-flex items-center gap-2 font-medium text-ink">
      <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${mark}`} />
      {label}
    </span>
  );
}
