# junco-site

The one-page site for [junco](https://github.com/ironforgesoftware/junco), served at
[junco.ironforgesoftware.com](https://junco.ironforgesoftware.com).

Static folder, no build step. Everything that deploys lives in `site/`; the GitHub Pages
workflow (`.github/workflows/pages.yml`) publishes it on every push to `main`.

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

Run all of these before any push; every one must pass. The word budget is **450** visible words.
README.md is excluded from the greps — it quotes the gate patterns themselves; keep its prose
clean by eye.

Grep gates (banned words, vendors, openai):

```bash
cd /Users/alxedelweiss/junco-site
grep -rniE 'blazing|seamless|revolutionary|supercharge|magical|\beasy\b|\bsimply\b|powerful' site/ og.html; echo "banned-words exit: $?"   # expected: 1 (no matches)
grep -rniE 'anthropic|claude|gpt|gemini|llama|mistral|deepseek|qwen|ollama|vllm|lm.?studio|mlx' site/ og.html .github/; echo "vendor exit: $?"  # expected: 1
grep -rni 'openai' site/ og.html | grep -vi 'openai-compatible'; echo "openai exit: $?"  # expected: 1
```

Emoji and hex gates:

```bash
python3 - <<'EOF'
import re
pat = re.compile('[\U0001F000-\U0001FAFF☀-➿⬀-⯿️⌚⌛⤴⤵⏩-⏺]')
allowed = set('✓✗')
bad = []
for f in ['site/index.html','site/styles.css','og.html']:
    for i, line in enumerate(open(f), 1):
        bad += [(f,i,c) for c in pat.findall(line) if c not in allowed]
print(bad if bad else 'emoji gate OK'); assert not bad
EOF
grep -n '#[0-9a-fA-F]\{3,8\}\b' site/index.html   # expected: ONLY the two theme-color metas
grep -n '#[0-9a-fA-F]\{6\}' site/styles.css       # expected: hits only inside :root, [data-theme=dark], the dark @media, and @media print blocks — verify by eye
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
npx -y html-validate site/index.html   # 0 errors
```

## DNS

`junco.ironforgesoftware.com` is a Cloudflare CNAME → `ironforgesoftware.github.io`,
**DNS-only (grey cloud)** — GitHub provisions and renews the TLS certificate, and proxying
breaks issuance. The custom domain itself is configured in the repo's Pages settings, not in
a CNAME file.
