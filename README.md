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
  --unicodes="U+0020-007E,U+00A0-00FF,U+2010-2027,U+2030-203A,U+2044,U+20AC,U+2190-2199,U+21D2,U+2500-257F,U+2580-259F,U+25A0-25CF,U+2713,U+2717"
```

Keep `site/assets/fonts/OFL.txt` next to the woff2 files — the license travels with the font.

**og-image** — `og.html` at the repo root is the source. Serve the repo root and screenshot at
1200×630:

```bash
python3 -m http.server 8000
npx -y playwright screenshot --viewport-size=1200,630 \
  http://localhost:8000/og.html site/assets/og-image.png
```

## DNS

`junco.ironforgesoftware.com` is a Cloudflare CNAME → `ironforgesoftware.github.io`,
**DNS-only (grey cloud)** — GitHub provisions and renews the TLS certificate, and proxying
breaks issuance. The custom domain itself is configured in the repo's Pages settings, not in
a CNAME file.
