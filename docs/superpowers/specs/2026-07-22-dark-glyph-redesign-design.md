# junco-site dark redesign — glyph matrix, dark-only, naturalist mascot

**Date:** 2026-07-22
**Status:** approved (design), pending implementation
**Decisions made with user:** dense magicui-faithful matrix (full page, ruled grid removed) · light mode removed entirely · mascot direction C, "naturalist plate"

## Goal

Modernize the site's look with three coordinated changes, without breaking any content
gate or adding a build step:

1. A full-viewport animated glyph-matrix background, adapted from
   magicui's `glyph-matrix` component to this site's vanilla-HTML/CSS/JS architecture.
2. Dark mode only — all light-theme machinery removed.
3. A lifelike dark-eyed junco mascot ("naturalist plate" style) replacing the current
   geometric circle-bird, drawn from the reference photo's color blocking and tuned for
   the dark background.

## Non-goals

- No framework, bundler, or deploy-time build step.
- No change to page copy, information architecture, or docs content.
- No mouse-reactive effects (the source component has none).

## 1 · Glyph matrix

**New file `site/glyphs.js`** (vanilla, ~60 lines, loaded with `defer` from the landing
page and every docs page via the shared head template in `scripts/build-docs.mjs`).

Behavior (faithful to the magicui component's contract):

- `<canvas>` created by the script, `position: fixed; inset: 0; z-index: -1;
  pointer-events: none`, behind all content on every page.
- Cell size 14 px; glyph pool `01·•+*/\<>=`; each cell has a 4% chance to mutate per
  90 ms tick; per-cell alpha jitter for depth.
- Font: Commit Mono (already loaded by every page).
- Bottom fade (`fadeBottom` ≈ 0.6) via CSS `mask-image` linear-gradient on the canvas —
  cheaper than repainting a gradient.
- Dirty-cell redraw only (clear + repaint mutated cells, not the whole canvas).
- `devicePixelRatio`-aware sizing; full rebuild on resize; ticking pauses while
  `document.hidden`.
- Color read at init from the `--glyph` custom property via `getComputedStyle` — the
  hex value lives only in the styles.css token block (hex gate).
- `prefers-reduced-motion: reduce` → paint one static frame, never tick.
- No JS → no canvas; page shows the flat `--bg`. The quad-ruled
  linear-gradient grid on `body` is removed everywhere (user decision: the two would
  clash).

**Token addition** in `styles.css :root`: `--glyph`, tuned barely above `--bg`
(`#14171d`) and below `--line` (`#343b48`) so dense glyphs never fight the 450 words of
text. Exact value chosen visually during implementation; it lives in the token block.

## 2 · Dark mode only

- `styles.css`: current dark values become the only `:root` tokens with
  `color-scheme: dark`; delete the light token set, the `[data-theme="dark"]` block, and
  the `@media (prefers-color-scheme: dark)` block. `@media print` block stays (print is
  monochrome-light on purpose).
- `site/index.html` and the docs head/nav template in `scripts/build-docs.mjs`:
  - remove the theme-toggle button and the inline localStorage theme script (keep the
    `.js` class add);
  - two `theme-color` metas collapse to one (`#14171d`, no `media` attr);
  - `<meta name="color-scheme">` → `dark`.
- `site/docs/docs.js`: delete the toggle wiring; keep copy buttons, anchors, search.
- Regenerate all docs pages (`node scripts/build-docs.mjs`); `--check` must pass.
- `og.html`: drop the now-meaningless `data-theme="dark"` attribute.
- `README.md`: update gate notes — hex expected only in `:root` and `@media print`
  blocks; one theme-color meta per page.
- `site/assets/favicon.svg` keeps its `prefers-color-scheme` variant: it tracks the
  browser tab bar, not the site theme, and stays legible on light tab bars.
- Word budget: removing the visible toggle label frees one word (449/450).

## 3 · Mascot — naturalist plate

Refined from the approved draft C, checked against the reference photo:

- Color blocking: dark slate hood covering head, nape, throat, upper breast with a
  rounded bib; gray mantle/wing with layered feather strokes; white belly and flanks;
  small conical bill and legs in the site's rose accent (the real bill is pink — brand
  and biology agree); dark tail with the junco's signature white outer tail feather;
  dark eye with a highlight; soft contact shadow where it perches.
- Rendering: inline SVG, radial/linear gradients for body shading. Every fill and
  gradient stop references a CSS custom property — new `--junco-*` tokens defined only
  in the `styles.css :root` token block (hex gate: site HTML stays hex-free).
- Touchpoints:
  - **Hero perch** — the detailed bird, larger than today (~180 px wide), feet on the
    spec table's top rule as now; `aria-hidden`, no words added.
  - **Header mark + favicon** — simplified flat two-tone silhouette of the same bird
    (gradients mush at 16 px); favicon.svg standalone (raw hex fine there),
    `favicon-32.png` regenerated to match.
  - **og.html** — new bird; `og-image.png` regenerated per the README recipe.

## Verification

- All README gates green locally before PR: banned words, vendor, openai, emoji, hex,
  word count (≤450), `node scripts/build-docs.mjs --check`.
- Visual pass via Playwright screenshots: landing + one docs page, desktop (1280) and
  mobile (390), checking glyph subtlety, text legibility, mascot rendering, and that
  no light-mode flash remains.
- Reduced-motion and no-JS spot checks (static frame / flat background).
- PR to `main` through the quality-gate workflow, per the standing dev loop.

## Files touched

`site/glyphs.js` (new) · `site/styles.css` · `site/index.html` ·
`site/docs/docs.js` · `scripts/build-docs.mjs` · regenerated `site/docs/**/index.html` ·
`site/assets/favicon.svg` · `site/assets/favicon-32.png` · `og.html` ·
`site/assets/og-image.png` · `README.md`
