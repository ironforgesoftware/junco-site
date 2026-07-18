// Unit tests for build-docs.mjs — run: node --test scripts/
// Fixtures are verbatim junco 0.8.0 output (captured 2026-07-18).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseHelp,
  parseConfigList,
  parseLeverReloads,
  applySubstitutions,
  escapeHtml,
  slugify,
  parseFragment,
  renderPage,
  extractSections,
  buildSearchIndexJson,
  SEARCH_OPTIONS,
} from "./build-docs.mjs";

const HELP_FIXTURE = `Usage: junco <subcommand> [options]

Subcommands:
  start        Start the daemon
  run-once     Process one task and exit (dev/cron convenience; no lock)
  service      Render a service file to stdout (launchd plist or systemd unit)
  inbox-path   Print the inbox directory path and exit
  status       Show daemon / endpoint / queue health at a glance
  list [box]   List tickets per queue box (inbox|processing|done|failed)
  retry <name…|--all>  Move failed tickets back to the inbox for a fresh run
  rm <name>            Delete a queued ticket from the inbox (best-effort)
  outbox [flush]      List or push the offline GitHub backlog
  prs                 List junco-authored pull requests across watched repos
  data [--json]  Print the data tree (paths, counts, provenance); 'data migrate' unifies legacy roots
  config path|list|get <path>|set <path> <value>|init  Inspect/edit config.json knobs; init scaffolds defaults
  assess <path|owner/repo|owner/repo#N> [--auto-plan]  audit a repo — or scoped to one issue; findings await review
  assess review [<id>]                    list pending assess reviews, or show one
  assess file <id> --all | --only <fp,...>  file reviewed findings as issues
  analyze <owner/repo#N|url>          investigate an issue and park a comment draft for review
  analyze review [<id>]                   list pending comment drafts, or preview one
  analyze edit <id>                       edit a pending draft in $EDITOR
  analyze post <id> [--no-footer]        post an approved draft as a comment on its issue
  doctor       Preflight: config, node, git, gh auth, endpoint, model, dirs
  auth login | auth grant <owner/repo>   Bot-account login / grant the bot write access to a repo
  logs [-f] [-n N] [--json|--human]  Show (or follow) the worker log
  dashboard    Interactive dashboard — first run opens the guided setup walkthrough
  restart      Restart the supervised daemon (picks up config + code changes)
  update       Update junco to the latest npm release (drains, then restarts the daemon)
  worktree prune <path>  Prune a stale/backup worktree (lock-guarded; refuses live)
  submit <file|-> Submit a ticket to the inbox (use - to read from stdin)
  dispatch <ref>  Fetch a GitHub issue (owner/repo#N or URL) and queue a ticket
                  for it — forks & clones unowned repos automatically
  schema       Print the ticket frontmatter JSON Schema and exit

  (no subcommand) → ensures the supervised daemon is running (interactive
                    terminal), then opens the dashboard; first run (no config)
                    opens the setup walkthrough. Use 'junco start' for an
                    explicit foreground daemon, 'junco dashboard' to observe
                    without starting anything.

Options:
  --config <path>       Path to config.json
                        [default: ./config.json if present, else ~/.config/junco/config.json]
  --once                (start) Process one task then exit
  --platform <name>     (service) Target platform: launchd | systemd
                        [default: launchd on macOS, systemd elsewhere]
  --help, -h            Show this help message
  --version             Print junco's version and exit
`;

const LEVERS_FIXTURE = `tools\t= ["read","bash","edit","write","grep","find","ls"] (default ["read","bash","edit","write","grep","find","ls"]) [structured, read-only]  Tool allowlist granted to the coding agent.
model.id\t= "local/my-model" (default "local/my-model") [string]  Provider-prefixed model id, e.g. openai/gpt-4o-mini.
model.apiKey\t= "sk-live-SHOULD-NOT-LEAK" (default undefined) [secret]  API key for the inference endpoint. Literal, "$ENV_VAR" reference, or unset to use the provider's env var (e.g. ANTHROPIC_API_KEY) for hosted catalog models.
worker.endpointProbe\t= "auto" (default "auto") [auto|always|never]  Endpoint probe policy: auto (probe local/inline, skip hosted catalog), always, or never.
assess.npmBin\t= "npm" (default "npm") [string]  Binary for the dependency scan (npm audit --json).
`;

const RELOADS_FIXTURE = `const LEVERS = [
  {
    path: "dataDir",
    type: "string",
    default: undefined,
    editable: true,
    reload: "restart",
    description: "Unified data root.",
  },
  {
    path: "model.compat",
    type: "structured",
    default: {},
    editable: false,
    reload: "live",
    description: "Provider compatibility overrides.",
  },
];`;

test("parseHelp: command inventory is complete (35 from help text)", () => {
  const { commands } = parseHelp(HELP_FIXTURE);
  const paths = commands.map((c) => c.path);
  assert.equal(commands.length, 35);
  for (const p of [
    "", // bare launcher
    "start", "run-once", "service", "inbox-path", "status", "list", "retry",
    "rm", "outbox", "prs", "data",
    "config path", "config list", "config get", "config set", "config init",
    "assess", "assess review", "assess file",
    "analyze", "analyze review", "analyze edit", "analyze post",
    "doctor", "auth login", "auth grant", "logs", "dashboard", "restart",
    "update", "worktree prune", "submit", "dispatch", "schema",
  ]) assert.ok(paths.includes(p), `missing command: ${JSON.stringify(p)}`);
});

test("parseHelp: synopsis, summary, and slug fields", () => {
  const { commands } = parseHelp(HELP_FIXTURE);
  const byPath = Object.fromEntries(commands.map((c) => [c.path, c]));
  assert.equal(byPath["assess file"].synopsis, "junco assess file <id> --all | --only <fp,...>");
  assert.equal(byPath["assess file"].summary, "file reviewed findings as issues");
  assert.equal(byPath["assess file"].slug, "assess-file");
  assert.equal(byPath["config set"].synopsis, "junco config set <path> <value>");
  assert.equal(byPath["config get"].synopsis, "junco config get <path>");
  assert.equal(byPath["config init"].synopsis, "junco config init");
  assert.equal(byPath["auth grant"].synopsis, "junco auth grant <owner/repo>");
  assert.equal(byPath["auth login"].summary, "Bot-account login");
  assert.equal(byPath["auth grant"].summary, "grant the bot write access to a repo");
  assert.equal(byPath["list"].synopsis, "junco list [box]");
});

test("parseHelp: continuation line joins into dispatch description", () => {
  const { commands } = parseHelp(HELP_FIXTURE);
  const dispatch = commands.find((c) => c.path === "dispatch");
  assert.equal(
    dispatch.summary,
    "Fetch a GitHub issue (owner/repo#N or URL) and queue a ticket for it — forks & clones unowned repos automatically"
  );
});

test("parseHelp: bare launcher from the (no subcommand) paragraph", () => {
  const { commands } = parseHelp(HELP_FIXTURE);
  const launcher = commands.find((c) => c.path === "");
  assert.equal(launcher.slug, "junco");
  assert.equal(launcher.synopsis, "junco");
  assert.match(launcher.summary, /ensures the supervised daemon is running/);
  assert.match(launcher.summary, /setup walkthrough/);
  assert.doesNotMatch(launcher.summary, /\n/);
});

test("parseHelp: per-command flags parsed from synopsis tokens", () => {
  const { commands } = parseHelp(HELP_FIXTURE);
  const byPath = Object.fromEntries(commands.map((c) => [c.path, c]));
  const flagNames = (p) => byPath[p].flags.map((f) => f.flag);
  assert.deepEqual(flagNames("assess"), ["--auto-plan"]);
  assert.deepEqual(flagNames("assess file"), ["--all", "--only"]);
  assert.equal(byPath["assess file"].flags[1].placeholder, "<fp,...>");
  assert.deepEqual(flagNames("logs"), ["-f", "-n", "--json", "--human"]);
  assert.equal(byPath["logs"].flags[1].placeholder, "N");
  assert.deepEqual(flagNames("analyze post"), ["--no-footer"]);
  assert.deepEqual(flagNames("retry"), ["--all"]);
  assert.deepEqual(flagNames("data"), ["--json"]);
  assert.deepEqual(flagNames("doctor"), []);
});

test("parseHelp: global flags with defaults, aliases, scopes", () => {
  const { globalFlags } = parseHelp(HELP_FIXTURE);
  const byFlag = Object.fromEntries(globalFlags.map((f) => [f.flag, f]));
  assert.equal(globalFlags.length, 5);
  assert.equal(byFlag["--config"].placeholder, "<path>");
  assert.equal(byFlag["--config"].default, "./config.json if present, else ~/.config/junco/config.json");
  assert.equal(byFlag["--config"].scope, null);
  assert.equal(byFlag["--once"].scope, "start");
  assert.equal(byFlag["--once"].description, "Process one task then exit");
  assert.equal(byFlag["--platform"].scope, "service");
  assert.equal(byFlag["--platform"].default, "launchd on macOS, systemd elsewhere");
  assert.equal(byFlag["--help"].alias, "-h");
  assert.equal(byFlag["--version"].default, null);
});

test("parseConfigList: fields parsed, current values never kept", () => {
  const { levers } = parseConfigList(LEVERS_FIXTURE);
  assert.equal(levers.length, 5);
  const byPath = Object.fromEntries(levers.map((l) => [l.path, l]));
  assert.equal(byPath["model.apiKey"].type, "secret");
  assert.equal(byPath["model.apiKey"].default, "undefined");
  assert.ok(!JSON.stringify(levers).includes("SHOULD-NOT-LEAK"), "current value leaked");
  assert.deepEqual(byPath["tools"], {
    path: "tools",
    type: "structured",
    markers: ["read-only"],
    default: '["read","bash","edit","write","grep","find","ls"]',
    description: "Tool allowlist granted to the coding agent.",
  });
  assert.equal(byPath["worker.endpointProbe"].type, "enum");
  assert.deepEqual(byPath["worker.endpointProbe"].enumValues, ["auto", "always", "never"]);
  // description containing parentheses survives intact
  assert.equal(byPath["assess.npmBin"].description, "Binary for the dependency scan (npm audit --json).");
});

test("parseLeverReloads: linear scan survives nested braces in defaults", () => {
  const map = parseLeverReloads(RELOADS_FIXTURE);
  assert.deepEqual(map, { dataDir: "restart", "model.compat": "live" });
});

test("applySubstitutions replaces before escape; escapeHtml escapes placeholders", () => {
  const subs = { "openai/gpt-4o-mini": "<provider>/<model-name>" };
  const out = escapeHtml(applySubstitutions("Provider-prefixed model id, e.g. openai/gpt-4o-mini.", subs));
  assert.equal(out, "Provider-prefixed model id, e.g. &lt;provider&gt;/&lt;model-name&gt;.");
  assert.equal(escapeHtml('a & b <c> "d"'), "a &amp; b &lt;c&gt; &quot;d&quot;");
});

test("slugify: command paths to kebab slugs", () => {
  assert.equal(slugify("assess file"), "assess-file");
  assert.equal(slugify("worktree prune"), "worktree-prune");
  assert.equal(slugify(""), "junco");
});

// ------------------------------------------------------------ Task 2: stitch

const FRAGMENT_FIXTURE = `<!--meta {"title":"The GitHub loop","description":"Label, plan, approve, PR.","slug":"github-loop","navLabel":"The GitHub loop","source":"docs/github-mode.md"} -->
<p>Body prose with <code>junco:approved</code>.</p>
`;

const NAV_FIXTURE = {
  groups: [
    { label: "start", slugs: ["index"] },
    { label: "guides", slugs: ["github-loop", "tickets"] },
  ],
};

test("parseFragment: meta comment + body", () => {
  const { meta, body } = parseFragment(FRAGMENT_FIXTURE);
  assert.equal(meta.title, "The GitHub loop");
  assert.equal(meta.slug, "github-loop");
  assert.match(body, /^<p>Body prose/);
  assert.throws(() => parseFragment("<p>no meta</p>"), /meta comment/);
});

test("renderPage: chrome contract", () => {
  const { meta, body } = parseFragment(FRAGMENT_FIXTURE);
  const html = renderPage({
    meta,
    body,
    nav: NAV_FIXTURE,
    navLabels: { index: "Start here", "github-loop": "The GitHub loop" },
    juncoVersion: "0.8.0",
  });
  assert.match(html, /<title>The GitHub loop — junco docs<\/title>/);
  assert.match(html, /rel="canonical" href="https:\/\/junco\.ironforgesoftware\.com\/docs\/github-loop\/"/);
  assert.match(html, /href="\/styles\.css"/);
  assert.match(html, /href="\/docs\/docs\.css"/);
  assert.match(html, /src="\/docs\/docs\.js"/);
  // own nav link is current; the other is not
  assert.match(html, /<a aria-current="page" href="\/docs\/github-loop\/">The GitHub loop<\/a>/);
  assert.match(html, /<a href="\/docs\/">Start here<\/a>/);
  // nav skips slugs with no fragment yet (tickets absent from navLabels)
  assert.doesNotMatch(html, /\/docs\/tickets\//);
  // stamp with version, source, edit link
  assert.match(html, /verified against junco 0\.8\.0/);
  assert.match(html, /docs\/github-mode\.md/);
  assert.match(html, /edit\/main\/docs-src\/pages\/github-loop\.html/);
  // body present, h1 from title
  assert.match(html, /<h1>The GitHub loop<\/h1>/);
  assert.match(html, /Body prose with <code>junco:approved<\/code>/);
});

test("extractSections: h2/h3 sections with anchors, intro, stripped text", () => {
  const html = `<html><body><main id="main"><h1>CLI</h1><p>Intro <code>junco</code> prose.</p>
<h2 id="submit">junco submit</h2><p>Places a ticket in the <code>inbox/</code>.</p>
<pre class="cmd">junco submit ./t.md</pre>
<h3 id="submit-stdin">stdin form</h3><p>Use &lt;file&gt; or -.</p></main></body></html>`;
  const sections = extractSections(html, "cli", { title: "CLI", keywords: ["submit"] });
  assert.equal(sections.length, 3);
  assert.deepEqual(sections[0], {
    id: "cli",
    url: "/docs/cli/",
    title: "CLI",
    heading: null,
    text: "Intro junco prose.",
    snippet: "Intro junco prose.",
    keywords: "submit",
  });
  assert.equal(sections[1].id, "cli#submit");
  assert.equal(sections[1].url, "/docs/cli/#submit");
  assert.equal(sections[1].heading, "junco submit");
  assert.match(sections[1].text, /Places a ticket in the inbox\/\./);
  assert.match(sections[1].text, /junco submit \.\/t\.md/);
  assert.equal(sections[2].heading, "stdin form");
  assert.equal(sections[2].text, "Use <file> or -.");
});

test("search index round-trip: build → loadJSON → query", async () => {
  const { default: MiniSearch } = await import("../site/docs/assets/minisearch.js");
  const sections = [
    { id: "cli#assess", url: "/docs/cli/#assess", title: "CLI", heading: "junco assess",
      text: "audit a repo and park findings", snippet: "audit a repo", keywords: "" },
    { id: "config", url: "/docs/config/", title: "Configuration", heading: null,
      text: "levers and defaults", snippet: "levers", keywords: "" },
  ];
  const json = buildSearchIndexJson(sections);
  const loaded = MiniSearch.loadJSON(json, SEARCH_OPTIONS);
  const hits = loaded.search("assess", { prefix: true });
  assert.equal(hits[0].id, "cli#assess");
  assert.equal(hits[0].url, "/docs/cli/#assess");
});

test("renderPage: index canonical is /docs/", () => {
  const html = renderPage({
    meta: { title: "Start here", description: "d", slug: "index", navLabel: "Start here" },
    body: "<p>x</p>",
    nav: NAV_FIXTURE,
    navLabels: { index: "Start here" },
    juncoVersion: "0.8.0",
  });
  assert.match(html, /rel="canonical" href="https:\/\/junco\.ironforgesoftware\.com\/docs\/"/);
  assert.match(html, /<a aria-current="page" href="\/docs\/">Start here<\/a>/);
});
