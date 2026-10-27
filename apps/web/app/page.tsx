import { Suspense } from "react";
import { connection } from "next/server";
import { OverviewDashboard } from "@/components/overview-dashboard";
import { OverviewContentSkeleton } from "@/components/skeletons/overview-content-skeleton";
import { probeEnabled } from "@/lib/demo/access";

export const metadata = {
  title: "Overview · ThrottleForge",
};

export default function OverviewPage() {
  return (
    <Suspense fallback={<OverviewContentSkeleton mode="full" />}>
      <OverviewWithProbe />
    </Suspense>
  );
}

async function OverviewWithProbe() {
  await connection();
  const liveProbe = probeEnabled(process.env.NODE_ENV, process.env.THROTTLEFORGE_DEMO_PROBE);
  return <OverviewDashboard liveProbe={liveProbe} />;
}
