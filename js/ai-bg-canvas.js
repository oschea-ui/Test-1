/* AI Object-Detection Style Background (Canvas 2D)
   - Fake looping “detection” overlay with moving shapes
   - Bounding boxes, label pills, and leader lines
   - Efficient: capped DPR, pauses in background, respects reduced motion
   - No dependencies, runs behind content with pointer-events: none
*/

(() => {
  const container = document.getElementById('ai-bg');
  if (!container) return;

  const world = document.getElementById('ai-bg-world'); // subtle moving silhouettes
  const hud = document.getElementById('ai-bg-hud');     // boxes, labels, leader lines
  const wctx = world.getContext('2d', { alpha: true });
  const hctx = hud.getContext('2d', { alpha: true });

  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  let running = !prefersReduced;

  // Visual tuning
  const ACCENT = '#35e0c2';
  const WORLD_FILL = 'rgba(255,255,255,0.06)';     // silhouettes
  const BOX_COLOR = 'rgba(255,255,255,0.70)';
  const LABEL_BG = 'rgba(0,0,0,0.70)';
  const LABEL_TEXT = 'rgba(255,255,255,0.95)';
  const LEADER_COLOR = 'rgba(255,255,255,0.35)';
  const ACCENT_RGBA = (a) => hexToRgba(ACCENT, a);

  // DPR cap for efficiency
  const DPR_CAP = 1.5;
  let dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);

  // Entities (cars, humans, objects)
  const classes = [
    { name: 'Car', kind: 'car' },
    { name: 'Human', kind: 'human' },
    { name: 'Object', kind: 'box' }
  ];
  const RNG = mulberry32(0xC0FFEE);

  // Build an initial set with sizes that feel plausible on a landing page
  let ents = [];
  function initEntities(count, W, H) {
    ents = [];
    for (let i = 0; i < count; i++) {
      const c = classes[Math.floor(RNG() * classes.length)];
      const dim = Math.min(W, H);
      const base = clamp(dim, 600, 1400);

      let w, h;
      if (c.kind === 'car') {
        w = randRange(base * 0.10, base * 0.16);
        h = w * randRange(0.36, 0.5);
      } else if (c.kind === 'human') {
        w = randRange(base * 0.05, base * 0.08);
        h = w * randRange(2.0, 2.8);
      } else {
        w = randRange(base * 0.06, base * 0.10);
        h = randRange(base * 0.06, base * 0.10);
      }

      const speed = randRange(14, 40); // px/s (slow, elegant)
      const dir = RNG() * Math.PI * 2;
      const vx = Math.cos(dir) * speed;
      const vy = Math.sin(dir) * speed;

      ents.push({
        id: i + 1,
        className: c.name,
        kind: c.kind,
        x: RNG() * (W - w),
        y: RNG() * (H - h),
        w, h,
        vx, vy,
        conf: 0.78 + RNG() * 0.20,
        labelSide: RNG() < 0.5 ? 'left' : 'right',
      });
    }
  }

  // Size and scale handling
  function sizeCanvases() {
    const W = container.clientWidth;
    const H = container.clientHeight;
    dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);

    for (const c of [world, hud]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      c.style.width = W + 'px';
      c.style.height = H + 'px';
    }
    wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!ents.length) {
      initEntities(10, W, H);
    }
  }

  sizeCanvases();
  window.addEventListener('resize', debounce(() => {
    // re-init entities on big size changes to keep proportions nice
    const W = container.clientWidth, H = container.clientHeight;
    sizeCanvases();
    if (ents.length) {
      // clamp positions to new bounds
      for (const e of ents) {
        e.x = clamp(e.x, 0, Math.max(0, W - e.w));
        e.y = clamp(e.y, 0, Math.max(0, H - e.h));
      }
    }
  }, 150), { passive: true });

  // Visibility pause to save battery
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else running = !prefersReduced;
  });

  let last = performance.now();

  function loop(now) {
    if (!running) {
      // Render one static frame when motion is reduced
      drawFrame(0);
      return;
    }
    requestAnimationFrame(loop);
    const t = performance.now();
    const dt = Math.min(48, t - last) / 1000; // seconds, clamp to avoid big jumps
    last = t;
    drawFrame(dt);
  }

  function drawFrame(dt) {
    const W = container.clientWidth;
    const H = container.clientHeight;

    // Update
    for (const e of ents) {
      e.x += e.vx * dt;
      e.y += e.vy * dt;

      // Gentle confidence jitter
      e.conf += (RNG() - 0.5) * 0.01;
      e.conf = clamp(e.conf, 0.70, 0.98);

      // Wrap-around for seamless looping
      const margin = 40;
      if (e.x > W + margin) e.x = -e.w - margin;
      if (e.y > H + margin) e.y = -e.h - margin;
      if (e.x + e.w < -margin) e.x = W + margin;
      if (e.y + e.h < -margin) e.y = H + margin;
    }

    // WORLD LAYER (subtle silhouettes)
    wctx.clearRect(0, 0, W, H);
    for (const e of ents) {
      wctx.fillStyle = WORLD_FILL;
      if (e.kind === 'car') {
        drawRoundedRect(wctx, e.x, e.y + e.h * 0.15, e.w, e.h * 0.7, 8);
        // small roof hint
        drawRoundedRect(wctx, e.x + e.w * 0.25, e.y, e.w * 0.50, e.h * 0.45, 6);
      } else if (e.kind === 'human') {
        // simple stick figure silhouette
        drawRoundedRect(wctx, e.x + e.w * 0.35, e.y + e.h * 0.25, e.w * 0.30, e.h * 0.60, 6);
        wctx.beginPath();
        wctx.arc(e.x + e.w * 0.5, e.y + e.h * 0.16, Math.min(e.w, e.h) * 0.22, 0, Math.PI * 2);
        wctx.fill();
      } else {
        drawRoundedRect(wctx, e.x, e.y, e.w, e.h, 10);
      }
    }

    // HUD LAYER (boxes, labels, leader lines)
    hctx.clearRect(0, 0, W, H);
    hctx.save();
    hctx.lineWidth = 1.5;

    for (const e of ents) {
      const rx = e.x, ry = e.y, rw = e.w, rh = e.h;

      // Corner brackets as the bounding box
      drawBrackets(hctx, rx, ry, rw, rh, BOX_COLOR);

      // Label pill
      const confText = `${Math.round(e.conf * 100)}%`;
      const text = `${e.className} ${confText}`;
      hctx.font = '12px "Space Grotesk", "DM Sans", system-ui, -apple-system, Segoe UI, Roboto';
      const metrics = hctx.measureText(text);
      const padX = 8, padY = 5;
      const labelW = Math.ceil(metrics.width + padX * 2);
      const labelH = 20;
      const anchor = chooseAnchor(rx, ry, rw, rh, W, H, e.labelSide);

      // Avoid edges
      let lx = anchor.x;
      let ly = anchor.y - 8 - labelH; // default above
      if (ly < 8) {
        ly = anchor.y + 8 + labelH; // place below if too close to top
      }
      if (e.labelSide === 'left') lx = Math.max(8, lx - (labelW + 12));
      else lx = Math.min(W - labelW - 8, lx + 12);

      // Leader line
      hctx.strokeStyle = LEADER_COLOR;
      hctx.beginPath();
      hctx.moveTo(anchor.x, anchor.y);
      hctx.lineTo(e.labelSide === 'left' ? lx + labelW : lx, ly - 6);
      hctx.stroke();

      // Label background
      hctx.fillStyle = LABEL_BG;
      drawRoundedRect(hctx, lx, ly - labelH, labelW, labelH, 10);
      hctx.fill();

      // Accent tick
      hctx.fillStyle = ACCENT_RGBA(0.9);
      hctx.fillRect(lx, ly - labelH, 3, labelH);

      // Label text
      hctx.fillStyle = LABEL_TEXT;
      hctx.fillText(text, lx + padX, ly - 6);
    }

    hctx.restore();
  }

  if (running) requestAnimationFrame(loop);
  else drawFrame(0);

  /* ---------- helpers ---------- */

  function drawRoundedRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
    ctx.fill();
  }

  function drawBrackets(ctx, x, y, w, h, color) {
    const L = clamp(Math.min(w, h) * 0.18, 10, 20);
    ctx.strokeStyle = color;
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

  function chooseAnchor(x, y, w, h, W, H, side) {
    // Anchor near top corners for a typical detection label feel
    if (side === 'left') return { x: x, y: y };
    return { x: x + w, y: y };
  }

  function randRange(a, b) { return a + (b - a) * RNG(); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function debounce(fn, ms) {
    let id; return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
  }

  function mulberry32(seed) {
    return function() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hexToRgba(hex, a = 1) {
    const c = hex.replace('#', '');
    const bigint = parseInt(c, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${a})`;
  }
})();
