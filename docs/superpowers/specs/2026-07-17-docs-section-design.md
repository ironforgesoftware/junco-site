# junco-site v3 — developer documentation section

**Date:** 2026-07-17 · **Status:** PROPOSED — awaiting maintainer review (drafted autonomously;
every decision below is an assumption until confirmed, flagged in "Open questions")

## Goal

Add a documentation section to junco.ironforgesoftware.com: searchable, every junco command and
config lever explained, with tips and worked examples. Same repo, same "Snowbird Spec Sheet"
design system, same deploy (Pages Actions publishes `site/` verbatim on push to main). The
landing page stays the landing page; docs live under `/docs/`.

## Research inputs (summarized)

- **IA**: successful small CLI tools converge on **Getting started / Guides / Reference /
  FAQ-or-Tips** nav (atuin, jj, gh) — Diátaxis-informed, never Diátaxis-labeled. Diátaxis's own
  guidance: use as a lens, not a blueprint; don't scaffold empty quadrants.
- **Reference anatomy** (gh CLI, clig.dev, Google style): synopsis → description → flags table
  (short+long, `<placeholder>`, default) → examples first-class (2–4 per command) → see-also.
  Examples are the most-used part of CLI docs; lead with them.
- **Search**: Pagefind is the standard for post-hoc static-HTML indexing but wants a CI build
  step (or binary-ish committed bundles); **MiniSearch** (~6 kB gzip, what VitePress uses) with a
  prebuilt JSON index is the proven zero-framework alternative at ≤ ~100 pages.
- **Frameworks**: a custom design is the worst case for Docusaurus/Starlight theming (two visual
  systems, toolchain lock-in). Hand-rolling stays rational at tens of pages **if** chrome
  duplication is tamed before ~page 5.
- **Tips**: command-specific gotchas belong as callouts on that command's section (3–5 per page
  max); cross-cutting recipes get a cookbook page; FAQs only from real recurring questions.
- **Audience extra**: junco's users are agent-drivers — ship `llms.txt` (Bun precedent).

## Approaches considered

**A. Pure hand-rolled pages, zero tooling.** Each docs page is a complete HTML file; nav/header/
footer duplicated per page; search hand-written over a hand-maintained JSON index.
*Pro:* maximum craft, zero new machinery. *Con:* ~14 pages × duplicated chrome — every nav edit
is a 14-file mechanical change; a hand-maintained search index goes stale silently; hand-rolled
relevance ranking is the weakest part of the result.

**B. Committed-output stitcher + vendored MiniSearch (RECOMMENDED).** Docs content authored as
HTML *body fragments* in `docs-src/`; a dependency-free Node script (`scripts/build-docs.mjs`,
`node:fs` + string templates only) wraps them in shared chrome and emits complete pages into
`site/docs/`, plus a serialized MiniSearch index. **Output is committed**; a `--check` mode
becomes a content gate (rebuild → byte-compare → fail on drift).
*Pro:* deploy invariant intact ("everything that deploys lives in `site/`", Pages workflow
untouched, `python3 -m http.server` preview works fully, search included); chrome edited once;
search index can never drift from content; zero npm dependencies (MiniSearch vendored as one
MIT-licensed file, license kept beside it — same pattern as the font's OFL.txt).
*Con:* a bespoke ~150-line generator to maintain; authoring moves one step away from the
deployed file.

**C. Docs framework (Astro Starlight / VitePress) in a subdir.** *Pro:* markdown authoring,
search and sidebar for free. *Con:* second visual system beside the hand-rolled landing page;
re-implementing Snowbird Spec Sheet inside a theme API; node_modules and a real build step in a
zero-dependency repo; deploy workflow rewritten. Rejected — this repo's identity is the
hand-rolled craft, and the research says custom-design + framework is where teams report the
most regret.

**Why B over A:** the repo already generates-and-commits assets via documented recipes (og-image
screenshot, font subsetting) — a stitcher run before commit is the same pattern, not a new
philosophy. **Search variant rejected:** Pagefind-in-CI breaks the verbatim-deploy invariant and
local preview; Pagefind-committed pollutes diffs with opaque chunks.

## Decisions (each is an assumption to confirm)

1. **Approach B**: stitcher + committed output + vendored MiniSearch.
2. **Vendor gate stays absolute in docs.** Model ids appear as neutral placeholders
   (`local/my-model`, `<provider>/<model-name>`); the real catalog ids are "printed by
   `junco config list` / the setup walkthrough". No AI vendor names anywhere in `site/`.
3. **Consolidated reference pages** (man-page style, deep anchors) rather than ~36 per-command
   stub pages: one CLI page, one config page, one ticket-schema page.
4. **14 docs pages** (map below) — assess and analyze stay separate (distinct flows, better
   search hits); bot account gets its own page (meaty migration gotchas).
5. **Directory-style URLs**: `site/docs/cli/index.html` → `/docs/cli/`.
6. **Search UI is an inline dropdown**, not a modal: input in the docs header, `/` and
   Cmd/Ctrl+K focus it, arrows+enter navigate, Esc closes. Hidden when JS is off
   (`html:not(.js)` — existing pattern).
7. **Docs are exempt from the 450-word budget** (it remains landing-only); voice gates (banned
   words) and emoji/hex gates extend to docs.
8. **Content is adapted, not copied**, from junco's own `docs/*.md` + source, and every page
   carries a "verified against junco v0.8.0 · source: docs/<file>.md" footer stamp with an
   edit link into the junco repo.

## URL & file map

```
site/
  index.html                 ← +"docs" link in header nav and footer (447→449 words, ≤450 ✓)
  docs/
    index.html               /docs/          Start here + 60-second quickstart + docs map
    how-it-works/            /docs/how-it-works/
    github-loop/             /docs/github-loop/
    tickets/                 /docs/tickets/
    assess/                  /docs/assess/
    analyze/                 /docs/analyze/
    dashboard/               /docs/dashboard/
    operations/              /docs/operations/
    security/                /docs/security/
    bot-account/             /docs/bot-account/
    cli/                     /docs/cli/      every command
    config/                  /docs/config/   every lever
    ticket-schema/           /docs/ticket-schema/
    field-notes/             /docs/field-notes/  tips, recipes, FAQ
    docs.css                 layout + components; NO hex (tokens via var() only)
    docs.js                  theme toggle + copy + search + anchor links (one shared file)
    search-index.json        generated, committed
    assets/minisearch.js     vendored, MIT license header kept
  llms.txt                   machine-readable docs index
docs-src/                    body fragments + page metadata (authoring source)
scripts/build-docs.mjs       stitcher + indexer, zero deps; --check mode for gates
```

Nav groups (sidebar order): **start** — Start here · How junco works · Security model;
**guides** — The GitHub loop · Tickets & the inbox · Assess · Analyze · The dashboard ·
Operations · Bot account; **reference** — CLI · Configuration · Ticket schema;
**field notes** — Tips, recipes & FAQ.

## Page-by-page content spec

Sources are junco-repo files, verified at v0.8.0. "Every function" is delivered by the three
reference pages; guides carry workflows; tips ride as callouts + the field-notes page.

| Page | Content | Primary sources |
|---|---|---|
| Start here (`/docs/`) | What junco is (2–3 sentences); 60-second quickstart (`npx @ironforgesoftware/junco` → walkthrough → label an issue or `junco submit`); docs map with one-line page descriptions; runtime prerequisites | README.md, wizard/flow.ts |
| How junco works | The queue (inbox→processing→done/failed, atomic claim, requeue+backoff); ticket flavors (PR / Q&A / assess / analyze); worktree isolation; run→verify→critic pipeline; loop guards & supervisor (nudge→escalate→kill); plan-lint; provider gate states; spend ledger; data root tree; offline outbox. Reuse landing-page pipeline diagram conventions | ARCHITECTURE.md, docs/tickets.md, docs/operations.md |
| The GitHub loop | Label→plan→approve→PR two-hop flow; full lifecycle-label table (`junco` · `junco:planning` · `plan-ready` · `approved` · `queued` · `working` · `done` · `failed` · `denied` · `ask`); approval trust rules (write access, postdates plan, fails closed); editing the plan comment; re-planning; `junco:ask` Q&A; fork-PR for unowned repos (`junco dispatch`, `push_remote: fork`, `amends_pr`); offline outbox behavior | docs/github-mode.md, githubInbox.ts |
| Tickets & the inbox | Authoring a ticket (frontmatter + plan body); the four flavors and how they're selected; the canonical plan shape (Scope tiers, Files table, Steps-end-in-commits, Verification block, strict Notes block); plan-lint rules and why each exists; `submit` / `retry` / `rm` / `list`; shipped templates & examples (incl. Obsidian Templater variants); WARNING callouts: no `cd` in Verification, portable commands, verbatim Notes block | docs/tickets.md, examples/, templates/, skills/junco-dispatch/ |
| Assess | Two-phase flow (park → human confirms `assess file`); `review` / `file --all|--only`; fingerprint dedup semantics; `--auto-plan` preconditions; issue format; WARNING callout: closed finding suppresses that fingerprint forever (and the recovery: delete issue or strip marker) | docs/assess.md |
| Analyze | Investigate → park draft → `review` / `edit` / `post [--no-footer]`; sanitization; one-draft-per-issue; etiquette on repos you don't own | docs/analyze.md |
| The dashboard | Both modes (GITHUB/LOCAL); every pane and key; command palette (`:` runs the real CLI); mouse support; first-run walkthrough chapters; adding repos with `w` vs config | docs/dashboard.md |
| Operations | Daemon lifecycle (`start`/`run-once`/`restart`/`update`; lock semantics; Ctrl-C once/twice/thrice); `service --platform` install for launchd/systemd (drain-aware stop timeouts); `logs`/`status`/`list`; health endpoints (`/live` `/ready` `/health`) + loopback warning; provider-gate state table; spend & `dailyBudgetUsd`; update awareness; data root, `data` / `data migrate` (+ `--dry-run`/`--force`); recovery playbook (stuck processing, retry, outbox flush) | docs/operations.md, docs/configuration.md |
| Security model | The inbox as a code-execution boundary; sandbox (Seatbelt/bwrap, fails closed, per-ticket `network` opt-in); `git.allowedRepoRoots` containment; approval gate rationale (`requireApproval:false` warning); untrusted issue text; what leaves the machine and what never does | docs/operations.md security section, README |
| Bot account | Why (attribution, dispatcher≠approver); `auth login` device flow; `auth grant`; doctor checks; SSO/SAML caveat; migration gotchas (duplicate first comments, stale fork remotes, auto-onboarding via push access) | docs/bot-account.md |
| CLI reference | **Every command and subcommand** (36 sections at v0.8.0, counting the bare `junco` launcher), one section each, gh-style anatomy: synopsis → description (incl. side effects) → flags table → 2–4 examples → see-also. Global flags (`--config`, `--help`, `--version`) in a head section. Deprecations noted (`junco init` removed → `dashboard`/`config init`) | cli.ts, README table, docs/operations.md |
| Configuration | Every lever, grouped by section exactly as `configLevers.ts`: name · type · default · live/restart · one-line effect. Env vars (`JUNCO_LOG_JSON`, `GH_CONFIG_DIR`, `$EDITOR`…); config resolution order; hot-reload semantics; deprecated path keys + migration pointer; example minimal + hosted-catalog configs (neutral model ids) | configLevers.ts, docs/configuration.md |
| Ticket schema | Frontmatter contract field-by-field (mirrors `junco schema`): type, required/optional, default, which flavor uses it; worker-managed vs author-settable fields; additive-only stability promise | ticketSchema.ts, docs/tickets.md |
| Field notes | Curated cross-cutting tips in field-guide voice: plan-authoring discipline (anti-loop phrases to avoid); BSD/GNU portability; retry-separator caveat; provider-fault vs ticket-fault retries; `restart` not SIGTERM; merged≠running; metrics vs spend divergence; recipe blocks ("run headless under launchd", "cron a run-once sweep", "confine PR targets"); FAQ seeded from junco's issue tracker | inventory §9, docs/*, issue tracker |

## Layout & design

- **Chrome**: same header bar as landing (wordmark links to `/`, GitHub, npm, theme toggle) plus
  the search input. Footer identical to landing plus per-page stamp: `verified against junco
  v0.8.0 · source: docs/github-mode.md · edit this page`.
- **Docs grid**: wrap widens to sidebar `24ch` + content `≤84ch`. Sidebar is static HTML per
  page (generator-stamped `aria-current="page"`), sticky on desktop; on `<720px` it collapses
  into a `<details><summary>docs</summary>` disclosure — works without JS.
- **Components** (docs.css, tokens only — hex gate untouched):
  - *Flags table*: `<dl>` spec-sheet styling reused from the landing's `.spec` (14ch term
    column) — flags as `dt`, effect+default as `dd`. On-brand and mobile-safe.
  - *Callouts*: bordered aside, text label `note —` / `warning —` (small-caps muted for note,
    accent for warning). No icons, no emoji. Budget: ≤5 per page.
  - *Heading anchors*: hover `#` permalink on every `h2`/`h3` (docs.js, absent without JS).
  - *Copy buttons* on code blocks, existing `.copy` pattern; copyable text never includes `$ `.
  - *Synopsis line*: `pre.synopsis` — command bold-ink, placeholders muted, per Google style
    (`<required>` `[optional]`).
- **Typography/rhythm**: Commit Mono, 1.5rem grid, quad-rule background — unchanged. New glyphs
  must pass the cmap coverage check against the shipped subset (recipe in README; extend subset
  only if a page truly needs a new glyph).
- **Theme**: same tokens, same inline head snippet (FOUC-free), same toggle behavior via
  docs.js.
- **Meta**: each page gets title (`<topic> — junco docs`), description, canonical; og:image
  reused sitewide.

## Search spec

- **Index** (`search-index.json`, generated): one document per `h2`/`h3` section across all docs
  pages — fields: page title, section heading, URL+anchor, body text, keywords (frontmatter-
  supplied, e.g. command names and flag strings boosted).
- **Engine**: vendored MiniSearch; prefix + fuzzy(0.2); boost heading ≫ keywords > body.
- **UI**: header input; results dropdown listing `page · section` with a one-line snippet;
  keyboard `/` and Cmd/Ctrl+K focus, ↑/↓ + Enter, Esc; `⌘K` hint rendered in the input;
  ARIA combobox/listbox semantics; index fetched lazily on first focus (~tens of kB).
- **No JS**: input hidden (`html:not(.js)`); the docs-map page and sidebar remain the fallback
  navigation.

## llms.txt

`site/llms.txt`: one-line project description + the docs URL list with per-page one-liners.
Serves agent consumers cheaply; no per-page `.md` endpoints for now (the committed HTML is
clean enough to parse, and junco's own repo docs remain the markdown source).

## Gates & workflow changes (README "Content gates" section updated to match)

1. Banned-words + vendor + openai greps: already recursive over `site/` — now genuinely load-
   bearing for docs; no script change.
2. Emoji + hex gates: file lists extended to glob `site/docs/**/*.html` and `site/docs/docs.css`
   (hex expected ONLY in styles.css token blocks, as today).
3. Word budget: unchanged, landing-only. Landing goes 447→449 with the two "docs" links.
4. `npx html-validate 'site/**/*.html'` — all pages, 0 errors.
5. **New**: `node scripts/build-docs.mjs --check` — regenerates chrome + search index to temp
   and byte-compares; fails on drift (stale index or hand-edited output).
6. **New**: cmap coverage check over docs pages' glyphs (existing recipe).
7. Screenshot pass for a docs page and the landing at 320/768/1440, light+dark, before push.

## Accuracy & maintenance ritual

- Every factual claim traces to a junco-repo file; specs in `docs-src/` carry `source:`
  metadata that renders into the page footer stamp.
- Per junco release: CHANGELOG-driven delta pass over affected pages, bump every "verified
  against" stamp, re-run gates, push once. (Same ritual the landing already follows per
  release — v0.7.0/v0.8.0 precedent.)
- The junco repo's `docs/*.md` remain the working source of truth; the site is the curated,
  designed presentation. No junco-repo changes in this project.

## Phased implementation outline (full task plan follows approval, via writing-plans)

1. **Scaffold**: `build-docs.mjs`, docs.css/docs.js, chrome template, `/docs/` home +
   quickstart, landing nav/footer links, gates extended, README updated. *Deployable alone.*
2. **Reference core**: CLI, Configuration, Ticket schema — the "every function" payload.
3. **Guides**: how-it-works, github-loop, tickets, assess, analyze, dashboard, operations,
   security, bot-account.
4. **Field notes + search polish + llms.txt**: tips/recipes/FAQ, search tuning, final gate run,
   screenshots, single push (one deploy).

Phases 1+2 constitute a useful minimum; 3+4 can land in subsequent pushes without breaking nav
(sidebar ships complete only once all pages exist — until then, unbuilt pages are simply absent
from the sidebar, never dead links).

## Out of scope

Any junco-repo changes (including linking the site from junco's README — worthwhile, separate).
Versioned docs (`latest`/`vX`) — revisit at 1.0. Per-page `.md` endpoints. Docs i18n.
Analytics. Comments/feedback widgets.

## Open questions for the maintainer

1. Approach B (committed-output stitcher + vendored MiniSearch) over pure hand-rolling (A) or
   Pagefind — acceptable machinery for this repo?
2. Vendor gate held absolute in docs (neutral `<provider>/<model-name>` placeholders) — or
   carve a documented exception for factual model-id examples?
3. Page granularity: 14 pages as mapped, or merge assess+analyze / fold bot-account into
   security?
4. Sidebar "field notes" naming (on-theme) vs a plainer "tips & FAQ"?
5. Landing spec-sheet `<dl>`: add a `docs` row pointing at `/docs/` (free — `<dl>` is excluded
   from the word count), or keep discovery to nav+footer links?
