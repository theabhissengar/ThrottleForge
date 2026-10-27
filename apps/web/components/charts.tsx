"use client";

import { useLayoutEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { outcomeMark } from "@/lib/metrics/chart-marks";
import { outcomeYDomain, type OutcomePoint } from "@/lib/metrics/deltas";

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

function useCompact(): boolean {
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const apply = () => setCompact(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return compact;
}

const SHORT_CATEGORY: Record<string, string> = {
  "Fixed window": "Fixed",
  "Weighted sliding-window counter": "Sliding",
  "Token bucket": "Token",
  "Static floor": "Floor",
  "Static ceiling": "Ceiling",
  "Static oracle": "Oracle",
  "Per-client reference": "Per-client",
};

function categoryTick(value: unknown, compact: boolean): string {
  const text = String(value ?? "");
  if (!compact) return text;
  return SHORT_CATEGORY[text] ?? text;
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
            <span>{item.value === null || item.value === undefined ? "unavailable" : `${String(item.value)} ${unit}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type OutcomeChartPoint = OutcomePoint & { label: string; atLabel: string };

function OutcomeTooltip({
  active,
  payload,
  palette,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: OutcomeChartPoint }>;
  palette: Palette;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const rows = [
    { name: "Allowed", value: point.allowed, color: palette.allow },
    { name: "Rejected", value: point.rejected, color: palette.reject },
  ];
  return (
    <div className="chart-tooltip">
      <p className="type-control">{point.atLabel}</p>
      <ul className="mt-1 grid gap-1">
        {rows.map((row) => (
          <li key={row.name} className="chart-tooltip-row type-data">
            <span className="inline-flex items-center gap-2">
              <span className="chart-swatch" style={{ background: row.color }} />
              <span className="type-secondary">{row.name}</span>
            </span>
            <span>{row.value === null ? "unavailable" : `${row.value} decisions`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OutcomeBar(props: {
  dataKey?: string | number;
  payload?: OutcomeChartPoint;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
}) {
  const key = props.dataKey === "rejected" ? "rejected" : "allowed";
  const value = props.payload?.[key] ?? null;
  const mark = outcomeMark(value);
  if (mark === "gap" || props.x == null || props.y == null || props.width == null) return null;
  if (mark === "zero") {
    return <Rectangle x={props.x} y={props.y - 2} width={props.width} height={2} fill={props.fill} />;
  }
  return <Rectangle x={props.x} y={props.y} width={props.width} height={props.height} fill={props.fill} radius={[3, 3, 0, 0]} />;
}

export function OutcomeTrendChart({ points }: { points: OutcomeChartPoint[] }) {
  const palette = useChartPalette();
  if (!palette) return <div className="skeleton-block h-(--chart-height) w-full" />;
  return (
    <div className="chart-frame" role="img" aria-label="Allowed and rejected decisions in each scrape interval. The vertical axis is a count of decisions and starts at zero. Allowed is green. Rejected is red. A missing series has no bar. A reported zero is a short mark on the baseline.">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid stroke={palette.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: palette.muted, fontSize: 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} minTickGap={24} />
          <YAxis tick={{ fill: palette.muted, fontSize: 12 }} domain={outcomeYDomain(points)} allowDecimals={false} width={48} axisLine={false} tickLine={false} />
          <Tooltip allowEscapeViewBox={{ x: false, y: false }} content={(props) => <OutcomeTooltip active={props.active} payload={props.payload as ReadonlyArray<{ payload?: OutcomeChartPoint }>} palette={palette} />} />
          <Legend wrapperStyle={{ fontSize: 12, color: palette.muted }} />
          <Bar dataKey="allowed" name="Allowed" fill={palette.allow} maxBarSize={18} isAnimationActive={false} shape={(props) => <OutcomeBar {...props} />} />
          <Bar dataKey="rejected" name="Rejected" fill={palette.reject} maxBarSize={18} isAnimationActive={false} shape={(props) => <OutcomeBar {...props} />} />
        </BarChart>
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
    <div className="chart-frame" role="img" aria-label="Cumulative limiter-operation observations at each histogram upper bound. This is not an exact percentile.">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: narrow ? 8 : 24 }} barCategoryGap="22%">
          <CartesianGrid stroke={palette.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: palette.muted, fontSize: 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} minTickGap={narrow ? 28 : 16} angle={narrow ? 0 : -35} height={narrow ? 32 : 70} textAnchor={narrow ? "middle" : "end"} />
          <YAxis tick={{ fill: palette.muted, fontSize: 12 }} domain={[0, "dataMax"]} allowDecimals={false} width={48} axisLine={false} tickLine={false} />
          <Tooltip allowEscapeViewBox={{ x: false, y: false }} content={(props) => <UnitTooltip {...props} unit="observations" />} />
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
  const compact = useCompact();
  const motion = useMotion();
  if (!palette) return <div className="skeleton-block h-(--chart-height) w-full" />;
  return (
    <div className="chart-frame" role="img" aria-label="Allowed and rejected counts for each algorithm. The vertical axis is a request count and starts at zero.">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 12, right: 12, left: 4, bottom: compact ? 4 : 8 }} barGap={6} barCategoryGap={compact ? "28%" : "24%"}>
          <CartesianGrid stroke={palette.grid} vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fill: palette.muted, fontSize: compact ? 11 : 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} interval={0} tickFormatter={(value) => categoryTick(value, compact)} height={compact ? 36 : 40} />
          <YAxis tick={{ fill: palette.muted, fontSize: 12 }} domain={[0, "dataMax"]} allowDecimals={false} width={compact ? 36 : 44} axisLine={false} tickLine={false} />
          <Tooltip allowEscapeViewBox={{ x: false, y: false }} content={(props) => <UnitTooltip {...props} unit="requests" />} />
          <Legend wrapperStyle={{ fontSize: 12, color: palette.muted, paddingTop: 4 }} iconType="square" iconSize={10} />
          <Bar dataKey="allowed" name="Allowed" fill={palette.allow} maxBarSize={compact ? 24 : 32} radius={[4, 4, 0, 0]} isAnimationActive={motion} />
          <Bar dataKey="rejected" name="Rejected" fill={palette.reject} maxBarSize={compact ? 24 : 32} radius={[4, 4, 0, 0]} isAnimationActive={motion} />
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
  const compact = useCompact();
  const motion = useMotion();
  if (!palette) return <div className="skeleton-block h-(--chart-height) w-full" />;
  return (
    <div className="chart-frame" role="img" aria-label="Regret for each runner in the selected scenario. Regret is shortfall plus excess. The axis starts at zero.">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} barCategoryGap="22%">
          <CartesianGrid stroke={palette.grid} vertical={false} />
          <XAxis dataKey="name" tick={{ fill: palette.muted, fontSize: compact ? 11 : 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} interval={0} tickFormatter={(value) => categoryTick(value, compact)} />
          <YAxis tick={{ fill: palette.muted, fontSize: 12 }} domain={[0, "dataMax"]} allowDecimals={false} width={48} axisLine={false} tickLine={false} />
          <Tooltip allowEscapeViewBox={{ x: false, y: false }} content={(props) => <UnitTooltip {...props} unit="regret" />} />
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
  const compact = useCompact();
  const motion = useMotion();
  if (!palette) return <div className="skeleton-block h-(--chart-height) w-full" />;
  return (
    <div className="chart-frame" role="img" aria-label="Values by window index. The vertical axis starts at zero.">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} barGap={4} barCategoryGap="22%">
          <CartesianGrid stroke={palette.grid} vertical={false} />
          <XAxis dataKey="window" tick={{ fill: palette.muted, fontSize: compact ? 11 : 12 }} axisLine={{ stroke: palette.grid }} tickLine={false} minTickGap={compact ? 16 : 8} />
          <YAxis tick={{ fill: palette.muted, fontSize: 12 }} domain={[0, "dataMax"]} allowDecimals={false} width={48} axisLine={false} tickLine={false} />
          <Tooltip allowEscapeViewBox={{ x: false, y: false }} content={(props) => <UnitTooltip {...props} unit="count" />} />
          <Legend wrapperStyle={{ fontSize: 12, color: palette.muted }} />
          {series.map((item) => (
            <Bar key={item.key} dataKey={item.key} name={item.name} fill={colorFromToken(palette, item.fill)} maxBarSize={28} radius={[4, 4, 0, 0]} isAnimationActive={motion} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
