// junco docs behavior: copy buttons, heading anchors, search.
// Loaded as a module at the end of every docs page; the page works without it.

function initCopy() {
  document.querySelectorAll("pre.cmd").forEach((pre) => {
    const wrap = document.createElement("div");
    wrap.className = "cmd-wrap";
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy";
    btn.setAttribute("aria-live", "polite");
    btn.textContent = "copy";
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(pre.textContent.trim()).then(() => {
        btn.textContent = "copied";
        setTimeout(() => {
          btn.textContent = "copy";
        }, 2000);
      });
    });
    wrap.appendChild(btn);
  });
}

function initAnchors() {
  document.querySelectorAll("main h2[id], main h3[id]").forEach((h) => {
    const a = document.createElement("a");
    a.className = "anchor";
    a.href = `#${h.id}`;
    a.textContent = "#";
    a.setAttribute("aria-label", `Link to ${h.textContent}`);
    h.appendChild(a);
  });
}

function initSidebar() {
  // Progressive enhancement: collapsed by default on small screens.
  const side = document.querySelector("details.side");
  if (side && matchMedia("(max-width: 720px)").matches) side.removeAttribute("open");
}

function initSearch() {
  const input = document.getElementById("docs-search");
  const list = document.getElementById("search-results");
  if (!input || !list) return;

  const hint = document.createElement("span");
  hint.className = "hint";
  // plain text, not the ⌘ glyph: U+2318 is outside the shipped font subset
  hint.textContent = navigator.platform.startsWith("Mac") ? "cmd K" : "ctrl K";
  input.parentNode.appendChild(hint);

  let engine = null;
  let selected = -1;

  const ensureEngine = async () => {
    if (engine) return engine;
    const [{ default: MiniSearch }, res] = await Promise.all([
      import("/docs/assets/minisearch.js"),
      fetch("/docs/search-index.json"),
    ]);
    engine = MiniSearch.loadJSON(await res.text(), {
      fields: ["title", "heading", "text", "keywords"],
      storeFields: ["title", "heading", "url", "snippet"],
      searchOptions: {
        boost: { heading: 3, keywords: 2 },
        prefix: true,
        fuzzy: 0.2,
      },
    });
    return engine;
  };

  const close = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    selected = -1;
  };

  const paintSelection = () => {
    [...list.children].forEach((li, i) => {
      li.setAttribute("aria-selected", String(i === selected));
    });
  };

  const render = (results) => {
    list.textContent = "";
    results.slice(0, 10).forEach((r) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      const strong = document.createElement("span");
      strong.textContent = r.heading || r.title;
      const where = document.createElement("span");
      where.className = "where";
      where.textContent = r.heading ? `${r.title} · ${r.snippet}` : r.snippet;
      li.append(strong, where);
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        location.href = r.url;
      });
      list.appendChild(li);
    });
    list.hidden = list.children.length === 0;
    input.setAttribute("aria-expanded", String(!list.hidden));
    selected = -1;
  };

  input.addEventListener("focus", () => {
    hint.hidden = true;
    ensureEngine();
  });
  input.addEventListener("blur", () => {
    hint.hidden = input.value.length > 0;
    setTimeout(close, 150);
  });
  input.addEventListener("input", async () => {
    const q = input.value.trim();
    if (!q) return close();
    render((await ensureEngine()).search(q));
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      close();
      input.blur();
    } else if (e.key === "ArrowDown" && !list.hidden) {
      e.preventDefault();
      selected = Math.min(selected + 1, list.children.length - 1);
      paintSelection();
      list.children[selected]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp" && !list.hidden) {
      e.preventDefault();
      selected = Math.max(selected - 1, 0);
      paintSelection();
      list.children[selected]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && selected >= 0 && !list.hidden) {
      e.preventDefault();
      const url = engine.search(input.value.trim()).slice(0, 10)[selected]?.url;
      if (url) location.href = url;
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== input && !/^(input|textarea)$/i.test(document.activeElement.tagName)) {
      e.preventDefault();
      input.focus();
    } else if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });
}

initCopy();
initAnchors();
initSidebar();
initSearch();
