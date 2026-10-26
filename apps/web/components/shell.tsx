"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { HelpProvider, useHelp } from "@/components/help-dialog";
import {
  LiveProvider,
  useFreshness,
  useLive,
} from "@/components/live-provider";
import { Wordmark } from "@/components/logo";
import {
  AdaptiveIcon,
  BenchmarkIcon,
  ChevronIcon,
  CloseIcon,
  CompareIcon,
  LearnIcon,
  OverviewIcon,
} from "@/components/nav-icons";
import {
  markTip,
  ThemeMenu,
  ThemeOptions,
  themeAnnouncement,
} from "@/components/theme-toggle";
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
      if (choice === "light" || choice === "dark" || choice === "system")
        setThemeChoice(choice);
    };
    sync();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (document.documentElement.dataset.themeChoice !== "system") return;
      const before = document.documentElement.dataset.theme;
      applyThemeChoice("system");
      setAnnouncement(
        themeAnnouncement(
          before,
          document.documentElement.dataset.theme ?? "light",
        ),
      );
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function chooseTheme(next: ThemeChoice) {
    const before = document.documentElement.dataset.theme;
    applyThemeChoice(next);
    setThemeChoice(next);
    setAnnouncement(
      themeAnnouncement(
        before,
        document.documentElement.dataset.theme ?? "light",
      ),
    );
  }

  function toggleSidebar() {
    const next: SidebarChoice =
      document.documentElement.dataset.sidebar === "collapsed"
        ? "expanded"
        : "collapsed";
    applySidebar(next);
    setCollapsed(next === "collapsed");
  }

  return (
    <>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-(--radius-control) focus:bg-panel focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <div className="flex min-h-full">
        <aside
          aria-label="Primary"
          className="sidebar glass sticky top-0 flex h-dvh shrink-0 flex-col border-r border-line"
        >
          <div className="sidebar-header">
            <button
              id={SIDEBAR_BUTTON_ID}
              type="button"
              className="collapse-toggle"
              suppressHydrationWarning
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={toggleSidebar}
            >
              <ChevronIcon direction="left" size={16} />
              <span className="footer-label">
                {collapsed ? "Expand" : "Collapse"}
              </span>
            </button>
          </div>
          <nav aria-label="Dashboard" className="sidebar-nav">
            <NavLinks />
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader
            onLearn={() => help.open(topicForPath(pathname))}
            themeChoice={themeChoice}
            onTheme={chooseTheme}
          />
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
            <span className="nav-icon-slot">
              <Icon />
            </span>
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

function AppHeader({
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
  const live = useLive();
  const [now, setNow] = useState<number | null>(null);
  const freshness = useFreshness(now ?? live.lastSuccessAt ?? 0);

  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

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
    <header className="app-header glass">
      <div className="header-brand">
        <div className="header-wordmark">
          <Wordmark />
        </div>
        <div className="header-actions">
          <ThemeMenu choice={themeChoice} onChange={onTheme} />
          <button type="button" className="btn header-learn" onClick={onLearn}>
            <LearnIcon />
            Learn
          </button>
          <button
            type="button"
            className="btn header-menu"
            onClick={() => dialogRef.current?.showModal()}
          >
            Menu
          </button>
        </div>
      </div>
      <div className="header-status">
        <p className="status-line" aria-live="polite">
          <span className="status-group">
            <span className="text-ink-dim">API</span>
            <StatusWord
              tone={
                live.health === "reachable"
                  ? "allow"
                  : live.health === "unreachable"
                    ? "reject"
                    : "mute"
              }
              label={
                live.health === "unknown"
                  ? "Checking"
                  : live.health === "reachable"
                    ? "Reachable"
                    : "Unreachable"
              }
            />
          </span>
          <span className="status-cluster">
            <span className="status-sep" aria-hidden="true">
              /
            </span>
            <span className="status-group">
              <span className="text-ink-dim">Metrics</span>
              <StatusWord
                tone={
                  freshness === "live"
                    ? "signal"
                    : freshness === "stale"
                      ? "amber"
                      : freshness === "unreachable"
                        ? "reject"
                        : "mute"
                }
                label={freshnessText}
              />
            </span>
            <span className="status-age type-data-sm text-ink-dim">{age}</span>
          </span>
        </p>
        <p className="header-note">
          Metrics are this Node process only. They are not a cluster total.
        </p>
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
        <div className="drawer-top">
          <h2 id={titleId} className="sr-only">
            Menu
          </h2>
          <Wordmark />
          <button
            type="button"
            className="btn hit"
            aria-label="Close"
            onClick={() => dialogRef.current?.close()}
          >
            <CloseIcon />
          </button>
        </div>
        <nav aria-label="Dashboard" className="drawer-nav">
          <NavLinks onNavigate={() => dialogRef.current?.close()} />
        </nav>
        <button
          type="button"
          className="nav-link drawer-learn"
          onClick={() => {
            dialogRef.current?.close();
            onLearn();
          }}
        >
          <span className="nav-icon-slot">
            <LearnIcon />
          </span>
          Learn Documentation
        </button>
        <div className="drawer-appearance">
          <p className="drawer-label">Appearance</p>
          <ThemeOptions
            choice={themeChoice}
            name="theme-drawer"
            onChange={onTheme}
          />
        </div>
      </dialog>
    </header>
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
      <span
        aria-hidden="true"
        className={`inline-block size-2 rounded-full ${mark}`}
      />
      {label}
    </span>
  );
}
