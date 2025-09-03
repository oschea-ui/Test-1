/* AI Vision-style Background (Canvas 2D)
   - Multiple moving targets across the screen
   - Strong bounding boxes with leader lines to edge-aligned labels
   - Smooth looping, low CPU, respects reduced motion and pauses on hidden tabs
   - No dependencies, runs behind content (pointer-events: none)
*/

(() => {
  const container = document.getElementById('ai-bg');
  if (!container) return;

  const world = document.getElementById('ai-bg-world'); // backdrop grid + faint silhouettes
  const hud = document.getElementById('ai-bg-hud');     // boxes, lines, labels
  if (!world || !hud) return;

  const wctx = world.getContext('2d', { alpha: true });
  const hctx = hud.getContext('2d', { alpha: true });

  // Visual tuning
  const ACCENT = '#35e0c2';
  const WORLD_SIL = 'rgba(255,255,255,0.05)';   // silhouettes
  const GRID_LINE = 'rgba(255,255,255,0.06)';   // grid
  const SWEEP = 'rgba(53,224,194,0.08)';        // scanning band
  const BOX_COLOR = 'rgba(255,255,255,0.9)';    // bounding box/brackets
  const LEADER_COLOR = 'rgba(255,255,255,0.5)'; // leader lines
  const LABEL_BG = 'rgba(0,0,0,0.78)';          // label pill
  const LABEL_TEXT = 'rgba(255,255,255,0.95)';  // label text
  const LABEL_TICK = hexToRgba(ACCENT, 0.95);   // accent bar on label

  // Performance/behavior
  const DPR_CAP = 1.5;
  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  let running = !prefersReduced;
  let dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);

  // Entities (cars, humans, boxes)
  const classes = [
    { name: 'Car', kind: 'car' },
    { name: 'Human', kind: 'human' },
    { name: 'Object', kind: 'box' }
  ];
  const RNG = mulberry32(0xA11A11); // deterministic

  let ents = [];
  let last = performance.now();
  let tAccum = 0;

  function initEntities(W, H) {
    ents = [];
    // Count scales with viewport; more on bigger screens
    const base = Math.round(clamp(W * H / 80000, 10, 24)); // ~10 on small, up to ~24
    for (let i = 0; i < base; i++) {
      const cls = classes[Math.floor(RNG() * classes.length)];
      // Sizes relative to viewport
      const short = Math.min(W, H);
      let bw, bh;
      if (cls.kind === 'car') {
        bw = randRange(short * 0.08, short * 0.14);
        bh = bw * randRange(0.38, 0.52);
      } else if (cls.kind === 'human') {
        bw = randRange(short * 0.04, short * 0.06);
        bh = bw * randRange(2.2, 2.8);
      } else {
        bw = randRange(short * 0.06, short * 0.10);
        bh = randRange(short * 0.06, short * 0.10);
      }
      const speed = randRange(22, 58); // px/s
      const dir = RNG() * Math.PI * 2;
      const vx = Math.cos(dir) * speed;
      const vy = Math.sin(dir) * speed;

      const x = RNG() * (W - bw);
      const y = RNG() * (H - bh);

      ents.push({
        id: i + 1,
        className: cls.name,
        kind: cls.kind,
        x, y, w: bw, h: bh,
        vx, vy,
        conf: 0.82 + RNG() * 0.16,
        // Make lines cross the screen: half go to left gutter, half to right
        side: RNG() < 0.5 ? 'left' : 'right'
      });
    }
  }

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

    if (!ents.length) initEntities(W, H);
  }

  sizeCanvases();
  window.addEventListener('resize', debounce(() => {
    const W = container.clientWidth, H = container.clientHeight;
    sizeCanvases();
    // Reset entities on big aspect changes to keep composition nice
    ents = [];
    initEntities(W, H);
  }, 120), { passive: true });

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden && !prefersReduced;
    if (!running) drawFrame(0);
  });

  if (running) requestAnimationFrame(loop);
  else drawFrame(0);

  function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(50, now - last) / 1000;
    last = now;
    tAccum += dt;
    drawFrame(dt, tAccum);
  }

  function drawFrame(dt = 0, t = 0) {
    const W = container.clientWidth;
    const H = container.clientHeight;

    // Update entities (wrap for seamless loop)
    if (dt > 0) {
      for (const e of ents) {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        const margin = 60;
        if (e.x > W + margin) e.x = -e.w - margin;
        if (e.y > H + margin) e.y = -e.h - margin;
        if (e.x + e.w < -margin) e.x = W + margin;
        if (e.y + e.h < -margin) e.y = H + margin;

        // Subtle confidence jitter
        e.conf += (RNG() - 0.5) * 0.01;
        e.conf = clamp(e.conf, 0.72, 0.98);
      }
    }

    // WORLD: grid + sweep + faint silhouettes
    wctx.clearRect(0, 0, W, H);
    drawGrid(wctx, W, H, t);
    for (const e of ents) {
      wctx.fillStyle = WORLD_SIL;
      if (e.kind === 'car') {
        rounded(wctx, e.x, e.y + e.h * 0.18, e.w, e.h * 0.64, 8); wctx.fill();
        rounded(wctx, e.x + e.w * 0.24, e.y, e.w * 0.52, e.h * 0.46, 6); wctx.fill();
      } else if (e.kind === 'human') {
        rounded(wctx, e.x + e.w * 0.32, e.y + e.h * 0.26, e.w * 0.36, e.h * 0.62, 6); wctx.fill();
        wctx.beginPath(); wctx.arc(e.x + e.w * 0.5, e.y + e.h * 0.16, Math.min(e.w, e.h) * 0.22, 0, Math.PI * 2); wctx.fill();
      } else {
        rounded(wctx, e.x, e.y, e.w, e.h, 10); wctx.fill();
      }
    }

    // HUD: boxes + long leader lines + labels
    hctx.clearRect(0, 0, W, H);
    hctx.save();
    hctx.lineWidth = 1.5;

    // Draw each detection
    for (const e of ents) {
      // Bounding "bracket" box
      drawBrackets(hctx, e.x, e.y, e.w, e.h, BOX_COLOR);

      // Compute label layout
      const confText = `${Math.round(e.conf * 100)}%`;
      const text = `${e.className} ${confText}`;
      const font = '12px "Space Grotesk", "DM Sans", system-ui, -apple-system, Segoe UI, Roboto';
      const layout = layoutLabel(hctx, e, text, font, W, H);

      // Leader line: long across-screen elbow to label
      hctx.strokeStyle = LEADER_COLOR;
      hctx.beginPath();
      hctx.moveTo(layout.anchorX, layout.anchorY);
      // elbow: go horizontal toward gutter, then vertical to label mid
      hctx.lineTo(layout.midX, layout.anchorY);
      hctx.lineTo(layout.midX, layout.labelMidY);
      hctx.lineTo(layout.attachX, layout.labelMidY);
      hctx.stroke();

      // Label pill
      hctx.fillStyle = LABEL_BG;
      rounded(hctx, layout.labelX, layout.labelY, layout.labelW, layout.labelH, 10);
      hctx.fill();

      // Accent tick
      hctx.fillStyle = LABEL_TICK;
      hctx.fillRect(layout.labelX, layout.labelY, 3, layout.labelH);

      // Text
      hctx.font = font;
      hctx.fillStyle = LABEL_TEXT;
      hctx.fillText(text, layout.labelX + layout.padX, layout.labelY + layout.labelH - 6);
    }

    // Micro UI (optional)
    hctx.font = '11px "DM Sans", system-ui';
    hctx.fillStyle = 'rgba(255,255,255,0.6)';
    hctx.fillText('Auto-labeling: ON', 12, H - 24);
    hctx.fillText('Tracker: Active', 12, H - 10);

    hctx.restore();
  }

  /* ---------- layout & drawing helpers ---------- */

  function layoutLabel(ctx, e, text, font, W, H) {
    const padX = 8;
    const labelH = 22;
    ctx.font = font;
    const tw = Math.ceil(ctx.measureText(text).width);
    const labelW = Math.min(Math.max(tw + padX * 2, 72), Math.max(140, W * 0.22));

    // Anchor at top edge center of the box
    const anchorX = e.x + e.w * 0.5;
    const anchorY = e.y;

    // Gutter to left or right
    const gutter = 16;
    const leftX = gutter;
    const rightX = W - gutter - labelW;

    const side = e.side || (anchorX < W / 2 ? 'left' : 'right');
    const labelX = side === 'left' ? leftX : rightX;

    // Try to align label vertically near the anchor with margin
    let labelY = clamp(anchorY - labelH - 8, 8, H - labelH - 8);

    // Leader attachment point on the label edge
    const attachX = side === 'left' ? (labelX + labelW) : labelX;
    const labelMidY = labelY + labelH / 2;

    // Midpoint for elbow: halfway between anchor and attachX
    const midX = side === 'left'
      ? Math.min(anchorX - 20, attachX - 20)
      : Math.max(anchorX + 20, attachX + 20);

    return {
      anchorX, anchorY,
      labelX, labelY, labelW, labelH, padX,
      attachX, labelMidY,
      midX
    };
  }

  function drawGrid(ctx, W, H, t) {
    const step = Math.round(clamp(Math.min(W, H) / 20, 32, 72));
    ctx.save();
    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += step) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
    }
    for (let y = 0; y <= H; y += step) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
    }
    ctx.stroke();

    // Vertical scanning band
    const bandW = Math.max(120, W * 0.12);
    const bandX = ((t * 40) % (W + bandW)) - bandW;
    const grad = ctx.createLinearGradient(bandX, 0, bandX + bandW, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, SWEEP);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(bandX, 0, bandW, H);

    ctx.restore();
  }

  function drawBrackets(ctx, x, y, w, h, color) {
    const L = clamp(Math.min(w, h) * 0.22, 12, 26);
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

  function rounded(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
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
