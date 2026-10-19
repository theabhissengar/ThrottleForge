"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { HelpProvider, useHelp } from "@/components/help-dialog";
import { LiveProvider, useFreshness, useLive } from "@/components/live-provider";
import { Wordmark } from "@/components/logo";
import { AdaptiveIcon, BenchmarkIcon, ChevronIcon, CompareIcon, LearnIcon, OverviewIcon } from "@/components/nav-icons";
import { markTip, ThemeToggle, themeAnnouncement } from "@/components/theme-toggle";
import { topicForPath } from "@/lib/help/topics";
import { formatAge } from "@/lib/metrics/format";
import {
  applySidebar,
  applyThemeChoice,
  SIDEBAR_BUTTON_ID,
  type SidebarChoice,
  type ThemeChoice,
} from "@/lib/preferences/boot";

const NAV = [
  { href: "/", label: "Overview", icon: OverviewIcon },
  { href: "/compare", label: "Algorithm Lab", icon: CompareIcon },
  { href: "/benchmarks", label: "Benchmark History", icon: BenchmarkIcon },
  { href: "/adaptive", label: "Adaptive Explorer", icon: AdaptiveIcon },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  return (
    <LiveProvider>
      <HelpProvider>
        <ShellFrame>{children}</ShellFrame>
      </HelpProvider>
    </LiveProvider>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>("system");
  const [announcement, setAnnouncement] = useState("");
  const help = useHelp();
  const pathname = usePathname();

  useLayoutEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      setCollapsed(root.dataset.sidebar === "collapsed");
      const choice = root.dataset.themeChoice;
      if (choice === "light" || choice === "dark" || choice === "system") setThemeChoice(choice);
    };
    sync();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (document.documentElement.dataset.themeChoice !== "system") return;
      const before = document.documentElement.dataset.theme;
      applyThemeChoice("system");
      setAnnouncement(themeAnnouncement(before, document.documentElement.dataset.theme ?? "light"));
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function chooseTheme(next: ThemeChoice) {
    const before = document.documentElement.dataset.theme;
    applyThemeChoice(next);
    setThemeChoice(next);
    setAnnouncement(themeAnnouncement(before, document.documentElement.dataset.theme ?? "light"));
  }

  function toggleSidebar() {
    const next: SidebarChoice = document.documentElement.dataset.sidebar === "collapsed" ? "expanded" : "collapsed";
    applySidebar(next);
    setCollapsed(next === "collapsed");
  }

  return (
    <>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-control)] focus:bg-panel focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <div className="flex min-h-full">
        <aside aria-label="Primary" className="sidebar sticky top-0 h-screen shrink-0 flex-col overflow-hidden border-r border-line bg-panel px-2 py-4">
          <div className="sidebar-header flex items-center justify-between gap-2">
            <Wordmark clip />
            <button
              id={SIDEBAR_BUTTON_ID}
              type="button"
              className="btn hit has-tip shrink-0"
              suppressHydrationWarning
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={toggleSidebar}
              onMouseEnter={markTip}
              onFocus={markTip}
            >
              <ChevronIcon direction={collapsed ? "right" : "left"} />
              <span className="rail-tip" aria-hidden="true">
                {collapsed ? "Expand sidebar" : "Collapse sidebar"}
              </span>
            </button>
          </div>
          <nav aria-label="Dashboard" className="mt-10 flex flex-1 flex-col gap-1 overflow-y-auto">
            <NavLinks />
          </nav>
          <div className="mt-4 grid gap-2">
            <div className="theme-expanded">
              <ThemeToggle variant="segmented" name="theme-sidebar" choice={themeChoice} onChange={chooseTheme} />
            </div>
            <div className="theme-collapsed">
              <ThemeToggle variant="popover" choice={themeChoice} onChange={chooseTheme} />
            </div>
            <button
              type="button"
              className="btn hit has-tip w-full justify-center"
              aria-current={pathname.startsWith("/docs") ? "page" : undefined}
              onClick={() => help.open(topicForPath(pathname))}
              onMouseEnter={markTip}
              onFocus={markTip}
            >
              <span className="learn-icon">
                <LearnIcon />
              </span>
              <span className="footer-label">Learn</span>
              <span className="rail-tip" aria-hidden="true">
                Learn
              </span>
            </button>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileBar onLearn={() => help.open(topicForPath(pathname))} themeChoice={themeChoice} onTheme={chooseTheme} />
          <StatusStrip />
          <main id="content" className="content-frame min-w-0 flex-1">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <>
      {NAV.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
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
            className="nav-link has-tip type-control"
            onMouseEnter={markTip}
            onFocus={markTip}
          >
            <Icon className="shrink-0" />
            <span className="nav-label">{item.label}</span>
            <span className="rail-tip" aria-hidden="true">
              {item.label}
            </span>
          </Link>
        );
      })}
    </>
  );
}

function MobileBar({
  onLearn,
  themeChoice,
  onTheme,
}: {
  onLearn: () => void;
  themeChoice: ThemeChoice;
  onTheme: (choice: ThemeChoice) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const titleId = useId();

  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  return (
    <header className="flex items-center justify-between gap-3 border-b border-line bg-panel px-4 py-3 lg:hidden">
      <Wordmark />
      <div className="flex items-center gap-2">
        <button type="button" className="btn" onClick={onLearn}>
          Learn
        </button>
        <button type="button" className="btn" onClick={() => dialogRef.current?.showModal()}>
          Menu
        </button>
      </div>
      <dialog
        ref={dialogRef}
        className="nav-dialog"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          dialogRef.current?.close();
        }}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id={titleId} className="type-section">
            Menu
          </h2>
          <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>
            Close
          </button>
        </div>
        <nav aria-label="Dashboard" className="flex flex-col gap-1">
          <NavLinks onNavigate={() => dialogRef.current?.close()} />
        </nav>
        <div className="mt-4 grid gap-3">
          <ThemeToggle variant="segmented" name="theme-drawer" choice={themeChoice} onChange={onTheme} />
          <button type="button" className="btn" onClick={onLearn}>
            Learn
          </button>
        </div>
      </dialog>
    </header>
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
    freshness === "collecting" ? "Collecting" : freshness === "live" ? "Live" : freshness === "stale" ? "Stale" : "Unreachable";
  const age = live.lastSuccessAt === null || now === null ? "no scrape yet" : formatAge(now - live.lastSuccessAt);

  return (
    <div className="sticky top-0 z-20 border-b border-line bg-panel px-4 py-3 lg:px-8">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <p className="type-body" aria-live="polite">
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
          <span className="type-data-sm ml-2 text-ink-dim">{age}</span>
        </p>
        <p className="type-secondary max-w-xl text-ink-dim">Metrics are this Node process only. They are not a cluster total.</p>
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
    <span className="type-control inline-flex items-center gap-2 text-ink">
      <span aria-hidden="true" className={`inline-block size-2 rounded-full ${mark}`} />
      {label}
    </span>
  );
}
