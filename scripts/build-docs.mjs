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
import MiniSearch from "../site/docs/assets/minisearch.js";

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
    <meta name="theme-color" content="#14171d">
    <meta name="color-scheme" content="dark">
    <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
    <link rel="preload" as="font" type="font/woff2" href="/assets/fonts/CommitMono-400.woff2" crossorigin>
    <link rel="preload" as="font" type="font/woff2" href="/assets/fonts/CommitMono-700.woff2" crossorigin>
    <link rel="stylesheet" href="/styles.css">
    <link rel="stylesheet" href="/docs/docs.css">
    <script src="/glyphs.js" defer></script>
    <script>
      document.documentElement.classList.add("js");
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

// --------------------------------------------------------------------- search

export const SEARCH_OPTIONS = {
  fields: ["title", "heading", "text", "keywords"],
  storeFields: ["title", "heading", "url", "snippet"],
};

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ")
    .replace(/ ([.,;:)])(?=\s|$)/g, "$1")
    .trim();
}

export function extractSections(html, slug, { title, keywords = [] }) {
  const main = html.match(/<main id="main">([\s\S]*?)<\/main>/)?.[1] ?? "";
  const url = pageUrl(slug);
  const kw = keywords.join(" ");
  const parts = main.split(/(?=<h[23] id=")/);
  const sections = [];
  for (const part of parts) {
    const h = part.match(/^<h[23] id="([^"]+)">([\s\S]*?)<\/h[23]>/);
    const bodyHtml = h ? part.slice(h[0].length) : part.replace(/<h1>[\s\S]*?<\/h1>/, "");
    const text = stripTags(bodyHtml);
    if (!text) continue;
    sections.push({
      id: h ? `${slug}#${h[1]}` : slug,
      url: h ? `${url}#${h[1]}` : url,
      title,
      heading: h ? stripTags(h[2]) : null,
      text,
      snippet: text.length > 120 ? `${text.slice(0, 117)}…` : text,
      keywords: kw,
    });
  }
  return sections;
}

export function buildSearchIndexJson(sections) {
  const index = new MiniSearch(SEARCH_OPTIONS);
  index.addAll(sections);
  return JSON.stringify(index);
}

// ------------------------------------------------------- reference renderers

function subEsc(text, subs) {
  return escapeHtml(applySubstitutions(text, subs));
}

function leverTypeLabel(lever) {
  if (lever.type === "enum") return lever.enumValues.join(" | ");
  return [lever.type, ...lever.markers].join(", ");
}

export function renderConfigReference(levers, subs, extended) {
  const groups = new Map();
  for (const lever of levers.levers) {
    const group = lever.path.includes(".") ? lever.path.split(".")[0] : "top-level";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(lever);
  }
  const out = [];
  for (const [group, members] of groups) {
    out.push(`<h2 id="g-${group}">${group === "top-level" ? "top-level" : `<code>${group}.*</code>`}</h2>`);
    if (extended.has(group)) out.push(extended.get(group));
    let open = false;
    for (const lever of members) {
      if (!open) { out.push('<dl class="flags">'); open = true; }
      const reload = lever.reload ? ` · ${lever.reload}` : "";
      out.push(
        `  <div><dt><code>${escapeHtml(lever.path)}</code> <span class="ph">${escapeHtml(leverTypeLabel(lever))}</span></dt>` +
          `<dd>${subEsc(lever.description, subs)} <span class="default">default ${subEsc(lever.default, subs)}${reload}</span></dd></div>`
      );
      if (extended.has(lever.path)) {
        out.push("</dl>", extended.get(lever.path));
        open = false;
      }
    }
    if (open) out.push("</dl>");
  }
  return `\n${out.join("\n")}\n`;
}

export function renderSchemaReference(schema, subs) {
  const out = [];
  for (const [name, prop] of Object.entries(schema.properties)) {
    out.push(`<h3 id="f-${name}"><code>${escapeHtml(name)}</code></h3>`);
    const type = prop.enum ? prop.enum.join(" | ") : prop.type;
    out.push(`<p class="see">${escapeHtml(String(type))}</p>`);
    if (prop.description) out.push(`<p>${subEsc(prop.description, subs)}</p>`);
    if (prop.properties) {
      const rows = Object.entries(prop.properties).map(
        ([sub, sp]) =>
          `  <div><dt><code>${escapeHtml(`${name}.${sub}`)}</code> <span class="ph">${escapeHtml(
            String(sp.enum ? sp.enum.join(" | ") : sp.type)
          )}</span></dt><dd>${sp.description ? subEsc(sp.description, subs) : ""}</dd></div>`
      );
      out.push('<dl class="flags">', ...rows, "</dl>");
    }
  }
  return `\n${out.join("\n")}\n`;
}

function extendedConfigProse() {
  const dir = join(SRC, "config");
  const map = new Map();
  if (!existsSync(dir)) return map;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".html")) continue;
    // filenames use dashes for dots: worker-dailyBudgetUsd.html → worker.dailyBudgetUsd
    const key = f.replace(/\.html$/, "").replace(/-/g, ".");
    // group-level fragments have no dash ("sandbox.html" → key "sandbox")
    map.set(key, readFileSync(join(dir, f), "utf8"));
  }
  return map;
}

export function renderCliReference(surface, subs, fragments) {
  const out = [];

  out.push('<h2 id="global-flags">global flags</h2>', '<dl class="flags">');
  for (const f of surface.globalFlags) {
    const name = [f.flag, f.alias].filter(Boolean).join(", ");
    const ph = f.placeholder ? ` <span class="ph">${escapeHtml(f.placeholder)}</span>` : "";
    const scope = f.scope ? `(<code>${escapeHtml(f.scope)}</code>) ` : "";
    const def = f.default ? ` <span class="default">default ${subEsc(f.default, subs)}</span>` : "";
    out.push(
      `  <div><dt><code>${escapeHtml(name)}</code>${ph}</dt><dd>${scope}${subEsc(f.description, subs)}${def}</dd></div>`
    );
  }
  out.push("</dl>");

  // launcher first, then alphabetical by slug
  const ordered = [
    ...surface.commands.filter((c) => c.slug === "junco"),
    ...surface.commands.filter((c) => c.slug !== "junco"),
  ];
  for (const cmd of ordered) {
    const name = cmd.path === "" ? "junco" : `junco ${cmd.path}`;
    out.push(`<h2 id="${cmd.slug}"><code>${escapeHtml(name)}</code></h2>`);
    out.push(`<pre class="synopsis">${escapeHtml(cmd.synopsis)}</pre>`);
    out.push(fragments.get(cmd.slug) ?? "");
    const described = cmd.flags.filter((f) => f.description);
    if (described.length) {
      out.push('<dl class="flags">');
      for (const f of described) {
        const ph = f.placeholder ? ` <span class="ph">${escapeHtml(f.placeholder)}</span>` : "";
        out.push(
          `  <div><dt><code>${escapeHtml(f.flag)}</code>${ph}</dt><dd>${subEsc(f.description, subs)}</dd></div>`
        );
      }
      out.push("</dl>");
    }
  }
  return `\n${out.join("\n")}\n`;
}

// Per-slug generated content appended after the fragment body.
const GENERATORS = {
  index: () => {
    // The docs map, generated from nav.json + page descriptions — never drifts.
    const nav = JSON.parse(readFileSync(join(SRC, "nav.json"), "utf8"));
    const out = ['<h2 id="the-map">The map</h2>', '<dl class="flags">'];
    for (const group of nav.groups) {
      for (const slug of group.slugs) {
        if (slug === "index") continue;
        const path = join(SRC, "pages", `${slug}.html`);
        if (!existsSync(path)) continue;
        const { meta } = parseFragment(readFileSync(path, "utf8"));
        out.push(
          `  <div><dt><a href="${pageUrl(slug)}">${escapeHtml(meta.navLabel)}</a></dt>` +
            `<dd>${escapeHtml(meta.description)}</dd></div>`
        );
      }
    }
    out.push("</dl>");
    return `\n${out.join("\n")}\n`;
  },
  cli: ({ subs }) => {
    const surface = JSON.parse(readFileSync(join(EXTRACTED, "surface.json"), "utf8"));
    return renderCliReference(surface, subs, cliFragmentsFromDisk());
  },
  config: ({ subs }) => {
    const levers = JSON.parse(readFileSync(join(EXTRACTED, "levers.json"), "utf8"));
    return renderConfigReference(levers, subs, extendedConfigProse());
  },
  "ticket-schema": ({ subs }) => {
    const schema = JSON.parse(readFileSync(join(EXTRACTED, "ticket-schema.json"), "utf8"));
    return renderSchemaReference(schema, subs);
  },
};

// -------------------------------------------------------------- changelog page
//
// junco's CHANGELOG.md predates this repo's stack-agnostic voice rule and its
// vendor-name/banned-word/emoji content gates. It is otherwise disciplined
// Keep a Changelog markdown (## [x.y.z] - date, ### Section, - bullets), so a
// targeted converter (not a general markdown library) can render it — but the
// handful of historical entries naming a vendor, a banned word, or a glyph
// outside the emoji gate's allowlist need scrubbing first. Reviewed against
// the full CHANGELOG.md as of junco 0.9.0; extend this map if a future entry
// trips a gate (the content-gate check over the rendered page will catch a
// miss — see checkContentGates / the emoji gate in README.md).
export const CHANGELOG_SUBSTITUTIONS = {
  "anthropic/claude-sonnet-4-5": "<provider>/<model-name>",
  ANTHROPIC_API_KEY: "<PROVIDER>_API_KEY",
  "OpenAI-compatible, Anthropic, Google, Bedrock, …":
    "OpenAI-compatible or any hosted catalog provider",
  "[oMLX]": "[legacy-local]",
  "`omlx`": "`legacy-local`",
  "Claude Code skill": "coding-agent skill",
  "simply move": "move",
  "⚠": "warn:", // not in the emoji gate's ✓✗ allowlist — see README's emoji gate
};

// Substitute (vendor/banned-word/glyph scrub) → escape → inline markdown.
// Order matters: substitution values intentionally contain literal `<`/`>`
// placeholders (e.g. <provider>/<model-name>) that must run through
// escapeHtml same as everything else, so they render the same way the
// existing render-substitutions.json placeholders do on the config/CLI pages.
function changelogInline(text, subs) {
  return escapeHtml(applySubstitutions(text, subs))
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function isChangelogTableBlock(blockLines) {
  return blockLines.every((l) => l.trim().startsWith("|"));
}

function renderChangelogListItem(blocks, subs) {
  const parts = blocks.map((blockLines) => {
    if (isChangelogTableBlock(blockLines)) {
      // Verbatim, monospace — a committed one-off in the 0.8.0 entry's
      // default-paths table; escaped + substituted like everything else, but
      // not run through the bold/code/link inline transforms (redundant
      // inside a <pre> block).
      return `<pre>${escapeHtml(applySubstitutions(blockLines.join("\n"), subs))}</pre>`;
    }
    const text = changelogInline(blockLines.join(" "), subs);
    return blocks.length > 1 ? `<p>${text}</p>` : text;
  });
  return `  <li>${parts.join("")}</li>`;
}

// Targeted Keep a Changelog → HTML fragment converter. Handles exactly the
// shapes junco's CHANGELOG.md uses: `## [ver] - date` / `## [Unreleased]`
// version headers, `### Section` subheaders, and `- ` bullets (whose
// continuation lines are 2-space indented, optionally spanning blank-line-
// separated paragraphs or a raw `|`-piped table). An empty version section
// (no bullets before the next `## `) is skipped entirely — currently true of
// `## [Unreleased]` between releases.
export function convertChangelogMarkdown(markdown, subs = CHANGELOG_SUBSTITUTIONS) {
  const lines = markdown.split("\n");
  let i = 0;
  while (i < lines.length && !lines[i].startsWith("## ")) i++; // skip H1 + intro prose

  const out = [];
  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      out.push("</ul>");
      listOpen = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith("## ")) j++;
      const hasContent = lines.slice(i + 1, j).some((l) => l.trim() !== "");
      if (!hasContent) {
        i = j;
        continue;
      }
      closeList();
      const m = line.match(/^## \[([^\]]+)\](?:\s*-\s*(.+))?\s*$/);
      const bracket = m ? m[1] : line.slice(3).trim();
      const date = m ? m[2] : null;
      const verMatch = bracket.match(/^(\d+\.\d+\.\d+)/);
      // html-validate's valid-id rule rejects dots — dash-join the version.
      const id = verMatch
        ? `v${verMatch[1].replace(/\./g, "-")}`
        : bracket.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const heading = date ? `${bracket} — ${date}` : bracket;
      out.push(`<h2 id="${id}">${changelogInline(heading, subs)}</h2>`);
      i++;
      continue;
    }

    if (line.startsWith("### ")) {
      closeList();
      out.push(`<h3>${changelogInline(line.slice(4).trim(), subs)}</h3>`);
      i++;
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (/^- /.test(line)) {
      const blocks = [];
      let cur = [line.slice(2)];
      i++;
      let sawBlank = false;
      while (i < lines.length) {
        const l = lines[i];
        if (l.trim() === "") {
          sawBlank = true;
          i++;
          continue;
        }
        if (/^- /.test(l) || l.startsWith("## ") || l.startsWith("### ")) break;
        if (/^ {2}\S/.test(l)) {
          if (sawBlank) {
            blocks.push(cur);
            cur = [];
            sawBlank = false;
          }
          cur.push(l.slice(2));
          i++;
          continue;
        }
        break; // unindented, non-bullet, non-heading line — defensively end the item
      }
      blocks.push(cur);
      if (!listOpen) {
        out.push("<ul>");
        listOpen = true;
      }
      out.push(renderChangelogListItem(blocks, subs));
      continue;
    }

    i++; // stray top-level line outside any list — not part of this changelog's shape
  }
  closeList();
  return `${out.join("\n")}\n`;
}

const CHANGELOG_META = {
  title: "Changelog",
  description: "Release history for junco — every version's notable changes.",
  slug: "changelog",
  navLabel: "Changelog",
  source: "CHANGELOG.md",
  keywords: ["changelog", "release notes", "version history"],
};

const CHANGELOG_INTRO = `<p>
  Every release's notable changes, generated from junco's canonical
  <code>CHANGELOG.md</code> and refreshed by <code>node scripts/build-docs.mjs</code> on every
  build — this page cannot drift from the source of truth.
</p>
`;

// Regenerates docs-src/pages/changelog.html from junco's canonical CHANGELOG.md
// (a file read, same allowed pattern as extract()'s read of configLevers.ts —
// never runs junco with cwd inside ~/junco). Silently keeps the committed
// fragment when no sibling ~/junco checkout is present (CI has none).
export function generateChangelogPage() {
  const changelogPath = join(homedir(), "junco", "CHANGELOG.md");
  if (!existsSync(changelogPath)) return false;
  const raw = readFileSync(changelogPath, "utf8");
  const body = CHANGELOG_INTRO + convertChangelogMarkdown(raw, CHANGELOG_SUBSTITUTIONS);
  const fragment = `<!--meta ${JSON.stringify(CHANGELOG_META)} -->\n${body}`;
  writeFileSync(join(SRC, "pages", "changelog.html"), fragment);
  return true;
}

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
  generateChangelogPage(); // before loadDocsSource() reads docs-src/pages/*.html
  const { nav, meta, subs, pages } = loadDocsSource();
  const navLabels = Object.fromEntries(pages.map((p) => [p.meta.slug, p.meta.navLabel]));
  const written = [];
  const sections = [];
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
    sections.push(
      ...extractSections(html, page.meta.slug, {
        title: page.meta.title,
        keywords: page.meta.keywords ?? [],
      })
    );
  }
  const indexPath = join(outRoot, "search-index.json");
  writeFileSync(indexPath, `${buildSearchIndexJson(sections)}\n`);
  written.push(indexPath);

  // llms.txt — machine-readable docs index; deployed at the site root.
  // buildPages writes it inside outRoot; the build CLI and the drift check
  // both map "llms.txt" to site/llms.txt.
  const lines = [
    "# junco documentation",
    "",
    "> junco is a harness-agnostic task-queue worker that turns Markdown tickets and",
    "> labeled GitHub issues into draft pull requests by driving a coding agent on",
    "> your own machine, against any OpenAI-compatible inference endpoint.",
    "",
  ];
  for (const group of nav.groups) {
    const groupPages = group.slugs
      .map((slug) => pages.find((p) => p.meta.slug === slug))
      .filter(Boolean);
    if (!groupPages.length) continue;
    lines.push(`## ${group.label}`, "");
    for (const p of groupPages) {
      lines.push(
        `- [${p.meta.title}](https://junco.ironforgesoftware.com${pageUrl(p.meta.slug)}): ${p.meta.description}`
      );
    }
    lines.push("");
  }
  const llmsPath = join(outRoot, "llms.txt");
  writeFileSync(llmsPath, `${lines.join("\n").trimEnd()}\n`);
  written.push(llmsPath);
  return written;
}

// ------------------------------------------------------- check (gate) helpers

// Local echo of the README gate greps — README's documented commands remain
// the authority; keep the two in sync when either changes.
const VENDOR_RE = /anthropic|claude|gpt|gemini|llama|mistral|deepseek|qwen|ollama|vllm|lm.?studio|mlx/i;
const BANNED_RE = /blazing|seamless|revolutionary|supercharge|magical|\beasy\b|\bsimply\b|\bpowerful\b/i;
const OPENAI_RE = /openai/gi;

export function checkContentGates(text) {
  const violations = [];
  for (const line of text.split("\n")) {
    for (const v of line.matchAll(new RegExp(VENDOR_RE.source, "gi"))) {
      violations.push(`vendor "${v[0].toLowerCase()}": ${line.trim().slice(0, 80)}`);
    }
    for (const b of line.matchAll(new RegExp(BANNED_RE.source, "gi"))) {
      violations.push(`banned word "${b[0].toLowerCase()}": ${line.trim().slice(0, 80)}`);
    }
    for (const m of line.matchAll(OPENAI_RE)) {
      const ctx = line.slice(Math.max(0, m.index - 1), m.index + 19);
      // "openai-completions" is junco's factual model.api value — allowed
      // alongside "OpenAI-compatible", same as the README gate.
      if (!/openai-(compatible|completions)/i.test(ctx)) {
        violations.push(`openai outside "OpenAI-compatible": ${line.trim().slice(0, 80)}`);
      }
    }
  }
  return violations;
}

export function checkCliCoverage(surface, fragments) {
  const slugs = new Set(surface.commands.map((c) => c.slug));
  const missing = [...slugs].filter((s) => !fragments.has(s)).sort();
  const orphans = [...fragments.keys()].filter((s) => !slugs.has(s)).sort();
  const noExample = [...fragments.entries()]
    .filter(([slug, html]) => slugs.has(slug) && !html.includes('<pre class="cmd">'))
    .map(([slug]) => slug)
    .sort();
  return { missing, orphans, noExample };
}

export function checkFlagsRendered(surface, cliHtml) {
  const missing = [];
  for (const cmd of surface.commands) {
    if (!cmd.flags.length) continue;
    const start = cliHtml.indexOf(`<h2 id="${cmd.slug}">`);
    if (start === -1) continue; // absence of the section is condition 2's finding
    const next = cliHtml.indexOf("<h2 id=", start + 1);
    const section = cliHtml.slice(start, next === -1 ? undefined : next);
    for (const f of cmd.flags) {
      if (!section.includes(f.flag)) missing.push(`${cmd.path}: ${f.flag}`);
    }
  }
  return missing;
}

export function checkStamps(pagesHtml, version) {
  return [...pagesHtml.entries()]
    .filter(([, html]) => !html.includes(`verified against junco ${version}`))
    .map(([slug]) => slug)
    .sort();
}

export function checkNavBijection(navSlugs, pageSlugs) {
  const nav = new Set(navSlugs);
  const pages = new Set(pageSlugs);
  return {
    navOnly: [...nav].filter((s) => !pages.has(s)).sort(),
    pagesOnly: [...pages].filter((s) => !nav.has(s)).sort(),
  };
}

// ------------------------------------------------------------ check + release

import { readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

function listFilesRec(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listFilesRec(p));
    else out.push(p);
  }
  return out;
}

function cliFragmentsFromDisk() {
  const dir = join(SRC, "cli");
  const map = new Map();
  if (!existsSync(dir)) return map;
  for (const f of readdirSync(dir)) {
    if (f.endsWith(".html")) map.set(f.replace(/\.html$/, ""), readFileSync(join(dir, f), "utf8"));
  }
  return map;
}

export function runCheck() {
  const failures = [];
  const put = (category, items) => {
    if (items.length) failures.push([category, items]);
  };

  const surface = JSON.parse(readFileSync(join(EXTRACTED, "surface.json"), "utf8"));
  const meta = JSON.parse(readFileSync(join(EXTRACTED, "meta.json"), "utf8"));
  const nav = JSON.parse(readFileSync(join(SRC, "nav.json"), "utf8"));

  // 1 — drift: rebuild into a temp root, byte-compare against site/docs.
  const tmp = join(tmpdir(), `junco-docs-check-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const built = buildPages(tmp);
  const outRoot = join(ROOT, "site", "docs");
  const drifted = [];
  for (const b of built) {
    const rel = b.slice(tmp.length + 1);
    const committed = rel === "llms.txt" ? join(ROOT, "site", "llms.txt") : join(outRoot, rel);
    if (!existsSync(committed)) drifted.push(`${rel} (missing — rebuild not committed)`);
    else if (readFileSync(b, "utf8") !== readFileSync(committed, "utf8")) drifted.push(rel);
  }
  rmSync(tmp, { recursive: true, force: true });
  put("drift (run: node scripts/build-docs.mjs build, then commit)", drifted);

  // 2–4 — CLI prose coverage.
  const fragments = cliFragmentsFromDisk();
  const cov = checkCliCoverage(surface, fragments);
  put("command without prose fragment (docs-src/cli/<slug>.html)", cov.missing);
  put("orphaned prose fragment (command no longer in surface.json)", cov.orphans);
  put('fragment without an example (<pre class="cmd">)', cov.noExample);

  // 5 — every flag appears in its rendered CLI section.
  const cliPage = join(outRoot, "cli", "index.html");
  if (existsSync(cliPage)) {
    put("flag not mentioned in its command's section", checkFlagsRendered(surface, readFileSync(cliPage, "utf8")));
  }

  // 6 — stamps.
  const pagesHtml = new Map();
  if (existsSync(outRoot)) {
    for (const f of listFilesRec(outRoot).filter((p) => p.endsWith("index.html"))) {
      const slug = f === join(outRoot, "index.html") ? "index" : f.slice(outRoot.length + 1, -"/index.html".length);
      pagesHtml.set(slug, readFileSync(f, "utf8"));
    }
  }
  put(`stamp != junco ${meta.juncoVersion}`, checkStamps(pagesHtml, meta.juncoVersion));

  // 7 — nav ↔ fragments bijection.
  const navSlugs = nav.groups.flatMap((g) => g.slugs);
  const pageSlugs = readdirSync(join(SRC, "pages"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => f.replace(/\.html$/, ""));
  const bij = checkNavBijection(navSlugs, pageSlugs);
  put("nav.json slug with no page fragment", bij.navOnly);
  put("page fragment missing from nav.json", bij.pagesOnly);

  // 8 — content gates over emitted docs.
  const gateViolations = [];
  for (const [slug, html] of pagesHtml) {
    for (const v of checkContentGates(html)) gateViolations.push(`${slug}: ${v}`);
  }
  put("content gate", gateViolations);

  if (failures.length) {
    for (const [category, items] of failures) {
      console.error(`✗ ${category} (${items.length})`);
      for (const item of items) console.error(`    ${item}`);
    }
    process.exit(1);
  }
  console.log("✓ docs check clean: no drift, full coverage, stamps current, gates pass");
}

export function runRelease() {
  const meta = JSON.parse(readFileSync(join(EXTRACTED, "meta.json"), "utf8"));
  const installed = runJunco(["--version"]).trim();
  console.log(`stamped:   junco ${meta.juncoVersion}`);
  console.log(`installed: junco ${installed}`);
  console.log("");
  const diff = spawnSync("git", ["diff", "--stat", "HEAD", "--", "docs-src/extracted/"], {
    cwd: ROOT,
    encoding: "utf8",
  }).stdout.trim();
  console.log(diff ? `snapshot delta vs HEAD:\n${diff}` : "snapshot delta vs HEAD: none (run --extract first?)");
  console.log("");
  const changelogPath = join(homedir(), "junco", "CHANGELOG.md");
  if (existsSync(changelogPath) && installed !== meta.juncoVersion) {
    const changelog = readFileSync(changelogPath, "utf8");
    const sections = changelog.split(/^## /m).slice(1);
    const newer = [];
    for (const s of sections) {
      const version = s.match(/^\[?([0-9]+\.[0-9]+\.[0-9]+)/)?.[1];
      if (version === meta.juncoVersion) break;
      newer.push(`## ${s.trim()}`);
    }
    console.log("CHANGELOG entries since the stamped version — map each Added/Changed");
    console.log("item to a guide or field-notes touch, or consciously mark it n/a:\n");
    console.log(newer.join("\n\n") || "(none found)");
  } else {
    console.log("CHANGELOG review: versions match — nothing new to map.");
  }
  console.log("\nchecklist: 1) --extract  2) --check (write missing prose)  3) map CHANGELOG");
  console.log("           4) build  5) run README gates  6) one push");
}

// ----------------------------------------------------------------------- cli

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  const mode = process.argv[2] ?? "build";
  if (mode === "--extract") extract();
  else if (mode === "build") {
    const outRoot = join(ROOT, "site", "docs");
    const written = buildPages(outRoot);
    // llms.txt deploys at the site root, not under /docs/
    const emitted = join(outRoot, "llms.txt");
    writeFileSync(join(ROOT, "site", "llms.txt"), readFileSync(emitted, "utf8"));
    rmSync(emitted);
    console.log(`built ${written.length} file(s)`);
  }
  else if (mode === "--check") runCheck();
  else if (mode === "--release") runRelease();
  else { console.error(`unknown mode: ${mode}`); process.exit(2); }
}
