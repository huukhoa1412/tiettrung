/**
 * Animated plate heat exchanger.
 *
 * Two channels are drawn along the exchanger, each shaded by its own LOCAL
 * temperature from the marched profile, with tracer particles moving in the
 * true flow direction of each stream. Reversing the cold stream physically
 * reverses its arrows, so co-current versus counter-current stops being a
 * label on a radio button and becomes something visible: in counter-current
 * the two shadings stay a roughly constant distance apart all the way along,
 * while in co-current they converge and then run flat together, which is the
 * ceiling made visual.
 */

import { sampleColormap } from './colormap.js';

const HOT = 2; // categorical slot for the heating medium
const COLD = 1; // categorical slot for milk

export class ExchangerView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.result = null;
    this.state = null;
    this.phase = 0;
    this.playing = true;
    this._raf = null;
  }

  resetView() {}
  setGeometry() {}

  update(result, frame, state, colormap) {
    this.result = result;
    this.state = state;
    this.colormap = colormap;
    // Draw once immediately: requestAnimationFrame does not fire in a hidden
    // or non-compositing tab, and without this the exchanger would show a
    // blank canvas until the tab was brought forward.
    this.draw();
    if (this._raf === null) this.loop();
  }

  loop() {
    if (document.hidden) {
      // No animation while hidden -- but keep a slow heartbeat so the view is
      // correct the moment the tab is shown again.
      this._raf = setTimeout(() => {
        this._raf = null;
        this.draw();
        this.loop();
      }, 250);
      return;
    }
    this._raf = requestAnimationFrame((t) => {
      this._raf = null;
      if (this.playing) this.phase = (t / 1000) % 1000;
      this.draw();
      this.loop();
    });
  }

  destroy() {
    // The handle may be from either scheduler; clearing both is harmless.
    if (this._raf !== null) {
      cancelAnimationFrame(this._raf);
      clearTimeout(this._raf);
    }
    this._raf = null;
  }

  draw() {
    const { canvas, ctx, result, state } = this;
    if (!result || !state) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w <= 0 || h <= 0) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const style = getComputedStyle(document.documentElement);
    const ink = style.getPropertyValue('--text').trim() || '#111';
    const muted = style.getPropertyValue('--ink-muted').trim() || '#898781';
    const surface = style.getPropertyValue('--surface').trim() || '#fff';
    const font = getComputedStyle(document.body).fontFamily;
    const hot = style.getPropertyValue(`--series-${HOT}`).trim();
    const cold = style.getPropertyValue(`--series-${COLD}`).trim();

    const counter = result.arrangement === 'counter';
    const p = result.profiles;
    const n = p.xi.length - 1;

    // Colour scale spans the full inlet gap, so both channels are comparable.
    const tLo = Math.min(state.TcoldIn, result.TcOut, result.ThOut);
    const tHi = Math.max(state.ThotIn, result.TcOut);
    const span = tHi - tLo || 1;
    const colourOf = (T) => {
      const [r, g, b] = sampleColormap(this.colormap ?? 'inferno', (T - tLo) / span);
      return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
    };

    const padX = 78;
    const x0 = padX;
    const x1 = w - padX;
    const barW = x1 - x0;
    const chanH = Math.min(48, (h - 150) / 2);
    const gap = 16;
    const yHot = 54;
    const yCold = yHot + chanH + gap;

    // --- channels, shaded by local temperature ---
    const slices = 220;
    for (let i = 0; i < slices; i++) {
      const s = i / (slices - 1);
      const idx = Math.round(s * n);
      const x = x0 + s * barW;
      const sw = barW / slices + 1;
      ctx.fillStyle = colourOf(p.Th[idx]);
      ctx.fillRect(x, yHot, sw, chanH);
      ctx.fillStyle = colourOf(p.Tc[idx]);
      ctx.fillRect(x, yCold, sw, chanH);
    }

    // The plate between them: a 2px surface gap, not a drawn border.
    ctx.fillStyle = surface;
    ctx.fillRect(x0, yHot + chanH, barW, gap);
    ctx.strokeStyle = muted;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, yHot + 0.5, barW - 1, chanH - 1);
    ctx.strokeRect(x0 + 0.5, yCold + 0.5, barW - 1, chanH - 1);
    ctx.fillStyle = muted;
    ctx.font = `600 10px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('plate', x0 + barW / 2, yHot + chanH + gap / 2);

    // --- tracer particles, moving in each stream's true direction ---
    const drawTracers = (y, reverse) => {
      const count = 26;
      for (let i = 0; i < count; i++) {
        let s = (i / count + this.phase * 0.22) % 1;
        if (reverse) s = 1 - s;
        const x = x0 + s * barW;
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath();
        ctx.ellipse(x, y + chanH / 2, 7, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Direction arrow above the channel.
      const ax = reverse ? x0 + 26 : x1 - 26;
      const dir = reverse ? -1 : 1;
      ctx.strokeStyle = muted;
      ctx.fillStyle = muted;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ax - dir * 16, y + chanH / 2);
      ctx.lineTo(ax, y + chanH / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax + dir * 7, y + chanH / 2);
      ctx.lineTo(ax - dir * 2, y + chanH / 2 - 4.5);
      ctx.lineTo(ax - dir * 2, y + chanH / 2 + 4.5);
      ctx.closePath();
      ctx.fill();
    };
    drawTracers(yHot, false);
    drawTracers(yCold, counter);

    // --- inlet and outlet labels ---
    ctx.font = `650 12px ${font}`;
    ctx.textBaseline = 'middle';

    const label = (text, value, x, y, align, colour) => {
      ctx.textAlign = align;
      ctx.fillStyle = muted;
      ctx.fillText(text, x, y - 8);
      ctx.fillStyle = colour;
      ctx.font = `700 14px ${font}`;
      ctx.fillText(`${value.toFixed(1)} °C`, x, y + 8);
      ctx.font = `650 12px ${font}`;
    };

    label('medium in', state.ThotIn, x0 - 10, yHot + chanH / 2, 'right', hot);
    label('medium out', result.ThOut, x1 + 10, yHot + chanH / 2, 'left', hot);
    if (counter) {
      label('milk out', result.TcOut, x0 - 10, yCold + chanH / 2, 'right', cold);
      label('milk in', state.TcoldIn, x1 + 10, yCold + chanH / 2, 'left', cold);
    } else {
      label('milk in', state.TcoldIn, x0 - 10, yCold + chanH / 2, 'right', cold);
      label('milk out', result.TcOut, x1 + 10, yCold + chanH / 2, 'left', cold);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = ink;
    ctx.font = `700 13px ${font}`;
    ctx.fillText(
      counter ? 'Counter-current: streams flow in opposite directions' : 'Co-current: streams flow the same way',
      w / 2,
      22,
    );

    // --- holding tube ---
    const yTube = yCold + chanH + 46;
    const tubeH = 26;
    if (yTube + tubeH + 34 < h) {
      const hold = result.hold;
      const compliant = hold.fastestParticleTime >= 15;
      ctx.fillStyle = colourOf(result.TcOut);
      ctx.fillRect(x0, yTube, barW, tubeH);
      ctx.strokeStyle = muted;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, yTube + 0.5, barW - 1, tubeH - 1);

      for (let i = 0; i < 20; i++) {
        const s = (i / 20 + this.phase * 0.3) % 1;
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.ellipse(x0 + s * barW, yTube + tubeH / 2, 6, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = muted;
      ctx.font = `600 11px ${font}`;
      ctx.fillText(
        `holding tube · ${state.tubeLength.toFixed(1)} m · mean residence ${hold.meanResidenceTime.toFixed(1)} s`,
        w / 2,
        yTube + tubeH + 6,
      );
      ctx.fillStyle = compliant
        ? style.getPropertyValue('--ok').trim() || '#15683c'
        : style.getPropertyValue('--danger').trim() || '#a3231d';
      ctx.font = `700 12px ${font}`;
      ctx.fillText(
        `fastest particle held ${hold.fastestParticleTime.toFixed(1)} s ${compliant ? '(meets 15 s)' : '(BELOW the 15 s requirement)'}`,
        w / 2,
        yTube + tubeH + 21,
      );
    }
  }
}
