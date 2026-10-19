import { AdaptiveExplorer } from "@/components/adaptive-explorer";
import { adaptiveReference } from "@/lib/artifacts/references";

export const metadata = {
  title: "Adaptive Explorer · ThrottleForge",
};

export default function AdaptivePage() {
  return <AdaptiveExplorer report={adaptiveReference()} badge="Committed reference" />;
}
