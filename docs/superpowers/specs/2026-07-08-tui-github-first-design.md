# junco-site v2 — TUI + GitHub flow first

**Date:** 2026-07-08 · **Status:** approved by maintainer (design conversation, this date)

## Goal

Reposition the one-page site from folder/CLI-first to **TUI + GitHub-flow-first**: the dashboard
and the label → plan → approve → PR loop become the page's spine; the folder/ticket flow demotes to
an "under the hood" section. Same repo, same stack (static HTML/CSS, no build), same "Snowbird Spec
Sheet" design system, same deploy (Pages Actions on push to main).

## Locked decisions (maintainer-confirmed)

1. Hero H1 → **"Issues in. Pull requests out."** (couplet kept, subject swapped).
2. Dashboard mock = **section 01**, first thing below the hero. GitHub loop = section 02.
3. The single typed animation is **retargeted** to a GitHub-mode `junco logs -f` transcript inside
   section 02. The old folder-flow logs demo is **deleted**.
4. `junco assess` gets its **own short section** (03) — the "closes the circle" beat.
5. Visible-prose budget gate raised **350 → 450 words** (README gate recipe updated to match).
6. Dashboard mock rendered **duotone + accent** (muted structure / ink text / rose attention) —
   no new color tokens; honors the TUI's own "ONE accent" principle (`src/tui/theme.ts:1`).

## Hard rules (unchanged from v1, still absolute)

- Stack-agnostic: no AI model/vendor/inference-server names anywhere; only "inference endpoint" /
  "any OpenAI-compatible inference endpoint".
- Banned words (blazing|seamless|revolutionary|supercharge|magical|\beasy\b|\bsimply\b|powerful),
  zero emoji (note: the README dashboard mock's 🐦 must NOT be copied over), hex only in the CSS
  token blocks, no AI attribution in commits.
- Every claim carries a checkable specific. All label names, key bindings, and log strings below
  were verified against the junco repo (docs/github-mode.md, docs/dashboard.md, docs/assess.md,
  src/tui/*, src/githubInbox.ts, src/prFlow.ts) on 2026-07-08.

## Page architecture

| # | Section | Change |
|---|---------|--------|
| S0 | Hero | H1/subhead/title/og rewritten; spec table reordered + `cockpit` row |
| 01 | The dashboard | NEW — annotated three-pane TUI mock |
| 02 | The loop | NEW — label-loop diagram + retargeted typed transcript + footnotes |
| 03 | It files its own issues | NEW — `junco assess` + `--auto-plan` |
| 04 | Under the hood: every issue becomes a ticket | Existing pipeline diagram + ticket example, reframed; folder demo deleted |
| 05 | Capabilities | 8 entries, regrouped; dashboard entry → PR-monitor entry |
| 06 | Setup | Code block gains `junco dashboard` emphasis + `[github]` config snippet; field-guide `diet` row updated |
| 07 | Contribute | Unchanged |
| — | CTA | Line → "Label an issue. Get a pull request." |
| — | Footer | Unchanged |

## Section specs

### S0 · Hero

- `<title>` and `og:title`: `junco — Issues in. Pull requests out.` `meta description` /
  `og:description` unchanged (positioning line).
- H1: `Issues in.<br>Pull requests out.`
- Subhead (approved verbatim): *"Label a GitHub issue `junco` and a plan appears as a comment.
  Approve it, and junco drives a coding agent in an isolated worktree until a draft PR arrives —
  watched from a terminal dashboard built for the whole loop."*
- Install panel, micro line, kicker: unchanged.
- Spec `<dl>` rows:
  - designation — unchanged
  - input — `GitHub issues you label · Markdown tickets`
  - output — `draft pull requests · plan comments · in-place answers`
  - **cockpit** (new) — `fullscreen terminal dashboard · junco dashboard`
  - endpoint / runtime / records — unchanged

### 01 · The dashboard

Intro sentence (~2 lines): the dashboard runs fullscreen in the terminal; repos, issues, plans,
queue, and junco-authored PRs one keystroke apart.

**Mock:** three-pane layout adapted from README.md:18-29, redrawn to **≤84 characters per line**
(fits the 84ch column with no desktop scroll; mobile scrolls inside the existing `.scroll`
wrapper). Content: header pulse line (` junco  acme/reef-api` + `●2 review · ✗1 PR · last ✓ 4m ·
daemon ● up 6h · ◐1 · 2 waiting` — chip set from docs/dashboard.md:13; the real TUI's `⚑`
attention chip and `⏳` queue chip are deliberately substituted, see Assets & meta), three panes
(`1 repos` with queue card, `2 issues · 14`, `3 PRs · acme/reef-api`), and the real footer key
string from src/tui/components/Chrome.tsx:262-272 (pane-2 main view), elided with `· ? help`
tail if width demands. Fictional content only (acme/reef-api, acme/tide-cli). Exact glyphs:
`▌` selection bars, lifecycle glyphs `● ◐ ○ ✓ ✗`, checks counts `✗2 ◍1 ✓4`, badge `plan-ready`.
Exact padding is an implementation concern; the gate is: every line ≤84 chars, panes aligned.

**Color treatment (duotone + accent, reusing the `.diagram` convention):** base text muted,
`<b>` → ink for row text and pane titles, `.hot` → accent for the three `▌` selection bars, the
header attention chips (`●2 review`, `⚑1 PR`), the `✗` glyphs in the PR pane, and the
`plan-ready` badge. No new CSS tokens.

**A11y:** `aria-hidden` `<pre>` + `visually-hidden` figcaption describing the three panes and
header, same pattern as the pipeline diagram.

**Annotations** (`ol.notes`, 4 items):
1. Three panes: watched repos (the queue card rides on top), the selected repo's `junco`-labeled
   issues, and junco-authored PRs sorted attention-first. `1`/`2`/`3` jump panes; `enter` opens a
   fullscreen detail overlay.
2. Every action is an ordinary label mutation made through your own `gh` auth — `d` dispatches,
   `a` approves; the daemon's sweep does the rest.
3. The header pulse: issues awaiting review, PRs that need attention (checks failing or changes
   requested), daemon uptime, queue depth.
4. `:` opens a command palette that runs the actual junco CLI — no reimplementation, no drift.

### 02 · The loop

**Diagram** (box-drawing, `.diagram` classes, aria-hidden + visually-hidden alt): two-hop flow —

```
issue labeled junco → junco:planning → plan posted as an issue comment (junco:plan-ready)
→ write+ collaborator applies junco:approved → execution ticket → agent in a worktree
→ draft PR (Closes acme/reef-api#52) → junco:done
```

Shape/wrap to taste at implementation; must include the literal label names `junco`,
`junco:plan-ready`, `junco:approved`, `junco:done`, and the qualified `Closes acme/reef-api#52`
(the real emitted form is `Closes owner/repo#N` — src/prFlow.ts:266; never the short `#N`).

**Typed transcript** (same animation mechanism — `.l` spans, `--n`/`--i`, IntersectionObserver;
JS unchanged): a `── junco logs -f ──` panel telling one issue's story. Log lines use the real
`formatHumanLine` format and only message strings verified in code:

- `github bridge: dispatched issue {"nwo":"acme/reef-api","issue":52,"kind":"plan"}` (src/githubInbox.ts:744)
- a muted narrative interstitial line (not a log line; precedent: the `$ junco submit` shell lines
  in v1) marking the human gap: plan read, `junco:approved` applied — with a ~17-minute timestamp
  jump around it
- `github bridge: approved plan dispatched for execution {"nwo":"acme/reef-api","issue":52}` (src/githubInbox.ts:697)
- `claimed {"src":…,"dst":…}` · `spec verification: 2/2 checks passed` · `critic: pass` ·
  `pushed junco/<branch> (3 new commits)` · `opened PR https://github.com/acme/reef-api/pull/57 …` ·
  `finalized (pr-flow) {"dst":"done/…","status":"completed"}` · `idle` + caret (all carried over
  from v1's verified line set)

⚠️ Implementation MUST verify in-code before finalizing copy: (a) the plan-ticket finalize log
line and flavor string, (b) the GitHub-mode ticket id shape (for `[ticket]` fields and
`inbox/<id>.md` paths) — from src/githubInbox.ts ticket construction. Do not invent strings.

**Footnotes** (`ol.notes`, 3 items) + one outbox line:
1. Approval is verified: who applied `junco:approved` (write access required) and that it
   postdates the plan comment — junco fails closed on any verification error.
2. The plan is an editable issue comment; whatever it says at approval time is what executes.
3. `junco:ask` skips planning: read-only Q&A, answered as a comment — no branch, no PR.

Plus one sentence: when GitHub is unreachable, labels, comments, and the PR push queue durably in
an outbox and drain on reconnect — FIFO, idempotent, dead-lettered after 3 attempts.

### 03 · It files its own issues

Prose (~3 sentences, approved shape): `junco assess <path|owner/repo>` audits a repo — `npm audit`
plus a read-only agent pass — and files fingerprinted, severity-labeled GitHub issues. Findings
dedupe against the most recent 500 `junco:finding` issues, closed ones included, so nothing is
filed twice. With `--auto-plan` each new issue also carries the trigger label: junco plans its own
findings, and you approve the ones worth doing.

Mock issue line (panel or plain, one line + label row):
`[high] Unsanitized template in exportCsv (sql-injection)` with labels
`junco:finding · severity/high · junco`. (Title format `[<severity>] <title> (<ruleId>)` —
docs/assess.md:66-73.)

### 04 · Under the hood: every issue becomes a ticket

Opening prose: the GitHub bridge writes an execution ticket into the same `inbox/` every folder
ticket uses — one queue, one pipeline, whether the work came from an issue or `junco submit` (or
any tool that writes a Markdown file). Then:

- **Pipeline diagram:** v1's diagram carried over unchanged.
- **Ticket example:** v1's `fix-tide-rounding.md` panel carried over unchanged, caption kept
  (Q&A tickets / `junco schema`).
- **Footnotes:** v1's three notes (atomic rename, guards/salvage, verification+critic) tightened
  for word budget but factually identical.
- v1's S2 (folder logs demo) is deleted; its `#demo` id moves to the new transcript in 02.

### 05 · Capabilities (8 entries)

Atomic claiming · Plans before code · Supervised sessions · Timeout salvage · Requeue with
backoff · Offline outbox · **PR monitor** (new — replaces "A dashboard worth living in", now
redundant with section 01: junco-authored PRs sorted attention-first — checks-failing and
changes-requested surface at the top; `junco prs` prints the same list, by construction) ·
Local-first. Entry copy otherwise carried from v1.

### 06 · Setup

- Setup block becomes:
  ```
  npx @ironforgesoftware/junco   # first run → setup wizard; afterwards → the daemon
  junco dashboard                # the cockpit: watch repos, dispatch, approve, monitor PRs
  junco submit my-task.md        # or feed it a Markdown ticket directly
  ```
- New 5-line `config.toml` snippet beside/below it (or note the dashboard's `w` key adds repos
  without touching config):
  ```
  [github]
  enabled = true        # label an issue `junco` → plan → approve → PR

  [[github.repos]]
  nwo  = "acme/reef-api"
  path = "~/code/reef-api"
  ```
- Field-guide card: `diet` row → `GitHub issues · Markdown tickets`. Everything else unchanged.

### 07 / CTA / Footer

Contribute unchanged. CTA line → **"Label an issue. Get a pull request."** (install panel
unchanged). Footer unchanged.

## Assets & meta

- **og-image regeneration required** (it bakes the old H1): edit og.html headline to the new H1,
  re-screenshot 1200×630 per the README recipe, replace site/assets/og-image.png.
- Favicon unchanged.
- **Glyph policy for the mock.** The real TUI's `⚑` (U+2691) and `⏳` (U+23F3) are excluded: both
  fall outside the shipped subset's ranges, and U+23F3 sits in a standard emoji range (our own
  emoji gate would flag it). The mock substitutes `✗1 PR` for the attention chip and the words
  `2 waiting` for the queue chip. `◍` (U+25CD, the TUI's pending-checks count glyph) turned out
  to be absent from Commit Mono entirely — the mock substitutes `◐`, which already means
  "pending" in the TUI's lifecycle vocabulary. Remaining mock glyphs: `▌ ● ◐ ○ ✓ ✗` plus
  box-drawing.
  `◐` (U+25D0) and `◍` (U+25CD) — `◐` is OUTSIDE the current geometric-shapes subset range
  (U+25A0–25CF): **re-subset both weights** with the README recipe, extending geometric shapes to
  U+25A0–25FF, then re-run the cmap coverage gate over every glyph the page uses before styling.

## Gates (all must pass before push; push to main = deploy)

Unchanged from v1 except word budget: html-validate; banned-word grep; vendor/model grep
(openai only in "OpenAI-compatible"); zero emoji; hex only in token blocks; **visible prose ≤450
words** (README recipe updated); 320px no body h-scroll; JS-off and reduced-motion render the full
transcript statically; light+dark screenshots at 320/768/1440. Work lands as local commits on
main, gates run, then one push (one deploy). Maintainer sees screenshots before the push.

## Out of scope

Any junco-repo changes (README, docs). Domain/DNS/Pages config (done). New pages or nav items.
