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
