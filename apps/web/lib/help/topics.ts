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
        heading: "What you are looking at",
        paragraphs: [
          "This screen shows what one running copy of the app is doing right now. You do not sign in. Nothing here is saved as a history. Numbers from several computers are not added together.",
          "The live numbers are read from that one running copy. Algorithm Lab and Adaptive Explorer show example results that were saved with this project. Benchmark History only shows a file you open during this visit. When you leave, that file is not kept.",
        ],
      },
      {
        heading: "How to read a chart",
        paragraphs: [
          "Every chart starts at zero, so a small bar is really small. Each color has a name in the key, and the same numbers are written in the table under the chart. When two lines share a chart, one is solid, one is dashed, and one may be dotted, so you can tell them apart without relying on color.",
          "Use the table if you cannot use the chart. Hovering a point repeats one number. The table still has every number.",
        ],
      },
    ],
  },
  {
    id: "overview",
    title: "Overview",
    sections: [
      {
        heading: "What this page shows",
        paragraphs: [
          "Overview counts how many requests this running app allowed or turned away. The big numbers are totals since the app started. The smaller note is how much those totals changed since the last refresh in this browser tab.",
        ],
      },
      {
        heading: "What the counts mean",
        paragraphs: [
          "Allowed means the limit check finished and let the request through. Rejected means the limit check finished and turned the request away.",
          "A store failure means the place that remembers the count had a problem before a yes-or-no decision was made. A degraded admission means the app let the request through because that memory failed. That is not the same as an allowed request.",
          "The line at the top says whether the app can be reached, and whether the numbers are still loading, up to date, old, or unavailable. Old means the last good reading is more than 10 seconds ago. The last numbers stay on the screen.",
        ],
      },
      {
        heading: "When a number is missing",
        paragraphs: [
          "“No sample” means this reading did not include that count. “0” means the app really reported zero.",
          "The limit, the time window, and the Redis failure setting are not sent by the app. Those rows say so. They are not zeros.",
          "The time chart is how long the limit check itself took. It is not how long the whole request took. The bars are running totals of those times, not one typical time. An average is shown only when there is at least one measurement.",
        ],
      },
    ],
  },
  {
    id: "algorithms",
    title: "Algorithm Lab",
    sections: [
      {
        heading: "What this page shows",
        paragraphs: [
          "This page plays the same list of requests, from a fresh start, through three different ways of limiting traffic. They are not expected to allow the same number of requests. These are saved example results, not a live contest.",
        ],
      },
      {
        heading: "The three ways of limiting",
        paragraphs: [
          "A fixed window counts requests until a set time is up, then starts over from zero.",
          "A sliding window still counts part of the previous time period. That leftover share fades as the new period moves forward.",
          "A token bucket refills steadily. A short burst is allowed only while there is still room in the bucket.",
        ],
      },
      {
        heading: "Counts and timings",
        paragraphs: [
          "Allowed, rejected, unexpected errors, and how much memory was used are the decision counts. They tell you what the limiter decided.",
          "Elapsed time, speed, and the percentile times only describe how long the saved run took on the computer that recorded it. They are not a ranking, and they should not be compared with the other benchmark commands.",
        ],
      },
    ],
  },
  {
    id: "benchmarks",
    title: "Benchmark History",
    sections: [
      {
        heading: "What this page does",
        paragraphs: [
          "You can open a JSON file that was saved from a benchmark run. This page does not run the benchmark. It does not open a terminal. It does not keep the file after you leave.",
          "The saved examples stay on Algorithm Lab and Adaptive Explorer. A file you open here is marked “Imported this session.”",
        ],
      },
      {
        heading: "Which files work",
        paragraphs: [
          "The file must be one JSON object. Its mode must be one of: core, http, compare, redis-compare, or adaptive-compare. Those files come from the load commands listed on the page.",
          "If the file is not valid, the page shows the exact error. It does not invent times or old runs.",
        ],
      },
    ],
  },
  {
    id: "adaptive",
    title: "Adaptive Explorer",
    sections: [
      {
        heading: "What this page shows",
        paragraphs: [
          "This page shows one saved practice run of a limit that adjusts itself. That automatic limit is not used on real requests to the app. These numbers are not a promise about how fast or how large a real system would be.",
        ],
      },
      {
        heading: "How to read the scores",
        paragraphs: [
          "The number on the cards is regret divided by the work that was offered. It shows how far the limit was from the practice target. A lower number means it stayed closer.",
          "Floor and ceiling are the two simple limits this practice run is compared with. The oracle is a reference set to the starting target. The app does not run the oracle.",
          "The average uses five situations. The one named mixed is left out. The per-client reference is not one of the comparison limits.",
          "The practice target is not drawn on the chart. Saturated means the window accepted exactly the limit then in use. Congested means more work was accepted than that practice target. A rejection is not the same thing as congestion.",
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
