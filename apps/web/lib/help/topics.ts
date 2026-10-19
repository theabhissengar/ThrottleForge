export type HelpSection = {
  heading: string;
  paragraphs: string[];
};

export type HelpTopic = {
  id: string;
  title: string;
  sections: HelpSection[];
};

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "using",
    title: "Using ThrottleForge",
    sections: [
      {
        heading: "What this dashboard is",
        paragraphs: [
          "ThrottleForge is a read-only view of one API process. It does not sign you in, store history, or add up several processes into a cluster total.",
          "Live numbers come from this process's /health and /metrics endpoints. Algorithm Lab and Adaptive Explorer show transcripts that were saved with the project. Benchmark History only shows a file you import during this visit.",
        ],
      },
      {
        heading: "What a chart is telling you",
        paragraphs: [
          "Chart axes start at zero. A series is named in the legend and repeated in the table under the chart. Color is paired with a solid, dashed, or dotted stroke where two series share a chart.",
          "The table is the text alternative. A tooltip repeats a point. It is not the only copy of that point.",
        ],
      },
    ],
  },
  {
    id: "overview",
    title: "Overview",
    sections: [
      {
        heading: "What this page is for",
        paragraphs: [
          "Overview shows fixed-window decisions recorded by this API process. The counts are cumulative counters from the latest successful scrape, plus the change since the previous scrape in this browser tab.",
        ],
      },
      {
        heading: "Allowed, rejected, degraded, and store failures",
        paragraphs: [
          "Allowed means the limiter finished and allowed the request. Rejected means the limiter finished and rejected it.",
          "A store failure happens before a quota decision. A degraded admission is a fail-open response after that failure. A degraded request is not an allowed quota decision.",
          "The status strip says whether the API is reachable and whether metrics are collecting, live, stale, or unreachable. Stale means the last good scrape is older than 10 seconds. The last numbers stay on screen.",
        ],
      },
      {
        heading: "No sample, reported zero, and unpublished settings",
        paragraphs: [
          "No sample means this scrape did not include that series. The card says No sample. A reported 0 is a real zero from the process.",
          "Limit, window, and Redis failure mode are not published by the API. Those rows stay labeled that way. They are not zeros.",
          "Limiter operation time is seconds inside one limiter consume. It is not handler latency, queue time, or end-to-end response time. The bars are cumulative histogram buckets, not an exact percentile. The mean is histogram sum divided by count, and it stays unavailable when the count is not positive.",
        ],
      },
    ],
  },
  {
    id: "algorithms",
    title: "Algorithm Lab",
    sections: [
      {
        heading: "What this page is for",
        paragraphs: [
          "Algorithm Lab replays one ordered trace from fresh state on three limiters. Unequal allow counts are expected. The page shows a committed reference, not a live ranking.",
        ],
      },
      {
        heading: "The three algorithms",
        paragraphs: [
          "A fixed window counts requests until a hard time boundary, then starts again.",
          "A weighted sliding-window counter still counts part of the previous window, and that share decays as the new window advances.",
          "A token bucket refills capacity smoothly. A burst is allowed only while tokens remain.",
        ],
      },
      {
        heading: "Decisions and timings",
        paragraphs: [
          "The decisions section is allowed, rejected, unexpected errors, and store size. Those are correctness counts.",
          "Elapsed time, throughput, and percentiles are observational timings from the machine that captured the file. They are not a ranking and they are not comparable to load:http or load:core.",
        ],
      },
    ],
  },
  {
    id: "benchmarks",
    title: "Benchmark History",
    sections: [
      {
        heading: "What this page is for",
        paragraphs: [
          "Import a JSON file saved from an existing load-tool stdout. The page does not run benchmarks, does not open a shell, and does not keep the file after you leave.",
          "Committed references stay on Algorithm Lab and Adaptive Explorer. An imported row is marked Imported this session.",
        ],
      },
      {
        heading: "Accepted files",
        paragraphs: [
          "The file must be one JSON object with a mode of core, http, compare, redis-compare, or adaptive-compare. Those files come from npm run load:core, load:http, load:compare, load:redis-compare, and load:adaptive.",
          "If the file is invalid, the page shows the parser message. It does not invent timestamps or historical runs.",
        ],
      },
    ],
  },
  {
    id: "adaptive",
    title: "Adaptive Explorer",
    sections: [
      {
        heading: "What this page is for",
        paragraphs: [
          "Adaptive Explorer shows one recorded synthetic experiment. The controller is not on the HTTP request path. These figures are not a production capacity, latency, or SLO result.",
        ],
      },
      {
        heading: "Regret, baselines, and the oracle",
        paragraphs: [
          "Normalized regret is regret divided by offered work. Regret is shortfall plus excess against the synthetic capacity. Lower means the runner stayed closer to that capacity.",
          "Static floor and static ceiling are the baselines the pass compares. The oracle is a reference set to the scenario's initial capacity. It is not a policy this API runs.",
          "The pass-set mean uses five scenarios. Mixed is excluded. The per-client reference is not a pass baseline.",
          "Plant capacity is not in the transcript and is not drawn. Saturated means the window admitted exactly the limit in force. Congested means admitted work exceeded that synthetic capacity. Rejects are not congestion.",
        ],
      },
    ],
  },
];

export function topicForPath(pathname: string): string {
  if (pathname.startsWith("/compare")) return "algorithms";
  if (pathname.startsWith("/benchmarks")) return "benchmarks";
  if (pathname.startsWith("/adaptive")) return "adaptive";
  if (pathname.startsWith("/docs")) return "using";
  return "overview";
}

export function helpTopic(id: string): HelpTopic {
  return HELP_TOPICS.find((topic) => topic.id === id) ?? HELP_TOPICS[0];
}
