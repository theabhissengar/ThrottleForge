type IconProps = { className?: string };

const shared = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

export function OverviewIcon({ className }: IconProps) {
  return (
    <svg className={className} width={20} height={20} {...shared}>
      <path d="M3 16 H17" />
      <path d="M4 13 L8 8 L12 11 L16 5" />
    </svg>
  );
}

export function CompareIcon({ className }: IconProps) {
  return (
    <svg className={className} width={20} height={20} {...shared}>
      <path d="M5 16 V11 M10 16 V5 M15 16 V8" />
    </svg>
  );
}

export function BenchmarkIcon({ className }: IconProps) {
  return (
    <svg className={className} width={20} height={20} {...shared}>
      <path d="M6 3 H12 L16 7 V17 H6 Z" />
      <path d="M12 3 V7 H16" />
    </svg>
  );
}

export function AdaptiveIcon({ className }: IconProps) {
  return (
    <svg className={className} width={20} height={20} {...shared}>
      <path d="M3 14 H7 V10 H11 V7 H17" />
    </svg>
  );
}

export function ChevronIcon({ direction, size = 20 }: { direction: "left" | "right"; size?: number }) {
  return (
    <svg width={size} height={size} {...shared}>
      {direction === "left" ? <path d="M12 4 L7 10 L12 16" /> : <path d="M8 4 L13 10 L8 16" />}
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg width={20} height={20} {...shared}>
      <circle cx="10" cy="10" r="3" />
      <path d="M10 3 V5 M10 15 V17 M3 10 H5 M15 10 H17" />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg width={20} height={20} {...shared}>
      <path d="M12 3.5 A6 6 0 1 0 16.5 12 A4.5 4.5 0 0 1 12 3.5 Z" />
    </svg>
  );
}

export function MonitorIcon() {
  return (
    <svg width={20} height={20} {...shared}>
      <rect x="3" y="4" width="14" height="9" rx="1" />
      <path d="M8 16 H12 M10 13 V16" />
    </svg>
  );
}

export function LearnIcon() {
  return (
    <svg width={20} height={20} {...shared}>
      <path d="M4 5 H9 V15 H4 Z M11 5 H16 V15 H11 Z" />
    </svg>
  );
}
