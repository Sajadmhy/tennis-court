/* Hero scene: a WebGL tennis shot (racket, ball, court, palms) drawn in one fragment shader.
   Exposes window.createHero(canvas, opts) -> { play, pause, stop, resize, renderAt }. */
(function (global) {
function createHero(canvas, opts) {

  opts = opts || {};
  var gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'high-performance' });
  if (!gl) return null;

  // ---------- vector helpers ----------
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function rot(v, k, th) { var c = Math.cos(th), s = Math.sin(th), kv = cross(k, v), kd = dot(k, v) * (1 - c); return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd]; }
  function axisMat(k, th) { // column-major mat3 for GLSL
    var c = Math.cos(th), s = Math.sin(th), t = 1 - c, x = k[0], y = k[1], z = k[2];
    return [t * x * x + c, t * x * y + s * z, t * x * z - s * y, t * x * y - s * z, t * y * y + c, t * y * z + s * x, t * x * z + s * y, t * y * z - s * x, t * z * z + c];
  }
  function matMul(a, b) { var r = new Array(9); for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) { r[j * 3 + i] = a[i] * b[j * 3] + a[3 + i] * b[j * 3 + 1] + a[6 + i] * b[j * 3 + 2]; } return r; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function smooth(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }

  // ---------- scene layout ----------
  var UPW = [0, 1, 0];
  var C0 = [-7.6, 1.45, 3.0];
  var F = norm([0.927, 0.068, -0.375]);
  var SUN = norm([0.866, 0.07, -0.50]);
  var POLE = [8.7, 0.6];
  var LP = [POLE[0] - 0.85, 7.05, POLE[1]];
  var R = norm(cross(F, UPW));
  var U = cross(R, F);
  var FOC = 0.86;
  var H0 = add(add(C0, mul(F, FOC)), mul(U, 0.035));
  var N0 = norm(add(add(mul(F, 0.85), mul(U, 0.42)), mul(R, -0.12)));
  var DH = norm(add(add(mul(U, 0.8), mul(R, -0.5)), mul(F, -0.15)));
  var Z0 = N0;
  var Y0 = norm(sub(DH, mul(Z0, dot(DH, Z0))));
  var X0 = cross(Y0, Z0);
  var HEADY = 0.50, BR = 0.0335;
  var B0 = sub(H0, mul(Y0, HEADY));
  var W0 = sub(B0, mul(Y0, 0.16));

  var T = 6.6, TI = 2.3, TC = 0.16, TH_READY = -0.30, TH_BACK = -0.52, TH_FOLLOW = 0.75, SW0 = 1.15, SWB = 1.75;
  function theta(t) {
    if (t < SW0) return TH_READY + 0.03 * Math.sin(t * 2.2);
    if (t < SWB) { var ub = smooth((t - SW0) / (SWB - SW0)); return TH_READY + 0.03 * Math.sin(SW0 * 2.2) * (1 - ub) + (TH_BACK - TH_READY) * ub; }
    if (t < TI) { var u = (t - SWB) / (TI - SWB); return TH_BACK + (0 - TH_BACK) * u * u; }
    var vel = 2 * (0 - TH_BACK) / (TI - SWB); // matching velocity at impact
    var t1 = TI + 0.9;
    if (t < t1) { var u2 = (t - TI) / (t1 - TI); // cubic with start vel, end vel 0
      var d = TH_FOLLOW, dur = t1 - TI; var a = vel * dur;
      // hermite: p0=0,p1=d,m0=a,m1=0
      var h = (u2 * u2 * u2 - 2 * u2 * u2 + u2) * a + (-2 * u2 * u2 * u2 + 3 * u2 * u2) * d; return h; }
    var t2 = TI + 1.2;
    if (t < t2) return TH_FOLLOW;
    var u3 = smooth((t - t2) / (T - t2)); return TH_FOLLOW + (TH_READY - TH_FOLLOW) * u3;
  }
  function racketPose(t) {
    var th = theta(t);
    var Y = rot(Y0, X0, th), Z = rot(Z0, X0, th), X = X0.slice();
    var B = add(W0, rot(sub(B0, W0), X0, th));
    // pronation roll about handle axis + post-impact vibration
    var roll = th * 0.22;
    var dt = t - TI;
    if (dt > 0) roll += 0.03 * Math.exp(-dt * 5.0) * Math.sin(dt * 55.0);
    X = rot(X, Y, roll); Z = rot(Z, Y, roll);
    return { B: B, X: X, Y: Y, Z: Z, H: add(B, mul(Y, HEADY)) };
  }

  // seeded random
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  var parts = [];
  for (var i = 0; i < 10; i++) {
    var a = rnd() * Math.PI * 2;
    var dir = add(mul(X0, Math.cos(a)), mul(Y0, Math.sin(a)));
    parts.push({ dir: dir, sp: 0.25 + rnd() * 0.55, back: rnd() * 0.25, up: 0.05 + rnd() * 0.25, r: 0.75 + rnd() * 0.25, life: 0.9 + rnd() * 0.8 });
  }

  var vOut = mul(norm(add(add(F, mul(U, 0.10)), mul(R, -0.16))), 11.0);
  var spinAx = norm(cross(norm(vOut), UPW));
  function ballState(t) {
    var st = { p: null, sq: 0, n: N0, a: 1, rotm: null, parts: [], puff: [0, 0, 0, 0.001], puffA: 0, dent: 0 };
    var inRot = axisMat(R, 1.3 * t);
    if (t < TI) {
      var dt = t - TI;
      var pose = racketPose(TI);
      var cimp = sub(pose.H, mul(pose.Z, BR));
      var vin = [0.015, -0.36, 0.04];
      st.p = add(add(cimp, mul(vin, dt)), [0, 0.5 * -0.16 * dt * dt, 0]);
      st.rotm = inRot;
      st.a = smooth((t - 0.05) / 0.2);
    } else if (t < TI + TC) {
      var u = (t - TI) / TC;
      var k = Math.sin(Math.PI * u) * 0.30;
      var pose2 = racketPose(t);
      st.p = sub(pose2.H, mul(pose2.Z, BR * (1 - k)));
      st.sq = k; st.n = pose2.Z; st.rotm = axisMat(R, 1.3 * TI); st.dent = k;
    } else {
      var pr = racketPose(TI + TC);
      var c0 = sub(pr.H, mul(pr.Z, BR));
      // integrate with bounce
      var p = c0.slice(), v = vOut.slice(), tt = TI + TC, step = 1 / 240;
      while (tt < t) { var h = Math.min(step, t - tt); v[1] -= 2.4 * h; p = add(p, mul(v, h)); if (p[1] < BR && v[1] < 0) { p[1] = BR; v[1] = -v[1] * 0.72; v[0] *= 0.85; v[2] *= 0.85; } tt += h; }
      st.p = p;
      var age = t - (TI + TC);
      st.rotm = matMul(axisMat(spinAx, age * 32.0), axisMat(R, 1.3 * TI));
      st.a = 1 - smooth((age - 2.2) / 0.5);
      // felt specks
      for (var j = 0; j < parts.length; j++) {
        var q = parts[j];
        if (age > q.life) { st.parts.push([0, 0, 0, 0]); continue; }
        var pos0 = add(c0, mul(q.dir, BR * q.r));
        var vel = add(add(mul(q.dir, q.sp), mul(N0, -q.back)), mul(UPW, q.up));
        var pp = add(add(pos0, mul(vel, age)), [0, -0.5 * 0.9 * age * age, 0]);
        st.parts.push([pp[0], pp[1], pp[2], (1 - age / q.life) * smooth(age / 0.05)]);
      }
      st.puff = [c0[0], c0[1], c0[2], 0.03 + age * 0.09];
      st.puffA = 0.28 * (1 - smooth(age / 0.7)) * smooth(age / 0.04);
    }
    while (st.parts.length < 10) st.parts.push([0, 0, 0, 0]);
    return st;
  }

  // ---------- palm silhouettes (canvas) ----------
  function palmAtlas() {
    var cv = document.createElement('canvas'); cv.width = 2048; cv.height = 1024;
    var x = cv.getContext('2d');
    x.fillStyle = '#fff'; x.strokeStyle = '#fff'; x.lineCap = 'round';
    for (var c = 0; c < 4; c++) {
      seed = 101 + c * 37;
      var ox = c * 512;
      var baseX = ox + 256 + (rnd() - 0.5) * 30, baseY = 1024;
      var lean = (rnd() - 0.5) * 90;
      var topX = ox + 256 + lean, topY = 250 + rnd() * 40;
      var cx1 = ox + 256 + lean * 0.2 + (rnd() - 0.5) * 40, cy1 = 650;
      // trunk
      for (var s = 0; s <= 1.0001; s += 0.004) {
        var ix = (1 - s) * (1 - s) * baseX + 2 * (1 - s) * s * cx1 + s * s * topX;
        var iy = (1 - s) * (1 - s) * baseY + 2 * (1 - s) * s * cy1 + s * s * topY;
        var w = 13 - 6 * s + (Math.sin(s * 160) > 0.6 ? 1.2 : 0);
        x.beginPath(); x.arc(ix, iy, w, 0, Math.PI * 2); x.fill();
      }
      // skirt of old fronds
      for (var k = 0; k < 14; k++) {
        var a0 = Math.PI * 0.5 + (rnd() - 0.5) * 1.6;
        var L = 60 + rnd() * 70;
        x.lineWidth = 2 + rnd() * 2;
        x.beginPath(); x.moveTo(topX, topY + 10); x.quadraticCurveTo(topX + Math.cos(a0) * L * 0.4, topY + 10 + Math.sin(a0) * L * 0.3, topX + Math.cos(a0) * L * 0.5, topY + 10 + Math.sin(a0) * L); x.stroke();
      }
      // fronds
      var nF = 17 + Math.floor(rnd() * 5);
      for (var f = 0; f < nF; f++) {
        var ang = -Math.PI + (f + rnd() * 0.6) / nF * Math.PI * 2;
        var up = Math.sin(ang) < 0; // pointing up
        if (!up && rnd() < 0.5) ang = -ang;
        up = Math.sin(ang) < 0;
        var Lf = 160 + rnd() * 90;
        var dx = Math.cos(ang), dy = Math.sin(ang);
        var droop = (up ? 0.25 + 0.35 * Math.abs(dx) : 0.75) * Lf * (0.7 + rnd() * 0.5);
        var p0 = [topX, topY], p1 = [topX + dx * Lf * 0.55, topY + dy * Lf * 0.55 - (up ? 30 : 0)], p2 = [topX + dx * Lf, topY + dy * Lf * 0.6 + droop];
        x.lineWidth = 3.2;
        x.beginPath(); x.moveTo(p0[0], p0[1]); x.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]); x.stroke();
        for (var t2 = 0.08; t2 < 1.0; t2 += 0.022) {
          var bx = (1 - t2) * (1 - t2) * p0[0] + 2 * (1 - t2) * t2 * p1[0] + t2 * t2 * p2[0];
          var by = (1 - t2) * (1 - t2) * p0[1] + 2 * (1 - t2) * t2 * p1[1] + t2 * t2 * p2[1];
          var tx = 2 * (1 - t2) * (p1[0] - p0[0]) + 2 * t2 * (p2[0] - p1[0]);
          var ty = 2 * (1 - t2) * (p1[1] - p0[1]) + 2 * t2 * (p2[1] - p1[1]);
          var tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
          var ll = 46 * Math.pow(1 - t2, 0.55) * (0.65 + rnd() * 0.5) + 6;
          for (var sd = -1; sd <= 1; sd += 2) {
            var nx = -ty * sd, ny = tx * sd;
            var lx = nx * 0.6 + tx * 0.55, ly = ny * 0.6 + ty * 0.55 + 1.1;
            var lq = Math.hypot(lx, ly); lx /= lq; ly /= lq;
            x.lineWidth = 1.2 + (1 - t2) * 1.1;
            x.beginPath(); x.moveTo(bx, by);
            x.quadraticCurveTo(bx + lx * ll * 0.5 + nx * 4, by + ly * ll * 0.4, bx + lx * ll, by + ly * ll + ll * 0.25);
            x.stroke();
          }
        }
      }
      // coconuts
      for (var n2 = 0; n2 < 6; n2++) { x.beginPath(); x.arc(topX + (rnd() - 0.5) * 22, topY + 12 + rnd() * 14, 6 + rnd() * 3, 0, Math.PI * 2); x.fill(); }
    }
    return cv;
  }

  // ---------- shaders ----------
  var VS = 'attribute vec2 p; void main(){ gl_Position = vec4(p,0.0,1.0); }';
  var FS = [
'precision highp float;',
'uniform vec2 uRes; uniform float uTime; uniform float uPix;',
'uniform vec3 uCP, uCR, uCU, uCF; uniform vec2 uTan, uShift;',
'uniform vec3 uRB, uRX, uRY, uRZ;',
'uniform vec3 uBall, uSqN; uniform float uSq, uBallA, uDent; uniform mat3 uBRot;',
'uniform vec4 uPart[10]; uniform vec4 uPuff; uniform float uPuffA;',
'uniform sampler2D uPalm; uniform float uFocus, uAper, uExpo;',
'uniform vec3 uSun, uLPos; uniform vec2 uPole;',
'#define PI 3.14159265',
'#define LPOS uLPos',
'#define SUND uSun',
'const float BR = 0.0335;',
'float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }',
'float hash13(vec3 p3){ p3 = fract(p3*0.1031); p3 += dot(p3, p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }',
'float noise2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash12(i),hash12(i+vec2(1,0)),f.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),f.x), f.y); }',
'float noise3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);',
'  return mix(mix(mix(hash13(i),hash13(i+vec3(1,0,0)),f.x),mix(hash13(i+vec3(0,1,0)),hash13(i+vec3(1,1,0)),f.x),f.y),',
'             mix(mix(hash13(i+vec3(0,0,1)),hash13(i+vec3(1,0,1)),f.x),mix(hash13(i+vec3(0,1,1)),hash13(i+vec3(1,1,1)),f.x),f.y), f.z); }',
'float fbm2(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*noise2(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }',
'float coc(float t){ return uAper*abs(t-uFocus)/uFocus; }',
// ---- sky ----
'vec3 skyBase(vec3 rd){',
'  float ep = max(rd.y,0.0);',
'  vec3 zen = vec3(0.003,0.012,0.26); vec3 mid = vec3(0.012,0.075,0.92); vec3 low = vec3(0.16,0.10,0.95);',
'  vec3 c = mix(mid, zen, smoothstep(0.06,0.80,ep));',
'  c = mix(low, c, smoothstep(0.0,0.10,ep));',
'  vec3 hd = normalize(vec3(rd.x,0.0,rd.z)+1e-5);',
'  float az = max(dot(hd, normalize(vec3(SUND.x,0.0,SUND.z))),0.0);',
'  float band = exp(-ep*26.0);',
'  c = mix(c, vec3(1.0,0.14,0.42), band*(0.15+0.85*pow(az,3.0)));',
'  c += vec3(1.0,0.36,0.10)*exp(-ep*60.0)*pow(az,9.0)*0.9;',
'  return c;',
'}',
'float birds(float ang, float e){',
'  float m = 0.0; float T = mod(uTime*0.012, 1.5) - 0.2;',
'  vec2 c0 = vec2(0.62 - T, 0.205 + 0.015*sin(uTime*0.05));',
'  for(int i=0;i<11;i++){ float fi=float(i); float side = mod(fi,2.0)*2.0-1.0; float k = floor((fi+1.0)*0.5);',
'    vec2 bp = c0 + vec2(k*0.011, side*k*0.004 - k*0.0012) + 0.0012*vec2(sin(uTime*0.7+fi*1.3), cos(uTime*0.6+fi));',
'    vec2 d = vec2(ang,e) - bp; float fl = 0.55+0.45*sin(uTime*8.0+fi*2.0);',
'    float dd = length(d*vec2(0.8, 1.0/(0.35+0.65*fl)));',
'    m = max(m, 1.0 - smoothstep(0.0005, 0.0013, dd)); }',
'  return m;',
'}',
'vec3 sky(vec3 rd, float pix){',
'  vec3 c = skyBase(rd);',
'  float e = max(rd.y,0.0); float ang = atan(rd.x,-rd.z);',
'  vec3 hd = normalize(vec3(rd.x,0.0,rd.z)+1e-5);',
'  float az = max(dot(hd, normalize(vec3(SUND.x,0.0,SUND.z))),0.0);',
'  vec2 q = vec2(ang*2.4 + uTime*0.003, e*24.0);',
'  float n = fbm2(q + vec2(0.0, fbm2(q*0.6+3.0)*1.4));',
'  float cover = smoothstep(0.54,0.80,n) * smoothstep(0.010,0.04,e) * (1.0 - smoothstep(0.06,0.17,e));',
'  vec3 cc = mix(vec3(0.10,0.05,0.45), vec3(1.0,0.22,0.50), 0.15+0.85*pow(az,1.5)) * (0.9 + 0.8*az);',
'  c = mix(c, cc, cover*0.92);',
'  float n2 = fbm2(vec2(ang*1.2 - uTime*0.002, e*5.0)*vec2(1.0,2.6)+7.0);',
'  c += vec3(0.30,0.22,0.70)*smoothstep(0.62,0.88,n2)*smoothstep(0.18,0.32,e)*(1.0-smoothstep(0.45,0.75,e))*0.22;',
'  c = mix(c, vec3(0.01,0.008,0.03), birds(ang, e));',
'  return c;',
'}',
'vec3 farScene(vec3 rd, float pix){',
'  vec3 c = sky(rd, pix);',
'  float ang = atan(rd.x,-rd.z); float e = rd.y;',
'  float hz = 0.002 + 0.010*pow(fbm2(vec2(ang*9.0, 3.1)),2.0)*2.0 + 0.006*smoothstep(0.62,0.78, noise2(vec2(ang*26.0,1.0))) + 0.003*step(0.8, noise2(vec2(ang*120.0,5.0)));',
'  float sil = 1.0 - smoothstep(hz - pix*2.0, hz + pix*2.0, e);',
'  c = mix(c, mix(vec3(0.010,0.006,0.035), skyBase(vec3(rd.x,0.02,rd.z))*0.30, 0.45), sil);',
'  float cell = floor(ang*140.0);',
'  float rr = hash12(vec2(cell, 4.0));',
'  if (rr > 0.62) {',
'    float ca = (cell + 0.5 + (hash12(vec2(cell,7.0))-0.5)*0.6)/140.0;',
'    float ce = 0.0015 + hash12(vec2(cell,9.0))*0.004;',
'    float r = 0.0019; float dl = length(vec2(ang-ca, e-ce));',
'    float b = 1.0 - smoothstep(r*0.65, r, dl);',
'    vec3 lc = mix(vec3(1.0,0.55,0.25), vec3(0.75,0.85,1.0), step(0.85,rr));',
'    c += lc*b*(0.6+0.6*hash12(vec2(cell,2.0)));',
'  }',
'  return c;',
'}',
// ---- ground ----
'float lineCov(float d, float bw){ return 1.0 - smoothstep(-bw, bw, d); }',
'vec3 courtCol(vec3 p, vec3 rd, float bw){',
'  vec2 q = p.xz; float ax=abs(q.x), az=abs(q.y);',
'  float inD = (1.0-smoothstep(5.485-bw,5.485+bw,ax))*(1.0-smoothstep(11.885-bw,11.885+bw,az));',
'  vec3 blue = vec3(0.006,0.045,0.30); vec3 green = vec3(0.010,0.13,0.032);',
'  vec3 alb = mix(green, blue, inD);',
'  float g = noise2(q*28.0)*0.6 + noise2(q*90.0)*0.4;',
'  alb *= 0.88 + 0.24*mix(g, 0.5, smoothstep(0.004,0.03,bw));',
'  float L = 0.0;',
'  L = max(L, lineCov(max(abs(az-11.885)-0.05, ax-5.485), bw));',
'  L = max(L, lineCov(max(abs(ax-5.485)-0.025, az-11.885), bw));',
'  L = max(L, lineCov(max(abs(ax-4.115)-0.025, az-11.885), bw));',
'  L = max(L, lineCov(max(abs(az-6.40)-0.025, ax-4.115), bw));',
'  L = max(L, lineCov(max(ax-0.025, az-6.40), bw));',
'  L = max(L, lineCov(max(ax-0.025, max(az-11.885, 11.785-az)), bw));',
'  alb = mix(alb, vec3(0.82,0.84,0.88), L);',
'  vec3 lv = LPOS - p; float ld2 = dot(lv,lv); float ndl = max(lv.y,0.0)/sqrt(ld2);',
'  vec3 light = vec3(0.12,0.15,0.40) + vec3(0.9,0.95,1.0)*26.0*ndl/ld2;',
'  vec3 c = alb*light;',
'  float fres = pow(1.0 - clamp(-rd.y,0.0,1.0), 5.0);',
'  c += skyBase(reflect(rd, vec3(0.0,1.0,0.0)))*fres*0.16;',
'  return c;',
'}',
'vec3 groundFar(vec3 p, vec3 rd, float pix){',
'  if (length(p.xz) > 36.0) {',
'    vec3 r = reflect(rd, vec3(0.0,1.0,0.0));',
'    float w = noise2(vec2(p.x*0.6, p.z*2.5) + vec2(uTime*0.2, 0.0));',
'    r.x += (w-0.5)*0.006; r.y = max(r.y, 0.0005);',
'    return farScene(r, pix)*0.28 + vec3(0.002,0.004,0.016);',
'  }',
'  vec3 lv = LPOS - p; float ld2 = dot(lv,lv);',
'  float gn = 0.7 + 0.6*fbm2(p.xz*0.35);',
'  return vec3(0.004,0.016,0.010)*gn*(1.0+40.0/ld2);',
'}',
// ---- palms ----
'vec4 palmP(int i){',
'  if(i==0) return vec4(2.1,-21.6,9.8,0.0);',
'  if(i==1) return vec4(6.6,-20.2,10.6,1.0);',
'  if(i==2) return vec4(12.6,-15.8,9.2,2.0);',
'  if(i==3) return vec4(15.9,-10.8,10.8,3.0);',
'  if(i==4) return vec4(18.6,-4.8,9.6,0.0);',
'  if(i==5) return vec4(19.8,2.2,10.2,1.0);',
'  return vec4(19.0,8.6,9.4,2.0);',
'}',
'vec4 palms(vec3 ro, vec3 rd, float pix, float tmax){',
'  vec4 acc = vec4(0.0); float best = 1e9;',
'  for(int i=0;i<7;i++){',
'    vec4 pp = palmP(i); vec3 P = vec3(pp.x,0.0,pp.y);',
'    vec3 Nn = normalize(vec3(P.x-ro.x,0.0,P.z-ro.z)); vec3 Tt = vec3(-Nn.z,0.0,Nn.x);',
'    float dn = dot(rd,Nn); if (dn < 1e-4) continue;',
'    float t = dot(P-ro,Nn)/dn; if (t<0.0 || t>tmax) continue;',
'    vec3 hp = ro+rd*t; float h = pp.z;',
'    vec2 uv = vec2(dot(hp-P,Tt)/(h*0.5)+0.5, 1.0 - hp.y/h);',
'    float sway = sin(uTime*0.55+float(i)*1.7)*0.010 + sin(uTime*1.3+float(i))*0.004;',
'    uv.x += sway*smoothstep(0.45,0.0,uv.y);',
'    if (uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0) continue;',
'    if (mod(float(i),2.0)>0.5) uv.x = 1.0-uv.x;',
'    float blurPx = coc(t)/t/pix;',
'    float a = texture2D(uPalm, vec2((pp.w+uv.x)/4.0, uv.y), log2(max(blurPx,1.0))).a;',
'    if (a>0.002 && t<best) { best = t; acc = vec4(vec3(0.004,0.005,0.016) + skyBase(vec3(0.0,0.02,-1.0))*0.012, a); }',
'  }',
'  return acc;',
'}',
// ---- fence ----
'vec4 fenceAt(vec3 p, float s, float bw, float wall, float scr){',
'  if (p.y < 0.0 || p.y > 3.7) return vec4(0.0);',
'  float cell = 0.055;',
'  vec2 dd = vec2(s + p.y, s - p.y)/cell;',
'  float d = min(abs(fract(dd.x+0.5)-0.5), abs(fract(dd.y+0.5)-0.5))*cell*0.7071;',
'  float wire = 0.0018;',
'  float pat = 1.0 - smoothstep(wire-bw, wire+bw, d);',
'  float cov = mix(pat, 0.11, smoothstep(cell*0.10, cell*0.40, bw));',
'  float dp = abs(fract(s/3.0+0.5)-0.5)*3.0;',
'  float post = 1.0 - smoothstep(0.035-bw, 0.035+bw, dp);',
'  float rail = 1.0 - smoothstep(0.025-bw, 0.025+bw, abs(p.y-3.6));',
'  float a = max(cov, max(post, rail));',
'  vec3 c = vec3(0.006,0.007,0.014);',
'  if (wall > 0.5) {',
'    float w = 1.0 - smoothstep(0.95-bw, 0.95+bw, p.y);',
'    vec3 lv = LPOS - p; float ld2 = dot(lv,lv);',
'    vec3 wc = vec3(0.70,0.62,0.92)*(0.90+0.16*noise2(vec2(s*9.0,p.y*9.0)))*(0.045 + 4.0/ld2);',
'    wc *= 0.75 + 0.35*smoothstep(0.80,0.93,p.y);',
'    c = mix(c, wc, w); a = max(a, w);',
'  }',
'  if (scr > 0.5) { float sc = 1.0 - smoothstep(2.0-bw, 2.0+bw, p.y); vec3 lv2 = LPOS - p;',
'    vec3 scc = vec3(0.010,0.016,0.045)*(0.9+0.2*noise2(vec2(s*3.0,p.y*8.0))) + vec3(0.25,0.3,0.6)*1.2/dot(lv2,lv2);',
'    scc *= 1.0 - 0.35*(1.0 - smoothstep(0.0,0.03+bw, dp));',
'    c = mix(c, scc, sc); a = max(a, sc); }',
'  a *= 1.0 - smoothstep(3.62-bw, 3.62+bw, p.y);',
'  return vec4(c, a);',
'}',
// ---- net ----
'vec4 netLayer(vec3 ro, vec3 rd, float pix, out float tn){',
'  tn = 1e9; if (abs(rd.z) < 1e-5) return vec4(0.0);',
'  float t = -ro.z/rd.z; if (t <= 0.0) return vec4(0.0);',
'  vec3 p = ro+rd*t; float ax = abs(p.x);',
'  if (ax > 6.4 || p.y < 0.0) return vec4(0.0);',
'  float h = 0.914 + 0.156*pow(ax/6.4, 2.0);',
'  float bw = t*pix/max(abs(rd.z),0.25) + coc(t);',
'  if (p.y > h + bw*2.0) return vec4(0.0);',
'  tn = t;',
'  float cell = 0.045;',
'  vec2 g = abs(fract(p.xy/cell+0.5)-0.5)*cell; float d = min(g.x,g.y);',
'  float pat = 1.0 - smoothstep(0.0015-bw, 0.0015+bw, d);',
'  float mesh = mix(pat, 0.14, smoothstep(cell*0.1, cell*0.4, bw));',
'  float top = 1.0 - smoothstep(h-bw, h+bw, p.y);',
'  float tape = smoothstep(h-0.065-bw, h-0.065+bw, p.y)*top;',
'  float strap = (1.0 - smoothstep(0.025-bw, 0.025+bw, ax))*top;',
'  vec3 lv = LPOS - p; float ld2 = dot(lv,lv);',
'  vec3 wc = vec3(0.85,0.86,0.95)*(0.10 + 14.0/ld2);',
'  vec3 c = mix(vec3(0.004,0.005,0.008), wc, max(tape,strap));',
'  float a = max(mesh*0.92*top, max(tape,strap));',
'  return vec4(c, a);',
'}',
// ---- generic coverage of a vertical pole ----
'vec4 vpole(vec3 ro, vec3 rd, vec2 c, float r, float y0, float y1, float pix, vec3 col, out float tp){',
'  tp = 1e9; vec2 oc = ro.xz - c; vec2 d = rd.xz; float a = dot(d,d); if (a < 1e-6) return vec4(0.0);',
'  float t = -dot(oc,d)/a; if (t < 0.0) return vec4(0.0);',
'  float dist = length(oc + d*t); float y = ro.y + rd.y*t;',
'  float bw = t*pix + coc(t);',
'  float cv = (1.0 - smoothstep(r-bw, r+bw, dist)) * smoothstep(y0-bw, y0+bw, y) * (1.0 - smoothstep(y1-bw, y1+bw, y));',
'  if (cv <= 0.0) return vec4(0.0);',
'  tp = t; return vec4(col, cv);',
'}',
'vec2 segRay(vec3 ro, vec3 rd, vec3 a, vec3 b){',
'  vec3 ba = b-a; vec3 w0 = ro-a; float B = dot(rd,ba), C = dot(ba,ba), D = dot(rd,w0), E = dot(ba,w0);',
'  float den = C - B*B; float s = den > 1e-8 ? clamp((E - B*D)/den, 0.0, 1.0) : 0.0;',
'  vec3 q = a + ba*s; float t = dot(q-ro, rd); return vec2(length(ro+rd*t-q), t);',
'}',
// ---- racket SDF ----
'float smin(float a, float b, float k){ float h = clamp(0.5+0.5*(b-a)/k,0.0,1.0); return mix(b,a,h)-k*h*(1.0-h); }',
'float dot2(vec2 v){ return dot(v,v); }',
'float sdBezier(vec2 pos, vec2 A, vec2 B, vec2 C){',
'  vec2 a = B - A; vec2 b = A - 2.0*B + C; vec2 c = a*2.0; vec2 d = A - pos;',
'  float kk = 1.0/dot(b,b); float kx = kk*dot(a,b); float ky = kk*(2.0*dot(a,a)+dot(d,b))/3.0; float kz = kk*dot(d,a);',
'  float res = 0.0; float p = ky - kx*kx; float p3 = p*p*p; float q = kx*(2.0*kx*kx-3.0*ky) + kz; float h = q*q + 4.0*p3;',
'  if (h >= 0.0) { h = sqrt(h); vec2 x = (vec2(h,-h)-q)/2.0; vec2 uv = sign(x)*pow(abs(x), vec2(1.0/3.0));',
'    float t = clamp(uv.x+uv.y-kx, 0.0, 1.0); res = dot2(d + (c + b*t)*t); }',
'  else { float z = sqrt(-p); float v = acos(clamp(q/(p*z*2.0),-1.0,1.0))/3.0; float m = cos(v); float n = sin(v)*1.732050808;',
'    vec3 t = clamp(vec3(m+m,-n-m,n-m)*z-kx, 0.0, 1.0); res = min(dot2(d+(c+b*t.x)*t.x), dot2(d+(c+b*t.y)*t.y)); }',
'  return sqrt(res);',
'}',
'float sdOct(vec2 p, float r){ const vec3 k = vec3(-0.9238795325, 0.3826834323, 0.4142135623); p = abs(p);',
'  p -= 2.0*min(dot(vec2(k.x,k.y),p),0.0)*vec2(k.x,k.y); p -= 2.0*min(dot(vec2(-k.x,k.y),p),0.0)*vec2(-k.x,k.y);',
'  p -= vec2(clamp(p.x, -k.z*r, k.z*r), r); return length(p)*sign(p.y); }',
'float sdCross(vec2 q, vec2 h, float r){ vec2 d = abs(q)-h; return length(max(d,0.0)) + min(max(d.x,d.y),0.0) - r; }',
'const vec2 HE = vec2(0.128,0.163);',
'float ellD(vec2 q){ float k0 = length(q/HE); float k1 = length(q/(HE*HE)); return k0*(k0-1.0)/max(k1,1e-4); }',
'vec2 mapR(vec3 p){',
'  float de = ellD(p.xy - vec2(0.0,0.50));',
'  float dF = sdCross(vec2(de, p.z), vec2(0.0042,0.0080), 0.0034);',
'  vec2 pm = vec2(abs(p.x), p.y);',
'  float db = sdBezier(pm, vec2(0.060,0.356), vec2(0.040,0.288), vec2(0.0105,0.236));',
'  float dA = sdCross(vec2(db, p.z), vec2(0.0034,0.0074), 0.0032);',
'  vec3 s = vec3(abs(p.x), p.y-0.213, abs(p.z));',
'  float dS = length(max(s - vec3(0.0075,0.025,0.0078),0.0)) - 0.0034;',
'  float o = sdOct(p.xz, 0.0135);',
'  vec2 hh = vec2(o, abs(p.y-0.101)-0.089);',
'  float dH = length(max(hh,0.0)) + min(max(hh.x,hh.y),0.0) - 0.0016;',
'  float o2 = sdOct(p.xz, 0.0152);',
'  vec2 bb = vec2(o2, abs(p.y-0.007)-0.007);',
'  float dB = length(max(bb,0.0)) + min(max(bb.x,bb.y),0.0) - 0.002;',
'  float d = smin(dF, dA, 0.010); d = smin(d, dS, 0.012);',
'  float m = 0.0;',
'  if (dH < d) { d = dH; m = 2.0; }',
'  if (dB < d) { d = dB; m = 3.0; }',
'  return vec2(d, m);',
'}',
'vec3 nR(vec3 p){ const vec2 k = vec2(1.0,-1.0); float e = 0.00025;',
'  return normalize(k.xyy*mapR(p+k.xyy*e).x + k.yyx*mapR(p+k.yyx*e).x + k.yxy*mapR(p+k.yxy*e).x + k.xxx*mapR(p+k.xxx*e).x); }',
// ---- lighting ----
'vec3 LFd(){ return normalize(-uCF + uCU*0.75 + uCR*0.55); }',
'float ggx(vec3 n, vec3 v, vec3 l, float r){ vec3 h = normalize(v+l); float nh = max(dot(n,h),0.0); float a = r*r; float a2 = a*a;',
'  float d = nh*nh*(a2-1.0)+1.0; float lh = max(dot(l,h),0.05); return a2/(PI*d*d) * max(dot(n,l),0.0) * 0.25/(lh*lh); }',
'vec3 envCol(vec3 r){ return r.y > 0.0 ? skyBase(r) : mix(vec3(0.01,0.05,0.12), vec3(0.01,0.03,0.02), clamp(-r.y*4.0,0.0,1.0)); }',
'vec3 lit(vec3 p, vec3 n, vec3 v, vec3 alb, float rough, float f0, float coat, float sheen, float shF){',
'  vec3 lf = LFd(); vec3 lp = normalize(LPOS-p); vec3 ls = SUND;',
'  vec3 cf = vec3(1.0,0.96,0.92)*2.4; vec3 cp = vec3(0.80,0.90,1.0)*2.6; vec3 cs = vec3(1.0,0.26,0.48)*2.6;',
'  float hy = n.y*0.5+0.5;',
'  vec3 col = alb*(mix(vec3(0.02,0.06,0.04), vec3(0.14,0.22,0.75), hy) + vec3(0.40,0.06,0.20)*max(dot(n, normalize(vec3(SUND.x,0.0,SUND.z))),0.0))*0.8;',
'  float w = sheen*0.45;',
'  col += alb*cf*clamp((dot(n,lf)+w)/(1.0+w),0.0,1.0)*shF;',
'  col += alb*cp*clamp((dot(n,lp)+w)/(1.0+w),0.0,1.0);',
'  col += alb*cs*clamp((dot(n,ls)+w)/(1.0+w),0.0,1.0);',
'  float nv = max(dot(n,v),0.0);',
'  float fr = f0 + (1.0-f0)*pow(1.0-nv,5.0);',
'  col += (cf*ggx(n,v,lf,rough)*shF + cp*ggx(n,v,lp,rough) + cs*ggx(n,v,ls,rough))*fr;',
'  vec3 r = reflect(-v,n);',
'  col += envCol(r)*fr*(1.0-rough*0.85)*0.9;',
'  if (coat > 0.0) { float fc = 0.04 + 0.96*pow(1.0-nv,5.0);',
'    col += coat*(envCol(r)*fc*1.2 + (cf*ggx(n,v,lf,0.07)*shF + cp*ggx(n,v,lp,0.07) + cs*ggx(n,v,ls,0.07))*fc); }',
'  if (sheen > 0.0) { float sv = pow(1.0-nv, 3.0);',
'    col += alb*sv*sheen*(cp*max(dot(n,lp)+0.6,0.0) + cs*max(dot(n,ls)+0.6,0.0) + cf*0.25)*0.55; }',
'  return col;',
'}',
// ---- ball ----
'vec3 seamPt(float t){ return vec3(0.7*cos(t)+0.3*cos(3.0*t), 0.7*sin(t)-0.3*sin(3.0*t), 0.9165*sin(2.0*t)); }',
'vec3 sqInv(vec3 v){ float a = dot(v,uSqN); vec3 pr = v - a*uSqN; return pr/(1.0+0.42*uSq) + uSqN*a/(1.0-uSq); }',
'float ballHit(vec3 ro, vec3 rd, out vec3 n, out vec3 q, out float fz){',
'  vec3 o = sqInv(ro - uBall); vec3 d = sqInv(rd);',
'  float a = dot(d,d), b = dot(o,d), c = dot(o,o) - BR*BR;',
'  float md = sqrt(max(dot(o,o) - b*b/a, 0.0));',
'  fz = md - BR;',
'  float h = b*b - a*c; q = vec3(0.0); n = vec3(0.0,1.0,0.0);',
'  if (h < 0.0) return -1.0;',
'  float t = (-b - sqrt(h))/a; if (t < 0.0) return -1.0;',
'  q = o + d*t; n = normalize(sqInv(q)); return t;',
'}',
'vec3 ballShade(vec3 q, vec3 n, vec3 wp, vec3 v){',
'  vec3 u = uBRot * normalize(q);',
'  float best = 1e3; float bt = 0.0;',
'  for (int i=0;i<64;i++){ float tt = float(i)/64.0*6.2831853; vec3 s = seamPt(tt); float dd = dot(u-s,u-s); if (dd<best){best=dd; bt=tt;} }',
'  float stp = 6.2831853/64.0;',
'  for (int j=0;j<5;j++){ stp *= 0.5; float d1 = dot(u-seamPt(bt-stp),u-seamPt(bt-stp)); float d2 = dot(u-seamPt(bt+stp),u-seamPt(bt+stp));',
'    if (d1<best){best=d1; bt-=stp;} else if (d2<best){best=d2; bt+=stp;} }',
'  float sd = sqrt(best);',
'  float seam = 1.0 - smoothstep(0.030, 0.050, sd);',
'  float groove = smoothstep(0.028,0.05,sd)*(1.0-smoothstep(0.05,0.10,sd));',
'  float f1 = noise3(u*55.0), f2 = noise3(u*150.0), f3 = noise3(u*9.0);',
'  vec3 nb = normalize(n + (vec3(noise3(u*80.0+3.1), noise3(u*80.0+7.7), noise3(u*80.0+11.3))-0.5)*0.55*(1.0-seam));',
'  vec3 alb = vec3(0.58,0.84,0.015)*(0.80 + 0.22*f1 + 0.12*f2 + 0.10*f3);',
'  alb = mix(alb, vec3(0.74,0.78,0.62), seam);',
'  alb *= 1.0 - 0.18*groove;',
'  vec3 c = lit(wp, nb, v, alb, 0.85, 0.02, 0.0, 1.0-seam, 1.0);',
'  return c;',
'}',
// ---- strings ----
'vec4 stringsL(vec3 ro, vec3 rd, out float ts, float pix){',
'  ts = 1e9; vec3 Hc = uRB + uRY*0.50;',
'  float dn = dot(rd, uRZ); if (abs(dn) < 1e-4) return vec4(0.0);',
'  float t = dot(Hc-ro, uRZ)/dn; if (t < 0.0) return vec4(0.0);',
'  vec3 hp = ro + rd*t - Hc; vec2 l = vec2(dot(hp,uRX), dot(hp,uRY));',
'  vec2 ab = vec2(0.1180,0.1530); float e = length(l/ab);',
'  float pw = t*pix/max(abs(dn),0.2);',
'  float inside = 1.0 - smoothstep(1.0 - pw/ab.x, 1.0 + pw/ab.x, e);',
'  if (inside <= 0.0) return vec4(0.0);',
'  ts = t;',
'  float sm = 0.0139, sc = 0.0153, r = 0.00068;',
'  float xm = fract(l.x/sm + 0.5) - 0.5; float yc = fract(l.y/sc + 0.5) - 0.5;',
'  float dm = abs(xm)*sm, dc = abs(yc)*sc;',
'  float aw = max(pw*0.5, 0.0001);',
'  float cm = 1.0 - smoothstep(r-aw, r+aw, dm); float cc = 1.0 - smoothstep(r-aw, r+aw, dc);',
'  float avg = 2.0*r/sm + 2.0*r/sc;',
'  float blend = smoothstep(1.5*r, 4.0*r, pw);',
'  float cov = mix(max(cm,cc), min(avg,1.0), blend) * inside;',
'  if (cov <= 0.001) return vec4(0.0);',
'  vec3 zf = -sign(dn)*uRZ;',
'  float om = clamp(xm*sm/r, -0.9, 0.9), oc = clamp(yc*sc/r, -0.9, 0.9);',
'  vec3 n = cm >= cc ? normalize(uRX*om + zf*sqrt(1.0-om*om)) : normalize(uRY*oc + zf*sqrt(1.0-oc*oc));',
'  n = normalize(mix(n, zf, blend));',
'  vec3 wp = ro + rd*t;',
'  // ball contact shadow from fill light + dent darkening',
'  vec3 lf = LFd(); vec3 tb = uBall - wp; float along = dot(tb, lf);',
'  float perp = length(tb - lf*along);',
'  float sh = along > 0.0 ? smoothstep(BR*0.6, BR*1.6, perp) : 1.0;',
'  sh = mix(1.0, sh, uBallA);',
'  float ao = 1.0 - 0.35*cm*cc;',
'  vec3 alb = vec3(0.30,0.62,0.025);',
'  vec3 c = lit(wp, n, -rd, alb, 0.35, 0.04, 0.0, 0.0, sh) * ao * 0.55;',
'  float dr = length(l); c *= 1.0 - uDent*0.5*exp(-dr*dr/(0.035*0.035));',
'  return vec4(c, cov);',
'}',
// ---- main ----
'void main(){',
'  vec2 uv = (gl_FragCoord.xy / uRes)*2.0 - 1.0;',
'  vec3 rd = normalize(uCF + (uv.x+uShift.x)*uTan.x*uCR + (uv.y+uShift.y)*uTan.y*uCU);',
'  vec3 ro = uCP;',
'  float pix = uPix;',
'  // far layers',
'  vec3 col; float tg = 1e9;',
'  if (rd.y < -1e-4) { tg = -ro.y/rd.y; }',
'  vec3 gp = ro + rd*min(tg, 1e5);',
'  bool inCourt = tg < 1e8 && abs(gp.x) < 9.5 && gp.z > -18.3 && gp.z < 18.3;',
'  if (tg < 1e8 && !inCourt) col = groundFar(gp, rd, pix); else col = farScene(rd, pix);',
'  vec4 pl = palms(ro, rd, pix, inCourt ? 0.0 : (tg < 1e8 ? tg : 1e9));',
'  col = mix(col, pl.rgb, pl.a);',
'  if (inCourt) { float bw = tg*pix/max(-rd.y,0.02) + coc(tg); col = courtCol(gp, rd, bw); }',
'  float tfront = inCourt ? tg : 1e9;',
'  // fences (back z=-18.3, sides x=+-9.5)',
'  if (abs(rd.z) > 1e-5) { float t = (-18.3 - ro.z)/rd.z; if (t > 0.0 && t < tfront) { vec3 p = ro+rd*t; if (abs(p.x) < 9.5) { float bw = t*pix/max(abs(rd.z),0.2)+coc(t); vec4 f = fenceAt(p, p.x, bw, 1.0, 0.0); col = mix(col, f.rgb, f.a); } } }',
'  if (abs(rd.x) > 1e-5) { float sx = rd.x > 0.0 ? 9.5 : -9.5; float t = (sx - ro.x)/rd.x; if (t > 0.0 && t < tfront) { vec3 p = ro+rd*t; if (p.z > -18.3 && p.z < 18.3) { float bw = t*pix/max(abs(rd.x),0.2)+coc(t); vec4 f = fenceAt(p, p.z, bw, 0.0, sx > 0.0 ? 1.0 : 0.0); col = mix(col, f.rgb, f.a); } } }',
'  // light pole + head',
'  float tp; vec4 pole = vpole(ro, rd, uPole, 0.075, 0.0, 7.0, pix, vec3(0.55,0.58,0.75)*0.35, tp);',
'  if (tp < tfront) col = mix(col, pole.rgb, pole.a);',
'  vec2 arm = segRay(ro, rd, vec3(uPole.x,6.95,uPole.y), vec3(uPole.x-0.62,7.12,uPole.y));',
'  float abw = arm.y*pix + coc(arm.y);',
'  col = mix(col, vec3(0.20,0.22,0.30), (1.0-smoothstep(0.05-abw,0.05+abw,arm.x))*step(arm.y,tfront));',
'  // net + posts',
'  float tn; vec4 net = netLayer(ro, rd, pix, tn);',
'  if (tn < tfront) col = mix(col, net.rgb, net.a);',
'  float tq; vec4 np1 = vpole(ro, rd, vec2(6.4,0.0), 0.04, 0.0, 1.07, pix, vec3(0.02,0.04,0.04), tq); if (tq < tfront) col = mix(col, np1.rgb, np1.a);',
'  vec4 np2 = vpole(ro, rd, vec2(-6.4,0.0), 0.04, 0.0, 1.07, pix, vec3(0.02,0.04,0.04), tq); if (tq < tfront) col = mix(col, np2.rgb, np2.a);',
'  // stray balls near the net',
'  for (int i=0;i<4;i++){ vec3 bc = i==0 ? vec3(-1.6,BR,-0.7) : (i==1 ? vec3(-0.6,BR,-0.35) : (i==2 ? vec3(0.9,BR,-1.1) : vec3(-2.6,BR,1.4)));',
'    vec3 oc = ro-bc; float b = dot(oc,rd); float c = dot(oc,oc)-BR*BR; float h = b*b-c;',
'    float tt = -b; float md = sqrt(max(dot(oc,oc)-b*b,0.0)); float bw = tt*pix + coc(tt);',
'    float cv = 1.0 - smoothstep(BR-bw, BR+bw, md);',
'    if (cv > 0.0 && tt < tfront + 0.1) { vec3 n = normalize(ro+rd*tt - bc + vec3(0.0,0.0,0.0)); vec3 lv = LPOS-bc;',
'      vec3 bcol = vec3(0.58,0.84,0.02)*(0.16 + 14.0*max(dot(normalize(lv), n),0.0)/dot(lv,lv) + 0.25*max(n.y,0.0));',
'      col = mix(col, bcol, cv); } }',
'  // floodlight bloom',
'  vec3 toL = normalize(LPOS - ro); float ang = length(rd - toL);',
'  col += vec3(0.85,0.92,1.0)*(6.0*(1.0-smoothstep(0.006,0.0085,ang)) + 0.45*exp(-ang*22.0) + 0.06*exp(-ang*5.0));',
'  // ===== near objects =====',
'  float tR = -1.0; vec3 lp, ld;',
'  { vec3 o = ro - uRB; lp = vec3(dot(o,uRX), dot(o,uRY), dot(o,uRZ)); ld = vec3(dot(rd,uRX), dot(rd,uRY), dot(rd,uRZ));',
'    float t0 = 0.0, t1 = 1e9;',
'    bool ok = true;',
'    if (abs(ld.z) > 1e-5) { float a1 = (-0.019-lp.z)/ld.z, a2 = (0.019-lp.z)/ld.z; t0 = max(t0, min(a1,a2)); t1 = min(t1, max(a1,a2)); } else if (abs(lp.z) > 0.019) ok = false;',
'    vec3 oc = lp - vec3(0.0,0.336,0.0); float b = dot(oc,ld); float c = dot(oc,oc) - 0.375*0.375; float h = b*b - c;',
'    if (h < 0.0) ok = false; else { h = sqrt(h); t0 = max(t0, -b-h); t1 = min(t1, -b+h); }',
'    if (ok && t1 > t0) { float t = t0;',
'      for (int i=0;i<80;i++){ float d = mapR(lp+ld*t).x; if (d < 0.00018*(1.0+t)) { tR = t; break; } t += d*0.9; if (t > t1) break; } } }',
'  vec3 cR = vec3(0.0);',
'  if (tR > 0.0) {',
'    vec3 p = lp + ld*tR; vec3 nl = nR(p); vec3 nw = normalize(uRX*nl.x + uRY*nl.y + uRZ*nl.z); vec3 wp = ro + rd*tR;',
'    float m = mapR(p).y; vec3 alb; float rough = 0.38, coat = 1.0, f0 = 0.05;',
'    if (m < 0.5) {',
'      float g = clamp((p.y-0.20)/0.46, 0.0, 1.0);',
'      float cw = 0.85 + 0.15*step(0.5, fract((p.y+p.x)*260.0)) ;',
'      alb = vec3(0.010,0.011,0.014)*cw;',
'      alb = mix(alb, vec3(0.006,0.075,0.85), smoothstep(0.55,0.95,g));',
'      alb = mix(alb, vec3(0.92,0.012,0.22), (1.0-smoothstep(0.10,0.30,g))*step(0.0055,abs(p.z)));',
'      rough = 0.42;',
'      vec2 q = p.xy - vec2(0.0,0.50); float an = atan(q.x, q.y); float k0 = length(q/HE);',
'      float outer = smoothstep(1.035, 1.06, k0) * step(0.30, p.y);',
'      float bump = outer*(1.0 - smoothstep(0.95, 1.25, abs(an)));',
'      alb = mix(alb, vec3(0.012), bump); rough = mix(rough, 0.6, bump); coat *= 1.0-bump;',
'      float de = ellD(q);',
'      float stripe = (1.0 - smoothstep(0.0014, 0.0022, abs(de))) * step(0.0075, abs(p.z)) * (1.0 - smoothstep(0.25,0.32, abs(abs(an)-1.57))) * step(0.40, p.y);',
'      alb = mix(alb, vec3(0.55,0.95,0.04), stripe);',
'      float holes = outer*(1.0-bump)*(1.0 - smoothstep(0.18,0.30, abs(fract(an*7.0)-0.5)))*(1.0 - smoothstep(0.003,0.005,abs(p.z)));',
'      alb *= 1.0 - 0.7*holes;',
'    } else if (m < 2.5) {',
'      float a = atan(p.z, p.x); float ph = fract(p.y*60.0 + a/6.2831853);',
'      float ridge = smoothstep(0.0, 0.08, ph)*(1.0 - smoothstep(0.85, 1.0, ph));',
'      alb = vec3(0.80,0.82,0.86)*(0.7+0.3*ridge); rough = 0.75; coat = 0.0; f0 = 0.02;',
'      float neon = (1.0 - smoothstep(0.003,0.004, abs(p.y-0.186)));',
'      alb = mix(alb, vec3(0.55,0.95,0.04), neon);',
'      nw = normalize(nw + (ridge-0.5)*0.15*uRY);',
'    } else { alb = vec3(0.010); rough = 0.25; coat = 0.6; float ring = 1.0 - smoothstep(0.0012,0.002, abs(p.y-0.0125)); alb = mix(alb, vec3(0.95,0.015,0.20), ring); }',
'    cR = lit(wp, nw, -rd, alb, rough, f0, coat, 0.0, 1.0);',
'    float ao = clamp(mapR(p + nl*0.004).x/0.004, 0.4, 1.0); cR *= ao;',
'  }',
'  float tS; vec4 sL = stringsL(ro, rd, tS, pix);',
'  vec3 bn, bq; float fz; float tB = uBallA > 0.0 ? ballHit(ro, rd, bn, bq, fz) : -1.0;',
'  vec3 cB = vec3(0.0); if (tB > 0.0) cB = ballShade(bq, bn, ro+rd*tB, -rd);',
'  // fuzz halo',
'  vec4 fuzz = vec4(0.0); float tF = length(uBall - ro);',
'  if (uBallA > 0.0 && fz > 0.0 && fz < 0.0026) {',
'    vec3 dir = normalize(ro + rd*tF - uBall); vec3 u = uBRot*dir;',
'    float fa = pow(1.0 - fz/0.0026, 1.6) * (0.35 + 0.65*noise3(u*140.0 + uTime*0.0));',
'    vec3 fc = lit(uBall + dir*BR, dir, -rd, vec3(0.62,0.90,0.04), 0.9, 0.02, 0.0, 1.0, 1.0);',
'    fuzz = vec4(fc, fa*0.85*uBallA); }',
'  // particles + puff',
'  vec4 pc = vec4(0.0); float tP = 1e9;',
'  for (int i=0;i<10;i++){ vec4 pp = uPart[i]; if (pp.w <= 0.0) continue; float t = dot(pp.xyz - ro, rd); float d = length(ro+rd*t-pp.xyz);',
'    float a = pp.w*(1.0 - smoothstep(0.0005, 0.0013, d)); if (a > pc.a) { pc = vec4(vec3(0.55,0.85,0.06)*1.4, a); tP = t; } }',
'  if (uPuffA > 0.0) { float t = dot(uPuff.xyz - ro, rd); float d = length(ro+rd*t-uPuff.xyz); float a = uPuffA*exp(-d*d/(uPuff.w*uPuff.w))*(0.6+0.4*noise3((ro+rd*t)*120.0));',
'    vec3 c = vec3(0.70,0.80,0.45)*1.2; pc.rgb = mix(pc.rgb, c, a/(pc.a+a+1e-4)); pc.a = max(pc.a, a); tP = min(tP, t); }',
'  // composite near layers back-to-front (4 items)',
'  vec4 L0 = vec4(cR, tR > 0.0 ? 1.0 : 0.0); float t0 = tR > 0.0 ? tR : -1.0;',
'  vec4 L1 = sL; float t1 = sL.a > 0.0 ? tS : -1.0;',
'  vec4 L2 = vec4(cB, tB > 0.0 ? uBallA : 0.0); float t2 = tB > 0.0 ? tB : -1.0;',
'  if (tB <= 0.0 && fuzz.a > 0.0) { L2 = fuzz; t2 = tF; }',
'  vec4 L3 = pc; float t3 = pc.a > 0.0 ? tP : -1.0;',
'  // sort descending by t (bubble, unrolled)',
'  for (int k=0;k<3;k++){',
'    if (t0 < t1) { vec4 x=L0; L0=L1; L1=x; float y=t0; t0=t1; t1=y; }',
'    if (t1 < t2) { vec4 x=L1; L1=L2; L2=x; float y=t1; t1=t2; t2=y; }',
'    if (t2 < t3) { vec4 x=L2; L2=L3; L3=x; float y=t2; t2=t3; t3=y; } }',
'  if (t0 > 0.0) col = mix(col, L0.rgb, L0.a);',
'  if (t1 > 0.0) col = mix(col, L1.rgb, L1.a);',
'  if (t2 > 0.0) col = mix(col, L2.rgb, L2.a);',
'  if (t3 > 0.0) col = mix(col, L3.rgb, L3.a);',
'  // grade',
'  col *= uExpo;',
'  col = (col*(2.51*col+0.03))/(col*(2.43*col+0.59)+0.14);',
'  col = pow(clamp(col,0.0,1.0), vec3(1.0/2.2));',
'  vec2 sv = gl_FragCoord.xy/uRes - 0.5; col *= 1.0 - 0.22*dot(sv,sv)*1.6;',
'  col += (hash12(gl_FragCoord.xy + fract(uTime)*317.0) - 0.5)*0.018;',
'  gl_FragColor = vec4(col, 1.0);',
'}'
  ].join('\n');

  function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { var log = gl.getShaderInfoLog(s); if (opts.onError) opts.onError(log); throw new Error(log); } return s; }
  var prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.bindAttribLocation(prog, 0, 'p'); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { throw new Error(gl.getProgramInfoLog(prog)); }
  gl.useProgram(prog);
  var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  var loc = {};
  ['uRes', 'uTime', 'uPix', 'uCP', 'uCR', 'uCU', 'uCF', 'uTan', 'uShift', 'uRB', 'uRX', 'uRY', 'uRZ', 'uBall', 'uSqN', 'uSq', 'uBallA', 'uDent', 'uBRot', 'uPart', 'uPuff', 'uPuffA', 'uPalm', 'uFocus', 'uAper', 'uExpo', 'uSun', 'uLPos', 'uPole'].forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });

  var tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, palmAtlas());
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(loc.uPalm, 0);

  var maxScale = opts.scale || Math.min(window.devicePixelRatio || 1, 1.25), minScale = Math.min(0.55, maxScale);
  var scale = maxScale;
  var W = 0, Hh = 0, cam = {}, lcw = 0, lch = 0;
  function layout() {
    var cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1; lcw = cw; lch = ch;
    W = Math.max(2, Math.round(cw * scale)); Hh = Math.max(2, Math.round(ch * scale));
    if (canvas.width !== W || canvas.height !== Hh) { canvas.width = W; canvas.height = Hh; }
    var aspect = cw / ch;
    var k = smooth((aspect - 0.7) / 0.6); // 0 = portrait, 1 = landscape
    var vfov = 64 + (36 - 64) * k;
    var tx = 0.5 + (0.69 - 0.5) * k, ty = 0.71 + (0.47 - 0.71) * k;
    if (opts.target) { tx = opts.target[0]; ty = opts.target[1]; }
    var tanV = Math.tan(vfov * Math.PI / 360), tanH = tanV * aspect;
    var rel = sub(H0, C0);
    var nx = dot(rel, R) / dot(rel, F) / tanH, ny = dot(rel, U) / dot(rel, F) / tanV;
    cam = { tanV: tanV, tanH: tanH, sx: nx - (tx * 2 - 1), sy: ny - (1 - ty * 2) };
    gl.viewport(0, 0, W, Hh);
  }

  function frame(t) {
    var tc = ((t % T) + T) % T;
    var pose = racketPose(tc);
    var b = ballState(tc);
    var shake = [0, 0];
    var dI = tc - TI;
    if (dI > 0) { var e = Math.exp(-dI * 7.0); shake = [Math.sin(dI * 70) * 0.0016 * e, Math.cos(dI * 63) * 0.0012 * e]; }
    var Cp = add(add(add(C0, mul(R, 0.004 * Math.sin(t * 0.40) + shake[0])), mul(U, 0.003 * Math.sin(t * 0.33 + 1.0) + shake[1])), mul(F, 0.003 * Math.sin(t * 0.27)));
    gl.uniform2f(loc.uRes, W, Hh);
    gl.uniform1f(loc.uTime, t);
    gl.uniform1f(loc.uPix, 2 * cam.tanV / Hh);
    gl.uniform3fv(loc.uCP, Cp); gl.uniform3fv(loc.uCR, R); gl.uniform3fv(loc.uCU, U); gl.uniform3fv(loc.uCF, F);
    gl.uniform2f(loc.uTan, cam.tanH, cam.tanV); gl.uniform2f(loc.uShift, cam.sx, cam.sy);
    gl.uniform3fv(loc.uRB, pose.B); gl.uniform3fv(loc.uRX, pose.X); gl.uniform3fv(loc.uRY, pose.Y); gl.uniform3fv(loc.uRZ, pose.Z);
    gl.uniform3fv(loc.uBall, b.p); gl.uniform3fv(loc.uSqN, b.n); gl.uniform1f(loc.uSq, b.sq); gl.uniform1f(loc.uBallA, b.a); gl.uniform1f(loc.uDent, b.dent);
    gl.uniformMatrix3fv(loc.uBRot, false, b.rotm);
    var pa = []; for (var i = 0; i < 10; i++) pa.push.apply(pa, b.parts[i]);
    gl.uniform4fv(loc.uPart, pa);
    gl.uniform4fv(loc.uPuff, b.puff); gl.uniform1f(loc.uPuffA, b.puffA);
    gl.uniform3fv(loc.uSun, SUN); gl.uniform3fv(loc.uLPos, LP); gl.uniform2f(loc.uPole, POLE[0], POLE[1]);
    gl.uniform1f(loc.uFocus, FOC); gl.uniform1f(loc.uAper, opts.aperture || 0.0035); gl.uniform1f(loc.uExpo, opts.exposure || 1.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  layout();
  var raf = 0, running = false, last = 0, sim = opts.offset || 0, ema = 16, frames = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    var dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
    sim += dt * (opts.getSpeed ? opts.getSpeed() : 1);
    if (dt > 0) { ema = ema * 0.9 + dt * 1000 * 0.1; frames++;
      if (frames > 40) { frames = 0;
        if (ema > 24 && scale > minScale) { scale = Math.max(minScale, scale * 0.82); layout(); }
        else if (ema < 13 && scale < maxScale) { scale = Math.min(maxScale, scale * 1.08); layout(); } } }
    if (canvas.clientWidth !== lcw || canvas.clientHeight !== lch) layout();
    frame(sim);
  }
  var api = {
    renderAt: function (t) { layout(); frame(t); },
    play: function () { if (!running) { running = true; last = 0; raf = requestAnimationFrame(loop); } },
    pause: function () { running = false; cancelAnimationFrame(raf); },
    resize: layout,
    stop: function () { api.pause(); var ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
  };
  return api;

}
global.createHero = createHero;
})(window);
