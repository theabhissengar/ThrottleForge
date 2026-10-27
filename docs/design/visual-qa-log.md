# Visual QA log

Reference file, reopened before Stage 1 and readable:

`C:\Users\theab\Downloads\ThrottleForge Responsive Dashboard Design Board.png`

Reference A is the Overview frames on that board. Reference B is the sidebar, mobile menu, tablet, light, and large-screen frames. The Dashboard UI Showcase was not used.

## Stage 1 — Tokens

Compared at 1440×1000, expanded sidebar.

- Dark canvas `rgb(8, 14, 22)` = `#080E16`. Sidebar `rgb(11, 20, 32)` = `#0B1420`. Header `rgb(16, 26, 39)` = `#101A27`. Card `rgb(16, 27, 41)` = `#101B29`. Accent `#39C6D8`. Ink `#F1F5F9`. Title `26px / 33px`. Sidebar width `208px`.
- Light canvas `rgb(243, 246, 250)` = `#F3F6FA`. Sidebar and header `#FFFFFF`. Ink `#172536`. Accent `#087E98`.
- Light muted is `#5A6D82` instead of the specified `#687B90`, because `#687B90` on white is about 4.3:1 and fails WCAG AA for 12px text. Dark muted `#7F94AB` on the card is about 5.5:1 and was kept.
- Theme still comes from the existing boot script. Reload with `throttleforge-theme` set to dark or light painted the matching `data-theme` before the measured styles. No second token system.

Screenshots: `stage1-dark-1440.png`, `stage1-light-1440.png`.

## Stage 2 — Sidebar

- Expanded width 208px, height matches the viewport, active item 44px, radius 8px, accent `rgb(57, 198, 216)` on `#12343E`. Learn is not in the sidebar. Collapse control is at the bottom (`y` 664 in a 720px viewport) and hit-testing returns the label Collapse.
- Collapsed width is 64px after the stylesheet refresh. Labels are opacity 0. The logo mark is 32px.
- The first collapsed measurement stayed at 208px because `min-width` had not updated in the running stylesheet. After reload, computed width and min-width were 64px.

Screenshots: `stage2-expanded-720.png`, `stage2-collapsed-480.png`. The 1000px captures cropped the footer out of the bitmap even though the control was in the layout viewport. The short viewport captures show it.

## Stage 3 — Header and mobile menu

At 390×844, dark, menu closed:

- Header height 110px. Brand row 52px. Status row 28px, one line, including the long “Unreachable / Unreachable / no scrape yet” case. Process sentence 19px, one line, exact copy. No page-level horizontal scroll (`scrollWidth` 390). Sidebar `display: none`.
- Menu open: drawer width 358px, which is within `min(100vw - 24px, 360px)`. Text includes Overview, Algorithm Lab, Benchmark History, Adaptive Explorer, Learn Documentation, and Appearance Light, Dark, System.

Screenshots: `stage3-mobile-390-oneline.png`, `stage3-mobile-390-open.png`.

Desktop Learn computed `display: flex` at 1440. Header height on the earlier desktop capture was 68px.

320, 375, 430, and landscape 844×390 are recorded in Stage 9.

## Stage 4 — Availability

At 1440 the availability grid computed two columns, `567.2px 567.2px`, with a left border on the policy group. Mobile still stacks, with the policy group under a top border. Observed store is still “Not observed yet” when the scrape has no store label. The running API scrape was failing (`fetch failed`), so the values are the real unavailable state, not the board’s sample numbers.

Screenshot: `stage4-availability-1440.png`.

## Stage 5 — Request demonstration

At 1440 the introduction and Run demonstration button are one row (`display: flex`, `flex-direction: row`). The button still sends the existing 10-request probe. After that run, the results table had 10 rows. This API’s Redis store was failing, so the rows were real `503` responses with `Absent` quota headers, not invented allows.

The probe-off example table is not on screen while the development probe is enabled. That table now opts into the narrow stacked layout, and it still has no Run button of its own. No reference frame exists for the example table.

## Stage 6 — Metric cards

A successful scrape with this API produced a mixed state, which is the useful one:

- Allowed, Rejected, and Degraded admissions render “No sample”. The counters were absent from `/metrics`.
- Store failures rendered `10`, with “Since previous scrape: 0”. That zero is a reported delta, not a missing sample.
- Four cards at 1440 (`276px` each) and at 1920. Two columns at 768 and 1024. One column at 390.
- Top borders use the semantic colors on the normal card surface. Light theme canvas measured `rgb(243, 246, 250)`.

Screenshots: `stage6-nosample-dark-1440.png`, `stage6-cards-dark-1440.png`, `stage6-cards-light-1440.png`.

## Stage 7 — Charts

Grouped bars stay. `outcomeMark` maps null to a gap, `0` to a 2px baseline, and a positive count to a bar. Tooltip text for null is still “unavailable”. Legend series are Allowed and Rejected only.

This session never produced an allowed or rejected interval, because those counters were absent. The outcomes panel correctly says “No usable interval sample.” Bar geometry was therefore not compared with the board’s illustrative chart. The null-versus-zero distinction is covered by `lib/metrics/chart-marks.test.ts`.

The histogram did render from the real scrape: mean `0.000322 s`, cumulative accent bars, and the bucket table. Early buckets with a cumulative count of 0 have no bar; the table still shows `0`. There is no histogram frame on the board.

Tooltips use `allowEscapeViewBox` so they stay in the plot. Screenshot: `stage7-histogram-dark-1440.png`.

## Stage 8 — Recent scrapes

From 1024px, Request outcomes and Recent scrapes share a row (`682px` and `455px` at 1440). Limiter operation time spans the row below. DOM order is unchanged: outcomes, histogram, scrapes.

The recent-scrape table is a 6-column row at 768 and above (`display: table-row`). Below 768 it stacks (`display: block` at 390), with the column name on each value. The first cell stays an em dash or “unavailable” or a number through the existing `deltaCell` helper. There is no View all control.

The same opt-in stack is on the demonstration tables only. Algorithm Lab, Benchmark History, and Adaptive Explorer still use horizontal scroll and the “More columns” hint.

## Stage 9 — Routes, themes, viewports, tests

Reference board reopened and readable before this pass.

| Viewport | Result |
| --- | --- |
| 320 | No page overflow. Status wraps between “API Reachable” and “/ Metrics Live …”. The slash stays inside the metrics cluster. Process sentence wraps to two lines. Header height 143px. Drawer width 288px. |
| 375 | Header 129px. No overflow. |
| 390 | Header 110px. Sidebar hidden. Scrapes stacked. Cards in one column. Docs header 110px, no overflow. |
| 430 | Header 110px. No overflow. |
| 768 | Sidebar hidden. Cards in two columns. Outcomes and scrapes stacked. Scrape table still a row. No overflow. |
| 844×390 landscape | Header 110px. Drawer width 360px, max-height 366px, inside the viewport. |
| 1024 | Sidebar 208px. Learn visible, Menu hidden. Outcomes/scrapes grid on. Cards in two columns. No overflow. |
| 1440 | Content, four cards, histogram, and the other routes as recorded above. |
| 1920 | Main column width 1280px (`80rem`). Four cards. No overflow. |

Collapsed sidebar measured 64px, with the Overview label at opacity 0, then expanded back to 208px. Light, dark, and system all applied through the existing theme control. System resolved to dark on this machine.

Algorithm Lab, Benchmark History, Adaptive Explorer, and Documentation render inside the same shell. Their tables were not switched to the Overview stack. Adaptive Explorer drew 3 charts from the committed reference. Benchmark History still shows the empty import state.

`:focus-visible` outlines use the accent color. The automated Tab key did not move focus, so a manual Tab pass is still the keyboard check.

`npm run test:web`: 10 files, 75 tests, passed. `npm run build:web`: passed.

Screenshots: `stage9-drawer-320.png`, `stage9-compare-dark-1440.png`.

---

# Algorithm Lab redesign

Reference board (confirmed open before Stage 1 and used throughout):

`C:\Users\theab\Downloads\ThrottleForge Algorithm Lab Dashboard Mockup.png`

Screenshots live under `docs/design/screenshots/`.

## Lab Stage 1 — Heading, introduction, scenario selector

Compared against board desktop-dark, desktop-light, and mobile-closed frames. Board invents Run simulation / parameter inputs; those were **not** added. Hierarchy, spacing, cyan selected cards, and shell integration were the comparison targets.

**Initial screenshots:** `lab-s1-dark-1440.png`, `lab-s1-light-1440.png`, `lab-s1-mobile-390.png`.

**Mismatches vs target / prior Lab:**
- Scenario legend used `type-card` instead of Overview section weight.
- Scenario intent used `type-control` (under-emphasized vs ID).
- Scenario block was a bare fieldset, not a panel surface.
- Intro had no max-width constraint.

**Fixes (files):**
- `apps/web/components/algorithm-lab.tsx` — `algorithm-lab` root, intro class, Scenario `card` panel, `type-card` intents, `type-section` legend.
- `apps/web/app/globals.css` — Lab-scoped `.algorithm-lab-intro`, `.algorithm-lab-scenarios`, `.algorithm-lab-scenario-grid`, `.algorithm-lab-scenario`.

**Re-check:** At 1440, grid is two columns (`553.6px 553.6px`); selected surface `rgb(18, 52, 62)` / border `rgb(47, 120, 140)`; About does not overlap the title; no page overflow. At 390, one column; title + About aligned. Light theme surfaces use shared tokens.

**Functional:** Six radios, default `boundary-burst`, IDs/intents unchanged.

## Lab Stage 2 — Metadata, Decisions chart, correctness table

Board has no exact Decisions/correctness twin (shows KPI cards + time-series). Logged as **no direct reference frame** for those sections; polished against shared chart/table conventions and board allow/reject colors.

**Screenshots:** `lab-s2-dark-1440.png`, `lab-s2-1024.png`, `lab-s2-768.png`, `lab-s2-390.png`.

**Mismatches:**
- Panel titles still `type-card`.
- Metadata competed with scenarios.
- `CompareBarChart` margins/legend density could be tighter on narrow widths.
- Mobile `--chart-height: 220px` media rule was overridden by a later `.chart-frame { height: var(--chart-height) }` (pre-existing).

**Fixes:**
- `algorithm-lab.tsx` — compact `.algorithm-lab-meta`; Decisions `titleClass="type-section"`; correctness `DataTable` `stack`.
- `charts.tsx` — `CompareBarChart` margins, dashed grid, compact bar sizing/legend.
- `globals.css` — `.algorithm-lab-meta`, `.algorithm-lab-table`; mobile chart height set via `:root { --chart-height: 220px }` under `max-width: 639px`.

**Re-check:** Allow `#27d99a` / reject `#f05b73` in dark. Boundary-burst table 20/0, 10/10, 10/10. Scenario switch to `sustained-over` → 10/10, 10/10, 19/1. Stacked correctness on 390 shows every field via `data-label` / `::before`. No overflow at 1440/1024/768/390. Chart height 220px after fix on 390.

## Lab Stage 3 — Observational timings and About dialogs

Observational timings: **no direct board twin** (board shows latency histogram / Key observations). About dialog uses shared help chrome.

**Screenshots:** `lab-s3-timings-1440.png`, `lab-s3-timings-390.png`, `lab-s3-about-1440.png`, `lab-s3-about-390.png`.

**Changes:** Timings panel `titleClass="type-section"` + `stack` (already in Stage 2 component pass). No help copy changes.

**Verification:**
- Timings stack on 390 preserves Algorithm, Elapsed ms, Throughput rps, p50/p95/p99 with labels.
- About opens topic `algorithms` (“Algorithm Lab”); Close visible; dialog in viewport on 390 (`358×697` inside 390×844).
- Escape closes; focus restores to “About this page” after a real click open.
- Automated Tab traversal still unreliable in this browser tooling (same limitation as Overview Stage 9).

## Lab Stage 4 — Regression and acceptance

| Viewport | Overflow | About overlap | Scenario cols |
| --- | --- | --- | --- |
| 320×700 | no | no | 1 |
| 375×812 | no | no | 1 |
| 390×844 | no | no | 1 |
| 430×932 | no | no | 1 |
| 844×390 | no | no | 2 |
| 768×1024 | no | no | 2 |
| 1024×900 | no | no | 2 |
| 1280×900 | no | no | 2 |
| 1440×1000 | no | no | 2 |
| 1920×1080 | no | no | 2 |

Screenshot: `lab-s4-320.png`.

**Scenarios:** All six allowed/rejected triples match committed JSON (`allScenariosOk: true`).

**Themes:** Light / Dark / System applied; System resolved to dark on this machine; `--tf-allow` / `--tf-selected` swap correctly.

**Sibling smoke:**
- Overview — loads Availability / demonstration shell.
- Benchmark History — empty import state; after programmatic compare JSON import, shared `CompareView` shows Decisions + Observational timings with badge “Imported this session”.
- Adaptive Explorer — committed reference + charts render.
- Docs — Algorithm Lab topic present.

**Commands:** `npm run test:web` — 10 files, 75 tests, passed. `npm run build:web` — passed.

**Unverified / limitations:** Full manual keyboard Tab order across every control; chart tooltip pixel-perfect hover at every viewport (tooltip component unchanged and theme-aware). Board invents Run simulation, KPIs, recent simulations — intentionally not built.

---

# Benchmark History redesign

Reference board (confirmed open before Stage 1 and used throughout):

`C:\Users\theab\Downloads\Benchmark History Dashboard Mockup.png`

Screenshots live under `docs/design/screenshots/`.

**Intentionally excluded board inventions (not product features):** aggregate KPI cards (Total/Successful/With errors/Last run), persistent run history table, search/filters/sort/pagination, Summary/Decisions/Timing/Configuration tabs, Run Benchmark controls.

## History Stage 1 — Heading and import panel

| Screenshot | Page/mode | Viewport | Theme | State | Reference frame |
| --- | --- | --- | --- | --- | --- |
| `hist-s1-dark-1440.png` | `/benchmarks` empty | 1440×1000 | Dark | Empty import | Desktop Dark |
| `hist-s1-light-1440.png` | `/benchmarks` empty | 1440×1000 | Light | Empty import | Desktop Light |
| `hist-s1-mobile-390.png` | `/benchmarks` empty | 390×844 | Dark | Empty import | Mobile menu closed |

**Checks:** No page overflow at 1440 or 390. Drop zone uses dashed border on elevated surface. About this page does not overlap the title (1440: About at x≈1317; 390: same row as title). File input present; CLI commands listed as five code chips. Menu visible at 390; sidebar collapse control at 1440.

**Mismatches vs board:** Board shows KPI strip and history table above an import — those sections are intentionally excluded. Import polish compared for hierarchy, dashed drop zone, cyan About links, and spacing only.

**Fixes this stage:** History-scoped `.benchmark-history*` classes; drag-over/`is-dragging`/`is-reading`/`focus-within` on drop zone; visible selected-filename area (appears after import); `type-section` import panel title; command chip list.

## History Stage 2 — Session metadata and decision tables

Fixtures validated with `parseArtifact` before use (all OK): `test-only-core-with-optionals.json`, `test-only-core-absent-optionals-null-throughput.json`, `test-only-http-null-metric.json`, `test-only-redis-compare-mismatch.json`, plus committed compare/adaptive JSON.

| Screenshot | Page/mode | Viewport | Theme | State | Reference frame |
| --- | --- | --- | --- | --- | --- |
| `hist-s2-core-absent-dark-1440.png` | core (absent optionals, null throughput) | 1440×1000 | Dark | Imported | No direct frame (board history table excluded) |
| `hist-s2-core-optionals-dark-1440.png` | core (optionals present) | 1440×1000 | Dark | Imported | No direct frame |
| `hist-s2-core-1024.png` | core | 1024×900 | Dark | Imported | Tablet ~1024 polish only |
| `hist-s2-core-768.png` | core | 768×1024 | Dark | Imported | Tablet ~768 polish only |
| `hist-s2-core-390.png` | core | 390×844 | Dark | Imported | Mobile closed polish only |

**Value semantics verified (CDP table scrape):** explicit Errors `0`; absent store optionals render blank cells; `throughputRps: null` renders `unavailable`. Selected session uses `.is-selected`; import panel shows `Viewing: <selected file>` synced to selection. Stacked `data-label` fields present at 390. No page overflow at 1440/1024/768/390.

**Intentionally excluded:** board KPI cards and persistent filtered history table.

**Fixes this stage:** session card/row selection styles; `type-section` session panel; filename `title` + wrap; detail meta strip; Decisions/outcomes tables with `stack` where appropriate; Viewing label tracks selected item.

## History Stage 3 — Timings, charts, shared mode views

Shared `CompareView` and embedded `AdaptiveExplorer` unchanged. History only wraps with `.benchmark-history-detail` + selected-file meta.

| Screenshot | Page/mode | Viewport | Theme | State | Reference frame |
| --- | --- | --- | --- | --- | --- |
| `hist-s3-compare-dark-1440.png` | compare import | 1440×1000 | Dark | Imported boundary-burst | No direct twin (board KPI/tabs excluded); chart polish vs Lab |
| `hist-s3-compare-light-1440.png` | compare import | 1440×1000 | Light | Imported | Desktop Light polish |
| `hist-s3-compare-chart-light-1440.png` | compare Decisions chart | 1440×1000 | Light | Imported | Chart/table polish |
| `hist-s3-compare-768.png` | compare | 768×1024 | Dark (CDP) | Imported | Tablet polish |
| `hist-s3-compare-390.png` | compare | 390×844 | Dark (CDP) | Imported | Mobile polish |
| `hist-s3-adaptive-dark-1440.png` | adaptive-compare | 1440×1000 | Dark | Imported | No direct board twin |
| `hist-s3-adaptive-light-1440.png` | adaptive-compare | 1440×1000 | Light | Imported | Embedded Adaptive transcript / pass-set means |

**CDP checks:** compare chart present; no page overflow at 1440/768/390; chart width 671px at 768 and 325px at 390 without clipping past viewport. Adaptive shows `Adaptive transcript`, Pass-set means, multiple charts; overflow false. No shared chart component edits required.

## History Stage 4 — Regression and acceptance

Screenshot: `hist-s4-320.png` (empty import, dark, 320×700).

### Errors (parser text unchanged)
- Invalid JSON → `File is not valid JSON.`
- Unknown mode → `Unknown mode "nope". Expected core, http, compare, redis-compare, adaptive-compare.`
- Missing core fields → `core.algorithm must be a non-empty string`

### Modes
All five imported successfully in one visit (core, http, compare, redis-compare, adaptive-compare). Selection switch to `core.json` updates Viewing label. HTTP shows Request outcomes + `unavailable` metric. Redis shows Matched + `unavailable` throughput.

### Persistence
After navigate to Algorithm Lab / Adaptive / Overview / Docs and back to `/benchmarks`: empty state restored (`No file imported in this visit.`). No import-related `localStorage` keys.

### Themes
Light, Dark, and System applied via existing `throttleforge-theme`. System resolved to dark on this machine.

### Viewport overflow (empty import)
| Viewport | Overflow |
| --- | --- |
| 320×700 | no |
| 375×812 | no |
| 390×844 | no (prior stages) |
| 430×932 | no |
| 844×390 landscape | no |
| 768×1024 | no (prior stages) |
| 1024×900 | no (prior stages) |
| 1280×900 | no |
| 1440×1000 | no |
| 1920×1080 | no |

### Sibling smoke
- Overview — Availability / demonstration shell loads.
- Algorithm Lab — scenarios + Committed reference Decisions/timings.
- Adaptive Explorer — Committed reference + charts.
- Docs — Benchmark History topic present.

### Commands
`npm run test:web` — 10 files, 75 tests, passed. `npm run build:web` — passed.

### Intentionally excluded (board inventions)
KPI cards, persistent run history, search/filters/sort/pagination, Summary/Decisions/Timing/Configuration tabs, Run Benchmark.

### Unverified / limitations
Full manual keyboard Tab order across every control (browser MCP Tab unreliable, same as Lab). Chart tooltip pixel hover at every viewport. Temporary `/qa-fixtures` public copies used only for CDP import during Stage 3–4 and removed afterward; lasting fixtures remain under `docs/design/fixtures/benchmark-history/`.

---

# Adaptive Explorer redesign

Reference board (confirmed open before Stage 1 and used throughout):

`C:\Users\theab\Downloads\Adaptive Explorer Responsive Dashboard.png`

Screenshots live under `docs/design/screenshots/`.

**Intentionally excluded board inventions (not product features):** traffic-pattern / Duration / Base-limit inputs, Run Experiment, fabricated KPI cards (Total/Allowed/Rejected/Final limit), live traffic + limit overlay chart, limit-adjustment event stream, invented performance-summary KPIs.

## Adaptive Stage 1 — Header, explanation, scenario selector, pass-set

| Screenshot | Page/mode | Viewport | Theme | State | Reference frame |
| --- | --- | --- | --- | --- | --- |
| `adaptive-s1-dark-1440.png` | `/adaptive` | 1440×1000 | Dark | Default `steady` | Desktop Dark (hierarchy only; board invents config/KPIs) |
| `adaptive-s1-light-1440.png` | `/adaptive` | 1440×1000 | Light | Default `steady` | Desktop Light |
| `adaptive-s1-mobile-390.png` | `/adaptive` | 390×844 | Dark | Header + callout | Mobile menu closed |
| `adaptive-s1-means-mobile-390.png` | `/adaptive` | 390×844 | Dark | Pass-set means scrolled | Mobile polish |

**Functional checks (CDP):** Means display `0.2164` / `0.4563` / `0.3434` / `0.0500`. Conclusion `passed`. Default scenario `steady` checked. Mixed labeled “Excluded from the mean”. No page overflow at 1440 or 390. About this page does not overlap title (1440: About at x≈1302; 390: wraps without overlap). Means grid 4-col at 1440, 1-col at 390.

**Mismatches vs board:** Board shows experiment configuration bar and KPI strip — intentionally excluded. Compared for page-header hierarchy, amber callout, cyan About, scenario card selection, means tiles, Dark/Light surfaces only.

**Fixes this stage:** `.adaptive-explorer*` scoped CSS; intro max-width; meta strip; means responsive grid; card-wrapped scenario selector with `choice-card` grid; `type-section` panel titles; per-client removed from orphaned 2-col cell (prep for Stage 3).

## Adaptive Stage 2 — Regret chart and runner totals

| Screenshot | Page/mode | Viewport | Theme | Scenario | Reference frame |
| --- | --- | --- | --- | --- | --- |
| `adaptive-s2-steady-dark-1440.png` | `/adaptive` | 1440×1000 | Dark | `steady` | Desktop Dark chart/table polish |
| `adaptive-s2-capacity-change-dark-1440.png` | `/adaptive` | 1440×1000 | Dark | `capacity-change` | Desktop Dark (materially different data) |
| `adaptive-s2-capacity-change-768.png` | `/adaptive` | 768×1024 | Dark | `capacity-change` | Tablet polish |
| `adaptive-s2-capacity-change-390.png` | `/adaptive` | 390×844 | Dark | `capacity-change` | Mobile polish |

**Value checks:** `steady` Adaptive regret `6` / offered `32` (matches `DOCUMENTED_REGRET`). `capacity-change` Adaptive/Floor/Ceiling/Oracle regrets `102`/`132`/`48`/`48`. All 12 runner columns present. Chart↔table consistent.

**Scroll / sticky (CDP):** No page overflow at 1440/768/390. At 768 and 390 runner `.table-scroll` is horizontally scrollable; “More columns” visible; `tabIndex=0` on scroll region. Sticky first-column `position:sticky` with opaque theme background.

**Shared chart reason:** Scoped CSS cannot set Recharts grid dash/margins/legend. Updated only `RegretChart` / `WindowChart` presentation to match `CompareBarChart` (dashed grid, margins, compact ticks). Props and data mappings unchanged.

**Fixes this stage:** `RegretChart`/`WindowChart` presentation polish in `charts.tsx`; sticky z-index + focus-visible on `.table-scroll`; `DataTable` keyboard focusable scroll region when wide; Adaptive runner table elevated sticky cells.

## Adaptive Stage 3 — Supporting charts and panels

| Screenshot | Page/mode | Viewport | Theme | Scenario | Reference frame |
| --- | --- | --- | --- | --- | --- |
| `adaptive-s3-windows-sustained-dark-1440.png` | `/adaptive` | 1440×1000 | Dark | `sustained-overload` | Desktop Dark (windows + per-client layout) |
| `adaptive-s3-panels-sustained-dark-1440.png` | `/adaptive` | 1440×1000 | Dark | `sustained-overload` | Desktop supporting panels |
| `adaptive-s3-about-dark-1440.png` | `/adaptive` | 1440×1000 | Dark | About dialog open | Dialog viewport fit |
| `adaptive-s3-windows-sustained-390.png` | `/adaptive` | 390×844 | Dark | `sustained-overload` | Mobile stacked windows |

**Checks:** `sustained-overload` Adaptive regret `28`, offered `320`, controller increase `8`. Window series length is **8** (not 320 — trace length is offered work, not window count); axes readable, no page overflow. Window grid 2-col at 1440, 1-col at 390. Per-client panel full-width under window grid (no orphaned half-column); constrained to `max-width: 42rem` (672px). Parameters: floor/initial/ceiling/windowMs/base/perClientReferenceLimit/globalKey unchanged. Observational `10.574` ms. About dialog `dialog.help-dialog` fits viewport (512×548 within 1440×1000).

**Note:** Board has no twin frames for these real transcript sections; compared for Lab/History panel polish only.

**Fixes this stage:** `RunnerWindows` layout (2-col charts + full-width per-client); `type-section` on supporting panels; stack on narrow tables; specificity fix for `.adaptive-explorer .card.adaptive-explorer-per-client` max-width after `.card`.

## Adaptive Stage 4 — Regression and acceptance

Screenshots: `adaptive-s4-320.png` (committed `/adaptive`, dark, 320×700); `adaptive-s4-history-embed-dark-1440.png` (History import of adaptive-compare).

### Viewport overflow (`/adaptive`, CDP)
| Viewport | Overflow |
| --- | --- |
| 320×700 | no |
| 375×812 | no |
| 390×844 | no |
| 430×932 | no |
| 844×390 landscape | no |
| 768×1024 | no |
| 1024×900 | no |
| 1280×900 | no |
| 1440×1000 | no |
| 1920×1080 | no |

### Scenarios / values
All six scenarios present; default `steady`; mixed labeled excluded; means `0.2164` / `0.4563` / `0.3434` / `0.0500`; conclusion `passed`.

### Themes
Light / Dark / System applied via `throttleforge-theme` + `data-theme` (Stage 1 captured Light 1440; Dark used throughout Stages 2–4). Charts remain present in each theme.

### Sibling smoke
- Overview — Availability / demonstration shell loads.
- Algorithm Lab — scenarios + Decisions chart (Allowed/Rejected) + Committed reference.
- Benchmark History — empty import; adaptive-compare import shows Adaptive transcript, Imported badge, means, 3 charts, 6 scenarios.
- Docs — Adaptive Explorer topic present.
- Adaptive Explorer — Committed reference + charts.

### Shared chart consumers
`RegretChart` / `WindowChart` presentation-only polish verified on `/adaptive` and History embed. `CompareBarChart` (Lab) unchanged and still renders.

### Commands
`npm run test:web` — 10 files, 75 tests, passed. `npm run build:web` — passed.

### Intentionally excluded (board inventions)
Traffic-pattern / Duration / Base-limit inputs, Run Experiment, fabricated KPI cards, live traffic + limit overlay, adjustment-event stream, invented performance-summary KPIs.

### Unverified / limitations
Full manual keyboard Tab order (browser MCP Tab unreliable). Chart tooltip pixel hover at every viewport. Temporary `/qa-fixtures/adaptive-compare.json` used only for History CDP import during Stage 4 and removed afterward. Hydration mismatch warnings in the Next overlay are from injected `data-cursor-ref` attributes during browser automation, not from Adaptive Explorer markup. `sustained-overload` has 8 adaptive windows (trace length 320 is offered work); tick density was not a dense-series stress case.

---

## Loading system — BrandLoader and page skeletons

Implemented Mark-based `BrandLoader`, shared skeleton primitives, corrected Overview metrics/band skeleton, Benchmark import inline loader, demo button loader, and chart palette flash correction (empty `chart-frame` instead of filled skeleton). No `app/loading.tsx` and no sync-route `loading.tsx` (Algorithm Lab / Adaptive / Docs / Benchmarks are static and render immediately).

### Stage 1 — BrandLoader and primitives
- `Mark` accepts `activity` with explicit `mark-seg-*` classes; CSS sequential accent on body segments; nick stays warning (button variant uses opacity on currentColor).
- Primitives in `components/skeletons/primitives.tsx`; Overview composer in `overview-content-skeleton.tsx`.
- Reduced motion: animations gated with `prefers-reduced-motion: no-preference`; existing global reduce rule still zeros motion.
- Verified in browser: dark collecting state shows Checking/Collecting header + `aria-busy` metrics region with 4 tone-bordered metric cards + overview-band placeholders (41 `.skeleton-block` nodes while Fetch held `/api/live` and `/api/policy`).

Screenshots:
- `load-overview-collecting-dark-1440.png` — header Checking/Collecting while first scrape held
- `load-overview-metrics-skel-dark-1440.png` — 4-metric + band skeleton region
- `load-overview-metrics-skel-dark-390.png` — narrow viewport (sidebar `display:none` at 390)
- `load-overview-metrics-skel-light-1440.png` — theme token check (light `data-theme` applied during capture)

### Stage 2 — Overview
- Suspense fallback and `!live.attempted` share `OverviewContentSkeleton` (`full` vs `metrics`).
- Policy loading: inline BrandLoader + fact value lines; unavailable clears pending.
- Example table: `SkeletonTable` while policy loading; static panel copy remains.
- Poll does not re-enter skeleton after `attempted` (gate unchanged).
- Failed scrape: existing error + Retry (capture: `load-overview-error-retry-dark-1440.png`).

### Stage 3 — Other routes
- Benchmark empty import immediate (`load-benchmarks-empty-dark-1440.png`); reading uses BrandLoader inline in drop zone.
- Demo live button: BrandLoader `button` + existing label/disabled/`aria-busy`.
- Charts: palette null → empty `chart-frame` (height reserved), not a filled skeleton product.
- Soft/hard nav to `/compare`, `/benchmarks`, `/adaptive`, `/docs`: content available immediately; **no** segment `loading.tsx` added.

### Stage 4 — Regression
| Check | Result |
| --- | --- |
| Overview collecting skeleton (Fetch hold) | Pass — 4 metrics + band, Checking/Collecting |
| Overview failed scrape + Retry | Pass |
| Algorithm Lab immediate render | Pass |
| Benchmark empty import | Pass |
| No sync-route loading.tsx | Pass (intentional) |
| `npm run test:web` | 10 files, 75 tests, passed |
| `npm run build:web` | Passed |

### Verification matrix notes
| State | Verified? | Notes |
| --- | --- | --- |
| Overview initial before first attempt | Yes | Fetch hold on `/api/live` |
| Successful first scrape | Unverified this session | API unreachable locally (`fetch failed`) |
| Missing-series / No sample | Unverified this session | Needs successful scrape |
| Explicit zero | Unverified this session | Needs successful scrape |
| Failed scrape + Retry | Yes | |
| Stale metrics | Unverified this session | Needs prior success then stall |
| Policy loading → success | Partial | Loading UI held; success needs policy API |
| Policy loading → unavailable | Unverified this session | |
| Benchmark reading → success/error | Code path only | BrandLoader wired; file read not CDP-captured |
| Demo pending | Code path only | Live probe button wired; not clicked this session |
| Reduced motion | CSS gated | Not toggled in OS settings this session |
| Light / Dark | Partial | Dark primary; light token flip attempted |
| Full viewport matrix | Partial | 390 and 1440 captured for loading; other sizes rely on shared layout CSS |

### Intentionally not shipped
- Full-screen initial app loader
- `app/loading.tsx`
- `compare` / `benchmarks` / `adaptive` / `docs` `loading.tsx`
- Fake delays or fabricated loading for sync committed JSON


