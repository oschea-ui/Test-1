// AI Labeling Background (Three.js + HUD canvas)
// - Minimal dependencies: Three.js from CDN via ESM import
// - Modes: 'minimal' or 'hyper'
// - Interactive: true/false (subtle parallax)
// - Respects prefers-reduced-motion
// - Auto quality scaler for low-end machines

import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';

const DEFAULTS = {
  accent: '#35e0c2',     // electric cyan/teal accent
  line: 'rgba(255,255,255,0.45)',
  hudAlpha: 0.8,
  dprMax: 1.5,           // cap DPR for perf
  mode: 'minimal',
  interactive: false
};

export function initAIBg(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  const container = document.getElementById('ai-bg') || createContainer();
  const glCanvas = document.getElementById('ai-bg-gl');
  const hudCanvas = document.getElementById('ai-bg-hud');
  const hudCtx = hudCanvas.getContext('2d');

  // Quality scaler
  let scale = 1;
  const maxDPR = cfg.dprMax;
  const baseDPR = Math.min(maxDPR, window.devicePixelRatio || 1);

  // Three.js renderer
  const renderer = new THREE.WebGLRenderer({
    canvas: glCanvas,
    antialias: false,
    alpha: true,
    powerPreference: 'low-power'
  });
  renderer.setClearColor(0x000000, 0);

  // Orthographic camera in screen space
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Full-screen quad for grid + sweep shader
  const plane = new THREE.PlaneGeometry(2, 2);
  const uniforms = {
    u_time: { value: 0 },
    u_res:  { value: new THREE.Vector2(1, 1) },
    u_gridScale: { value: cfg.mode === 'hyper' ? 22.0 : 26.0 },
    u_lineWidth: { value: cfg.mode === 'hyper' ? 0.015 : 0.012 },
    u_opacity: { value: cfg.mode === 'hyper' ? 0.55 : 0.42 },
    u_accent: { value: new THREE.Color(cfg.accent) },
    u_sweepOpacity: { value: cfg.mode === 'hyper' ? 0.22 : 0.12 },
    u_noiseAmp: { value: cfg.mode === 'hyper' ? 0.6 : 0.35 }
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec2 v_uv;
      void main() {
        v_uv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 v_uv;
      uniform vec2 u_res;
      uniform float u_time;
      uniform float u_gridScale;
      uniform float u_lineWidth;
      uniform float u_opacity;
      uniform vec3 u_accent;
      uniform float u_sweepOpacity;
      uniform float u_noiseAmp;

      // Simple hash noise
      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 345.45));
        p += dot(p, p + 34.345);
        return fract(p.x * p.y);
      }

      // Soft grid line using smoothstep
      float gridLine(vec2 uv, float scale, float lineWidth) {
        vec2 g = abs(fract(uv * scale) - 0.5);
        float d = min(g.x, g.y);
        float line = 1.0 - smoothstep(0.5 - lineWidth, 0.5, 0.5 - d);
        return line;
      }

      void main() {
        // Maintain square cells regardless of aspect
        vec2 uv = v_uv;
        float aspect = u_res.x / u_res.y;
        vec2 suv = vec2(uv.x * aspect, uv.y);

        // Base grid
        float grid = gridLine(suv, u_gridScale, u_lineWidth);

        // Sub-grid for hyper mode richness
        float sub = gridLine(suv + 0.002, u_gridScale * 3.0, u_lineWidth * 0.6);

        // Scanning sweep band moves vertically
        float t = u_time * 0.05;
        float band = smoothstep(0.0, 1.0, 1.0 - abs(fract(uv.y + t) * 2.0 - 1.0));
        band = pow(band, 2.0);

        // Subtle animated noise to avoid static feel
        float n = hash(floor(suv * 10.0) + floor(t * 10.0));

        vec3 col = vec3(0.0);
        col += mix(vec3(0.6), u_accent, 0.1) * grid;
        col += mix(vec3(0.35), u_accent, 0.25) * sub * 0.5;
        col += u_accent * band * u_sweepOpacity;

        // Tiny twinkle on intersections
        col += u_accent * n * 0.04;

        gl_FragColor = vec4(col, (grid * 0.5 + sub * 0.25) * u_opacity + band * u_sweepOpacity);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  scene.add(new THREE.Mesh(plane, material));

  // HUD entities (2D canvas overlay)
  const rng = mulberry32(0xdecafbad);
  const classes = ['Person', 'Car', 'Bicycle', 'Dog', 'Bus'];
  const palette = {
    base: 'rgba(255,255,255,0.6)',
    accent: hexToRgba(cfg.accent, 0.9),
    labelBg: 'rgba(0,0,0,0.65)',
    mask: hexToRgba(cfg.accent, cfg.mode === 'hyper' ? 0.12 : 0.07),
    bracket: 'rgba(255,255,255,0.7)'
  };

  const counts = cfg.mode === 'hyper'
    ? { boxes: 14, masks: 4, trails: true, keypoints: true }
    : { boxes: 8, masks: 0, trails: false, keypoints: false };

  const entities = makeEntities(counts.boxes, classes, rng);

  // State
  let rafId = 0;
  let running = !prefersReduced;
  let lastT = performance.now();
  let avgFrame = 16;
  let parallax = { x: 0, y: 0, targetX: 0, targetY: 0 };

  // Resize setup
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    const dpr = baseDPR * scale;

    // GL
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    uniforms.u_res.value.set(w * dpr, h * dpr);

    // HUD
    hudCanvas.width = Math.round(w * dpr);
    hudCanvas.height = Math.round(h * dpr);
    hudCanvas.style.width = w + 'px';
    hudCanvas.style.height = h + 'px';
    hudCtx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels

    // Clear on resize
    hudCtx.clearRect(0, 0, w, h);
  }

  resize();
  window.addEventListener('resize', debounce(resize, 150), { passive: true });

  // Interactivity (subtle parallax)
  if (cfg.interactive && !prefersReduced) {
    window.addEventListener('mousemove', (e) => {
      const rect = container.getBoundingClientRect();
      const nx = (e.clientX - rect.width / 2) / rect.width;
      const ny = (e.clientY - rect.height / 2) / rect.height;
      parallax.targetX = nx * 10; // px
      parallax.targetY = ny * 10; // px
    }, { passive: true });

    // Mobile tilt (very subtle)
    window.addEventListener('deviceorientation', (e) => {
      const nx = (e.gamma || 0) / 45;
      const ny = (e.beta || 0) / 45;
      parallax.targetX = clamp(nx, -1, 1) * 10;
      parallax.targetY = clamp(ny, -1, 1) * 10;
    }, { passive: true });
  }

  // Visibility pause
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  if (running) start();
  else renderStatic();

  function start() {
    if (rafId) return;
    running = true;
    lastT = performance.now();
    loop();
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function loop(now) {
    rafId = requestAnimationFrame(loop);
    const t = performance.now();
    const dt = Math.min(64, t - lastT);
    lastT = t;

    // Frame time smoothing and autoscale
    avgFrame = avgFrame * 0.9 + dt * 0.1;
    if (avgFrame > 26 && scale > 0.75) { // drop quality if < ~38fps
      scale = 0.75; resize();
    } else if (avgFrame > 30 && scale > 0.5) { // drop more if needed
      scale = 0.5; resize();
    }

    // Animate uniforms
    uniforms.u_time.value = t * 0.001;

    // Parallax easing
    parallax.x += (parallax.targetX - parallax.x) * 0.08;
    parallax.y += (parallax.targetY - parallax.y) * 0.08;
    glCanvas.style.transform = `translate3d(${parallax.x}px, ${parallax.y}px, 0)`;
    hudCanvas.style.transform = `translate3d(${parallax.x * 1.2}px, ${parallax.y * 1.2}px, 0)`; // slight depth

    // Update entities and draw HUD
    stepEntities(entities, dt, container.clientWidth, container.clientHeight, counts, rng);
    drawHUD(hudCtx, entities, counts, palette, container.clientWidth, container.clientHeight, cfg);

    // Render GL
    renderer.render(scene, camera);
  }

  function renderStatic() {
    // One static frame (grid rendered once, HUD minimal)
    uniforms.u_time.value = 0.0;
    renderer.render(scene, camera);
    stepEntities(entities, 0, container.clientWidth, container.clientHeight, counts, rng);
    drawHUD(hudCtx, entities, counts, palette, container.clientWidth, container.clientHeight, cfg, true);
  }
}

/* ---------------- Helpers and HUD ---------------- */

function createContainer() {
  const div = document.createElement('div');
  div.id = 'ai-bg';
  div.innerHTML = `<canvas id="ai-bg-gl"></canvas><canvas id="ai-bg-hud"></canvas><div class="shade"></div>`;
  div.style.position = 'fixed';
  div.style.inset = '0';
  div.style.pointerEvents = 'none';
  div.style.zIndex = '0';
  document.body.prepend(div);
  return div;
}

function hexToRgba(hex, a = 1) {
  const c = hex.replace('#', '');
  const bigint = parseInt(c, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function debounce(fn, ms) {
  let id; return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
}

function makeEntities(count, classes, rng) {
  const ents = [];
  for (let i = 0; i < count; i++) {
    const cls = classes[Math.floor(rng() * classes.length)];
    ents.push({
      id: i + 1,
      cls,
      conf: 0.75 + rng() * 0.24,
      x: rng(), y: rng(),
      w: 0.12 + rng() * 0.18,
      h: 0.10 + rng() * 0.18,
      vx: (rng() - 0.5) * 0.02,
      vy: (rng() - 0.5) * 0.02,
      life: 6000 + rng() * 6000,
      age: 0,
      trail: []
    });
  }
  return ents;
}

function stepEntities(ents, dt, w, h, counts, rng) {
  const dts = dt / 1000;
  for (const e of ents) {
    e.age += dt;
    // Move with slow drift and a little noise
    e.x += e.vx * dts + (rng() - 0.5) * 0.0006;
    e.y += e.vy * dts + (rng() - 0.5) * 0.0006;

    // Bounce at bounds with slight re-seeding
    if (e.x < 0 || e.x > 1) { e.vx *= -1; e.x = clamp(e.x, 0.02, 0.98); e.conf = 0.75 + rng() * 0.24; }
    if (e.y < 0 || e.y > 1) { e.vy *= -1; e.y = clamp(e.y, 0.02, 0.98); e.conf = 0.75 + rng() * 0.24; }

    // Occasion re-size and class flip in hyper mode
    if (counts.trails && e.age % 3000 < dt) {
      if (rng() < 0.35) {
        e.w = clamp(e.w * (0.85 + rng() * 0.3), 0.10, 0.32);
        e.h = clamp(e.h * (0.85 + rng() * 0.3), 0.09, 0.30);
      }
    }

    // Trails
    if (counts.trails) {
      e.trail.push({ x: e.x, y: e.y, t: performance.now() });
      if (e.trail.length > 14) e.trail.shift();
    }
  }
}

function drawHUD(ctx, ents, counts, palette, w, h, cfg, staticFrame = false) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();

  // Global alpha
  ctx.globalAlpha = cfg.hudAlpha;

  // Optional translucent "segmentation" masks (hyper)
  if (counts.masks > 0) {
    for (let i = 0; i < counts.masks; i++) {
      const e = ents[(i * 3) % ents.length];
      const r = rectPx(e, w, h, 0.9);
      ctx.fillStyle = palette.mask;
      roundedRect(ctx, r.x + 4, r.y + 4, r.w - 8, r.h - 8, 10);
      ctx.fill();
    }
  }

  // Draw trails (hyper)
  if (counts.trails) {
    for (const e of ents) {
      if (e.trail.length < 2) continue;
      ctx.strokeStyle = hexToRgba('#ffffff', 0.15);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < e.trail.length; i++) {
        const p = e.trail[i];
        const px = p.x * w, py = p.y * h;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  // Boxes and labels
  for (const e of ents) {
    const r = rectPx(e, w, h);
    // Corner brackets
    drawBrackets(ctx, r.x, r.y, r.w, r.h, palette.bracket);

    // Label pill
    const label = `${e.cls} ${(e.conf * 100) | 0}%`;
    const pill = drawLabel(ctx, r.x, r.y - 8, label, palette);

    // Optional keypoints (hyper + only for Person)
    if (counts.keypoints && e.cls === 'Person') {
      drawKeypoints(ctx, r.x, r.y, r.w, r.h, palette.accent);
    }
  }

  // Micro UI text (hyper)
  if (counts.trails) {
    ctx.font = '11px "DM Sans", ui-sans-serif, system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('Auto-labeling: ON', 12, h - 24);
    ctx.fillText('Tracker: Active', 12, h - 10);
  }

  ctx.restore();

  // If static frame requested, no animated effects needed beyond this point.
}

function rectPx(e, w, h, padScale = 1.0) {
  const cx = e.x * w, cy = e.y * h;
  const rw = e.w * w * padScale;
  const rh = e.h * h * padScale;
  return { x: cx - rw / 2, y: cy - rh / 2, w: rw, h: rh };
}

function drawBrackets(ctx, x, y, w, h, color) {
  const L = Math.max(10, Math.min(24, Math.min(w, h) * 0.18)); // bracket length
  const R = 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  // TL
  ctx.moveTo(x, y + L); ctx.lineTo(x, y); ctx.lineTo(x + L, y);
  // TR
  ctx.moveTo(x + w - L, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + L);
  // BR
  ctx.moveTo(x + w, y + h - L); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - L, y + h);
  // BL
  ctx.moveTo(x + L, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - L);
  ctx.stroke();
}

function drawLabel(ctx, x, y, text, palette) {
  ctx.font = '12px "Space Grotesk", "DM Sans", ui-sans-serif, system-ui';
  const metrics = ctx.measureText(text);
  const padX = 8, padY = 5;
  const w = Math.ceil(metrics.width + padX * 2);
  const h = 20;
  const rx = Math.max(6, h / 2);

  ctx.fillStyle = palette.labelBg;
  roundedRect(ctx, x, y - h, w, h, rx);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(text, x + padX, y - 6);
  return { w, h };
}

function drawKeypoints(ctx, x, y, w, h, color) {
  // Minimal 5-point stick figure
  const pts = [
    { x: x + w * 0.5, y: y + h * 0.25 },
    { x: x + w * 0.5, y: y + h * 0.45 },
    { x: x + w * 0.38, y: y + h * 0.45 },
    { x: x + w * 0.62, y: y + h * 0.45 },
    { x: x + w * 0.5, y: y + h * 0.65 }
  ];
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y);
  ctx.moveTo(pts[1].x, pts[1].y); ctx.lineTo(pts[2].x, pts[2].y);
  ctx.moveTo(pts[1].x, pts[1].y); ctx.lineTo(pts[3].x, pts[3].y);
  ctx.moveTo(pts[1].x, pts[1].y); ctx.lineTo(pts[4].x, pts[4].y);
  ctx.stroke();
  ctx.fillStyle = color;
  for (const p of pts) {
    ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
