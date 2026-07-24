/**
 * Line-plot engine on Canvas 2D.
 *
 * WHY CANVAS AND NOT SVG
 * A conduction run carries a few hundred frames and up to a few hundred mesh
 * points per spatial profile. As SVG that is thousands of DOM nodes redrawn on
 * every scrub; on canvas it is one path. The text that must be readable and
 * selectable -- legend, tooltip, table view -- stays in HTML above the canvas,
 * so it inherits the app's type and colour tokens rather than being baked into
 * pixels.
 *
 * DESIGN RULES FOLLOWED HERE
 *   - Series colour follows the QUANTITY (centre, surface, mean), never its
 *     position in a list, so hiding one never repaints the others.
 *   - Gridlines and axes are solid hairlines one shade off the surface. Never
 *     dashed: dashing reads as "threshold" when it is only a grid.
 *   - 2 px strokes, no fills behind lines, generous padding.
 *   - A legend whenever there is more than one series, plus an endpoint label
 *     on each -- identity is never carried by colour alone.
 *   - Crosshair and tooltip on hover, with a table view as the non-hover path
 *     to the same numbers. A tooltip must enhance, never gate.
 *   - One y-axis. Quantities with different units get their own plot; a second
 *     y-scale would invent a relationship that is not in the data.
 */

/** Read a CSS custom property so the plot follows the app's theme tokens. */
function token(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** "Nice" tick positions at 1, 2 or 5 times a power of ten. */
function niceTicks(lo, hi, target = 6) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const first = Math.ceil(lo / step) * step;
  const out = [];
  for (let v = first; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

/** Decade ticks for a logarithmic axis. */
function logTicks(lo, hi) {
  const out = [];
  const from = Math.floor(Math.log10(lo));
  const to = Math.ceil(Math.log10(hi));
  for (let e = from; e <= to; e++) {
    const v = Math.pow(10, e);
    if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
  }
  return out;
}

function formatTick(v, scale) {
  if (v === 0) return '0';
  if (scale === 'log') {
    const e = Math.round(Math.log10(v));
    return e >= -2 && e <= 3 ? String(Math.pow(10, e)) : `1e${e}`;
  }
  const a = Math.abs(v);
  if (a >= 10000 || (a < 0.01 && a > 0)) return v.toExponential(0);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

export class LinePlot {
  /**
   * @param container  element to fill
   * @param options.height  plot height in CSS pixels, EXCLUDING the axis band
   *                        and legend, which are added on top. Sizing the
   *                        container to the plot alone is what produces a card
   *                        with a tiny nested scrollbar.
   */
  constructor(container, { height = 190, title = '' } = {}) {
    this.container = container;
    this.height = height;
    this.spec = null;
    this.hover = null;

    container.classList.add('plot');
    container.innerHTML = `
      <div class="plot-head">
        <span class="plot-title">${title}</span>
        <button class="plot-table-toggle" type="button" aria-expanded="false">Data</button>
      </div>
      <div class="plot-legend" role="list"></div>
      <div class="plot-canvas-wrap">
        <canvas></canvas>
        <div class="plot-tooltip" hidden></div>
      </div>
      <div class="plot-table" hidden></div>`;

    this.canvas = container.querySelector('canvas');
    this.legendEl = container.querySelector('.plot-legend');
    this.tooltipEl = container.querySelector('.plot-tooltip');
    this.tableEl = container.querySelector('.plot-table');
    this.titleEl = container.querySelector('.plot-title');
    this.ctx = this.canvas.getContext('2d');

    const toggle = container.querySelector('.plot-table-toggle');
    toggle.addEventListener('click', () => {
      const open = this.tableEl.hidden;
      this.tableEl.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) this.renderTable();
    });

    // Pointer hit area is the whole plot; the nearest sample is picked, so a
    // reader never has to land on a 2 px line.
    this.canvas.addEventListener('pointermove', (e) => this.onPointer(e));
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.tooltipEl.hidden = true;
      this.draw();
    });

    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(container);
  }

  destroy() {
    this.resizeObserver.disconnect();
  }

  /**
   * @param spec.series  [{ id, label, color, x, y, dash, width }]
   * @param spec.markers [{ axis:'x'|'y', value, label, color }]
   */
  setData(spec) {
    this.spec = spec;
    if (spec.title) this.titleEl.textContent = spec.title;
    this.renderLegend();
    if (!this.tableEl.hidden) this.renderTable();
    this.draw();
  }

  renderLegend() {
    const s = this.spec;
    // A single series is named by the title; a legend box would be noise.
    if (!s || s.series.length < 2) {
      this.legendEl.innerHTML = '';
      this.legendEl.hidden = true;
      return;
    }
    this.legendEl.hidden = false;
    this.legendEl.innerHTML = s.series
      .map(
        (ser) =>
          `<span class="plot-key" role="listitem">
             <span class="plot-swatch" style="background:${ser.color}"></span>${ser.label}
           </span>`,
      )
      .join('');
  }

  /** The table view: the same numbers, reachable without a pointer. */
  renderTable() {
    const s = this.spec;
    if (!s) return;
    const step = Math.max(1, Math.ceil(s.series[0].x.length / 24));
    const rows = [];
    for (let i = 0; i < s.series[0].x.length; i += step) {
      const cells = s.series.map((ser) => formatTick(ser.y[i], 'lin'));
      rows.push(`<tr><td>${formatTick(s.series[0].x[i], s.xScale)}</td><td>${cells.join('</td><td>')}</td></tr>`);
    }
    this.tableEl.innerHTML = `
      <table>
        <caption>${s.title ?? ''} — every ${step === 1 ? 'sample' : `${step}th sample`}</caption>
        <thead><tr><th>${s.xLabel}</th><th>${s.series.map((x) => x.label).join('</th><th>')}</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>`;
  }

  /** Map data coordinates to canvas pixels. */
  scales(w, h) {
    const s = this.spec;
    const m = { l: 62, r: 18, t: 10, b: 38 };
    const pw = w - m.l - m.r;
    const ph = h - m.t - m.b;

    let [x0, x1] = s.xDomain ?? autoDomain(s.series, 'x');
    let [y0, y1] = s.yDomain ?? autoDomain(s.series, 'y');
    if (x1 === x0) x1 = x0 + 1;
    if (y1 === y0) y1 = y0 + 1;

    const logY = s.yScale === 'log';
    if (logY) {
      y0 = Math.max(y0, 1e-6);
      y1 = Math.max(y1, y0 * 10);
    }

    const fx = (v) => m.l + ((v - x0) / (x1 - x0)) * pw;
    const fy = logY
      ? (v) => m.t + ph - ((Math.log10(Math.max(v, y0)) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0))) * ph
      : (v) => m.t + ph - ((v - y0) / (y1 - y0)) * ph;

    return { m, pw, ph, x0, x1, y0, y1, fx, fy, logY };
  }

  draw() {
    const s = this.spec;
    if (!s || !s.series.length) return;

    const dpr = window.devicePixelRatio || 1;
    const w = this.container.clientWidth;
    const h = this.height;
    if (w <= 0) return;

    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const grid = token('--grid', '#e1e0d9');
    const axis = token('--axis', '#c3c2b7');
    const muted = token('--ink-muted', '#898781');
    const font = getComputedStyle(document.body).fontFamily;

    const { m, pw, ph, x0, x1, y0, y1, fx, fy, logY } = this.scales(w, h);

    const xt = s.xScale === 'log' ? logTicks(x0, x1) : niceTicks(x0, x1, 6);
    const yt = logY ? logTicks(y0, y1) : niceTicks(y0, y1, 5);

    // --- grid: solid hairlines, one shade off the surface ---
    ctx.lineWidth = 1;
    ctx.strokeStyle = grid;
    ctx.beginPath();
    for (const v of yt) {
      const y = Math.round(fy(v)) + 0.5;
      ctx.moveTo(m.l, y);
      ctx.lineTo(m.l + pw, y);
    }
    for (const v of xt) {
      const x = Math.round(fx(v)) + 0.5;
      ctx.moveTo(x, m.t);
      ctx.lineTo(x, m.t + ph);
    }
    ctx.stroke();

    // --- axes ---
    ctx.strokeStyle = axis;
    ctx.beginPath();
    ctx.moveTo(m.l + 0.5, m.t);
    ctx.lineTo(m.l + 0.5, m.t + ph + 0.5);
    ctx.lineTo(m.l + pw, m.t + ph + 0.5);
    ctx.stroke();

    // --- tick labels: tabular figures so the column aligns ---
    ctx.fillStyle = muted;
    ctx.font = `500 11px ${font}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of yt) ctx.fillText(formatTick(v, s.yScale), m.l - 8, fy(v));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const v of xt) ctx.fillText(formatTick(v, s.xScale), fx(v), m.t + ph + 8);

    // --- axis titles ---
    ctx.fillStyle = muted;
    ctx.font = `600 11px ${font}`;
    ctx.textAlign = 'center';
    ctx.fillText(s.xLabel, m.l + pw / 2, h - 13);
    ctx.save();
    ctx.translate(13, m.t + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(s.yLabel, 0, 0);
    ctx.restore();

    // --- reference markers (target F0, hold temperature, current time) ---
    for (const mk of s.markers ?? []) {
      ctx.save();
      ctx.strokeStyle = mk.color ?? muted;
      ctx.lineWidth = mk.weight ?? 1.5;
      if (mk.dashed !== false) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      if (mk.axis === 'y') {
        const y = Math.round(fy(mk.value)) + 0.5;
        ctx.moveTo(m.l, y);
        ctx.lineTo(m.l + pw, y);
      } else {
        const x = Math.round(fx(mk.value)) + 0.5;
        ctx.moveTo(x, m.t);
        ctx.lineTo(x, m.t + ph);
      }
      ctx.stroke();
      ctx.restore();
      if (mk.label) {
        ctx.fillStyle = muted;
        ctx.font = `600 10px ${font}`;
        ctx.textAlign = mk.axis === 'y' ? 'left' : 'center';
        ctx.textBaseline = mk.axis === 'y' ? 'bottom' : 'top';
        if (mk.axis === 'y') ctx.fillText(mk.label, m.l + 6, fy(mk.value) - 3);
        else ctx.fillText(mk.label, fx(mk.value), m.t + 2);
      }
    }

    // --- series ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(m.l, m.t, pw, ph);
    ctx.clip();
    for (const ser of s.series) {
      ctx.strokeStyle = ser.color;
      ctx.lineWidth = ser.width ?? 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (ser.dash) ctx.setLineDash(ser.dash);
      else ctx.setLineDash([]);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < ser.x.length; i++) {
        const yv = ser.y[i];
        if (!Number.isFinite(yv) || (logY && yv <= 0)) {
          started = false;
          continue;
        }
        const px = fx(ser.x[i]);
        const py = fy(yv);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    // --- selective direct labels at the series endpoint ---
    if (s.series.length <= 4 && s.directLabels !== false) {
      ctx.font = `650 11px ${font}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      const used = [];
      for (const ser of s.series) {
        let i = ser.x.length - 1;
        while (i > 0 && !Number.isFinite(ser.y[i])) i--;
        const py = fy(ser.y[i]);
        if (!Number.isFinite(py)) continue;
        // Nudge apart if two endpoints land on top of one another.
        let y = py;
        while (used.some((u) => Math.abs(u - y) < 12)) y -= 12;
        used.push(y);
        ctx.fillStyle = ser.color;
        ctx.fillText(ser.label, m.l + pw - 4, Math.max(m.t + 11, y - 4));
      }
    }

    // --- crosshair + hovered points ---
    if (this.hover !== null) {
      const i = this.hover;
      const xv = s.series[0].x[i];
      const px = Math.round(fx(xv)) + 0.5;
      ctx.strokeStyle = axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, m.t);
      ctx.lineTo(px, m.t + ph);
      ctx.stroke();
      for (const ser of s.series) {
        const yv = ser.y[i];
        if (!Number.isFinite(yv) || (logY && yv <= 0)) continue;
        const py = fy(yv);
        // 2 px surface ring rather than a stroke border, so overlapping
        // markers stay separable without drawing outlines around marks.
        ctx.fillStyle = token('--surface', '#fff');
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ser.color;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  onPointer(e) {
    const s = this.spec;
    if (!s) return;
    const rect = this.canvas.getBoundingClientRect();
    const { m, pw, fx } = this.scales(rect.width, this.height);
    const px = e.clientX - rect.left;
    if (px < m.l - 8 || px > m.l + pw + 8) return;

    // Nearest sample by x, so the hit area is the full plot width rather than
    // the 2 px line itself.
    const xs = s.series[0].x;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < xs.length; i++) {
      const d = Math.abs(fx(xs[i]) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    this.hover = best;

    const rows = s.series
      .map(
        (ser) =>
          `<div class="tt-row"><span class="plot-swatch" style="background:${ser.color}"></span>` +
          `<span class="tt-label">${ser.label}</span>` +
          `<span class="tt-value">${formatTick(ser.y[best], 'lin')}${s.yUnit ?? ''}</span></div>`,
      )
      .join('');
    this.tooltipEl.innerHTML = `<div class="tt-head">${s.xLabel}: ${formatTick(xs[best], s.xScale)}${s.xUnit ?? ''}</div>${rows}`;
    this.tooltipEl.hidden = false;

    const tipX = fx(xs[best]);
    const flip = tipX > rect.width * 0.6;
    this.tooltipEl.style.left = `${flip ? tipX - 12 : tipX + 12}px`;
    this.tooltipEl.style.transform = flip ? 'translateX(-100%)' : 'none';
    this.tooltipEl.style.top = `8px`;

    this.draw();
  }
}

function autoDomain(series, key) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const ser of series) {
    const arr = ser[key];
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (!Number.isFinite(lo)) return [0, 1];
  const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.1 || 1;
  return [lo - pad, hi + pad];
}

/** Convenience: read a themed series colour by slot. */
export function seriesColor(slot) {
  return token(`--series-${slot}`, '#2a78d6');
}
