// glyph mascot — the junco rebuilt from the backdrop's own glyph alphabet as
// a fixed background layer: WebGL2 instanced quads, one glyph per sampled
// cell of the mascot art, colored from the art itself. It assembles from a
// scatter on load, the cursor startles it, scrolling lifts and disperses it,
// and idle glyphs mutate like the matrix behind it. The art is sampled for
// shape and color only — the glyphs are the mascot. Draws one still
// assembled frame under prefers-reduced-motion; absent without JS or WebGL2.
(function () {
  if (typeof WebGL2RenderingContext === "undefined") return;

  var GLYPHS = "01·•+*/\\<>="; // same alphabet as the backdrop matrix
  var ATLAS_COLS = 16; // glyph columns in the texture (padded power of two)
  var WIDE_SAMPLE = 76; // sampling grid when the bird is large (square, art contain-fit)
  var FLOW_SAMPLE = 40; // coarser grid for the small in-flow bird — glyphs stay readable
  var BIRD_UNITS = 7.92; // world width of the bird — physics are tuned to this
  var LIFT = 0.55; // gamma lift on sampled art colors — dark plumage must read on the dark page
  var FOV = 50; // camera: perspective at z 18, matching the source effect
  var CAMZ = 18;
  var FLOW_CAMZ = 11.5; // tighter framing when the bird sits in flow on mobile
  var VIEW_UNITS = 2 * CAMZ * Math.tan((FOV * Math.PI) / 360); // world height in view
  var LOOSE = 0.45; // idle restlessness (feather ruffle + tail sway)
  var MOUSE = { radius: 4.9, strength: 0.8, decay: 0.2, distort: 5 };
  var LIGHT = { x: 4.5, y: 5.5, z: 3, range: 14, min: 0.85, max: 1.4, followX: 1.05 };
  var FPS = 30;
  var WIDTH_FRAC = 0.5; // narrow viewports: bird width as a share of the viewport
  var CENTER_X = 0.2; // narrow viewports: bird center, fraction of viewport width
  var CENTER_Y_MAX = 340; // bird center y in px, capped — the hero copy is
  var CENTER_Y_FRAC = 0.45; // top-anchored, so the bird tracks it, not the viewport
  var COPY_SHIFT = matchMedia("(min-width: 800px)"); // must match the styles.css hero breakpoint
  var STILL_T = 12; // pose time for the reduced-motion frame
  var SRC = "assets/junco.png"; // sampled for shape and color; never displayed

  var reduced = matchMedia("(prefers-reduced-motion: reduce)");
  var fine = matchMedia("(hover: hover) and (pointer: fine)");
  var img = new Image();

  var VERT =
    "precision highp float;\n" +
    "attribute vec2 position;\n" +
    "attribute vec4 aInstance;\n" + // xyz cell center, w per-glyph scale
    "attribute vec3 aScattered;\n" +
    "attribute vec3 aColor;\n" +
    "attribute float aOpacity;\n" +
    "attribute float aEdge;\n" +
    "attribute float aIndex;\n" +
    "attribute float aGlyph;\n" +
    "uniform mat4 uModel, uModelView, uProj;\n" +
    "uniform float uTime, uAssembly, uLoose, uScatter, uHalf;\n" +
    "uniform vec2 uMouse;\n" +
    "uniform float uMouseRadius, uMouseStrength, uMouseDistort;\n" +
    "uniform vec3 uLightPos;\n" +
    "uniform float uLightRange, uShadeMin, uShadeMax;\n" +
    "varying vec2 vUv;\n" +
    "varying vec3 vColor;\n" +
    "varying float vAlpha;\n" +
    "varying float vGlyph;\n" +
    "void main() {\n" +
    "  vec3 targetCenter = aInstance.xyz;\n" +
    "  float assembly = smoothstep(0.0, 1.0, uAssembly);\n" +
    "  vec3 center = mix(aScattered, targetCenter, assembly);\n" +
    "  vec3 pos = center + vec3(position * uHalf * aInstance.w, 0.0);\n" +
    // idle looseness: static jitter + slow drift, strongest at the silhouette edge
    "  float loose = uLoose * mix(0.25, 1.0, aEdge) * assembly;\n" +
    "  if (loose > 0.001) {\n" +
    "    vec3 jitter = vec3(\n" +
    "      fract(sin(aIndex * 12.9898) * 43758.5453) - 0.5,\n" +
    "      fract(sin(aIndex * 78.2330) * 12543.1230) - 0.5,\n" +
    "      fract(sin(aIndex * 39.4250) * 26711.7700) - 0.5);\n" +
    "    pos += jitter * 0.05 * loose;\n" +
    "    pos.x += sin(uTime * 0.50 + aIndex * 0.53) * 0.06 * loose;\n" +
    "    pos.y += cos(uTime * 0.42 + aIndex * 0.71) * 0.06 * loose;\n" +
    "    pos.z += sin(uTime * 0.36 + aIndex * 0.91) * 0.08 * loose;\n" +
    // tail sway: the tail points -x in the art, sway grows toward the tip
    "    float tail = smoothstep(0.5, 4.5, -targetCenter.x) * uLoose * assembly;\n" +
    "    pos.y += sin(uTime * 1.1 + targetCenter.x * 0.7) * 0.1 * tail;\n" +
    "    pos.z += cos(uTime * 0.9 + targetCenter.x * 0.55) * 0.06 * tail;\n" +
    "  }\n" +
    // scroll dispersal: drift back toward the scatter, edges loosen first
    "  if (uScatter > 0.001) {\n" +
    "    float disperse = uScatter * mix(0.5, 1.0, aEdge);\n" +
    "    pos += (aScattered - center) * disperse;\n" +
    "    pos.z += sin(uTime * 0.6 + aIndex * 0.3) * disperse * 0.6;\n" +
    "  }\n" +
    // cursor startle: radial push, cubic falloff, per-glyph direction noise
    "  if (assembly > 0.8) {\n" +
    "    float mouseEffect = (assembly - 0.8) * 5.0;\n" +
    "    vec2 toMouse = center.xy - uMouse;\n" +
    "    float mouseDist = length(toMouse);\n" +
    "    if (mouseDist < uMouseRadius && mouseDist > 0.001) {\n" +
    "      float t = 1.0 - mouseDist / uMouseRadius;\n" +
    "      float force = t * t * t * mouseEffect * uMouseStrength;\n" +
    "      vec2 dir = toMouse / mouseDist;\n" +
    "      float na = sin(aIndex * 0.37 + uTime * 0.5) * uMouseDistort;\n" +
    "      float ca = cos(na), sa = sin(na);\n" +
    "      pos.xy += vec2(dir.x * ca - dir.y * sa, dir.x * sa + dir.y * ca) * force * 2.0;\n" +
    "      pos.z += sin(aIndex * 1.7 + uTime) * force * 0.8;\n" +
    "    }\n" +
    "  }\n" +
    // free drift while scattered
    "  if (assembly < 0.9) {\n" +
    "    float s = smoothstep(0.9, 0.0, assembly);\n" +
    "    pos.x += sin(uTime * 0.5 + aIndex * 0.1) * 0.2 * s;\n" +
    "    pos.y += cos(uTime * 0.4 + aIndex * 0.07) * 0.2 * s;\n" +
    "    pos.z += sin(uTime * 0.3 + aIndex * 0.13) * 0.15 * s;\n" +
    "  }\n" +
    // shading from a fixed world-space light; the group sways underneath it
    "  vec4 world = uModel * vec4(pos, 1.0);\n" +
    "  float lit = clamp(1.0 - distance(world.xyz, uLightPos) / uLightRange, 0.0, 1.0);\n" +
    "  float light = mix(uShadeMin, uShadeMax, lit * lit);\n" +
    "  float shimmer = 0.95 + 0.05 * sin(uTime * 1.5 + targetCenter.x * 5.0 + targetCenter.y * 3.0);\n" +
    "  vColor = aColor * light;\n" +
    "  vAlpha = aOpacity * mix(0.6, 1.0, assembly) * shimmer;\n" +
    // slow per-glyph mutation, staggered — the matrix behavior, in the bird
    "  vGlyph = mod(aGlyph + floor(uTime * 0.15 + fract(sin(aIndex * 91.7) * 4373.57) * 8.0), " +
    GLYPHS.length +
    ".0);\n" +
    "  vUv = position * 0.5 + 0.5;\n" +
    "  gl_Position = uProj * uModelView * vec4(pos, 1.0);\n" +
    "}\n";

  var FRAG =
    "precision highp float;\n" +
    "uniform sampler2D uAtlas;\n" +
    "uniform float uFade;\n" +
    "varying vec2 vUv;\n" +
    "varying vec3 vColor;\n" +
    "varying float vAlpha;\n" +
    "varying float vGlyph;\n" +
    "void main() {\n" +
    "  float g = floor(vGlyph + 0.5);\n" +
    "  float a = texture2D(uAtlas, vec2((g + vUv.x) / " +
    ATLAS_COLS +
    ".0, vUv.y)).a;\n" +
    "  float alpha = a * vAlpha * uFade;\n" +
    "  if (alpha < 0.004) discard;\n" +
    "  gl_FragColor = vec4(vColor, alpha);\n" +
    "}\n";

  // ---- sampling: art -> one particle per opaque cell ----

  function sampleArt(t) {
    var cell = BIRD_UNITS / t;
    var c = document.createElement("canvas");
    c.width = t;
    c.height = t;
    var x = c.getContext("2d");
    var r = Math.min(t / img.naturalWidth, t / img.naturalHeight);
    var w = img.naturalWidth * r;
    var h = img.naturalHeight * r;
    x.drawImage(img, (t - w) / 2, (t - h) / 2, w, h);
    var d = x.getImageData(0, 0, t, t).data;
    var alpha = new Float32Array(t * t);
    for (var i = 0; i < t * t; i++) alpha[i] = d[4 * i + 3] / 255;
    var mid = t / 2;
    var inst = [], scat = [], color = [], op = [], edge = [], glyph = [];
    for (var row = 0; row < t; row++) {
      for (var col = 0; col < t; col++) {
        var a = alpha[row * t + col];
        if (a <= 0.3) continue;
        var dark = 0;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            var ox = col + dx;
            var oy = row + dy;
            if (ox < 0 || oy < 0 || ox >= t || oy >= t || alpha[oy * t + ox] <= 0.3) dark++;
          }
        }
        var k = 4 * (row * t + col);
        inst.push((col - mid) * cell, (mid - row) * cell, 0, 0.85 + Math.random() * 0.3);
        color.push(
          Math.pow(d[k] / 255, LIFT),
          Math.pow(d[k + 1] / 255, LIFT),
          Math.pow(d[k + 2] / 255, LIFT)
        );
        op.push(a);
        edge.push(dark / 8);
        glyph.push((Math.random() * GLYPHS.length) | 0);
        var ang = Math.random() * Math.PI * 2;
        var ph = Math.acos(2 * Math.random() - 1);
        var rad = 3 * (0.4 + 0.6 * Math.random());
        scat.push(
          Math.sin(ph) * Math.cos(ang) * rad,
          Math.sin(ph) * Math.sin(ang) * rad,
          Math.cos(ph) * rad * 0.5
        );
      }
    }
    return { inst: inst, scat: scat, color: color, op: op, edge: edge, glyph: glyph, count: op.length };
  }

  // ---- small column-major mat4 helpers ----

  function mat4mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) {
        o[c * 4 + r] =
          a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return o;
  }

  function perspective(aspect) {
    var f = 1 / Math.tan((FOV * Math.PI) / 360);
    var near = 0.1;
    var far = 100;
    var o = new Float32Array(16);
    o[0] = f / aspect;
    o[5] = f;
    o[10] = (far + near) / (near - far);
    o[11] = -1;
    o[14] = (2 * far * near) / (near - far);
    return o;
  }

  function rot3(rx, ry, rz) {
    var cx = Math.cos(rx), sx = Math.sin(rx);
    var cy = Math.cos(ry), sy = Math.sin(ry);
    var cz = Math.cos(rz), sz = Math.sin(rz);
    return [
      cy * cz, -cy * sz, sy,
      cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy,
      sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy,
    ];
  }

  function composeTRS(R, py, s) {
    return new Float32Array([
      R[0] * s, R[3] * s, R[6] * s, 0,
      R[1] * s, R[4] * s, R[7] * s, 0,
      R[2] * s, R[5] * s, R[8] * s, 0,
      0, py, 0, 1,
    ]);
  }

  // ---- lifecycle ----

  var canvas, gl, raf, resizeTimer;
  var layoutCanvas = null;
  var drawStill = null;
  var startStop = null;

  function setup() {
    if (canvas || !img.naturalWidth) return;

    canvas = document.createElement("canvas");
    canvas.id = "mascot";
    canvas.setAttribute("aria-hidden", "true");
    gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    if (!gl) {
      canvas = null;
      return;
    }
    document.body.prepend(canvas);

    function shader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      canvas.remove();
      canvas = null;
      gl = null;
      return;
    }
    gl.useProgram(prog);
    function U(n) {
      return gl.getUniformLocation(prog, n);
    }

    function attach(name, data, size, divisor) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(loc, divisor);
    }
    // two densities of the same bird: fine for the big background plate,
    // coarse for the small in-flow plate, so glyphs stay legible at both
    function makeSet(sample) {
      var pd = sampleArt(sample);
      var vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      attach("position", [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1], 2, 0);
      attach("aInstance", pd.inst, 4, 1);
      attach("aScattered", pd.scat, 3, 1);
      attach("aColor", pd.color, 3, 1);
      attach("aOpacity", pd.op, 1, 1);
      attach("aEdge", pd.edge, 1, 1);
      attach("aGlyph", pd.glyph, 1, 1);
      var indices = [];
      for (var i = 0; i < pd.count; i++) indices.push(i);
      attach("aIndex", indices, 1, 1);
      gl.bindVertexArray(null);
      return { vao: vao, count: pd.count, half: (BIRD_UNITS / sample) * 0.83 };
    }
    var wideSet = makeSet(WIDE_SAMPLE);
    var flowSet = makeSet(FLOW_SAMPLE);
    var activeSet = wideSet;

    // glyph atlas: the alphabet rendered once into a single-row texture
    var atlas = gl.createTexture();
    function buildAtlas() {
      if (!gl) return;
      var cellPx = 64;
      var c = document.createElement("canvas");
      c.width = ATLAS_COLS * cellPx;
      c.height = cellPx;
      var x = c.getContext("2d");
      x.font = '700 56px "Commit Mono", monospace';
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillStyle = "rgb(255, 255, 255)";
      for (var i = 0; i < GLYPHS.length; i++) {
        x.fillText(GLYPHS[i], i * cellPx + cellPx / 2, cellPx / 2 + 2);
      }
      gl.bindTexture(gl.TEXTURE_2D, atlas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    buildAtlas();
    if (document.fonts) {
      // once the woff2 lands: repaint the atlas, re-measure the layout (the
      // column is ch-sized), and refresh the still frame if motion is off
      document.fonts.ready.then(function () {
        buildAtlas();
        if (layoutCanvas) layoutCanvas();
        if (reduced.matches && drawStill) drawStill();
      });
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(U("uAtlas"), 0);
    gl.uniform1f(U("uLoose"), LOOSE);
    gl.uniform1f(U("uMouseRadius"), MOUSE.radius);
    gl.uniform1f(U("uMouseDistort"), MOUSE.distort);
    gl.uniform1f(U("uLightRange"), LIGHT.range);
    gl.uniform1f(U("uShadeMin"), LIGHT.min);
    gl.uniform1f(U("uShadeMax"), LIGHT.max);

    // the bird spans BIRD_UNITS of the VIEW_UNITS-tall camera view. On wide
    // viewports the copy shifts right, so the bird is sized to the measured
    // freed zone — its tail bleeds a little off-screen, its beak tucks under
    // the copy's edge — and shrinks only when the viewport height demands it.
    // On narrow viewports it falls back to a viewport fraction behind the copy.
    var dpr = Math.min(devicePixelRatio || 1, 1.5);
    var artAspect = img.naturalHeight / img.naturalWidth;
    var heroCopy = document.querySelector(".hero-copy");
    var slot = document.querySelector(".hero-mascot");
    var camz = CAMZ;
    var viewUnits = VIEW_UNITS;
    layoutCanvas = function () {
      // narrow viewports: the bird sits in flow above the copy, tighter framed
      var flow = !COPY_SHIFT.matches && slot;
      if (flow && canvas.parentNode !== slot) slot.appendChild(canvas);
      else if (!flow && canvas.parentNode !== document.body) document.body.prepend(canvas);
      var birdW, side, cx;
      activeSet = flow ? flowSet : wideSet;
      if (flow) {
        camz = FLOW_CAMZ;
        viewUnits = 2 * camz * Math.tan((FOV * Math.PI) / 360);
        var colW = slot.clientWidth || innerWidth - 40;
        side = Math.round(Math.min(colW, (300 * viewUnits) / BIRD_UNITS));
        birdW = (side * BIRD_UNITS) / viewUnits;
        canvas.style.left = "";
        canvas.style.top = "";
        // collapse the scatter padding so flow height hugs the silhouette
        canvas.style.marginBlock = Math.round(-(side - birdW * artAspect) / 2 + 10) + "px";
      } else {
        camz = CAMZ;
        viewUnits = VIEW_UNITS;
        canvas.style.marginBlock = "";
        var copyLeft = heroCopy ? heroCopy.getBoundingClientRect().left : 0;
        if (copyLeft > 200) {
          var right = copyLeft + Math.min(120, copyLeft * 0.2);
          birdW = Math.min(right * 1.064, (innerHeight - 180) / artAspect);
          cx = right - birdW / 2;
        } else {
          birdW = Math.min(innerWidth * WIDTH_FRAC, (innerHeight - 160) / artAspect);
          cx = innerWidth * CENTER_X;
        }
        var birdH = birdW * artAspect;
        side = Math.round((birdW * viewUnits) / BIRD_UNITS);
        var cy = Math.max(Math.min(innerHeight * CENTER_Y_FRAC, CENTER_Y_MAX), birdH / 2 + 84);
        canvas.style.left = Math.round(cx - side / 2) + "px";
        canvas.style.top = Math.round(cy - side / 2) + "px";
      }
      canvas.style.width = side + "px";
      canvas.style.height = side + "px";
      canvas.width = Math.round(side * dpr);
      canvas.height = Math.round(side * dpr);
    };
    layoutCanvas();
    COPY_SHIFT.addEventListener("change", function () {
      if (layoutCanvas) layoutCanvas();
    });

    var ndc = { x: 0, y: 0 };
    var smooth = { x: 0, y: 0 };
    var mouseActive = false;
    var mouseMoved = false;
    var strength = 0;

    function onMove(e) {
      mouseActive = true;
      mouseMoved = true;
      var r = canvas.getBoundingClientRect();
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    }
    if (fine.matches) addEventListener("mousemove", onMove, { passive: true });
    addEventListener("mouseleave", function () {
      mouseActive = false;
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) mouseActive = false;
    });

    function render(t, dt, D, sc, still) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (D <= 0) return;

      // group sway, bob, lift-off with scroll
      var rz = t * (1 - D) * 0.3 + 0.04 * Math.sin(0.25 * t);
      var rx = 0.05 * Math.sin(0.08 * t * 0.7);
      var ry = 0.1 * Math.sin(0.08 * t);
      var py = 0.15 * Math.sin(0.4 * t) + 2.5 * sc;
      var gs = (0.75 + 0.25 * D) * (1 - 0.5 * sc);
      var R = rot3(rx, ry, rz);
      var model = composeTRS(R, py, gs);
      var view = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -camz, 1]);
      gl.uniformMatrix4fv(U("uModel"), false, model);
      gl.uniformMatrix4fv(U("uModelView"), false, mat4mul(view, model));
      gl.uniformMatrix4fv(U("uProj"), false, perspective(1));

      // cursor in world units, eased, then into group-local space
      if (!still && dt > 0) {
        var tx = ndc.x * viewUnits * 0.5;
        var ty = ndc.y * viewUnits * 0.5;
        var target = mouseActive && fine.matches ? MOUSE.strength : 0;
        strength += (target - strength) * (1 - Math.pow(0.05, dt));
        if (mouseMoved) {
          if (strength < 0.01) {
            smooth.x = tx;
            smooth.y = ty;
          } else {
            smooth.x += (tx - smooth.x) * MOUSE.decay;
            smooth.y += (ty - smooth.y) * MOUSE.decay;
          }
        }
      }
      var wx = smooth.x;
      var wy = smooth.y - py;
      gl.uniform2f(U("uMouse"), (R[0] * wx + R[3] * wy) / gs, (R[1] * wx + R[4] * wy) / gs);
      gl.uniform1f(U("uMouseStrength"), still ? 0 : strength);
      gl.uniform3f(U("uLightPos"), LIGHT.x + (still ? 0 : smooth.x) * LIGHT.followX, LIGHT.y, LIGHT.z);

      gl.uniform1f(U("uTime"), t);
      gl.uniform1f(U("uAssembly"), D);
      gl.uniform1f(U("uScatter"), 1.6 * Math.min(1, 1.5 * sc));
      gl.uniform1f(U("uFade"), Math.max(0, 1 - 1.1 * sc));

      gl.bindVertexArray(activeSet.vao);
      gl.uniform1f(U("uHalf"), activeSet.half);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, activeSet.count);
    }

    var t0 = performance.now();
    var last = 0;
    var prevT = 0;
    var acc = 0;
    var frameMs = 1000 / FPS;

    function loop(now) {
      raf = requestAnimationFrame(loop);
      if (now - last < frameMs) return;
      last = now - ((now - last) % frameMs);
      var t = (now - t0) / 1000;
      var dt = Math.min(0.1, Math.max(0, t - prevT));
      prevT = t;
      acc += dt;
      var L = Math.max(0, Math.min(1, (acc - 0.3) / 2.5));
      var D = 1 - Math.pow(1 - L, 3);
      // read scroll fresh each frame — cached event values go stale across
      // window resizes, which fire scrolls without a final event at rest
      render(t, dt, D, Math.min(1, scrollY / innerHeight), false);
    }

    drawStill = function () {
      render(STILL_T, 0, 1, 0, true);
    };

    startStop = function () {
      cancelAnimationFrame(raf);
      raf = 0;
      if (reduced.matches) drawStill();
      else {
        prevT = (performance.now() - t0) / 1000;
        raf = requestAnimationFrame(loop);
      }
    };
    startStop();
  }

  reduced.addEventListener("change", function () {
    if (startStop) startStop();
  });
  addEventListener("resize", function () {
    if (layoutCanvas) layoutCanvas(); // track live window drags immediately
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (layoutCanvas) {
        layoutCanvas(); // settle once more after layout finishes shifting
        if (reduced.matches && drawStill) drawStill();
      }
    }, 150);
  });
  img.addEventListener("load", setup);
  img.src = SRC;
})();
