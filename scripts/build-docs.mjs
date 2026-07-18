#!/usr/bin/env node
// build-docs.mjs — junco-site docs pipeline. Zero dependencies (node:* only).
//
// Modes:
//   --extract   snapshot junco's self-described surface into docs-src/extracted/
//   (default)   build site/docs/ from docs-src/ + snapshots        (Task 2+)
//   --check     drift + coverage gate                              (Task 4)
//   --release   per-release delta checklist                        (Task 4)
//
// Extraction runs the installed `junco` binary with cwd = this repo. Never run
// junco with cwd inside ~/junco — that checkout is a live daemon runtime and
// config resolution prefers ./config.json. `config list` always gets
// --config docs-src/blank-config.json so the maintainer's real values can
// never reach a committed snapshot.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "docs-src");
const EXTRACTED = join(SRC, "extracted");

// Commands (and flags) junco's help page carries only inline or not at all.
// Each entry is verified against junco source; drop entries as `junco
// introspect --json` (proposed follow-up) makes them self-describing.
const EXTRA_COMMANDS = [
  {
    // help line 'data [--json]' only *mentions* 'data migrate' in its
    // description; flags verified against src/cli.ts (migrate handler).
    slug: "data-migrate",
    path: "data migrate",
    synopsis: "junco data migrate [--dry-run] [--force]",
    summary:
      "Unify legacy data roots under dataDir: move the queue, normalize the state tree, rewrite config to drop legacy keys",
    flags: [
      { flag: "--dry-run", placeholder: null, description: "Print every move without touching anything" },
      { flag: "--force", placeholder: null, description: "Skip the daemon-up refusal checks" },
    ],
  },
];

export function slugify(commandPath) {
  if (commandPath === "") return "junco";
  return commandPath.replace(/\s+/g, "-");
}

export function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function applySubstitutions(text, map) {
  let out = text;
  for (const [from, to] of Object.entries(map)) out = out.replaceAll(from, to);
  return out;
}

// ---------------------------------------------------------------- help parser

function flagsFromSynopsisTokens(tokenString) {
  // Pull -f / --flag occurrences plus an attached placeholder (<...> or a bare
  // uppercase token like N). Brackets/pipes around them are usage sugar.
  const flags = [];
  const re = /(--?[a-z][a-z-]*)(?:[ =](<[^>\]]+>|[A-Z]+\b))?/g;
  for (const m of tokenString.matchAll(re)) {
    flags.push({ flag: m[1], placeholder: m[2] ?? null, description: null });
  }
  return flags;
}

function commandPathFromTokens(tokenString) {
  // Leading bare words form the command path; args/flags/pipes end it.
  const words = [];
  for (const tok of tokenString.split(/\s+/)) {
    if (/^[a-z][a-z-]*$/.test(tok)) words.push(tok);
    else break;
  }
  return words.join(" ");
}

function makeCommand(tokenString, summary) {
  const path = commandPathFromTokens(tokenString);
  return {
    slug: slugify(path),
    path,
    synopsis: `junco ${tokenString}`.trim(),
    summary,
    flags: flagsFromSynopsisTokens(tokenString.slice(path.length)),
  };
}

function expandCompound(tokenString, summary) {
  // Two shapes shipped in junco 0.8.0's help; anything new lands as a plain
  // (possibly wrong) single command and gets caught by snapshot review + the
  // coverage gate.
  const configMatch = tokenString.match(/^(config) (\S.*)$/);
  if (configMatch && configMatch[2].includes("|")) {
    return configMatch[2].split("|").map((seg) => makeCommand(`config ${seg.trim()}`, summary));
  }
  if (tokenString.includes(" | ")) {
    const segs = tokenString.split(" | ").map((s) => s.trim());
    // Only a command compound when every segment starts with a bare word —
    // 'assess file <id> --all | --only <fp,...>' pipes flag alternatives.
    if (segs.every((s) => /^[a-z]/.test(s))) {
      // 'a / b'-shaped summaries pair off with the segments when counts match.
      const parts = summary.split(" / ");
      return segs.map((seg, i) =>
        makeCommand(seg, parts.length === segs.length ? parts[i] : summary)
      );
    }
  }
  return [makeCommand(tokenString, summary)];
}

export function parseHelp(text) {
  const lines = text.split("\n");
  const commands = [];
  const globalFlags = [];
  let section = null; // 'subcommands' | 'launcher' | 'options'
  let launcherLines = [];

  for (const line of lines) {
    if (/^Subcommands:/.test(line)) { section = "subcommands"; continue; }
    if (/^\s+\(no subcommand\)/.test(line)) { section = "launcher"; launcherLines.push(line); continue; }
    if (/^Options:/.test(line)) { section = "options"; continue; }

    if (section === "subcommands" && /^\s{2}\S/.test(line)) {
      const m =
        line.trim().match(/^(\S.*?)\s{2,}(.*)$/) ??
        // fallback for single-space separators ('submit <file|-> Submit a…'):
        // the description is taken to start at the first capitalized word
        line.trim().match(/^([a-z][^A-Z]*?) ([A-Z].*)$/);
      if (m) commands.push(...expandCompound(m[1].trim(), m[2]));
      else if (commands.length) {
        // continuation line indented like a name but with no 2-space split
        commands[commands.length - 1].summary += ` ${line.trim()}`;
      }
    } else if (section === "subcommands" && /^\s{4,}\S/.test(line) && commands.length) {
      commands[commands.length - 1].summary += ` ${line.trim()}`;
    } else if (section === "launcher" && /^\s+\S/.test(line)) {
      launcherLines.push(line);
    } else if (section === "options" && /^\s{2}-/.test(line)) {
      const m = line
        .trim()
        .match(/^(--?[a-z-]+)(?:, (-[a-z]))?(?: (<[^>]+>))?\s{2,}(.*)$/);
      if (!m) continue;
      let description = m[4];
      let scope = null;
      const scoped = description.match(/^\(([a-z-]+)\) (.*)$/);
      if (scoped) { scope = scoped[1]; description = scoped[2]; }
      globalFlags.push({
        flag: m[1],
        alias: m[2] ?? null,
        placeholder: m[3] ?? null,
        scope,
        description,
        default: null,
      });
    } else if (section === "options" && /^\s+\[default: /.test(line) && globalFlags.length) {
      globalFlags[globalFlags.length - 1].default = line.trim().replace(/^\[default: (.*)\]$/, "$1");
    }
  }

  const launcherText = launcherLines
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/^\s*\(no subcommand\) → /, "")
    .trim();
  commands.push({ slug: "junco", path: "", synopsis: "junco", summary: launcherText, flags: [] });

  return { commands, globalFlags };
}

// --------------------------------------------------------- config-list parser

export function parseConfigList(text) {
  const levers = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const [path, rest] = line.split("\t");
    if (!rest || !rest.startsWith("= ")) continue;
    const defIdx = rest.indexOf(" (default ");
    const tail = rest.slice(defIdx + " (default ".length);
    const endIdx = tail.indexOf(") [");
    const def = tail.slice(0, endIdx);
    const afterBracket = tail.slice(endIdx + ") [".length);
    const closeIdx = afterBracket.indexOf("]");
    const typeStr = afterBracket.slice(0, closeIdx);
    const description = afterBracket.slice(closeIdx + 1).trim();

    const typeParts = typeStr.split(",").map((s) => s.trim());
    const head = typeParts[0];
    const lever = { path, type: head, markers: typeParts.slice(1), default: def, description };
    if (head.includes("|")) {
      lever.type = "enum";
      lever.enumValues = head.split("|");
    }
    levers.push(lever);
  }
  return { levers };
}

// ------------------------------------------------- reload-kind enrichment map

export function parseLeverReloads(tsSource) {
  // Linear scan: `path:` sets the cursor, `reload:` assigns to it. Immune to
  // nested braces in defaults (e.g. `default: {}`).
  const map = {};
  let current = null;
  for (const line of tsSource.split("\n")) {
    const p = line.match(/^\s*path:\s*"([^"]+)"/);
    if (p) { current = p[1]; continue; }
    const r = line.match(/^\s*reload:\s*"(live|restart)"/);
    if (r && current) { map[current] = r[1]; current = null; }
  }
  return map;
}

// ------------------------------------------------------------------- extract

function runJunco(args, extra = {}) {
  const res = spawnSync("junco", args, { cwd: ROOT, encoding: "utf8", ...extra });
  if (res.status !== 0) {
    throw new Error(`junco ${args.join(" ")} exited ${res.status}: ${res.stderr}`);
  }
  return res.stdout;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function extract() {
  mkdirSync(EXTRACTED, { recursive: true });

  const version = runJunco(["--version"]).trim();
  const surface = parseHelp(runJunco(["--help"]));
  surface.commands.push(...EXTRA_COMMANDS);
  surface.commands.sort((a, b) => a.slug.localeCompare(b.slug));

  const levers = parseConfigList(
    runJunco(["--config", join(SRC, "blank-config.json"), "config", "list"])
  );
  const reloadsPath = join(homedir(), "junco", "src", "configLevers.ts");
  if (existsSync(reloadsPath)) {
    const reloads = parseLeverReloads(readFileSync(reloadsPath, "utf8"));
    for (const lever of levers.levers) lever.reload = reloads[lever.path] ?? null;
  }

  const schema = JSON.parse(runJunco(["schema"]));

  writeJson(join(EXTRACTED, "meta.json"), { juncoVersion: version });
  writeJson(join(EXTRACTED, "surface.json"), surface);
  writeJson(join(EXTRACTED, "levers.json"), levers);
  writeJson(join(EXTRACTED, "ticket-schema.json"), schema);
  console.log(
    `extracted junco ${version}: ${surface.commands.length} commands, ` +
      `${levers.levers.length} levers, ${Object.keys(schema.properties).length} schema fields`
  );
}

// ----------------------------------------------------------- fragments/pages

export function parseFragment(text) {
  const m = text.match(/^<!--meta (\{[\s\S]*?\}) -->\r?\n([\s\S]*)$/);
  if (!m) throw new Error("fragment must start with a meta comment: <!--meta {…} -->");
  return { meta: JSON.parse(m[1]), body: m[2] };
}

function pageUrl(slug) {
  return slug === "index" ? "/docs/" : `/docs/${slug}/`;
}

function renderNav(nav, navLabels, currentSlug) {
  const groups = nav.groups
    .map((group) => {
      const links = group.slugs
        .filter((slug) => navLabels[slug]) // pages not yet built stay absent — never dead links
        .map((slug) => {
          const current = slug === currentSlug ? 'aria-current="page" ' : "";
          return `        <li><a ${current}href="${pageUrl(slug)}">${escapeHtml(navLabels[slug])}</a></li>`;
        })
        .join("\n");
      if (!links) return null;
      return `      <section>\n        <p class="group">${escapeHtml(group.label)}</p>\n        <ul>\n${links}\n        </ul>\n      </section>`;
    })
    .filter(Boolean)
    .join("\n");
  return groups;
}

// Same FOUC-free theme init the landing page inlines.
const THEME_SNIPPET = `      (function () {
        var t = localStorage.getItem("theme");
        if (t) document.documentElement.setAttribute("data-theme", t);
        document.documentElement.classList.add("js");
      })();`;

export function renderPage({ meta, body, nav, navLabels, juncoVersion }) {
  const url = pageUrl(meta.slug);
  const title = `${meta.title} — junco docs`;
  const sourceBit = meta.source
    ? ` · source: <a href="https://github.com/ironforgesoftware/junco/blob/main/${escapeHtml(meta.source)}">${escapeHtml(meta.source)}</a>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(meta.description)}">
    <link rel="canonical" href="https://junco.ironforgesoftware.com${url}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(meta.description)}">
    <meta property="og:url" content="https://junco.ironforgesoftware.com${url}">
    <meta property="og:type" content="website">
    <meta property="og:image" content="https://junco.ironforgesoftware.com/assets/og-image.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f2f4f5">
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#14171d">
    <meta name="color-scheme" content="light dark">
    <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
    <link rel="preload" as="font" type="font/woff2" href="/assets/fonts/CommitMono-400.woff2" crossorigin>
    <link rel="preload" as="font" type="font/woff2" href="/assets/fonts/CommitMono-700.woff2" crossorigin>
    <link rel="stylesheet" href="/styles.css">
    <link rel="stylesheet" href="/docs/docs.css">
    <script>
${THEME_SNIPPET}
    </script>
  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>

    <header class="wrap-docs bar">
      <a class="wordmark" href="/"
        ><svg class="mark" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
          <circle fill="currentColor" cx="13" cy="16" r="12"></circle>
          <path fill="var(--accent)" d="M21 10 L32 16 L21 22 Z"></path></svg
        >junco</a
      >
      <div class="search" role="search">
        <input id="docs-search" type="search" placeholder="search docs" autocomplete="off"
          role="combobox" aria-expanded="false" aria-controls="search-results"
          aria-autocomplete="list" aria-label="Search docs">
        <!-- [html-validate-disable-next prefer-native-element: ARIA combobox popup; a native select cannot host result links] -->
        <ul id="search-results" role="listbox" aria-label="Search results" hidden></ul>
      </div>
      <nav aria-label="Site">
        <a href="/docs/" aria-current="${meta.slug === "index" ? "page" : "true"}">docs</a>
        <a href="https://github.com/ironforgesoftware/junco">GitHub</a>
        <a href="https://www.npmjs.com/package/@ironforgesoftware/junco">npm</a>
        <button id="theme-toggle" type="button" aria-pressed="false">dark</button>
      </nav>
    </header>

    <div class="wrap-docs docs-grid">
      <details class="side" open>
        <summary>contents</summary>
        <nav aria-label="Docs">
${renderNav(nav, navLabels, meta.slug)}
        </nav>
      </details>
      <main id="main">
        <h1>${escapeHtml(meta.title)}</h1>
${body.trimEnd()}
      </main>
    </div>

    <footer class="wrap-docs foot">
      <p>
        <a href="https://github.com/ironforgesoftware/junco/blob/main/LICENSE">MIT</a> ·
        <a href="https://github.com/ironforgesoftware/junco">GitHub</a> ·
        <a href="https://www.npmjs.com/package/@ironforgesoftware/junco">npm</a> ·
        <a href="https://github.com/ironforgesoftware/junco/blob/main/CHANGELOG.md">changelog</a>
      </p>
      <p class="stamp">
        verified against junco ${escapeHtml(juncoVersion)}${sourceBit} ·
        <a href="https://github.com/ironforgesoftware/junco-site/edit/main/docs-src/pages/${escapeHtml(meta.slug)}.html">edit this page</a>
      </p>
    </footer>

    <script type="module" src="/docs/docs.js"></script>
  </body>
</html>
`;
}

// Per-slug generated content appended after the fragment body (Tasks 6–7).
const GENERATORS = {};

export function loadDocsSource() {
  const nav = JSON.parse(readFileSync(join(SRC, "nav.json"), "utf8"));
  const meta = JSON.parse(readFileSync(join(EXTRACTED, "meta.json"), "utf8"));
  const subs = JSON.parse(readFileSync(join(SRC, "render-substitutions.json"), "utf8"));
  const pages = [];
  for (const group of nav.groups) {
    for (const slug of group.slugs) {
      const path = join(SRC, "pages", `${slug}.html`);
      if (!existsSync(path)) continue;
      pages.push(parseFragment(readFileSync(path, "utf8")));
    }
  }
  return { nav, meta, subs, pages };
}

export function buildPages(outRoot) {
  const { nav, meta, subs, pages } = loadDocsSource();
  const navLabels = Object.fromEntries(pages.map((p) => [p.meta.slug, p.meta.navLabel]));
  const written = [];
  for (const page of pages) {
    let body = page.body;
    if (GENERATORS[page.meta.slug]) body += GENERATORS[page.meta.slug]({ subs });
    const html = renderPage({
      meta: page.meta,
      body,
      nav,
      navLabels,
      juncoVersion: meta.juncoVersion,
    });
    const outPath =
      page.meta.slug === "index"
        ? join(outRoot, "index.html")
        : join(outRoot, page.meta.slug, "index.html");
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html);
    written.push(outPath);
  }
  return written;
}

// ----------------------------------------------------------------------- cli

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  const mode = process.argv[2] ?? "build";
  if (mode === "--extract") extract();
  else if (mode === "build") {
    const written = buildPages(join(ROOT, "site", "docs"));
    console.log(`built ${written.length} page(s)`);
  }
  else if (mode === "--check") { console.error("--check: not implemented yet (Task 4)"); process.exit(1); }
  else if (mode === "--release") { console.error("--release: not implemented yet (Task 4)"); process.exit(1); }
  else { console.error(`unknown mode: ${mode}`); process.exit(2); }
}
