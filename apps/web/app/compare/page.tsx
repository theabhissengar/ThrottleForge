import { AlgorithmLab } from "@/components/algorithm-lab";
import { COMPARE_SCENARIOS } from "@/lib/artifacts/labels";
import { compareReference } from "@/lib/artifacts/references";
import type { CompareReport } from "@/lib/artifacts/types";

export const metadata = {
  title: "Algorithm Lab · ThrottleForge",
};

export default function ComparePage() {
  const reports = Object.fromEntries(
    COMPARE_SCENARIOS.map((scenario) => [scenario, compareReference(scenario)]),
  ) as Record<(typeof COMPARE_SCENARIOS)[number], CompareReport>;
  return <AlgorithmLab reports={reports} />;
}
