// drifting-slate backdrop — a WebGL2 fluid-noise field behind the glyph
// matrix. Domain-warped simplex noise moves slow slate shapes in the site
// palette; the cursor drags a warp trail with a rose tint through a
// quarter-res flowmap that decays each frame. Static single frame under
// prefers-reduced-motion; absent without JS or WebGL2. The glyph matrix
// above it is untouched.
(function () {
  if (typeof WebGL2RenderingContext === "undefined") return;

  var FPS = 30;
  var SPEED = 0.28; // shader seconds per wall second
  var SCALE = 2.6; // noise field zoom (higher = finer drift)
  var OFFSET_X = -1.24;
  var OFFSET_Y = -0.48;
  var DISTORT_BOOST = 2.2; // cursor drag warp
  var SWIRL_BOOST = 0.8; // cursor swirl
  var GLOW = 0.26; // cursor trail tint strength
  var VIGNETTE = 0.2;
  var STILL_T = 60; // shader time for the reduced-motion frame
  var BRUSH_RADIUS = 0.09;
  var BRUSH_STRENGTH = 1.8;
  var MOUSE_SMOOTHING = 0.1;
  var MOUSE_VELOCITY = 0.2;
  var DECAY = 0.925;

  var VERT = `#version 300 es
in vec4 a_position;
out vec2 vUv;
void main() {
  vUv = a_position.xy * 0.5 + 0.5;
  gl_Position = a_position;
}
`;

  var FLOW = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D u_prev;
uniform vec2 u_mouse;
uniform vec2 u_velocity;
uniform float u_brushRadius;
uniform float u_brushStrength;
uniform float u_decay;
out vec4 fragColor;

void main() {
  vec4 prev = texture(u_prev, vUv);

  prev.r *= u_decay;
  prev.gb = mix(vec2(0.5), prev.gb, u_decay);

  float dist = distance(vUv, u_mouse);

  float influence = exp(-dist * dist / (u_brushRadius * u_brushRadius * 0.5));
  influence = max(0.0, influence - 0.01);

  float speed = length(u_velocity);
  float presenceStrength = u_brushStrength * 0.3;
  float velBonus = min(speed * 3.0, 0.7) * u_brushStrength;
  float totalStrength = presenceStrength + velBonus;

  prev.r = max(prev.r, influence * totalStrength);
  float blendAmt = influence * min(totalStrength, 0.4) * 0.3;
  prev.g = mix(prev.g, clamp(u_velocity.x * 2.0 + 0.5, 0.0, 1.0), blendAmt);
  prev.b = mix(prev.b, clamp(u_velocity.y * 2.0 + 0.5, 0.0, 1.0), blendAmt);

  fragColor = prev;
}
`;

  var FLUID = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec3 u_c1, u_c2, u_c3, u_c4, u_c5;
uniform float u_scale;
uniform vec2 u_offset;
uniform float u_grain;
uniform float u_speed;
uniform sampler2D u_flowmap;
uniform float u_distortBoost;
uniform float u_swirlBoost;
uniform float u_glowIntensity;
uniform vec3 u_glowColor1;
uniform vec3 u_glowColor2;
uniform vec3 u_glowColor3;
uniform vec2 u_lightPos;
uniform float u_lightCore;
uniform float u_lightHalo;
uniform float u_vignette;
uniform float u_bloomThreshold;
uniform float u_bloomRange;
uniform float u_bloomStrength;
out vec4 fragColor;

vec3 mod289v3(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289v4(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289v4(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}

float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);
  const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289v3(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;
  vec4 s1=floor(b1)*2.+1.;
  vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
  m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

float hash(vec2 p){
  vec3 p3=fract(vec3(p.xyx)*.1031);
  p3+=dot(p3,p3.yzx+33.33);
  return fract((p3.x+p3.y)*p3.z);
}

float fbm(vec3 p){
  float v=0.,amp=.6;vec3 shift=vec3(100.);
  for(int i=0;i<1;i++){v+=amp*snoise(p);p=p*2.+shift;amp*=.4;}
  return v;
}

float fluidNoise(vec2 uv,float t){
  float n1=fbm(vec3(uv*.6,t*.06));
  float n2=fbm(vec3(uv*.6+5.2,t*.06+1.3));
  vec2 w1=vec2(n1,n2)*.6;
  float n3=fbm(vec3((uv+w1)*.7+1.7,t*.05+3.1));
  float n4=fbm(vec3((uv+w1)*.7+9.2,t*.05+5.7));
  vec2 w2=vec2(n3,n4)*.5;
  return fbm(vec3((uv+w1+w2)*.5,t*.04));
}

vec2 curlish(vec2 uv,float t){
  float eps=.02;
  float n=snoise(vec3(uv*.8,t));
  float nx=snoise(vec3((uv+vec2(eps,0.))*.8,t));
  float ny=snoise(vec3((uv+vec2(0.,eps))*.8,t));
  return vec2(-(ny-n)/eps,(nx-n)/eps)*.003;
}

void main(){
  float aspect=u_resolution.x/u_resolution.y;
  vec2 uv=gl_FragCoord.xy/u_resolution;
  vec2 suv=vec2(uv.x*aspect, uv.y) * u_scale + u_offset;
  float t=u_time;

  // Mouse interaction via flowmap
  vec4 flow = texture(u_flowmap, uv);
  float influence = flow.r;
  vec2 flowDir = (flow.gb - 0.5) * 2.0;

  // Apply mouse distortion to UV
  suv += flowDir * influence * u_distortBoost * 0.8;
  // Apply mouse swirl
  float swirlAngle = influence * u_swirlBoost * 2.5;
  float cs = cos(swirlAngle), sn = sin(swirlAngle);
  vec2 delta = suv - vec2(uv.x * aspect, uv.y) * u_scale;
  suv += (mat2(cs, sn, -sn, cs) * delta - delta) * influence;

  vec2 curl=curlish(suv,t*.04);
  vec2 uvD=suv+curl*12.;
  float f=fluidNoise(uvD,t);
  float swirl=snoise(vec3(uvD*.8+f*1.5,t*.035))*.5+.5;
  float n=f*.5+.5;
  vec3 col=mix(u_c1,u_c2,smoothstep(.2,.5,n));
  col=mix(col,u_c3,smoothstep(.35,.65,n+swirl*.25));
  col=mix(col,u_c4,smoothstep(.6,.85,swirl)*.55);
  col=mix(col,u_c5,smoothstep(.5,.8,n*swirl)*.35);

  // Mouse proximity color shift: 3-color glow blended by distance + noise
  float glow = smoothstep(0.0, 0.8, influence);
  float glowNoise = snoise(vec3(uvD * 1.5, t * 0.08)) * 0.5 + 0.5;
  float glowDist = smoothstep(0.0, 1.0, influence);
  vec3 glowMix = mix(u_glowColor3, u_glowColor2, glowDist);
  glowMix = mix(glowMix, u_glowColor1, glowDist * glowNoise);
  col = mix(col, glowMix, glow * u_glowIntensity);

  if(u_grain>0.0){
    vec2 flowOffset = (uvD - suv) * u_resolution.y;
    vec2 gp = floor((gl_FragCoord.xy + flowOffset) / 5.0);
    float gr=hash(gp)*2.-1.;
    col+=gr*u_grain;
  }

  // Self-luminance bloom: bright fluid regions become their own light spots,
  // so glow follows the flow and mouse disturbance instead of a fixed point
  float luma=dot(col,vec3(.299,.587,.114));
  float bloom=smoothstep(u_bloomThreshold-u_bloomRange,u_bloomThreshold+u_bloomRange,luma);
  col+=(col*.85+vec3(.15,.145,.13))*bloom*u_bloomStrength;

  // Virtual light source: soft warm core
  float ld=length((uv-u_lightPos)*vec2(aspect,1.));
  float core=exp(-ld*ld*4.5);
  float halo=exp(-ld*1.8);
  col+=vec3(1.,.97,.9)*core*u_lightCore+vec3(.72,.8,1.)*halo*u_lightHalo;

  float vig=1.-smoothstep(.35,.75,length(uv-.5));
  col=mix(col*(1.-u_vignette),col,vig);
  fragColor=vec4(col,1.);
}
`;

  var reduced = matchMedia("(prefers-reduced-motion: reduce)");
  var coarse = matchMedia("(hover: none), (pointer: coarse)");

  // every color comes from the token block in styles.css
  var css = getComputedStyle(document.documentElement);
  function tok(name) {
    var n = parseInt(css.getPropertyValue(name).trim().slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  var PALETTE = [tok("--shadow"), tok("--junco-tail"), tok("--junco-hood-1"), tok("--junco-mantle-2"), tok("--shadow")];
  var GLOWS = [tok("--accent"), tok("--ink-muted"), tok("--junco-mantle-2")];

  var canvas = document.createElement("canvas");
  canvas.id = "backdrop";
  canvas.setAttribute("aria-hidden", "true");
  var gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
  if (!gl) return;
  document.body.prepend(canvas);

  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }
  function program(frag) {
    var p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(p);
    return p;
  }
  var flowP = program(FLOW);
  var fluidP = program(FLUID);
  if (
    !gl.getProgramParameter(flowP, gl.LINK_STATUS) ||
    !gl.getProgramParameter(fluidP, gl.LINK_STATUS)
  ) {
    canvas.remove();
    return;
  }

  function locations(p, names) {
    var o = {};
    for (var i = 0; i < names.length; i++) o[names[i]] = gl.getUniformLocation(p, names[i]);
    return o;
  }
  var FU = locations(flowP, ["u_prev", "u_mouse", "u_velocity", "u_brushRadius", "u_brushStrength", "u_decay"]);
  var DU = locations(fluidP, [
    "u_flowmap", "u_time", "u_resolution", "u_scale", "u_offset", "u_grain",
    "u_distortBoost", "u_swirlBoost", "u_glowIntensity",
    "u_glowColor1", "u_glowColor2", "u_glowColor3",
    "u_c1", "u_c2", "u_c3", "u_c4", "u_c5",
    "u_lightPos", "u_lightCore", "u_lightHalo", "u_vignette",
    "u_bloomThreshold", "u_bloomRange", "u_bloomStrength", "u_speed",
  ]);

  var quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  function bindQuad(p) {
    var a = gl.getAttribLocation(p, "a_position");
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  }

  var W = 0;
  var H = 0;
  function size() {
    W = Math.ceil(innerWidth);
    H = Math.ceil(innerHeight);
    canvas.width = W;
    canvas.height = H;
  }
  size();

  // flowmap: quarter-res ping-pong, influence in r, drag direction in gb
  var FW = Math.max(1, Math.round(W / 4));
  var FH = Math.max(1, Math.round(H / 4));
  function target(data) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, FW, FH, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo: fbo, tex: tex };
  }
  var seed = new Uint8Array(FW * FH * 4);
  for (var i = 0; i < FW * FH; i++) {
    seed[4 * i] = 0;
    seed[4 * i + 1] = 128;
    seed[4 * i + 2] = 128;
    seed[4 * i + 3] = 255;
  }
  var ping = target(seed);
  var pong = target(seed);
  var flip = false;

  var mouse = { x: 0.5, y: 0.5, sx: 0.5, sy: 0.5, vx: 0, vy: 0 };
  var moved = false;
  function onMove(e) {
    moved = true;
    mouse.x = e.clientX / W;
    mouse.y = 1 - e.clientY / H;
  }
  if (!coarse.matches) addEventListener("mousemove", onMove, { passive: true });

  function drawFlow() {
    var src = flip ? ping : pong;
    var dst = flip ? pong : ping;
    flip = !flip;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, FW, FH);
    gl.useProgram(flowP);
    bindQuad(flowP);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(FU.u_prev, 0);
    gl.uniform2f(FU.u_mouse, mouse.sx, mouse.sy);
    gl.uniform2f(FU.u_velocity, mouse.vx, mouse.vy);
    gl.uniform1f(FU.u_brushRadius, BRUSH_RADIUS);
    gl.uniform1f(FU.u_brushStrength, moved && !coarse.matches ? BRUSH_STRENGTH : 0);
    gl.uniform1f(FU.u_decay, DECAY);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return dst;
  }

  function drawFluid(t, flowTex) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(fluidP);
    bindQuad(fluidP);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, flowTex);
    gl.uniform1i(DU.u_flowmap, 0);
    gl.uniform1f(DU.u_time, t);
    gl.uniform2f(DU.u_resolution, W, H);
    gl.uniform1f(DU.u_scale, SCALE);
    gl.uniform2f(DU.u_offset, OFFSET_X, OFFSET_Y);
    gl.uniform1f(DU.u_grain, 0);
    gl.uniform1f(DU.u_distortBoost, DISTORT_BOOST);
    gl.uniform1f(DU.u_swirlBoost, SWIRL_BOOST);
    gl.uniform1f(DU.u_glowIntensity, GLOW);
    gl.uniform3fv(DU.u_glowColor1, GLOWS[0]);
    gl.uniform3fv(DU.u_glowColor2, GLOWS[1]);
    gl.uniform3fv(DU.u_glowColor3, GLOWS[2]);
    gl.uniform3fv(DU.u_c1, PALETTE[0]);
    gl.uniform3fv(DU.u_c2, PALETTE[1]);
    gl.uniform3fv(DU.u_c3, PALETTE[2]);
    gl.uniform3fv(DU.u_c4, PALETTE[3]);
    gl.uniform3fv(DU.u_c5, PALETTE[4]);
    gl.uniform2f(DU.u_lightPos, 0, 0);
    gl.uniform1f(DU.u_lightCore, 0);
    gl.uniform1f(DU.u_lightHalo, 0);
    gl.uniform1f(DU.u_vignette, VIGNETTE);
    gl.uniform1f(DU.u_bloomThreshold, 1);
    gl.uniform1f(DU.u_bloomRange, 0.1);
    gl.uniform1f(DU.u_bloomStrength, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  var raf = 0;
  var last = 0;
  var frame = 1000 / FPS;
  var t0 = performance.now();

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < frame) return;
    last = now - ((now - last) % frame);
    if (canvas.width !== Math.ceil(innerWidth) || canvas.height !== Math.ceil(innerHeight)) size();
    mouse.sx += (mouse.x - mouse.sx) * MOUSE_SMOOTHING;
    mouse.sy += (mouse.y - mouse.sy) * MOUSE_SMOOTHING;
    mouse.vx += ((mouse.x - mouse.sx) * 0.5 - mouse.vx) * MOUSE_VELOCITY;
    mouse.vy += ((mouse.y - mouse.sy) * 0.5 - mouse.vy) * MOUSE_VELOCITY;
    var dst = drawFlow();
    drawFluid((now - t0) * 0.001 * SPEED, dst.tex);
  }

  function still() {
    drawFluid(STILL_T, (flip ? pong : ping).tex);
  }

  function start() {
    if (!raf && !reduced.matches) raf = requestAnimationFrame(loop);
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  if (reduced.matches) still();
  else start();

  reduced.addEventListener("change", function () {
    stop();
    if (reduced.matches) still();
    else start();
  });
})();
