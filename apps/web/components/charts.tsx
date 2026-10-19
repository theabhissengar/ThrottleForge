"use client";

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

const tick = { fill: "#E8EEF7", fontSize: 12 };
const grid = "#2C3A52";

function UnitTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ name?: unknown; value?: unknown }>;
  label?: unknown;
  unit: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-[10px] border border-line bg-raised px-3 py-2 text-sm text-ink">
      <p className="font-medium">{String(label ?? "")}</p>
      <ul className="mt-1 space-y-1">
        {payload.map((item, index) => (
          <li key={`${String(item.name)}-${index}`}>
            {String(item.name)}: {String(item.value)} {unit}
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
  return (
    <div role="img" aria-label="Allowed and rejected decisions in each scrape interval. The vertical axis is a count of decisions and starts at zero.">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid stroke={grid} />
          <XAxis dataKey="label" tick={tick} />
          <YAxis tick={tick} domain={[0, "dataMax"]} allowDecimals={false} width={48} />
          <Tooltip content={(props) => <UnitTooltip {...props} unit="decisions" />} />
          <Legend />
          <Line type="monotone" dataKey="allowed" name="Allowed" stroke="#3DDC97" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="rejected" name="Rejected" stroke="#F07178" strokeWidth={2} dot={false} />
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
  return (
    <div role="img" aria-label="Cumulative limiter-operation observations at each histogram upper bound. This is not an exact percentile.">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid stroke={grid} />
          <XAxis dataKey="label" tick={tick} interval={0} angle={-35} height={70} textAnchor="end" />
          <YAxis tick={tick} domain={[0, "dataMax"]} allowDecimals={false} width={48} />
          <Tooltip content={(props) => <UnitTooltip {...props} unit="observations" />} />
          <Legend />
          <Bar dataKey="cumulative" name="Cumulative observations" fill="#3EC6D8" />
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
  return (
    <div role="img" aria-label="Allowed and rejected counts for each algorithm. The vertical axis is a request count and starts at zero.">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid stroke={grid} />
          <XAxis dataKey="name" tick={tick} interval={0} height={70} angle={-20} textAnchor="end" />
          <YAxis tick={tick} domain={[0, "dataMax"]} allowDecimals={false} width={48} />
          <Tooltip content={(props) => <UnitTooltip {...props} unit="requests" />} />
          <Legend />
          <Bar dataKey="allowed" name="Allowed" fill="#3DDC97" />
          <Bar dataKey="rejected" name="Rejected" fill="#F07178" />
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
  return (
    <div role="img" aria-label="Regret for each runner in the selected scenario. Regret is shortfall plus excess. The axis starts at zero.">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid stroke={grid} />
          <XAxis dataKey="name" tick={tick} interval={0} height={80} angle={-20} textAnchor="end" />
          <YAxis tick={tick} domain={[0, "dataMax"]} allowDecimals={false} width={48} />
          <Tooltip content={(props) => <UnitTooltip {...props} unit="regret" />} />
          <Legend />
          <Bar dataKey="regret" name="Regret">
            {points.map((point) => (
              <Cell key={point.name} fill={point.fill} />
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
  return (
    <div role="img" aria-label="Values by window index. The vertical axis starts at zero.">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid stroke={grid} />
          <XAxis dataKey="window" tick={tick} />
          <YAxis tick={tick} domain={[0, "dataMax"]} allowDecimals={false} width={48} />
          <Tooltip content={(props) => <UnitTooltip {...props} unit="count" />} />
          <Legend />
          {series.map((item) => (
            <Bar key={item.key} dataKey={item.key} name={item.name} fill={item.fill} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
