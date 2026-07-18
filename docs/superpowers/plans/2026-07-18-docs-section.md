# junco-site docs section — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Content-drafting steps inside Tasks 7–9 may fan out to parallel subagents bound by the
> Style Contract below; everything they produce is reviewed and gated inline.
> NOTE: this plan is executed by its author in the same session — it specifies interfaces,
> data contracts, real fixtures, commands, and acceptance criteria rather than duplicating
> every implementation body inline.

**Goal:** Ship `/docs/` on junco.ironforgesoftware.com: 14 searchable pages covering every
junco command, config lever, and schema field, generated-reference + coverage-gated per the
approved spec (`docs/superpowers/specs/2026-07-17-docs-section-design.md`).

**Architecture:** A zero-dependency Node script (`scripts/build-docs.mjs`) with four modes:
`--extract` (snapshot junco's self-descriptions), default build (stitch fragments + snapshots
into `site/docs/`, emit search index + llms.txt), `--check` (drift + coverage gate), `--release`
(delta checklist). Output is committed; deploy stays "publish `site/` verbatim".

**Tech Stack:** Node ≥ 22 built-ins only (`node:fs`, `node:path`, `node:child_process`,
`node:test`). Vendored MiniSearch (single ESM file, MIT). No package.json, no npm deps.

## Global Constraints (from spec — every task inherits these)

- Vendor gate absolute: no AI model/vendor names anywhere in `site/` (grep:
  `anthropic|claude|gpt|gemini|llama|mistral|deepseek|qwen|ollama|vllm|lm.?studio|mlx`;
  `openai` only inside "OpenAI-compatible"). Neutral placeholders: `local/my-model`,
  `<provider>/<model-name>`.
- Banned words: `blazing|seamless|revolutionary|supercharge|magical|\beasy\b|\bsimply\b|powerful`.
- Emoji: none except `✓ ✗`. Hex colors: only in `styles.css` token blocks — `docs.css` uses
  `var()` exclusively.
- Landing word budget ≤450 (docs pages exempt); after this project index.html = 449.
- All HTML passes `npx -y html-validate`.
- Glyphs must exist in the shipped Commit Mono subset (README recipe); run the cmap check
  before styling new glyphs.
- Absolute asset paths in docs chrome (`/styles.css`, `/assets/fonts/…`) — pages are nested.
- All snapshot-derived text is HTML-escaped at render; substitutions applied before escape.
- Commits are small and frequent; NO push (push = deploy) until maintainer sees screenshots.
- junco extraction: installed binary, cwd = junco-site, never cwd inside `~/junco`;
  `config list` always with `--config docs-src/blank-config.json`.

## File Structure

```
scripts/build-docs.mjs        all four modes; exports parsers for tests
scripts/build-docs.test.mjs   node:test unit tests (fixtures = real junco 0.8.0 output)
docs-src/nav.json             ordered nav groups → page slugs (single source of nav + llms.txt)
docs-src/blank-config.json    {}
docs-src/render-substitutions.json
docs-src/extracted/{surface,levers,ticket-schema,meta}.json   (committed snapshots)
docs-src/pages/<slug>.html    page body fragments (meta comment + body HTML)
docs-src/cli/<cmd-slug>.html  per-command prose fragments (36)
site/docs/docs.css            layout + components, tokens only
site/docs/docs.js             ESM: theme, copy, anchors, search
site/docs/assets/minisearch.js  vendored + MINISEARCH-LICENSE
site/docs/**/index.html       generated (committed)
site/docs/search-index.json   generated (committed)
site/llms.txt                 generated (committed)
site/index.html               modified: docs links in header nav + footer
README.md                     modified: content-gates + docs authoring section
```

## Data Contracts

**Page fragment** (`docs-src/pages/<slug>.html`) — first line is a meta comment, rest is body:

```html
<!--meta {"title":"The GitHub loop","description":"Label → plan → approve → PR, verified at every hop.","slug":"github-loop","source":"docs/github-mode.md","navLabel":"The GitHub loop"} -->
<p>…body HTML…</p>
```

**nav.json:**

```json
{ "groups": [
  { "label": "start",       "slugs": ["index", "how-it-works", "security"] },
  { "label": "guides",      "slugs": ["github-loop", "tickets", "assess", "analyze",
                                       "dashboard", "operations", "bot-account"] },
  { "label": "reference",   "slugs": ["cli", "config", "ticket-schema"] },
  { "label": "field notes", "slugs": ["field-notes"] } ] }
```

**surface.json** (from parsed global `junco --help` + `EXTRA_COMMANDS` supplement in the
script for invocables the help lists only inline, e.g. `data migrate`):

```json
{ "commands": [
  { "slug": "assess-file", "path": "assess file", "synopsis": "junco assess file <id> --all | --only <fp,...>",
    "summary": "file reviewed findings as issues",
    "flags": [ { "flag": "--all", "placeholder": null, "default": null,
                 "description": "(assess file) File every finding in the batch" } ] } ],
  "globalFlags": [ { "flag": "--config", "alias": null, "placeholder": "<path>",
    "default": "./config.json if present, else ~/.config/junco/config.json",
    "description": "Path to config.json" } ] }
```

**levers.json:**

```json
{ "levers": [ { "path": "model.id", "type": "string", "markers": [],
  "default": "\"local/my-model\"",
  "description": "Provider-prefixed model id, e.g. openai/gpt-4o-mini." } ] }
```

(`markers` carries `secret` / `structured` / `read-only`. Current values are never stored.)

**ticket-schema.json** — verbatim parsed `junco schema` output. **meta.json** —
`{ "juncoVersion": "0.8.0" }`.

**render-substitutions.json** — `{ "openai/gpt-4o-mini": "<provider>/<model-name>" }`
(applied to snapshot text before HTML-escape; reviewed by hand whenever extraction diffs).

**CLI prose fragment** (`docs-src/cli/<cmd-slug>.html`) — no meta comment; body only:
description paragraph(s) incl. side effects → ≥1 `<pre class="cmd">` example (≥2 for the
big commands) → optional `<pre class="out">` output → optional callout(s) → optional
`<p class="see">see also: …</p>`. Slug = command path, spaces→dashes; bare launcher = `junco`.

**Parser fixtures** (unit-test inputs, captured from junco 0.8.0 — verify at execution with
the real binary): the `Subcommands:`/`Options:` blocks of `junco --help`, incl. the compound
lines `config path|list|get <path>|set <path> <value>|init` and
`auth login | auth grant <owner/repo>` (expand to one command each: `config path`,
`config list`, `config get`, `config set`, `config init`, `auth login`, `auth grant`), the
two-line `dispatch` description (continuation-line join), and `list [box]` arg syntax.
`config list` line fixture:
`model.apiKey\t= undefined (default undefined) [secret]  API key for the inference endpoint. …`

## Rendered Page Anatomy (chrome emitted by the stitcher)

head: charset · viewport · `<title>{title} — junco docs</title>` · description · canonical
`https://junco.ironforgesoftware.com/docs/{slug}/` (index: `/docs/`) · og tags (reuse existing
og-image) · theme-color metas · color-scheme · favicons · font preloads · `/styles.css` +
`/docs/docs.css` · inline theme-init snippet (same as landing).
body: skip link → header bar (wordmark → `/`; nav: docs · GitHub · npm; search combobox;
theme-toggle) → `div.docs-grid` [ `nav.side` (grouped links, `aria-current="page"`, wrapped
in `<details open>` that CSS collapses on mobile) · `main` (h1 = title, body) ] → footer
(same links as landing + stamp line: `verified against junco {meta.juncoVersion} ·
source: {source} · edit this page` where edit links to
`https://github.com/ironforgesoftware/junco-site/edit/main/docs-src/pages/{slug}.html`)
→ `<script type="module" src="/docs/docs.js"></script>`.

Generated reference pages: `cli` renders per-command sections (h2 id={cmd-slug}: synopsis
`pre.synopsis` from surface + prose fragment + `dl.flags` from surface flags, global flags in
a head section); `config` renders `dl.flags`-style lever groups from levers.json (+ optional
extended-prose fragments `docs-src/config/<lever-path>.html` if present); `ticket-schema`
renders field sections from ticket-schema.json properties. These three pages still have a
`docs-src/pages/<slug>.html` fragment for their intro prose; generated content is appended.

## Coverage & Drift Gate (`--check` — exact failure conditions)

1. Rebuild to temp dir; byte-compare every emitted file vs committed → list drifted paths.
2. Every `surface.json` command has `docs-src/cli/<slug>.html`.
3. Every CLI prose fragment contains ≥1 `<pre class="cmd">`.
4. Every `docs-src/cli/*.html` maps to a surface command (orphan check).
5. Every surface flag string occurs in its command's rendered section (invariant).
6. Every rendered page's stamp version == meta.json juncoVersion.
7. nav.json slugs ↔ docs-src/pages fragments: bijection, both directions named on failure.
8. Rendered output passes the vendor + banned-words regexes (fast local echo of README gates).
Exit 1 with a named list per category; exit 0 silent otherwise.

## Style Contract (binds every content task and any drafting subagent)

- Voice: spec-sheet terse. Short declaratives. No marketing adjectives, no banned words, no
  "you can". Every claim checkable against a named junco source file; when in doubt, verify
  in `~/junco` (READ-ONLY — it is a live daemon runtime; never run junco with cwd there,
  never touch its config/tickets/worktrees).
- Headings sentence-case, h2/h3 with kebab-case ids. Commands/paths/labels in `<code>`.
- Examples: `<pre class="cmd">` copyable, NO `$ ` prefix, common-case args only;
  output in `<pre class="out">` (not copyable). Lead sections with examples where sensible.
- Callouts: `<div class="note">`/`<div class="warn">` starting
  `<b>note —</b>`/`<b>warn —</b>`; ≤5 per page; warnings reserved for data-loss/security/
  fails-closed behavior.
- Tips live next to the thing they qualify; cross-cutting recipes go to field-notes.
- ASCII + `✓ ✗ ● ◐ ○ ▌` + box-drawing only (subset-verified glyphs).
- Diagrams: reuse landing conventions (`pre.diagram`, aria-hidden + visually-hidden alt).

---

### Task 1: Extractor + snapshots

**Files:** Create `scripts/build-docs.mjs` (exports: `parseHelp(text)`, `parseConfigList(text)`,
`applySubstitutions(text, map)`, `escapeHtml(text)`; CLI mode `--extract`),
`scripts/build-docs.test.mjs`, `docs-src/blank-config.json`,
`docs-src/render-substitutions.json`; generate `docs-src/extracted/*.json`.
**Produces:** the four snapshot files per Data Contracts; parser exports for Task 4's checks.

- [ ] Write failing `node --test scripts/` tests: parseHelp fixture → expected command array
      (incl. compound expansion, continuation join, flag scoping/defaults); parseConfigList
      fixture → lever objects with markers, current values dropped; applySubstitutions;
      escapeHtml (`<path>` → `&lt;path&gt;`).
- [ ] Run: `node --test scripts/` → FAIL (module missing).
- [ ] Implement parsers + `--extract` (spawnSync installed `junco`; `EXTRA_COMMANDS` const for
      `data migrate` with comment; write snapshots pretty-printed, sorted keys).
- [ ] Run: `node --test scripts/` → PASS. Run `node scripts/build-docs.mjs --extract`;
      inspect snapshots: 36 commands, all lever paths present, schema parses, meta 0.8.0;
      grep snapshots for absence of maintainer values (spot: no real `dataDir`/`baseUrl`).
- [ ] Commit `feat: docs extractor + junco 0.8.0 surface snapshots`.

### Task 2: Stitcher, chrome, docs.css/docs.js, docs home skeleton

**Files:** Extend `build-docs.mjs` (default mode), create `docs-src/nav.json`,
`docs-src/pages/index.html` (skeleton: title + one-paragraph placeholder body — real content
in Task 9), `site/docs/docs.css`, `site/docs/docs.js`.
**Produces:** `buildPages()` emitting `site/docs/<slug>/index.html` + `site/docs/index.html`
per Rendered Page Anatomy; docs.js functions `initTheme() initCopy() initAnchors()`.

- [ ] Tests: fragment-meta parser; chrome renderer (given fragment+nav+meta → contains title,
      canonical, aria-current on own slug, stamp with 0.8.0, absolute asset paths). Run → FAIL.
- [ ] Implement build mode + docs.css (grid `24ch minmax(0, 84ch)`, sticky sidebar, mobile
      `<details>` collapse ≤720px, `dl.flags`, `pre.synopsis`, `aside.note/.warn`,
      `.anchor` links, search combobox shell, stamp) + docs.js (theme = landing logic; copy
      buttons injected on `pre.cmd`; heading anchors) — all colors `var()`.
- [ ] Run tests → PASS. Build; `npx -y html-validate 'site/docs/**/*.html'` → 0 errors;
      `python3 -m http.server 8000 -d site` and eyeball `/docs/` light+dark, 320px (no body
      h-scroll), no-JS (sidebar usable, search hidden, toggle hidden).
- [ ] Commit `feat: docs stitcher + chrome + docs home skeleton`.

### Task 3: Search

**Files:** Vendor `site/docs/assets/minisearch.js` (+ `MINISEARCH-LICENSE`); extend build
(section extraction → `site/docs/search-index.json`); extend docs.js (`initSearch()`).
**Produces:** index docs `{id,url,title,heading,text,keywords}`, storeFields
`title,heading,url,snippet`; boost heading 3 / keywords 2 / text 1, prefix + fuzzy 0.2.

- [ ] Vendor: `npm pack minisearch` in scratch dir → copy single-file ES build + LICENSE;
      import from node in a smoke test.
- [ ] Tests: section extractor (fixture page → docs per h2/h3 with anchor urls, tags
      stripped); index round-trip (build JSON → `MiniSearch.loadJSON` → query "assess"
      returns the assess sections). Run → FAIL; implement; PASS.
- [ ] docs.js: lazy `fetch('/docs/search-index.json')` on first focus; ARIA combobox +
      listbox; `/` and Cmd/Ctrl+K focus, ↑/↓ + Enter navigate, Esc closes; `⌘K` hint.
- [ ] Manual: serve, search "assess file", "pollInterval", "worktree" → sane results,
      keyboard path works, dark mode ok. Commit `feat: docs search (vendored minisearch)`.

### Task 4: Coverage/drift gate + release report

**Files:** Extend `build-docs.mjs`: `--check` (all 8 conditions above), `--release` (snapshot
diff vs git HEAD version + CHANGELOG tail from `~/junco/CHANGELOG.md` read-only).

- [ ] Tests per failure condition with tiny in-memory fixtures (missing fragment, orphan,
      no-example, stamp mismatch, vendor string) → named-list output asserted. FAIL →
      implement → PASS.
- [ ] Run `--check` against the real tree → currently fails listing all 36 missing CLI
      fragments (expected red until Task 7); verify the list is exact.
- [ ] Commit `feat: docs coverage gate + release report`.

### Task 5: Repo gates, README, landing links, llms.txt

**Files:** Modify `README.md` (content-gates: emoji/hex file lists → globs over
`site/**/*.html` + `site/docs/docs.css`; add `node scripts/build-docs.mjs --check`; add
"Docs authoring" section: fragment format, extract/release flow, style contract pointer),
`site/index.html` (header nav `docs` before GitHub; footer `docs ·` before GitHub), build
emits `site/llms.txt` from nav.json descriptions.

- [ ] Landing edit; word gate → expect exactly `449 visible words`; html-validate landing.
- [ ] README gates rewritten; run every documented gate command verbatim → all pass except
      `--check` (known-red CLI fragments).
- [ ] llms.txt emission + test (contains all 14 URLs). Commit
      `feat: docs gates + landing links + llms.txt`.

### Task 6: Reference content — config + ticket-schema pages

**Files:** Create `docs-src/pages/config.html`, `docs-src/pages/ticket-schema.html` (intro
prose per spec page table: resolution order, hot-reload, env vars, deprecated keys, example
minimal + hosted-catalog configs w/ neutral ids; flavor selection, worker-managed fields,
additive-only promise); extend build to render lever groups + schema fields (already specced);
optional `docs-src/config/<lever>.html` extended prose for: `dataDir`, `worker.dailyBudgetUsd`,
`sandbox.*` set, `github.requireApproval`, `git.allowedRepoRoots`.

- [ ] Renderer tests (lever group HTML, schema field HTML, substitution applied to
      `model.id` description). FAIL → implement → PASS.
- [ ] Write intro fragments + the 5 extended-prose fragments; verify claims against
      `~/junco/docs/configuration.md` + `src/configLevers.ts` (read-only).
- [ ] Build; validate; eyeball both pages. Commit `docs: configuration + ticket schema`.

### Task 7: Reference content — CLI page (36 prose fragments)

**Files:** `docs-src/pages/cli.html` (intro: synopsis conventions, global flags section);
`docs-src/cli/*.html` × 36 per Data Contract + Style Contract. Examples reuse the landing's
fictional `acme/reef-api` universe. Command-specific tips as callouts here (assess-file
dedup warn, retry separator caveat, restart-not-SIGTERM, worktree-prune liveness, etc.).
May fan out drafting to parallel subagents (batches of ~6 commands) with the Style Contract
+ per-command source pointers; every draft reviewed + fact-checked inline before commit.

- [ ] Draft fragments batch-wise; after each batch run `--check` → missing-list shrinks;
      spot-verify each claim against `~/junco` docs/source.
- [ ] `--check` fully green (conditions 2–5). Build; validate; eyeball.
- [ ] Commit per batch: `docs: cli reference — <commands>`.

### Task 8: Guides (9 pages, 3 batches)

**Files:** `docs-src/pages/{how-it-works,security}.html` (batch A),
`{github-loop,tickets,assess,analyze}.html` (batch B),
`{dashboard,operations,bot-account}.html` (batch C) — content per spec page table, sources
per spec (junco `docs/*.md`), diagrams reuse landing conventions.

- [ ] Per batch: draft (subagent fan-out allowed) → inline review → fact-check → build →
      html-validate → gate-greps → commit `docs: guides — <pages>`.

### Task 9: Start here + field notes

**Files:** Rewrite `docs-src/pages/index.html` (real content: what junco is, 60-second
quickstart, docs map from nav.json descriptions, prerequisites); create
`docs-src/pages/field-notes.html` (curated tips/recipes/FAQ per spec: plan-authoring
discipline, BSD/GNU portability, provider-fault vs ticket-fault, merged≠running, metrics vs
spend, recipes: headless launchd, cron run-once, confine PR targets; FAQ from junco issue
tracker via `gh issue list -R ironforgesoftware/junco` read-only).

- [ ] Draft → review → build → validate → commit `docs: start here + field notes`.

### Task 10: Final polish + full gate run + screenshots (NO push)

- [ ] Search keyword boosts: add `"keywords"` to fragment metas for command aliases/label
      names; re-tune; verify top hits for 10 canonical queries.
- [ ] Run ALL README gates verbatim (banned/vendor/openai/emoji/hex/word-count/html-validate/
      `--check`) → every one green; cmap coverage check over docs glyphs.
- [ ] Screenshots: landing + `/docs/` + `/docs/cli/` at 320/768/1440, light+dark (browser
      tools); JS-off sanity pass.
- [ ] Final commit; present screenshots + gate transcript to maintainer; **hold push for
      approval** (push = deploy).

## Self-Review (run after writing, before executing)

Spec coverage ✓ (all 14 pages tasked; extractor/coverage/release flow in Tasks 1+4; gates in
Task 5; llms.txt Task 5; search Task 3; stamps Task 2; substitutions Task 1). No placeholders:
skeleton home page in Task 2 is explicitly completed by Task 9. Type consistency: slugs,
export names, and JSON shapes defined once in Data Contracts and referenced by name everywhere.
