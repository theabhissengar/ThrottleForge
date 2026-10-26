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
          "The limit, the time window, and the Redis failure setting come from a separate policy reading. When that reading is available, those rows show it. When it is not, the rows say Unavailable. They are not zeros.",
          "The time chart is how long the limit check itself took. It is not how long the whole request took. The bars are running totals of those times, not one typical time. An average is shown only when there is at least one measurement.",
        ],
      },
      {
        heading: "The limit this app actually uses",
        paragraphs: [
          "Requests to this app use a fixed window. The app counts until the time window ends, then starts again at zero. The policy reading shows the configured store, that limit, the window length in milliseconds, and what happens if Redis fails. Observed store comes from metric labels and stays unobserved until a sample includes it. The policy store is not copied into the observed row.",
          "A configured Redis store is not the same as Redis being reachable. The policy reading does not check that Redis answered.",
        ],
      },
      {
        heading: "Run a small demonstration",
        paragraphs: [
          "A production deployment leaves the live probe off. That page does not show Run demonstration. It shows an example table for the configured limit. Those rows were not sent to the app. They are not quota decisions, and they are not the live counters.",
          "On a local development server, the Request demonstration section sends 10 real requests to this copy of the app. Press Run demonstration. The table lists each response after the batch finishes. You can run it again after the server cooldown, which is 30 seconds on one web server process. That cooldown is not shared across every copy of the web server, and it is not a general rate limit.",
          "Demo cooldown active means the web server refused to start another batch yet. It shows how many seconds to wait. That message is not one of the ten results, and it is not the app rejecting a request for using up its quota.",
        ],
      },
      {
        heading: "What 200, 429, and 503 mean",
        paragraphs: [
          "200 with quota headers means the limit check allowed the request. 200 with the mode header set to degraded means the count could not be read and the app let the request through anyway. That is not a normal allow.",
          "429 in the demonstration table means the shared quota rejected that request. 503 means the store failed and the app did not let the request through. A 503 is not a quota rejection.",
          "Limit, Remaining, and Reset describe the quota. Reset is a Unix time in seconds. Retry-After is how many seconds the app asks you to wait after a rejection. Mode appears on a degraded allow. Absent means that response did not include the header. The page does not fill one in.",
        ],
      },
      {
        heading: "Who the quota belongs to",
        paragraphs: [
          "You are the person using the page. The web server is what sends the 10 requests. The app counts the web server’s address, so people using the same page share one quota. The page does not give each visitor a separate limit, and it does not list visitors or clear the count.",
          "A development setting can let other tools send a test client name. This demonstration does not send that name. In production that setting stays off.",
          "A count kept in memory belongs to this one app process. A count kept in Redis is shared by app processes that use the same Redis settings. If Redis fails, fail-closed answers 503 and does not invent a remaining count. Fail-open answers 200 with the degraded mode and also does not invent that count.",
        ],
      },
      {
        heading: "Other pages and heavier local runs",
        paragraphs: [
          "Algorithm Lab and Adaptive Explorer show results that were saved with this project. They do not choose the limit used by live requests. The adaptive example does not handle this app’s traffic.",
          "For a larger local run, use the terminal at the project root: npm run load:http, npm run load:compare, npm run load:core, npm run load:redis-compare, or npm run load:adaptive. The page does not run those commands.",
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
