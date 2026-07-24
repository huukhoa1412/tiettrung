/**
 * Canvas 2-D cross-section, used when WebGL2 is unavailable.
 *
 * WHY THIS EXISTS
 * Locked-down university machines, remote-desktop sessions and virtualised lab
 * images all ship broken or disabled WebGL more often than one would like. A
 * lecture demo that shows a black rectangle is worse than one that shows a flat
 * cross-section, and the cross-section carries nearly all the teaching value:
 * it is the same field, drawn in the plane where the gradient lives.
 *
 * The section drawn is the physically meaningful one for each geometry -- the
 * r-z half plane through the axis of a can, a diametral slice of a sphere, the
 * through-thickness section of a slab.
 */

import { buildFieldImage, buildFreezeFieldImage } from './field.js';

export class Fallback2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = null;
    this.result = null;
    this.frame = 0;
    this.colormap = 'inferno';
  }

  /** Present for interface parity with the WebGL renderer. */
  resetView() {}
  setGeometry() {}

  update(result, frame, state, colormap) {
    this.result = result;
    this.frame = frame;
    this.state = state;
    this.colormap = colormap;
    this.draw();
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

    const img =
      result.kind === 'freeze'
        ? buildFreezeFieldImage(result, this.frame, state, this.colormap, 128)
        : buildFieldImage(result, this.frame, state, this.colormap, 128, 128);
    // A freeze run reports the geometry it actually solved, which may differ
    // from the control panel's if the user arrived from the can scenario.
    const geometry = result.geometry ?? state.geometry;

    // Reserve room for the caption below the drawing.
    const pad = 18;
    const boxW = w - pad * 2;
    const boxH = h - pad * 2 - 20;
    const cx = w / 2;
    const cy = pad + boxH / 2;

    const colourAt = (u, v) => {
      const i = Math.max(0, Math.min(img.width - 1, Math.round(u * (img.width - 1))));
      const j = img.height === 1 ? 0 : Math.max(0, Math.min(img.height - 1, Math.round(v * (img.height - 1))));
      const p = (j * img.width + i) * 4;
      return `rgb(${img.rgba[p]},${img.rgba[p + 1]},${img.rgba[p + 2]})`;
    };

    let caption;
    if (geometry === 'sphere') {
      const R = Math.min(boxW, boxH) / 2;
      // Concentric rings from the outside in, so each overwrites the last.
      const steps = 120;
      for (let s = steps; s >= 1; s--) {
        const frac = s / steps;
        ctx.fillStyle = colourAt(frac, 0.5);
        ctx.beginPath();
        ctx.arc(cx, cy, R * frac, 0, Math.PI * 2);
        ctx.fill();
      }
      caption = 'Diametral section through the sphere';
    } else if (geometry === 'slab') {
      const halfW = Math.min(boxW / 2, boxH * 0.9);
      const halfH = Math.min(boxH / 2, halfW * 0.55);
      const cols = 160;
      for (let i = 0; i < cols; i++) {
        const u = Math.abs((i + 0.5) / cols - 0.5) * 2; // 0 at mid-plane, 1 at faces
        ctx.fillStyle = colourAt(u, 0.5);
        ctx.fillRect(cx - halfW + (i * 2 * halfW) / cols, cy - halfH, (2 * halfW) / cols + 1, 2 * halfH);
      }
      caption = 'Section through the slab thickness (heated on both faces)';
    } else {
      const twoD = geometry === 'finiteCylinder';
      const aspect = twoD ? state.canHeight / (2 * state.radius) : 1.6;
      let halfW = boxW / 2;
      let halfH = halfW * aspect;
      if (halfH > boxH / 2) {
        halfH = boxH / 2;
        halfW = halfH / aspect;
      }
      const cols = 140;
      const rows = twoD ? 140 : 1;
      const cw = (2 * halfW) / cols;
      const ch = (2 * halfH) / rows;
      for (let i = 0; i < cols; i++) {
        const u = Math.abs((i + 0.5) / cols - 0.5) * 2; // 0 on the axis, 1 at the wall
        for (let j = 0; j < rows; j++) {
          const v = twoD ? Math.abs((j + 0.5) / rows - 0.5) * 2 : 0.5;
          ctx.fillStyle = colourAt(u, v);
          ctx.fillRect(cx - halfW + i * cw, cy - halfH + j * ch, cw + 1, ch + 1);
        }
      }
      caption = twoD
        ? 'Axial section through the can (heat enters the wall and both lids)'
        : 'Radial section (infinite cylinder — the ends are ignored)';
    }

    const style = getComputedStyle(document.documentElement);
    ctx.strokeStyle = style.getPropertyValue('--axis').trim() || '#c3c2b7';
    ctx.lineWidth = 1;
    ctx.fillStyle = style.getPropertyValue('--ink-muted').trim() || '#898781';
    ctx.font = `600 12px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(caption, cx, h - 6);
  }
}
