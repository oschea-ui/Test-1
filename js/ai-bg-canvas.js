/* AI Vision-style Background (Canvas 2D)
   - Bold bounding boxes + long leader lines to edge labels (left/right gutters)
   - Many moving targets with smooth horizontal motion and light vertical sway
   - Faint grid + scanning sweep for “vision system” vibe
   - Efficient: capped DPR, pauses on hidden tab, respects reduced motion
   - No dependencies; runs behind content (pointer-events: none)
*/

(() => {
  const container = document.getElementById('ai-bg');
  if (!container) return;

  const world = document.getElementById('ai-bg-world'); // grid + silhouettes
  const hud = document.getElementById('ai-bg-hud');     // boxes + lines + labels
  if (!world || !hud) return;

  const wctx = world.getContext('2d', { alpha: true });
  const hctx = hud.getContext('2d', { alpha: true });

  // Visuals (higher contrast than before)
  const ACCENT = '#35e0c2';
  const GRID_LINE = 'rgba(255,255,255,0.08)';
  const SWEEP = 'rgba(53,224,194,0.10)';
  const WORLD_SIL = 'rgba(255,255,255,0.10)';

  const BOX_COLOR = 'rgba(255,255,255,0.98)';    // bracket box
  const LINE_COLOR = 'rgba(255,255,255,0.9)';    // leader line
  const LABEL_BG = 'rgba(0,0,0,0.88)';           // label pill
  const LABEL_TEXT = 'rgba(255,255,255,0.98)';
  const LABEL_TICK = hexToRgba(ACCENT, 0.98);

  // Performance/behavior
  const DPR_CAP = 1.5;
  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  let running = !prefersReduced;
  let dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);

  // Random + entities
  const RNG = mulberry32(0xA11A11);
  const classes = [
    { name: 'Car', kind: 'car' },
    { name: 'Human', kind: 'human' },
    { name: 'Object', kind: 'box' }
  ];

  let ents = [];
  let lanesLeft = [];
  let lanesRight = [];
  let dashOffset = 0;
  let last = performance.now();

  function initEntities(W, H) {
    ents = [];
    // More entities on bigger screens
    const count = Math.round(clamp((W * H) / 50000, 18, 36));
    const short = Math.min(W, H);

    for (let i = 0; i < count; i++) {
      const cls = classes[Math.floor(RNG() * classes.length)];
      let bw, bh;
      if (cls.kind === 'car') {
        bw = randRange(short * 0.08, short * 0.14);
        bh = bw * randRange(0.38, 0.52);
      } else if (cls.kind === 'human') {
        bw = randRange(short * 0.04, short * 0.065);
        bh = bw * randRange(2.1, 2.7);
      } else {
        bw = randRange(short * 0.06, short * 0.10);
        bh = randRange(short * 0.06, short * 0.10);
      }

      // Motion: predominant horizontal with gentle vertical sway
      const speed = randRange(34, 70); // px/s
      const toRight = RNG() < 0.5;
      const vx = toRight ? speed : -speed;
      const vy = randRange(-8, 8);

      // Start anywhere, wrap for seamless loop
      let x = RNG() * (W - bw);
      let y = RNG() * (H - bh);

      ents.push({
        id: i + 1,
        className: cls.name,
        kind: cls.kind,
        x, y, w: bw, h: bh,
        vx, vy,
        conf: 0.84 + RNG() * 0.12,
        side: toRight ? 'right' : 'left',
        laneIndex: -1 // assigned later
      });
    }
  }

  function makeLanes(W, H) {
    // Even lanes down the screen; labels snap to lane centers
    const count = clamp(Math.floor(H / 120), 6, 12);
    const pad = 18;
    const spacing = (H - pad * 2) / (count - 1);
    lanesLeft = [];
    lanesRight = [];
    for (let i = 0; i < count; i++) {
      const y = Math.round(pad + i * spacing);
      lanesLeft.push({ y, used: 0 });
      lanesRight.push({ y, used: 0 });
    }
  }

  function assignLanes(W, H) {
    // Reset lane usage each frame and assign nearest available lane
    for (const L of lanesLeft) L.used = 0;
    for (const R of lanesRight) R.used = 0;

    for (const e of ents) {
      const set = e.side === 'left' ? lanesLeft : lanesRight;
      let idx = e.laneIndex;
      if (idx < 0 || idx >= set.length) {
        // Find nearest lane to anchor Y
        idx = nearestLaneIndex(set, e.y);
      } else {
        // If current lane is heavily used, consider moving one step
        if (set[idx].used > 1) {
          const better = nearestLaneIndex(set, e.y);
          if (better !== idx) idx = better;
        }
      }
      e.laneIndex = idx;
      set[idx].used++;
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

    makeLanes(W, H);
    if (!ents.length) initEntities(W, H);
  }

  sizeCanvases();
  window.addEventListener('resize', debounce(() => {
    const W = container.clientWidth, H = container.clientHeight;
    sizeCanvases();
    // Re-compose on big aspect changes
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
    drawFrame(dt, now * 0.001);
  }

  function drawFrame(dt = 0, t = 0) {
    const W = container.clientWidth;
    const H = container.clientHeight;

    // Update entities with wrap-around and sway
    if (dt > 0) {
      for (const e of ents) {
        const sway = Math.sin((e.x * 0.01) + e.id) * 10; // vertical wave
        e.x += e.vx * dt;
        e.y += (e.vy + sway) * dt;

        const margin = 100;
        if (e.vx > 0 && e.x > W + margin) { e.x = -e.w - margin; }
        if (e.vx < 0 && e.x + e.w < -margin) { e.x = W + margin; }
        if (e.y < -margin) e.y = H + margin;
        if (e.y > H + margin) e.y = -margin;

        e.conf += (RNG() - 0.5) * 0.01;
        e.conf = clamp(e.conf, 0.75, 0.98);
      }
    }

    // WORLD: grid + scanning band + silhouettes
    wctx.clearRect(0, 0, W, H);
    drawGrid(wctx, W, H, t);
    drawSilhouettes(wctx, ents);

    // HUD: assign lanes and draw boxes + long leaders + labels
    assignLanes(W, H);

    hctx.clearRect(0, 0, W, H);
    hctx.save();
    hctx.lineWidth = 1.8;

    // Animated dashed leaders
    dashOffset -= dt * 140;
    hctx.setLineDash([10, 7]);
    hctx.lineDashOffset = dashOffset;

    for (const e of ents) {
      // Bounding brackets
      drawBrackets(hctx, e.x, e.y, e.w, e.h, BOX_COLOR);

      // Label text
      const text = `${e.className} ${Math.round(e.conf * 100)}%`;

      // Edge label layout at lane Y
      const side = e.side;
      const laneSet = side === 'left' ? lanesLeft : lanesRight;
      const lane = laneSet[e.laneIndex] || laneSet[nearestLaneIndex(laneSet, e.y)];
      const font = '12px "Space Grotesk", "DM Sans", system-ui, -apple-system, Segoe UI, Roboto';
      const lab = layoutEdgeLabel(hctx, text, font, side, W, lane.y);

      // Multi-segment leader: anchor -> mid -> vertical to lane -> to label
      const anchorX = e.x + e.w * 0.5;
      const anchorY = e.y; // top edge
      const attachX = side === 'left' ? (lab.x + lab.w) : lab.x;
      const midX = side === 'left'
        ? Math.min(anchorX - 24, attachX - 32)
        : Math.max(anchorX + 24, attachX + 32);

      hctx.strokeStyle = LINE_COLOR;
      hctx.beginPath();
      hctx.moveTo(anchorX, anchorY);
      hctx.lineTo(midX, anchorY);
      hctx.lineTo(midX, lab.y + lab.h / 2);
      hctx.lineTo(attachX, lab.y + lab.h / 2);
      hctx.stroke();

      // Solid end cap into label
      hctx.setLineDash([]);
      hctx.beginPath();
      hctx.moveTo(attachX - (side === 'left' ? 6 : -6), lab.y + lab.h / 2);
      hctx.lineTo(attachX, lab.y + lab.h / 2);
      hctx.stroke();
      hctx.setLineDash([10, 7]);
      hctx.lineDashOffset = dashOffset;

      // Label pill
      drawLabelPill(hctx, lab.x, lab.y, lab.w, lab.h, text, font);
    }

    // Micro UI
    hctx.setLineDash([]);
    hctx.font = '11px "DM Sans", system-ui';
    hctx.fillStyle = 'rgba(255,255,255,0.70)';
    hctx.fillText('Auto-labeling: ON', 12, H - 24);
    hctx.fillText('Tracker: Active', 12, H - 10);

    hctx.restore();
  }

  /* ------------- helpers ------------- */

  function drawGrid(ctx, W, H, t) {
    const step = Math.round(clamp(Math.min(W, H) / 18, 36, 72));
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

    // Scanning band (vertical)
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

  function drawSilhouettes(ctx, entities) {
    ctx.fillStyle = WORLD_SIL;
    for (const e of entities) {
      if (e.kind === 'car') {
        rounded(ctx, e.x, e.y + e.h * 0.18, e.w, e.h * 0.64, 1); ctx.fill();
        rounded(ctx, e.x + e.w * 0.24, e.y, e.w * 0.52, e.h * 0.46, 1); ctx.fill();
      } else if (e.kind === 'human') {
        rounded(ctx, e.x + e.w * 0.32, e.y + e.h * 0.26, e.w * 0.36, e.h * 0.62, 1); ctx.fill();
        ctx.beginPath();
        ctx.arc(e.x + e.w * 0.5, e.y + e.h * 0.16, Math.min(e.w, e.h) * 0.22, 0, Math.PI * 2);
        ctx.fill();
      } else {
        rounded(ctx, e.x, e.y, e.w, e.h, 1); ctx.fill();
      }
    }
  }

  function drawBrackets(ctx, x, y, w, h, color) {
    const L = clamp(Math.min(w, h) * 0.22, 12, 28);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
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

  function layoutEdgeLabel(ctx, text, font, side, W, laneY) {
    ctx.font = font;
    const padX = 8;
    const labelH = 22;
    const tw = Math.ceil(ctx.measureText(text).width);
    const labelW = Math.min(Math.max(tw + padX * 2, 80), Math.max(150, W * 0.22));
    const gutter = 12;
    const x = side === 'left' ? gutter : (W - gutter - labelW);
    const y = Math.round(clamp(laneY - labelH / 2, 8, container.clientHeight - labelH - 8));
    return { x, y, w: labelW, h: labelH, side };
  }

  function drawLabelPill(ctx, x, y, w, h, text, font) {
    // Background
    ctx.fillStyle = LABEL_BG;
    rounded(ctx, x, y, w, h, 10);
    ctx.fill();
    // Accent tick
    ctx.fillStyle = LABEL_TICK;
    ctx.fillRect(x, y, 3, h);
    // Text
    ctx.font = font;
    ctx.fillStyle = LABEL_TEXT;
    ctx.fillText(text, x + 8, y + h - 6);
  }

  function nearestLaneIndex(lanes, y) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < lanes.length; i++) {
      const d = Math.abs(lanes[i].y - y);
      // Penalize lanes already used to spread labels out
      const penalty = lanes[i].used * 14;
      if (d + penalty < bestD) { bestD = d + penalty; best = i; }
    }
    return best;
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
