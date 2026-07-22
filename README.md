# junco-site

The site for [junco](https://github.com/ironforgesoftware/junco), served at
[junco.ironforgesoftware.com](https://junco.ironforgesoftware.com): a one-page landing plus
the `/docs/` section.

Static folder, no build step at deploy time. Everything that deploys lives in `site/`; the
GitHub Pages workflow (`.github/workflows/pages.yml`) publishes it verbatim on every push to
`main`. Docs pages are generated locally by `scripts/build-docs.mjs` and committed (see
"Docs authoring" below) — the same generate-and-commit pattern as the og-image and fonts.

## Local preview

```bash
python3 -m http.server 8000 -d site
# → http://localhost:8000
```

## Regenerating assets

**Fonts** — Commit Mono (SIL OFL 1.1), subset to woff2. To regenerate:

```bash
gh release download -R eigilnikolajsen/commit-mono --pattern '*.zip'
# unzip, then for each weight (400, 700):
uvx --from "fonttools[woff]" --with brotli pyftsubset CommitMono-400-Regular.otf \
  --output-file=site/assets/fonts/CommitMono-400.woff2 --flavor=woff2 \
  --layout-features="kern,calt" \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2010-2027,U+2030-203A,U+2044,U+20AC,U+2190-2199,U+21D2,U+2500-257F,U+2580-259F,U+25A0-25FF,U+2713,U+2717"
```

Keep `site/assets/fonts/OFL.txt` next to the woff2 files — the license travels with the font.

**og-image** — `og.html` at the repo root is the source. Serve the repo root and screenshot at
1200×630:

```bash
python3 -m http.server 8000
npx -y playwright screenshot --viewport-size=1200,630 \
  http://localhost:8000/og.html site/assets/og-image.png
```

## Content gates

`main` is PR-only (repository ruleset "main quality gate", same shape as junco's): work lands
on a branch, the `quality-gate` workflow re-runs these gates on the PR, and merging deploys.
Run all of these locally before opening the PR; every one must pass. The word budget is **450** visible words.
README.md is excluded from the greps — it quotes the gate patterns themselves; keep its prose
clean by eye.

Grep gates (banned words, vendors, openai):

```bash
cd /Users/alxedelweiss/junco-site
grep -rniE 'blazing|seamless|revolutionary|supercharge|magical|\beasy\b|\bsimply\b|powerful' site/ og.html; echo "banned-words exit: $?"   # expected: 1 (no matches)
grep -rniE 'anthropic|claude|gpt|gemini|llama|mistral|deepseek|qwen|ollama|vllm|lm.?studio|mlx' site/ og.html .github/ --exclude=quality-gate.yml; echo "vendor exit: $?"  # expected: 1 (the workflow quotes the pattern)
grep -rni 'openai' site/ og.html | grep -viE 'openai-(compatible|completions)'; echo "openai exit: $?"  # expected: 1 ("openai-completions" is junco's factual model.api value)
```

Emoji and hex gates:

```bash
python3 - <<'EOF'
import re, glob
pat = re.compile('[\U0001F000-\U0001FAFF☀-➿⬀-⯿️⌚⌛⤴⤵⏩-⏺]')
allowed = set('✓✗')
files = (['site/index.html','site/styles.css','og.html',
          'site/docs/docs.css','site/docs/docs.js']
         + glob.glob('site/docs/**/index.html', recursive=True)
         + glob.glob('docs-src/**/*.html', recursive=True))
bad = []
for f in files:
    for i, line in enumerate(open(f), 1):
        bad += [(f,i,c) for c in pat.findall(line) if c not in allowed]
print(bad if bad else 'emoji gate OK'); assert not bad
EOF
grep -rn '#[0-9a-fA-F]\{3,8\}\b' site/ --include='*.html'  # expected: ONLY theme-color metas (one per page)
grep -n '#[0-9a-fA-F]\{6\}' site/styles.css       # expected: hits only inside :root and @media print blocks — verify by eye
grep -n '#[0-9a-fA-F]\{3,8\}\b' site/docs/docs.css  # expected: 1 (no matches — docs.css is var()-only)
```

Docs coverage + drift gate (fails naming names: undocumented command/flag, missing example,
orphaned prose, stale search index, stamp/version mismatch, gate violation in rendered docs):

```bash
node scripts/build-docs.mjs --check
```

Word count gate (≤450):

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

HTML validation:

```bash
npx -y html-validate 'site/**/*.html'   # 0 errors
```

## Docs authoring

The docs under `site/docs/` are generated — never edit them by hand (the drift gate will
catch it). Sources live in `docs-src/`:

- `pages/<slug>.html` — one fragment per page: a `<!--meta {…} -->` first line (title,
  description, slug, navLabel, source, optional keywords) followed by body HTML.
- `cli/<command-slug>.html` — per-command prose (description, examples in
  `<pre class="cmd">`, callouts). The coverage gate requires one per command in
  `extracted/surface.json`, each with at least one example.
- `extracted/*.json` — committed snapshots of junco's self-described surface. Regenerate
  with `node scripts/build-docs.mjs --extract` (runs the installed `junco`; informational
  commands only; `config list` reads `blank-config.json` so real settings never land in a
  snapshot).
- `render-substitutions.json` — reviewed map applied to snapshot text at render time so
  junco's own strings pass this repo's gates.

Build: `node scripts/build-docs.mjs` (writes `site/docs/`, `site/search-index.json` under
docs, and `site/llms.txt`). Verify: `--check`. Voice rules: same banned-word/vendor/emoji
gates as the landing page; examples copyable without a `$ ` prefix; warnings reserved for
fails-closed/data-loss behavior.

Per junco release: `junco update`, then `--extract` (the snapshot diff is the to-do list),
write the prose stubs `--check` lists, run `--release` for the CHANGELOG-mapping checklist,
rebuild, run all gates, push once.

## DNS

`junco.ironforgesoftware.com` is a Cloudflare CNAME → `ironforgesoftware.github.io`,
**DNS-only (grey cloud)** — GitHub provisions and renews the TLS certificate, and proxying
breaks issuance. The custom domain itself is configured in the repo's Pages settings, not in
a CNAME file.
