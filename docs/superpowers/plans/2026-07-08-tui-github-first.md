# junco-site v2 — TUI + GitHub First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition the one-page site (repo root `/Users/alxedelweiss/junco-site`) from folder/CLI-first to TUI + GitHub-flow-first per the approved spec at `docs/superpowers/specs/2026-07-08-tui-github-first-design.md`.

**Architecture:** Single static page — `site/index.html` + `site/styles.css`, no build step. This plan restructures the page body (new sections 01–03: dashboard mock, GitHub loop, assess; old folder content merges into 04), regenerates fonts and og-image, and re-runs the content gates. Work lands as local commits on `main`; ONE push at the very end (push = deploy via Pages Actions), only after the maintainer approves screenshots.

**Tech Stack:** HTML/CSS, vanilla JS (existing, unchanged), python3/node one-liners as gate scripts, `uvx`+fonttools for subsetting, Playwright for screenshots.

## Global Constraints

- **No AI attribution in any commit** — no `Co-Authored-By: Claude` trailer, no "Generated with Claude Code" line. If tooling auto-appends one, amend it away before moving on.
- **Stack-agnostic copy:** never name an AI model/vendor/inference server; only "inference endpoint" / "any OpenAI-compatible inference endpoint".
- **Banned words** (case-insensitive, in any shipped file): blazing, seamless, revolutionary, supercharge, magical, easy (word-boundary), simply (word-boundary), powerful.
- **Zero emoji** anywhere. `✓` (U+2713) and `✗` (U+2717) are explicitly allowed; `⚑` (U+2691), `⏳` (U+23F3) and the README's `🐦` are explicitly banned.
- **Hex colors only in the CSS token blocks** (`:root`, `[data-theme="dark"]`, the dark `@media` block, the print block) and the two `theme-color` metas in HTML.
- **Visible prose ≤450 words** (everything except `<pre>`, `<dl>`, `<script>`, `<style>`, and `visually-hidden` elements). Keep `visually-hidden` elements free of nested tags — the counter strips to the first closing tag.
- **Every `<pre>` mock/diagram line ≤84 characters**; bordered mock lines all exactly equal width.
- All conventional-commit messages; suite of gates green at every commit (html-validate at minimum; full gates in Task 8).
- Do not touch the junco repo, `~/junco/config.toml`, or anything outside `/Users/alxedelweiss/junco-site` (except the scratchpad).
- Working dir for all commands: `/Users/alxedelweiss/junco-site` (absolute paths in commands below).

## Verified string inventory (do not deviate)

| Thing | Value | Source |
|---|---|---|
| Exec ticket id | `gh-acme-reef-api-52` | junco `src/githubInbox.ts:101,516` |
| Plan ticket id | `gh-acme-reef-api-52-plan` | `src/githubInbox.ts:144` |
| Branch | `junco/gh-acme-reef-api-52` | `deriveBranchName`, `src/repoContext.ts:36-39`, prefix `junco/` `src/config.ts:164` |
| Plan-ticket finalize | `finalized {"dst":…,"status":…}` (no flavor suffix) | `src/runOnce.ts:286` |
| Exec finalize | `finalized (pr-flow) {"dst":…,"status":…}` | `src/runOnce.ts:223` |
| Dispatch log | `github bridge: dispatched issue` fields `{nwo,issue,id,kind}` | `src/githubInbox.ts:744` |
| Approval log | `github bridge: approved plan dispatched for execution` fields `{nwo,issue,id}` | `src/githubInbox.ts:697` |
| Verification log | `spec verification: 2/2 checks passed` | `src/prFlow.ts:595` |
| Critic log | `critic: pass` | `src/prFlow.ts:604` |
| Push log | `pushed junco/gh-acme-reef-api-52 (3 new commits)` | `src/prFlow.ts:667` |
| PR body close line | `Closes acme/reef-api#52` (qualified, never `#N`) | `src/prFlow.ts:266` |
| Labels | `junco`, `junco:planning`, `junco:plan-ready`, `junco:approved`, `junco:queued`, `junco:working`, `junco:done`, `junco:failed`, `junco:denied`, `junco:ask`, `junco:finding`, `severity/high` | `src/githubInbox.ts:46-57`, `src/findings.ts:485-495` |
| Assess title format | `[<severity>] <title> (<ruleId>)` | junco `docs/assess.md:66-73` |
| Footer keys (pane 2) | `↑/↓ move · ←/→ panes · enter preview · d dispatch · a approve · / filter · ? help` (elided from the full builder for width) | `src/tui/components/Chrome.tsx:262-272` |

---

### Task 1: Re-subset fonts (extend geometric shapes to U+25FF)

**Files:**
- Modify: `site/assets/fonts/CommitMono-400.woff2`, `site/assets/fonts/CommitMono-700.woff2` (binary, regenerated)

**Interfaces:**
- Produces: font files whose cmap covers every glyph Tasks 3–4 use: `▌ ● ◐ ○ ◍ ✓ ✗ ◄ ►` + box drawing. The mock in Task 3 depends on `◐` (U+25D0) and `◍` (U+25CD).

- [ ] **Step 1: Download Commit Mono and locate the OTFs**

```bash
cd /private/tmp/claude-501/-Users-alxedelweiss-junco/9aed06d6-ad10-4dcb-95a8-7131b96a3d9c/scratchpad
gh release download -R eigilnikolajsen/commit-mono --pattern '*.zip' --clobber
unzip -o *.zip -d commit-mono
find commit-mono -name '*.otf' | grep -Ei '400-Regular|700-Regular'
```
Expected: two paths, one per weight (names like `CommitMono-400-Regular.otf`, `CommitMono-700-Regular.otf`).

- [ ] **Step 2: Subset both weights with the widened range**

The only change from the README recipe: `U+25A0-25CF` → `U+25A0-25FF`.

```bash
for W in 400 700; do
  uvx --from "fonttools[woff]" --with brotli pyftsubset \
    "$(find commit-mono -name "CommitMono-${W}-Regular.otf")" \
    --output-file=/Users/alxedelweiss/junco-site/site/assets/fonts/CommitMono-${W}.woff2 \
    --flavor=woff2 --layout-features="kern,calt" \
    --unicodes="U+0020-007E,U+00A0-00FF,U+2010-2027,U+2030-203A,U+2044,U+20AC,U+2190-2199,U+21D2,U+2500-257F,U+2580-259F,U+25A0-25FF,U+2713,U+2717"
done
```

- [ ] **Step 3: Coverage gate — assert every page glyph is in the cmap**

```bash
cd /Users/alxedelweiss/junco-site
for W in 400 700; do
  uvx --from "fonttools[woff]" --with brotli fonttools ttx -q -t cmap \
    -o /tmp/cmap-${W}.ttx site/assets/fonts/CommitMono-${W}.woff2
done
python3 - <<'EOF'
import re
need = ['258C','25CF','25D0','25CB','25CD','2713','2717','2500','2502','256D','256F','2570','2502','25BA','25C4','2191','2193','2190','2192']
for w in ('400','700'):
    cmap = open(f'/tmp/cmap-{w}.ttx').read().lower()
    missing = [c for c in need if f'code="0x{c.lower()}"' not in cmap]
    assert not missing, (w, missing)
print('cmap coverage OK')
EOF
```
Expected: `cmap coverage OK`. If `25BA`/`25C4` (`►`/`◄`) are missing (they are U+25BA/U+25C4, inside U+25A0-25FF, so they should be present — but U+25BA was missing from the FONT itself in v1), substitute `─►`-style arrows built from `─` + `►`… if `►` itself is absent from the source font, use `→` (U+2192, already subset and present) in the loop diagram instead, and re-run this gate with the adjusted `need` list.

- [ ] **Step 4: Size gate**

```bash
ls -la site/assets/fonts/*.woff2 | awk '{s+=$5} END {print s " bytes total"; exit (s<51200)?0:1}'
```
Expected: total < 51200 (v1 was ~36 KB; the wider range adds ~1–2 KB).

- [ ] **Step 5: Visual spot check + commit**

```bash
python3 -m http.server 8000 -d site &   # then load http://localhost:8000 and confirm no tofu; kill server
git add site/assets/fonts/ && git commit -m "feat: widen font subset to geometric shapes U+25A0-25FF"
```

---

### Task 2: Head, meta, and hero rewrite

**Files:**
- Modify: `site/index.html:6` (title), `:12` (og:title), `:71-94` (hero)

**Interfaces:**
- Produces: hero with H1 "Issues in. Pull requests out."; spec `<dl>` with new `cockpit` row. Nothing else on the page changes yet.

- [ ] **Step 1: Title + og:title**

Replace line 6 and line 12's content attribute value with:
```
junco — Issues in. Pull requests out.
```
(`meta name="description"` and `og:description` stay as the positioning line.)

- [ ] **Step 2: H1 and subhead**

Replace the current `<h1 id="hero-h">Markdown tickets in.<br>Pull requests out.</h1>` and the `.sub` paragraph with:

```html
<h1 id="hero-h">Issues in.<br>Pull requests out.</h1>
<p class="sub">
  Label a GitHub issue <code>junco</code> and a plan appears as a comment. Approve it, and
  junco drives a coding agent in an isolated worktree until a draft PR arrives — watched
  from a terminal dashboard built for the whole loop.
</p>
```

- [ ] **Step 3: Spec table rows**

Replace the `input` and `output` rows and add the `cockpit` row after `output`:

```html
<div><dt>input</dt><dd>GitHub issues you label · Markdown tickets (YAML frontmatter)</dd></div>
<div><dt>output</dt><dd>draft pull requests · plan comments · in-place answers</dd></div>
<div><dt>cockpit</dt><dd>fullscreen terminal dashboard · <code>junco dashboard</code></dd></div>
```
(`designation`, `endpoint`, `runtime`, `records` rows unchanged.)

- [ ] **Step 4: Validate + commit**

```bash
npx -y html-validate site/index.html   # expected: 0 errors
git add site/index.html && git commit -m "feat: GitHub-first hero — Issues in. Pull requests out."
```

---

### Task 3: New sections 01–03 (dashboard, loop, assess); delete old demo

This task inserts the three new sections directly after the hero, deletes the old S2 folder-logs demo (the `#demo` id moves to the new transcript), and leaves the old how-it-works/ticket/capabilities sections temporarily numbered as they are (Task 4 renumbers them). The page is valid and coherent after this commit; only the `01/02/03` vs old `01/02/03` heading numbers overlap until Task 4 — acceptable for one commit, flagged in the commit body.

**Files:**
- Modify: `site/index.html` (insert 3 sections after `</section>` of the hero; delete the old `<!-- S2 · terminal demo -->` section)
- Modify: `site/styles.css` (one new rule)

**Interfaces:**
- Consumes: fonts from Task 1 (`◐`, `◍`).
- Produces: sections with ids `dash-h`, `loop-h`, `assess-h`; the `#demo` element now lives in section 02 (the existing inline JS keyed on `getElementById("demo")` keeps working untouched).

- [ ] **Step 1: Width gate first (it will arbitrate the mock and diagram)**

Save as `/private/tmp/claude-501/-Users-alxedelweiss-junco/9aed06d6-ad10-4dcb-95a8-7131b96a3d9c/scratchpad/widthcheck.js`:

```js
// stdin: plain text block. Fails if any line >84 chars or bordered lines unequal.
const s = require("fs").readFileSync(0, "utf8");
const lines = s.split("\n").filter((l) => l.trim().length);
const w = (l) => [...l].length;
const max = Math.max(...lines.map(w));
const boxed = new Set(lines.filter((l) => /^[│╭╰]/.test(l)).map(w));
console.log("max", max, "boxed widths", [...boxed].join(","));
if (max > 84 || boxed.size > 1) { console.error("FAIL"); process.exit(1); }
console.log("OK");
```

- [ ] **Step 2: Draft the mock as plain text and run the gate**

Save the block below (exactly, no HTML) to `scratchpad/mock.txt`, then `node scratchpad/widthcheck.js < scratchpad/mock.txt`. Adjust padding spaces only (never content) until it prints `OK`:

```text
 junco  acme/reef-api   ●2 review · ✗1 PR · ✓14 · daemon ● up 6h · ◐1 · 2 waiting
╭ 1 repos ─────────╮╭ 2 issues · 14 ──────────────────────╮╭ 3 PRs · reef-api ──────╮
│▌acme/reef-api 2● ││▌● #52 Fix reef color…   plan-ready ││▌✗ #52 fix-color-lut ✗2 │
│ acme/tide-cli    ││ ◐ #46 Bleaching alert      working ││ ◐ #48 tide-cache    ◐1 │
│──────────────────││ ○ #61 Add tide tables          3h  ││ ● #41 alert-copy    ✓4 │
│ queue            ││ ✓ #44 Coral survey       done  2d  ││                        │
│ ◐ #46 · turn 14  ││                                    ││                        │
│ 2 waiting        ││                             2/14   ││                        │
╰──────────────────╯╰────────────────────────────────────╯╰────────────────────────╯
 ↑/↓ move · ←/→ panes · enter preview · d dispatch · a approve · / filter · ? help
```

- [ ] **Step 3: Insert section 01 (dashboard)**

Insert after the hero's closing `</section>`. The `<pre>` content is the gated `mock.txt` with spans added — spans must not change the character content. `<b>` = ink (row text), `class="hot"` = accent (selection bars, header attention chips, PR-pane ✗s, plan-ready badge); everything unwrapped stays muted.

```html
<!-- 01 · the dashboard -->
<section class="sec" aria-labelledby="dash-h">
  <h2 id="dash-h"><span class="num" aria-hidden="true">01 · </span>The dashboard</h2>
  <p>
    <code>junco dashboard</code> runs fullscreen in the terminal: repos, issues, plans, the
    queue, and every junco-authored PR, one keystroke apart.
  </p>
  <figure class="fig">
    <div class="scroll">
      <pre class="diagram" aria-hidden="true">
 <b>junco</b>  acme/reef-api   <span class="hot">●2 review</span> · <span class="hot">✗1 PR</span> · ✓14 · daemon ● up 6h · ◐1 · 2 waiting
╭ 1 repos ─────────╮╭ 2 issues · 14 ──────────────────────╮╭ 3 PRs · reef-api ──────╮
│<span class="hot">▌</span><b>acme/reef-api</b> 2● ││<span class="hot">▌</span>● #52 <b>Fix reef color…</b>   <span class="hot">plan-ready</span> ││<span class="hot">▌</span><span class="hot">✗</span> #52 <b>fix-color-lut</b> <span class="hot">✗2</span> │
│ acme/tide-cli    ││ ◐ #46 <b>Bleaching alert</b>      working ││ ◐ #48 <b>tide-cache</b>    ◐1 │
│──────────────────││ ○ #61 <b>Add tide tables</b>          3h  ││ ● #41 <b>alert-copy</b>    ✓4 │
│ queue            ││ ✓ #44 <b>Coral survey</b>       done  2d  ││                        │
│ ◐ #46 · turn 14  ││                                    ││                        │
│ 2 waiting        ││                             2/14   ││                        │
╰──────────────────╯╰────────────────────────────────────╯╰────────────────────────╯
 ↑/↓ move · ←/→ panes · enter preview · d dispatch · a approve · / filter · ? help</pre>
    </div>
    <figcaption class="visually-hidden">
      The junco dashboard: three panes side by side. Pane one lists watched repositories with
      a queue card showing the running ticket and waiting count. Pane two lists the selected
      repository's junco-labeled issues with lifecycle glyphs and state badges. Pane three
      lists junco-authored pull requests with check counts. A header line shows review count,
      PRs needing attention, daemon uptime, and queue depth; a footer line shows key bindings.
    </figcaption>
  </figure>
  <ol class="notes">
    <li>
      Watched repos (queue card on top), the selected repo's <code>junco</code>-labeled
      issues, junco's PRs sorted attention-first — <code>1</code>/<code>2</code>/<code>3</code>
      jump panes, <code>enter</code> opens detail.
    </li>
    <li>
      Every action is a label mutation through your own <code>gh</code> auth — <code>d</code>
      dispatches, <code>a</code> approves; the daemon's sweep does the rest.
    </li>
    <li>
      <code>:</code> opens a command palette that runs the actual junco CLI — no
      reimplementation, no drift.
    </li>
  </ol>
</section>
```

- [ ] **Step 4: Width-gate the loop diagram, then insert section 02**

Gate the plain-text diagram below the same way (`node scratchpad/widthcheck.js`), adjusting padding only. If Task 1 found `►`/`◄` unavailable, use `→`/`←` arrows.

```text
 ┌─ you ─────────────────────┐        ┌─ junco ────────────────────────────────┐
 │ label an issue: junco     │ ─────► │ verifies the labeler has write access, │
 │                           │        │ plans read-only, posts the plan as a   │
 │                           │ ◄───── │ comment · junco:plan-ready             │
 │ read the plan comment,    │        │                                        │
 │ edit it if you like,      │        │                                        │
 │ apply junco:approved      │ ─────► │ approval verified — write access, and  │
 │                           │        │ newer than the plan — then: worktree,  │
 │                           │        │ agent, verify, critic                  │
 │ review the draft PR       │ ◄───── │ opened PR · Closes acme/reef-api#52    │
 │                           │        │ issue flips to junco:done              │
 └───────────────────────────┘        └────────────────────────────────────────┘
```

Then insert as section 02, after section 01. Accent (`class="hot"`): the four label names and `Closes acme/reef-api#52`. `<b>` (ink): the box titles `you` and `junco` and the arrow glyphs' rows are left muted.

```html
<!-- 02 · the loop -->
<section class="sec" aria-labelledby="loop-h">
  <h2 id="loop-h"><span class="num" aria-hidden="true">02 · </span>The loop</h2>
  <figure class="fig">
    <div class="scroll">
      <pre class="diagram" aria-hidden="true">…the width-gated plain text from the block above, with spans added in place (spans
never change character content): <b> around the box titles "you" and "junco";
class="hot" around the five accent strings: "junco" (the label, line 2),
"junco:plan-ready", "junco:approved", "junco:done", "Closes acme/reef-api#52"…</pre>
    </div>
    <figcaption class="visually-hidden">
      You label an issue junco. Junco verifies the labeler has write access, plans in a
      read-only session, and posts the plan as an issue comment, flipping the label to
      junco:plan-ready. You read the plan comment, optionally edit it, and apply
      junco:approved. Junco verifies the approval — write access, and newer than the plan —
      then runs the agent in a git worktree with verification and a critic, opens a draft
      pull request whose description says Closes acme/reef-api#52, and flips the issue to
      junco:done.
    </figcaption>
  </figure>
  <div class="panel term">
    <p class="panel-cap" aria-hidden="true">── junco logs -f ──</p>
    <div class="scroll">
      <pre class="demo" id="demo"><span
          class="l">$ junco logs -f</span><span
          class="l">09:14:07 INFO  github bridge: dispatched issue {"nwo":"acme/reef-api","issue":52,"id":"gh-acme-reef-api-52-plan","kind":"plan"}</span><span
          class="l">09:14:52 INFO  [gh-acme-reef-api-52-plan] finalized {"dst":"done/gh-acme-reef-api-52-plan.md","status":"completed"}</span><span
          class="l note">── plan on #52 · junco:plan-ready · a human reads it, applies junco:approved ──</span><span
          class="l">09:31:02 INFO  github bridge: approved plan dispatched for execution {"nwo":"acme/reef-api","issue":52,"id":"gh-acme-reef-api-52"}</span><span
          class="l">09:31:05 INFO  claimed {"src":"inbox/gh-acme-reef-api-52.md","dst":"processing/gh-acme-reef-api-52.md"}</span><span
          class="l">09:42:31 INFO  [gh-acme-reef-api-52] spec verification: 2/2 checks passed</span><span
          class="l">09:42:58 INFO  [gh-acme-reef-api-52] critic: pass</span><span
          class="l">09:43:41 INFO  [gh-acme-reef-api-52] pushed junco/gh-acme-reef-api-52 (3 new commits)</span><span
          class="l">09:43:56 INFO  [gh-acme-reef-api-52] opened PR https://github.com/acme/reef-api/pull/57</span><span
          class="l">09:43:57 INFO  [gh-acme-reef-api-52] finalized (pr-flow) {"dst":"done/gh-acme-reef-api-52.md","status":"completed"}</span><span
          class="l">09:43:58 INFO  idle<span class="caret" aria-hidden="true">▌</span></span></pre>
    </div>
  </div>
  <ol class="notes">
    <li>
      Approval is verified: <code>junco:approved</code> must come from a write+ collaborator
      and postdate the plan comment. junco fails closed on any verification error.
    </li>
    <li>The plan is an editable issue comment — whatever it says at approval time is what executes.</li>
    <li>
      <code>junco:ask</code> skips planning: read-only Q&amp;A, answered as a comment. No
      branch, no PR.
    </li>
    <li>
      Offline? Labels, comments, and the PR push queue in a durable outbox — FIFO replay,
      idempotent, dead-lettered after 3 attempts.
    </li>
  </ol>
</section>
```

**Critical formatting rule carried from v1:** line breaks in the transcript source live INSIDE the span open tags (`<span\n class="l">`), never between `</span>` and `<span>` — a text-node newline between `display:block` spans renders as an extra blank line in `<pre>`.

- [ ] **Step 5: Insert section 03 (assess)**

```html
<!-- 03 · assess -->
<section class="sec" aria-labelledby="assess-h">
  <h2 id="assess-h"><span class="num" aria-hidden="true">03 · </span>It files its own issues</h2>
  <p>
    <code>junco assess</code> audits a repo — <code>npm audit</code> plus a read-only agent
    pass — and files fingerprinted, severity-labeled issues, deduped against the last 500
    findings, closed ones included. With <code>--auto-plan</code> each issue also carries the
    trigger label: junco plans its own findings; you approve the ones worth doing.
  </p>
  <div class="panel">
    <p class="panel-cap" aria-hidden="true">── junco assess acme/reef-api · filed ──</p>
    <div class="scroll">
      <pre class="diagram">● <b>[high] Unsanitized template in exportCsv (sql-injection)</b>
  <span class="hot">junco:finding</span> · <span class="hot">severity/high</span> · <span class="hot">junco</span></pre>
    </div>
  </div>
</section>
```

- [ ] **Step 6: Delete the old S2 demo section**

Remove the entire `<!-- S2 · terminal demo -->` `<section class="sec" aria-labelledby="demo-h">…</section>` block (old lines ~137-158). There must be exactly one `id="demo"` in the file afterwards:

```bash
grep -c 'id="demo"' site/index.html   # expected: 1
```

- [ ] **Step 7: CSS for the interstitial line**

Append to `site/styles.css` next to the existing `.caret` rule:

```css
.demo .note {
  color: var(--ink-muted);
}
```

- [ ] **Step 8: Validate, eyeball, commit**

```bash
npx -y html-validate site/index.html   # expected: 0 errors
python3 -m http.server 8000 -d site &  # eyeball 01/02/03 in browser (alignment, colors, animation replays); kill after
git add site/index.html site/styles.css
git commit -m "feat: dashboard, GitHub loop, and assess sections; retire folder demo" \
  -m "Heading numbers temporarily overlap with the legacy sections; Task 4 renumbers."
```

---

### Task 4: Section 04 merge (under the hood) + renumbering

**Files:**
- Modify: `site/index.html` — old S1 (how it works) + old S3 (the ticket) merge into one section 04; capabilities→05, setup→06, contribute→07

**Interfaces:**
- Consumes: sections 01–03 from Task 3.
- Produces: final section order and ids: `dash-h` 01, `loop-h` 02, `assess-h` 03, `hood-h` 04, `cap-h` 05, `setup-h` 06, `con-h` 07.

- [ ] **Step 1: Build section 04 from the two old sections**

Replace the old `<!-- S1 · how it works -->` section's heading + opening with the block below, keep its `<figure>` (pipeline diagram + figcaption) **byte-identical**, replace its three `ol.notes` items with the tightened trio, then move the old S3 ticket `<div class="panel">` + caption INTO this same section (after the notes), and delete the now-empty old S3 section shell:

```html
<!-- 04 · under the hood -->
<section class="sec" aria-labelledby="hood-h">
  <h2 id="hood-h"><span class="num" aria-hidden="true">04 · </span>Under the hood: every issue becomes a ticket</h2>
  <p>
    The bridge writes an execution ticket into the same <code>inbox/</code> that
    <code>junco submit</code> uses — one queue, one pipeline, wherever the work came from.
  </p>
  [UNCHANGED pipeline diagram <figure> from old S1]
  <ol class="notes">
    <li>
      Claim is one atomic rename — <code>inbox/</code> to <code>processing/</code> — so two
      workers can never own the same ticket.
    </li>
    <li>
      Four loop guards; a supervisor nudges, escalates, kills. A killed or timed-out run
      still gets its commits salvaged into a draft PR.
    </li>
    <li>
      Verification blocks run in the worktree; a critic reads the diff against the spec — a
      MISSING verdict buys exactly one corrective pass.
    </li>
  </ol>
  [UNCHANGED ticket panel + caption from old S3]
</section>
```

- [ ] **Step 2: Renumber the remaining headings**

- Capabilities: `04 · ` → `05 · ` (id `cap-h` unchanged)
- Setup: `05 · ` → `06 · ` (id `setup-h` unchanged)
- Contribute: `06 · ` → `07 · ` (id `con-h` unchanged)

- [ ] **Step 3: Verify order, validate, commit**

```bash
grep -o '0[0-9] · [A-Za-z][^<]*' site/index.html   # expected: 01…07 in order, each once
npx -y html-validate site/index.html               # expected: 0 errors
git add site/index.html && git commit -m "refactor: merge pipeline and ticket into 04 · under the hood; renumber"
```

---

### Task 5: Capabilities, setup, field guide, CTA

**Files:**
- Modify: `site/index.html` — capabilities grid (one entry swapped), setup section (code block + new config panel + field-guide diet row), CTA line

**Interfaces:**
- Consumes: section numbering from Task 4.

- [ ] **Step 1: Swap the dashboard grid entry for PR monitor**

Replace the `<div><dt>A dashboard worth living in</dt>…</div>` entry with:

```html
<div>
  <dt>PR monitor</dt>
  <dd>junco-authored PRs sorted attention-first — failing checks and requested changes surface at the top. <code>junco prs</code> prints the same list.</dd>
</div>
```

- [ ] **Step 2: Setup code block**

Replace the 4-line `<pre><code>` in the setup panel with:

```html
<pre><code>npx @ironforgesoftware/junco   # first run → setup wizard; afterwards → the daemon
junco dashboard                # the cockpit: watch, dispatch, approve, monitor
junco submit my-task.md        # or feed it a Markdown ticket directly</code></pre>
```
(The copy button's `data-copy` stays `npx @ironforgesoftware/junco`.)

- [ ] **Step 3: Config panel**

Insert after the setup panel, before the field-guide `<aside>`:

```html
<div class="panel install-block">
  <p class="panel-cap" aria-hidden="true">── config.toml ──</p>
  <div class="scroll">
    <pre><code>[github]
enabled = true            # label an issue `junco` → plan → approve → PR

[[github.repos]]          # or press `w` in the dashboard to watch a repo
nwo  = "acme/reef-api"
path = "~/code/reef-api"</code></pre>
  </div>
</div>
```

- [ ] **Step 4: Field guide diet row + CTA**

In the field-guide `<pre class="fg">`, change `diet       Markdown tickets` to
`diet       GitHub issues · Markdown tickets` and update the matching sentence in its
`visually-hidden` twin. Change the CTA line:

```html
<p class="cta-line">Label an issue. Get a pull request.</p>
```

- [ ] **Step 5: Validate + commit**

```bash
npx -y html-validate site/index.html   # expected: 0 errors
git add site/index.html && git commit -m "feat: PR-monitor capability, github config snippet, GitHub-first CTA"
```

---

### Task 6: og.html + og-image regeneration

**Files:**
- Modify: `og.html:54`
- Regenerate: `site/assets/og-image.png`

- [ ] **Step 1: New headline in og.html**

```html
<h1>Issues in.<br>Pull requests out.</h1>
```

- [ ] **Step 2: Regenerate and verify**

```bash
cd /Users/alxedelweiss/junco-site
python3 -m http.server 8000 &
npx -y playwright screenshot --viewport-size=1200,630 http://localhost:8000/og.html site/assets/og-image.png
kill %1
```
Then Read the PNG visually: dark panel, new headline, positioning line, mark + domain. Dimensions:
```bash
python3 -c "import struct;d=open('site/assets/og-image.png','rb').read();print(struct.unpack('>II', d[16:24]))"
```
Expected: `(1200, 630)`.

- [ ] **Step 3: Commit**

```bash
git add og.html site/assets/og-image.png && git commit -m "feat: regenerate og-image with the GitHub-first headline"
```

---

### Task 7: README — gates section + updated recipes

**Files:**
- Modify: `README.md` (font recipe range; new "Content gates" section)

- [ ] **Step 1: Update the font recipe range**

In the `pyftsubset` command: `U+25A0-25CF` → `U+25A0-25FF`.

- [ ] **Step 2: Add a "Content gates" section** (before "DNS"), containing exactly the gate commands from Task 8 Steps 1–4 in a fenced block, prefaced by: "Run all of these before any push; every one must pass. The word budget is **450** visible words."

- [ ] **Step 3: Commit**

```bash
git add README.md && git commit -m "docs: content-gates section; font range follows the wider subset"
```

---

### Task 8: Full gate run, screenshots, maintainer approval, push

**Files:** none created (gate outputs to scratchpad); push deploys.

- [ ] **Step 1: Grep gates (all must output nothing / pass)**

```bash
cd /Users/alxedelweiss/junco-site
grep -rniE 'blazing|seamless|revolutionary|supercharge|magical|\beasy\b|\bsimply\b|powerful' site/ og.html README.md; echo "banned-words exit: $?"   # expected: 1 (no matches)
grep -rniE 'anthropic|claude|gpt|gemini|llama|mistral|deepseek|qwen|ollama|vllm|lm.?studio|mlx' site/ og.html .github/ README.md; echo "vendor exit: $?"  # expected: 1
grep -rni 'openai' site/ og.html README.md | grep -vi 'openai-compatible'; echo "openai exit: $?"  # expected: 1
```

- [ ] **Step 2: Emoji + hex gates**

```bash
python3 - <<'EOF'
import re
pat = re.compile('[\U0001F000-\U0001FAFF☀-➿⬀-⯿️⌚⌛⤴⤵⏩-⏺]')
allowed = set('✓✗')
bad = []
for f in ['site/index.html','site/styles.css','og.html','README.md']:
    for i, line in enumerate(open(f), 1):
        bad += [(f,i,c) for c in pat.findall(line) if c not in allowed]
print(bad if bad else 'emoji gate OK'); assert not bad
EOF
grep -n '#[0-9a-fA-F]\{3,8\}\b' site/index.html   # expected: ONLY the two theme-color metas
grep -n '#[0-9a-fA-F]\{6\}' site/styles.css       # expected: hits only inside :root, [data-theme=dark], the dark @media, and @media print blocks — verify by eye
```

- [ ] **Step 3: Word gate (≤450)**

```bash
python3 - <<'EOF'
import re, html
s = open('site/index.html').read()
for p in (r'<script[\s\S]*?</script>', r'<style[\s\S]*?</style>', r'<pre[\s\S]*?</pre>',
          r'<dl[\s\S]*?</dl>', r'<[a-z]+[^>]*visually-hidden[^>]*>[\s\S]*?</[a-z]+>'):
    s = re.sub(p, ' ', s)
n = len(html.unescape(re.sub(r'<[^>]+>', ' ', s)).split())
print(n, 'visible words (budget 450)'); assert n <= 450
EOF
```
If over budget, trim in this priority order (never the hero subhead — its copy is maintainer-approved): 1. assess prose, 2. dashboard annotations, 3. section-04 opening sentence, 4. loop footnote 4. Re-run until green.

- [ ] **Step 4: html-validate + width re-check**

```bash
npx -y html-validate site/index.html   # 0 errors
```
Re-run `widthcheck.js` against the two new `<pre>` blocks' text content (copy from browser or strip tags).

- [ ] **Step 5: Browser verification + screenshots**

Serve `python3 -m http.server 8000 -d site`. With Playwright browser tools, capture to the scratchpad: 320/768/1440 widths × light/dark (6 shots), plus reduced-motion emulation (transcript must render fully, statically) and JS disabled (transcript full, copy/theme buttons hidden). At 320: `document.body.scrollWidth <= 320` must hold (the wide mocks scroll inside `.scroll`, the body must not).

- [ ] **Step 6: Show the maintainer, WAIT for approval, then push**

Present the screenshots and gate summary. **Do not push without an explicit go.** On approval:

```bash
cd /Users/alxedelweiss/junco-site && git push origin main
gh run watch $(gh run list -L1 --json databaseId -q '.[0].databaseId') --exit-status
curl -s https://junco.ironforgesoftware.com/ | grep -o '<title>[^<]*</title>'   # expect the new title
```

---

## Self-review notes

- **Spec coverage:** hero/meta (T2), dashboard (T3), loop+transcript (T3), assess (T3), under-the-hood merge + renumber (T4), capabilities/setup/CTA (T5), og-image (T6), README gates 450 + font range (T7), gates/screenshots/approval-gated deploy (T8), font re-subset with ◐/◍ (T1). Spec's "maintainer sees screenshots before the push" → T8 Step 6.
- **No invented strings:** transcript and labels traced to the string inventory table; the two spec-flagged verification items (plan-ticket finalize line, ticket id shape) were resolved against code before this plan was written.
- **Known judgment points left to the implementer:** exact padding inside the two gated `<pre>` blocks (the width gate arbitrates) and the loop-diagram arrow glyph fallback (T1 Step 3 defines the rule).
- **Declared deviation from the spec:** section 01 ships 3 annotations, not the spec's 4 — the header-pulse note was cut for the 450-word budget (the visually-hidden figcaption still describes the pulse; the mock shows it). If the final word count lands comfortably under 430, the implementer MAY restore it as annotation 3: "The header pulse: issues awaiting review, PRs with failing checks or requested changes, daemon uptime, queue depth."
