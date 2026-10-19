/** Inclusive upper bounds, in seconds, for limiter consume latency. */
export const DURATION_BUCKET_BOUNDS_SECONDS: readonly number[] = Object.freeze([
  0.00005, 0.0001, 0.00025, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1,
  0.25, 0.5, 1,
]);

export type MetricLabels = Readonly<Record<string, string>>;

function escapeHelp(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
}

function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error('metric value must be finite');
  }
  if (Object.is(value, -0)) {
    return '0';
  }
  return String(value);
}

export function formatLabels(labels: MetricLabels): string {
  const names = Object.keys(labels).sort();
  if (names.length === 0) {
    return '';
  }
  const body = names
    .map((name) => `${name}="${escapeLabelValue(labels[name])}"`)
    .join(',');
  return `{${body}}`;
}

function seriesKey(labels: MetricLabels): string {
  return Object.keys(labels)
    .sort()
    .map((name) => `${name}=${labels[name]}`)
    .join('\0');
}

function copyLabels(labels: MetricLabels): Record<string, string> {
  return { ...labels };
}

interface CounterSample {
  labels: Record<string, string>;
  value: number;
}

export class PrometheusCounter {
  private readonly samples = new Map<string, CounterSample>();

  constructor(
    readonly name: string,
    readonly help: string,
  ) {}

  inc(labels: MetricLabels, by = 1): void {
    const key = seriesKey(labels);
    const existing = this.samples.get(key);
    if (existing) {
      existing.value += by;
      return;
    }
    this.samples.set(key, { labels: copyLabels(labels), value: by });
  }

  renderLines(): string[] {
    const lines = [
      `# HELP ${this.name} ${escapeHelp(this.help)}`,
      `# TYPE ${this.name} counter`,
    ];
    const samples = [...this.samples.values()].sort((a, b) =>
      formatLabels(a.labels).localeCompare(formatLabels(b.labels)),
    );
    for (const sample of samples) {
      lines.push(
        `${this.name}${formatLabels(sample.labels)} ${formatNumber(sample.value)}`,
      );
    }
    return lines;
  }
}

interface HistogramSample {
  labels: Record<string, string>;
  buckets: number[];
  inf: number;
  sum: number;
  count: number;
}

export class PrometheusHistogram {
  private readonly samples = new Map<string, HistogramSample>();

  constructor(
    readonly name: string,
    readonly help: string,
    private readonly bounds: readonly number[],
  ) {}

  /**
   * Cumulative buckets: a sample `v` increments every finite bound `le`
   * where `v <= le`, and always increments `+Inf`.
   */
  observe(labels: MetricLabels, value: number): void {
    if (!Number.isFinite(value)) {
      throw new Error('histogram observation must be finite');
    }
    const key = seriesKey(labels);
    let sample = this.samples.get(key);
    if (!sample) {
      sample = {
        labels: copyLabels(labels),
        buckets: this.bounds.map(() => 0),
        inf: 0,
        sum: 0,
        count: 0,
      };
      this.samples.set(key, sample);
    }
    for (let i = 0; i < this.bounds.length; i += 1) {
      if (value <= this.bounds[i]) {
        sample.buckets[i] += 1;
      }
    }
    sample.inf += 1;
    sample.sum += value;
    sample.count += 1;
  }

  renderLines(): string[] {
    const lines = [
      `# HELP ${this.name} ${escapeHelp(this.help)}`,
      `# TYPE ${this.name} histogram`,
    ];
    const samples = [...this.samples.values()].sort((a, b) =>
      formatLabels(a.labels).localeCompare(formatLabels(b.labels)),
    );
    for (const sample of samples) {
      for (let i = 0; i < this.bounds.length; i += 1) {
        lines.push(
          `${this.name}_bucket${formatLabels({
            ...sample.labels,
            le: String(this.bounds[i]),
          })} ${sample.buckets[i]}`,
        );
      }
      lines.push(
        `${this.name}_bucket${formatLabels({
          ...sample.labels,
          le: '+Inf',
        })} ${sample.inf}`,
      );
      lines.push(
        `${this.name}_sum${formatLabels(sample.labels)} ${formatNumber(sample.sum)}`,
      );
      lines.push(
        `${this.name}_count${formatLabels(sample.labels)} ${sample.count}`,
      );
    }
    return lines;
  }
}

/** In-process registry. `render` only reads memory. */
export class PrometheusRegistry {
  private readonly counters: PrometheusCounter[] = [];
  private readonly histograms: PrometheusHistogram[] = [];

  counter(name: string, help: string): PrometheusCounter {
    const counter = new PrometheusCounter(name, help);
    this.counters.push(counter);
    return counter;
  }

  histogram(
    name: string,
    help: string,
    bounds: readonly number[],
  ): PrometheusHistogram {
    const histogram = new PrometheusHistogram(name, help, bounds);
    this.histograms.push(histogram);
    return histogram;
  }

  render(): string {
    const lines: string[] = [];
    for (const counter of this.counters) {
      lines.push(...counter.renderLines());
    }
    for (const histogram of this.histograms) {
      lines.push(...histogram.renderLines());
    }
    if (lines.length === 0) {
      return '';
    }
    return `${lines.join('\n')}\n`;
  }
}
