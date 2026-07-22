// glyph-matrix background — magicui's glyph-matrix (React/canvas) redone as a
// dependency-free script. A fixed canvas behind the page; a few cells mutate
// per tick. Static single frame under prefers-reduced-motion; absent without JS.
(function () {
  var GLYPHS = "01·•+*/\\<>=";
  var CELL = 14; // px
  var RATE = 0.04; // share of cells mutated per tick
  var TICK = 90; // ms

  var canvas = document.createElement("canvas");
  canvas.id = "glyphs";
  document.body.prepend(canvas);
  var ctx = canvas.getContext("2d");

  var reduced = matchMedia("(prefers-reduced-motion: reduce)");
  var cols, rows, timer;

  function cell(i) {
    var x = (i % cols) * CELL;
    var y = ((i / cols) | 0) * CELL;
    ctx.clearRect(x, y, CELL, CELL);
    ctx.globalAlpha = 0.3 + Math.random() * 0.7;
    ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], x + CELL / 2, y + CELL / 2);
    ctx.globalAlpha = 1;
  }

  function build() {
    var dpr = devicePixelRatio || 1;
    canvas.width = Math.ceil(innerWidth * dpr);
    canvas.height = Math.ceil(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--glyph").trim();
    ctx.font = '11px "Commit Mono", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    cols = Math.ceil(innerWidth / CELL);
    rows = Math.ceil(innerHeight / CELL);
    for (var i = 0; i < cols * rows; i++) cell(i);
  }

  function tick() {
    var n = Math.max(1, (cols * rows * RATE) | 0);
    for (var k = 0; k < n; k++) cell((Math.random() * cols * rows) | 0);
  }

  function start() {
    if (!timer && !reduced.matches && !document.hidden) timer = setInterval(tick, TICK);
  }
  function stop() {
    clearInterval(timer);
    timer = null;
  }

  build();
  start();
  if (document.fonts) document.fonts.ready.then(build); // repaint once the woff2 lands
  addEventListener("resize", build);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else start();
  });
  reduced.addEventListener("change", function () {
    stop();
    build();
    start();
  });
})();
