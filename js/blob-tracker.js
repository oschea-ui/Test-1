/* TouchDesigner-style Blob Tracking Background (Canvas 2D)
   - Glowing blobs moving along horizontal lanes
   - Dashed leader lines to compact edge labels
   - Subtle centroid markers and tracking rings
   - Efficient: capped DPR, scales entity count to viewport, pauses on hidden tab
   - Respects prefers-reduced-motion; renders static frame if set
   - No dependencies; runs behind content with pointer-events: none
*/

(() => {
  const container = document.getElementById('ai-bg');
  if (!container) return;
  const world = document.getElementById('ai-bg-world'); // lanes + glow blobs
  const hud = document.getElementById('ai-bg-hud');     // outlines + leaders + labels
  if (!world || !hud) return;

  const wctx = world.getContext('2d', { alpha: true });
  const hctx = hud.getContext('2d', { alpha: true });

  // Visual tuning (inspired by TD blob tracking aesthetics)
  const ACCENT = '#35e0c2';
  const LANE_CORE = 'rgba(255,255,255,0.85)';
  const LANE_GLOW = 'rgba(53,224,194,0.22)';
  const BLOB_CORE = 'rgba(255,255,255,0.14)';
  const BLOB_ACCENT = 'rgba(53,224,194,0.85)';
  const RING_COLOR = 'rgba(255,255,255,0.85)';
  const CROSSHAIR = 'rgba(255,255,255,0.7)';
  const LEADER_COLOR = 'rgba(255,255,255,0.88)';
  const LABEL_BG = 'rgba(0,0,0,0.85)';
  const LABEL_TEXT = 'rgba(255,255,255,0.98)';

  // Behavior/perf
  const DPR_CAP = 1.5;
  const prefersReduced = matchMediaSafe('(prefers-reduced-motion: reduce)');
  let running = !prefersReduced;
  let dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);

  // Lanes and blobs
  let lanes = []; // [{ y, dir, speed, color }]
  let blobs = []; // [{ lane, x, y, r, ex, speed, side, id, label }]
  let dashOffset = 0;
  let last = performance.now();

  // Init & sizing
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
    initBlobs(W, H);
  }

  function makeLanes(W, H) {
    const count = clamp(Math.floor(H / 110), 6, 12);
    const pad = 24;
    const spacing = (H - pad * 2) / (count - 1);
    lanes = [];
    for (let i = 0; i < count; i++) {
      const y = Math.round(pad + i * spacing);
      const dir = i % 2 === 0 ? 1 : -1; // alternate directions
      const speed = 28 + (i % 3) * 8;   // slight variation
      lanes.push({ y, dir, speed, color: ACCENT });
    }
  }

  function initBlobs(W, H) {
    const short = Math.min(W, H);
    blobs = [];
    // ~2-3 blobs per lane, scales with width
    const perLane = clamp(Math.floor(W / 480) + 2, 2, 4);

    let id = 1;
    for (let li = 0; li < lanes.length; li++) {
      for (let k = 0; k < perLane; k++) {
        const lane = lanes[li];
        const r = randRange(short * 0.018, short * 0.035);
        const ex = randRange(1.0, 1.5); // horizontal elongation (ellipse x-scale)
        let x = Math.random() * W;
        let y = lane.y + randRange(-6, 6); // small jitter around lane
        const speed = lane.speed * randRange(0.8, 1.25) * lane.dir;
        const side = speed > 0 ? 'right' : 'left';
        const label = pickLabel();
        blobs.push({ lane: li, x, y, r, ex, speed, side, id: id++, label });
      }
    }
  }

  sizeCanvases();
  window.addEventListener('resize', debounce(() => {
    sizeCanvases();
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

    // Update blobs
    if (dt > 0) {
      for (const b of blobs) {
        const sway = Math.sin((b.x * 0.01) + b.id) * 10; // vertical wave for organic motion
        b.x += b.speed * dt;
        b.y += (sway * 0.25) * dt;

        const margin = 120;
        if (b.speed > 0 && b.x > W + margin) { b.x = -margin; }
        if (b.speed < 0 && b.x < -margin) { b.x = W + margin; }

        // Nudge back toward lane center
        const laneY = lanes[b.lane]?.y ?? b.y;
        b.y += (laneY - b.y) * 0.08 * dt;
      }
      dashOffset -= dt * 160; // leader dash animation
    }

    // WORLD: lanes + glowing blobs
    wctx.clearRect(0, 0, W, H);
    drawLanes(wctx, W, H, t);
    drawBlobsGlow(wctx, blobs);

    // HUD: rings + centroid + leaders + labels
    hctx.clearRect(0, 0, W, H);
    hctx.save();
    hctx.lineWidth = 1.6;

    // Compute label slots per lane to avoid label overlap
    const laneSlots = computeLaneSlots(blobs, lanes);

    // Leaders are dashed and animated
    hctx.setLineDash([10, 7]);
    hctx.lineDashOffset = dashOffset;

    for (const b of blobs) {
      // Tracking ring (ellipse) and centroid crosshair
      const ry = b.r;           // vertical radius
      const rx = b.r * b.ex;    // horizontal radius

      hctx.strokeStyle = RING_COLOR;
      strokeEllipse(hctx, b.x, b.y, rx, ry);

      // Centroid crosshair
      hctx.strokeStyle = CROSSHAIR;
      hctx.beginPath();
      hctx.moveTo(b.x - 6, b.y); hctx.lineTo(b.x + 6, b.y);
      hctx.moveTo(b.x, b.y - 6); hctx.lineTo(b.x, b.y + 6);
      hctx.stroke();

      // Label and leader
      const side = b.side;
      const slot = laneSlots[b.lane]?.getSlot(b) || { y: lanes[b.lane].y, idx: 0 };
      const font = '12px "Space Grotesk", "DM Sans", system-ui, -apple-system, Segoe UI, Roboto';
      const lab = layoutEdgeLabel(hctx, `${b.label}`, font, side, W, slot.y);

      // Leader: centroid -> elbow -> lane slot -> label attach
      const attachX = side === 'left' ? (lab.x + lab.w) : lab.x;
      const midX = side === 'left'
        ? Math.min(b.x - 28, attachX - 36)
        : Math.max(b.x + 28, attachX + 36);

      hctx.strokeStyle = LEADER_COLOR;
      hctx.beginPath();
      hctx.moveTo(b.x, b.y);
      hctx.lineTo(midX, b.y);
      hctx.lineTo(midX, lab.y + lab.h / 2);
      hctx.lineTo(attachX, lab.y + lab.h / 2);
      hctx.stroke();

      // Draw label pill
      drawLabelPill(hctx, lab.x, lab.y, lab.w, lab.h, `${b.label}`, font);
    }

    hctx.setLineDash([]);
    hctx.restore();
  }

  /* ---------------------- drawing helpers ---------------------- */

  function drawLanes(ctx, W, H, t) {
    for (const lane of lanes) {
      // Glow underlay
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = LANE_GLOW;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, lane.y);
      ctx.lineTo(W, lane.y);
      ctx.stroke();
      ctx.restore();

      // Core line
      ctx.strokeStyle = LANE_CORE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, lane.y + 0.5);
      ctx.lineTo(W, lane.y + 0.5);
      ctx.stroke();

      // Subtle moving ticks to imply flow
      const tickLen = 24;
      const gap = 60;
      const phase = (t * lane.speed * (lane.dir > 0 ? 1 : -1) * 0.5) % gap;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.setLineDash([tickLen, gap - tickLen]);
      ctx.lineDashOffset = -phase;
      ctx.beginPath();
      ctx.moveTo(0, lane.y - 4);
      ctx.lineTo(W, lane.y - 4);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawBlobsGlow(ctx, list) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of list) {
      // Soft outer glow
      const grd = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2.4);
      grd.addColorStop(0.0, BLOB_ACCENT);
      grd.addColorStop(0.45, BLOB_CORE);
      grd.addColorStop(1.0, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;

      ctx.beginPath();
      ctx.ellipse(b.x, b.y, b.r * b.ex * 1.2, b.r * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function strokeEllipse(ctx, cx, cy, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function layoutEdgeLabel(ctx, text, font, side, W, atY) {
    ctx.font = font;
    const padX = 8;
    const labelH = 22;
    const tw = Math.ceil(ctx.measureText(text).width);
    const labelW = Math.min(Math.max(tw + padX * 2, 72), Math.max(150, W * 0.22));
    const gutter = 12;
    const x = side === 'left' ? gutter : (W - gutter - labelW);
    const y = Math.round(clamp(atY - labelH / 2, 8, container.clientHeight - labelH - 8));
    return { x, y, w: labelW, h: labelH, side };
  }

  function drawLabelPill(ctx, x, y, w, h, text, font) {
    // Background
    ctx.fillStyle = LABEL_BG;
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    // Accent tick
    ctx.fillStyle = hexToRgba(ACCENT, 0.98);
    ctx.fillRect(x, y, 3, h);
    // Text
    ctx.font = font;
    ctx.fillStyle = LABEL_TEXT;
    ctx.fillText(text, x + 8, y + h - 6);
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function computeLaneSlots(list, lanes) {
    // For each lane, sort blobs by x so slots are stable, then assign staggered Y offsets
    const slots = {};
    for (let i = 0; i < lanes.length; i++) {
      slots[i] = {
        items: [],
        getSlot(b) {
          if (!this.indexMap) this._assign();
          return this.indexMap.get(b.id);
        },
        _assign() {
          // sort by x to keep slot order stable
          this.items.sort((a, b) => a.x - b.x);
          this.indexMap = new Map();
          const baseY = lanes[i].y;
          const step = 24; // vertical stagger between labels in same lane
          for (let k = 0; k < this.items.length; k++) {
            const offset = (k - (this.items.length - 1) / 2) * step;
            this.indexMap.set(this.items[k].id, { y: baseY + offset, idx: k });
          }
        }
      };
    }
    for (const b of list) {
      if (slots[b.lane]) slots[b.lane].items.push(b);
    }
    for (const key in slots) slots[key]._assign();
    return slots;
  }

  /* ---------------------- utils ---------------------- */

  function matchMediaSafe(q) {
    try { return window.matchMedia?.(q)?.matches || false; } catch { return false; }
  }

  function debounce(fn, ms) {
    let id; return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function randRange(a, b) { return a + Math.random() * (b - a); }

  function pickLabel() {
    // Simple rotating labels to feel like tracked categories
    const pool = ['Blob', 'Track', 'Object', 'Target'];
    const name = pool[Math.floor(Math.random() * pool.length)];
    const pct = Math.floor(80 + Math.random() * 19);
    return `${name} ${pct}%`;
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
