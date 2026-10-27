import {
  SkeletonChart,
  SkeletonFactValue,
  SkeletonHeading,
  SkeletonLine,
  SkeletonMetric,
  SkeletonPanel,
  SkeletonTable,
} from "@/components/skeletons/primitives";

/** Shared Overview loading shape for Suspense fallback and pre-scrape metrics wait. */
export function OverviewContentSkeleton({
  mode = "full",
}: {
  /** full: page chrome + metrics (Suspense). metrics: band only (!attempted inside live dashboard). */
  mode?: "full" | "metrics";
}) {
  if (mode === "metrics") {
    return (
      <div aria-busy="true" aria-label="Loading overview metrics">
        <p className="sr-only">Loading overview metrics.</p>
        <OverviewMetricsSkeleton />
      </div>
    );
  }

  return (
    <div className="page-stack" aria-busy="true" aria-label="Loading overview">
      <p className="sr-only">Loading overview.</p>
      <header className="flex flex-wrap items-start justify-between gap-3" aria-hidden="true">
        <div className="min-w-0 flex-1">
          <SkeletonHeading className="h-8 w-40" />
          <SkeletonLine className="mt-2 h-4 w-full max-w-xl" />
        </div>
      </header>
      <AvailabilitySkeleton />
      <DemoShellSkeleton />
      <OverviewMetricsSkeleton />
    </div>
  );
}

function AvailabilitySkeleton() {
  return (
    <section className="card" aria-hidden="true">
      <SkeletonHeading className="mb-3 h-5 w-32" />
      <div className="availability-grid">
        <div>
          <SkeletonLine className="mb-2 h-3 w-20" />
          <div className="availability-facts">
            <FactSkeleton />
            <FactSkeleton />
            <FactSkeleton />
            <FactSkeleton />
          </div>
        </div>
        <div className="availability-policy">
          <SkeletonLine className="mb-2 h-3 w-16" />
          <div className="availability-facts">
            <FactSkeleton />
            <FactSkeleton />
            <FactSkeleton />
            <FactSkeleton />
          </div>
        </div>
      </div>
    </section>
  );
}

function FactSkeleton() {
  return (
    <div className="min-w-0">
      <SkeletonLine className="h-3 w-24" />
      <SkeletonFactValue />
    </div>
  );
}

function DemoShellSkeleton() {
  return (
    <>
      <SkeletonPanel titleWidth="w-52">
        <SkeletonLine className="h-4 w-full max-w-lg" />
        <SkeletonLine className="mt-2 h-4 w-full max-w-md" />
      </SkeletonPanel>
      <SkeletonPanel titleWidth="w-64">
        <SkeletonLine className="h-4 w-full max-w-lg" />
        <SkeletonTable rows={4} className="mt-4" />
      </SkeletonPanel>
    </>
  );
}

export function OverviewMetricsSkeleton() {
  return (
    <>
      <div className="metric-frame" aria-hidden="true">
        <div className="metric-grid">
          <SkeletonMetric tone="allow" />
          <SkeletonMetric tone="reject" />
          <SkeletonMetric tone="warning" />
          <SkeletonMetric tone="danger" />
        </div>
      </div>
      <div className="overview-band" aria-hidden="true">
        <SkeletonPanel className="overview-outcomes" titleWidth="w-44">
          <SkeletonLine className="mb-4 h-4 w-full max-w-sm" />
          <SkeletonChart />
          <SkeletonTable rows={3} className="mt-4" />
        </SkeletonPanel>
        <SkeletonPanel className="overview-histogram" titleWidth="w-52">
          <SkeletonLine className="h-4 w-full max-w-md" />
          <SkeletonLine className="mt-2 h-4 w-full max-w-sm" />
          <SkeletonLine className="mt-4 h-8 w-36" />
          <SkeletonChart className="mt-4" />
          <SkeletonTable rows={4} className="mt-4" />
        </SkeletonPanel>
        <SkeletonPanel className="overview-scrapes" titleWidth="w-36">
          <SkeletonTable rows={5} />
        </SkeletonPanel>
      </div>
    </>
  );
}
