"use client";

import { useLayoutEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Palette = {
  allow: string;
  reject: string;
  accent: string;
  floor: string;
  ceiling: string;
  oracle: string;
  muted: string;
  grid: string;
  ink: string;
};

const TOKEN: Record<string, keyof Palette> = {
  allow: "allow",
  reject: "reject",
  accent: "accent",
  floor: "floor",
  ceiling: "ceiling",
  oracle: "oracle",
  muted: "muted",
};

export function useChartPalette(): Palette | null {
  const [palette, setPalette] = useState<Palette | null>(null);
  useLayoutEffect(() => {
    const read = () => setPalette(readPalette());
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return palette;
}

function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const pick = (name: string) => style.getPropertyValue(name).trim();
  return {
    allow: pick("--tf-allow"),
    reject: pick("--tf-reject"),
    accent: pick("--tf-accent"),
    floor: pick("--tf-floor"),
    ceiling: pick("--tf-ceiling"),
    oracle: pick("--tf-oracle"),
    muted: pick("--tf-muted"),
    grid: pick("--tf-grid"),
    ink: pick("--tf-ink"),
  };
}

export function colorFromToken(palette: Palette, token: string): string {
  const key = TOKEN[token] ?? "muted";
  return palette[key];
}

function useMotion(): boolean {
  const [allow, setAllow] = useState(false);
  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setAllow(!media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return allow;
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return narrow;
}

function UnitTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ name?: unknown; value?: unknown; color?: unknown }>;
  label?: unknown;
  unit: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="chart-tooltip">
      <p className="type-control">{String(label ?? "")}</p>
      <ul className="mt-1 grid gap-1">
        {payload.map((item, index) => (
          <li key={`${String(item.name)}-${index}`} className="chart-tooltip-row type-data">
            <span className="inline-flex items-center gap-2">
              <span className="chart-swatch" style={{ background: String(item.color ?? "currentColor") }} />
              <span className="type-secondary">{String(item.name)}</span>
            </span>
            <span>
              {String(item.value)} {unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OutcomeTrendChart({
  points,
}: {
  points: { label: string; allowed: number; rejected: number }[];
}) {
  const palette = useChartPalette();
  if (!palette) return <div className="skeleton-block h-(--chart-height) w-full" />;
  return (
    <div role="img" aria-label="Allowed and rejected decisions in each scrape interval. The vertical axis is a count of decisions and starts at zero. Allowed is a solid line. Rejected is dashed.">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid stroke={palette.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: palette.muted, fontSize: 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} />
          <YAxis tick={{ fill: palette.muted, fontSize: 12 }} domain={[0, "dataMax"]} allowDecimals={false} width={48} axisLine={false} tickLine={false} />
          <Tooltip content={(props) => <UnitTooltip {...props} unit="decisions" />} />
          <Legend wrapperStyle={{ fontSize: 12, color: palette.muted }} />
          <Line type="monotone" dataKey="allowed" name="Allowed" stroke={palette.allow} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="rejected" name="Rejected" stroke={palette.reject} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BucketChart({
  points,
}: {
  points: { label: string; cumulative: number }[];
}) {
  const palette = useChartPalette();
  const narrow = useNarrow();
  const motion = useMotion();
  if (!palette) return <div className="skeleton-block h-(--chart-height) w-full" />;
  return (
    <div role="img" aria-label="Cumulative limiter-operation observations at each histogram upper bound. This is not an exact percentile.">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: narrow ? 8 : 24 }} barCategoryGap="22%">
          <CartesianGrid stroke={palette.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: palette.muted, fontSize: 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} interval={narrow ? 1 : 0} angle={narrow ? 0 : -35} height={narrow ? 32 : 70} textAnchor={narrow ? "middle" : "end"} />
          <YAxis tick={{ fill: palette.muted, fontSize: 12 }} domain={[0, "dataMax"]} allowDecimals={false} width={48} axisLine={false} tickLine={false} />
          <Tooltip content={(props) => <UnitTooltip {...props} unit="observations" />} />
          <Bar dataKey="cumulative" name="Cumulative observations" fill={palette.accent} maxBarSize={28} radius={[4, 4, 0, 0]} isAnimationActive={motion} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CompareBarChart({
  points,
}: {
  points: { name: string; allowed: number; rejected: number }[];
}) {
  const palette = useChartPalette();
  const motion = useMotion();
  if (!palette) return <div className="skeleton-block h-(--chart-height) w-full" />;
  return (
    <div role="img" aria-label="Allowed and rejected counts for each algorithm. The vertical axis is a request count and starts at zero.">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} barGap={4} barCategoryGap="22%">
          <CartesianGrid stroke={palette.grid} vertical={false} />
          <XAxis dataKey="name" tick={{ fill: palette.muted, fontSize: 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} interval={0} />
          <YAxis tick={{ fill: palette.muted, fontSize: 12 }} domain={[0, "dataMax"]} allowDecimals={false} width={48} axisLine={false} tickLine={false} />
          <Tooltip content={(props) => <UnitTooltip {...props} unit="requests" />} />
          <Legend wrapperStyle={{ fontSize: 12, color: palette.muted }} />
          <Bar dataKey="allowed" name="Allowed" fill={palette.allow} maxBarSize={28} radius={[4, 4, 0, 0]} isAnimationActive={motion} />
          <Bar dataKey="rejected" name="Rejected" fill={palette.reject} maxBarSize={28} radius={[4, 4, 0, 0]} isAnimationActive={motion} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RegretChart({
  points,
}: {
  points: { name: string; regret: number; fill: string }[];
}) {
  const palette = useChartPalette();
  const motion = useMotion();
  if (!palette) return <div className="skeleton-block h-(--chart-height) w-full" />;
  return (
    <div role="img" aria-label="Regret for each runner in the selected scenario. Regret is shortfall plus excess. The axis starts at zero.">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} barCategoryGap="22%">
          <CartesianGrid stroke={palette.grid} vertical={false} />
          <XAxis dataKey="name" tick={{ fill: palette.muted, fontSize: 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} interval={0} />
          <YAxis tick={{ fill: palette.muted, fontSize: 12 }} domain={[0, "dataMax"]} allowDecimals={false} width={48} axisLine={false} tickLine={false} />
          <Tooltip content={(props) => <UnitTooltip {...props} unit="regret" />} />
          <Legend wrapperStyle={{ fontSize: 12, color: palette.muted }} />
          <Bar dataKey="regret" name="Regret" maxBarSize={28} radius={[4, 4, 0, 0]} isAnimationActive={motion}>
            {points.map((point) => (
              <Cell key={point.name} fill={colorFromToken(palette, point.fill)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WindowChart({
  points,
  series,
}: {
  points: Record<string, string | number>[];
  series: { key: string; name: string; fill: string }[];
}) {
  const palette = useChartPalette();
  const motion = useMotion();
  if (!palette) return <div className="skeleton-block h-(--chart-height) w-full" />;
  return (
    <div role="img" aria-label="Values by window index. The vertical axis starts at zero.">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} barGap={4} barCategoryGap="22%">
          <CartesianGrid stroke={palette.grid} vertical={false} />
          <XAxis dataKey="window" tick={{ fill: palette.muted, fontSize: 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} />
          <YAxis tick={{ fill: palette.muted, fontSize: 12 }} domain={[0, "dataMax"]} allowDecimals={false} width={48} axisLine={false} tickLine={false} />
          <Tooltip content={(props) => <UnitTooltip {...props} unit="count" />} />
          <Legend wrapperStyle={{ fontSize: 12, color: palette.muted }} />
          {series.map((item) => (
            <Bar key={item.key} dataKey={item.key} name={item.name} fill={colorFromToken(palette, item.fill)} maxBarSize={28} radius={[4, 4, 0, 0]} isAnimationActive={motion} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
