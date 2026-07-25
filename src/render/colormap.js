/**
 * Colour maps for the temperature field.
 *
 * WHY MULTI-HUE IS ALLOWED HERE
 * The general rule for sequential data is one hue, light to dark, and never a
 * rainbow. Temperature is the documented exception: "semantic heat", where the
 * dark-to-bright progression carries meaning a single hue cannot. The condition
 * attached to that exception is that a scale legend must always be shown, so
 * the 3-D view ships a colour bar with real temperatures on it and never asks
 * the reader to guess what a colour means.
 *
 * Inferno and viridis are perceptually uniform: equal steps in the data give
 * equal perceived steps in colour. A naive blue-to-red ramp is not, and creates
 * false banding that students read as physical structure.
 *
 * A single-hue blue ramp is offered as well. It is the safest option for
 * colour-vision deficiency and for greyscale printing, at the cost of a
 * narrower perceptual range.
 */

/** Control points, evenly spaced from 0 to 1, as linear RGB in 0..1. */
const STOPS = {
  // COMSOL's Rainbow table: blue - cyan - green - yellow - red.
  // This is the default because it is what students meet in COMSOL and in most
  // engineering simulation output, so the app speaks the same visual language
  // as the rest of their course. It is NOT perceptually uniform -- equal steps
  // in temperature are not equal steps in apparent colour, and the green band
  // in particular compresses a wide range into one apparent shade. That is a
  // real cost, paid deliberately for familiarity, and it is why the colour bar
  // is always on screen: the numbers, not the hue, carry the value.
  rainbow: [
    [0.0, 0.0, 1.0],
    [0.0, 1.0, 1.0],
    [0.0, 1.0, 0.0],
    [1.0, 1.0, 0.0],
    [1.0, 0.0, 0.0],
  ],
  inferno: [
    [0.001462, 0.000466, 0.013866],
    [0.046915, 0.030324, 0.150164],
    [0.142378, 0.046242, 0.308553],
    [0.258234, 0.038571, 0.406485],
    [0.366529, 0.071579, 0.431994],
    [0.472328, 0.110547, 0.428334],
    [0.578304, 0.148039, 0.404411],
    [0.682656, 0.189501, 0.360757],
    [0.780517, 0.243327, 0.299523],
    [0.865006, 0.316822, 0.226055],
    [0.929644, 0.411479, 0.145367],
    [0.970919, 0.522853, 0.058367],
    [0.987622, 0.645320, 0.039886],
    [0.978806, 0.774545, 0.176037],
    [0.950018, 0.903409, 0.380271],
    [0.988362, 0.998364, 0.644924],
  ],
  viridis: [
    [0.267004, 0.004874, 0.329415],
    [0.281412, 0.089666, 0.412415],
    [0.282623, 0.140926, 0.457517],
    [0.276022, 0.192902, 0.489055],
    [0.253935, 0.265254, 0.529983],
    [0.221989, 0.339161, 0.548752],
    [0.190631, 0.407061, 0.556089],
    [0.163625, 0.471133, 0.558148],
    [0.139147, 0.533812, 0.555298],
    [0.120565, 0.596422, 0.543611],
    [0.134692, 0.658636, 0.517649],
    [0.208030, 0.718701, 0.472873],
    [0.327796, 0.773980, 0.407061],
    [0.477504, 0.821444, 0.318195],
    [0.647257, 0.858400, 0.209861],
    [0.993248, 0.906157, 0.143936],
  ],
  // The design system's own sequential blue ramp, 100 -> 700.
  blue: [
    [0.804, 0.886, 0.984],
    [0.718, 0.827, 0.965],
    [0.620, 0.773, 0.957],
    [0.525, 0.714, 0.937],
    [0.427, 0.655, 0.925],
    [0.333, 0.596, 0.906],
    [0.224, 0.529, 0.898],
    [0.161, 0.475, 0.839],
    [0.145, 0.416, 0.749],
    [0.110, 0.361, 0.669],
    [0.094, 0.310, 0.584],
    [0.063, 0.263, 0.506],
    [0.051, 0.212, 0.418],
  ],
};

/**
 * Selectable maps, in menu order.
 *
 * Rainbow leads because it is the requested default. Viridis is retained as
 * the second entry for one reason worth stating: roughly one man in twelve has
 * a red-green colour deficiency, and rainbow is close to the worst possible
 * choice for them -- its red and green ends can be indistinguishable, so a hot
 * spot and a cold spot look the same. Viridis stays legible under every common
 * form of colour blindness. One alternative in a dropdown costs nothing and
 * means no student is locked out of the picture.
 */
export const COLORMAPS = [
  { id: 'rainbow', label: 'Rainbow' },
  { id: 'viridis', label: 'Viridis (colour-blind safe)' },
];

/** Sample a colour map at t in 0..1, returning [r, g, b] in 0..1. */
export function sampleColormap(name, t) {
  const stops = STOPS[name] ?? STOPS.rainbow;
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** A 256-entry RGBA lookup table, for upload as a WebGL texture. */
export function colormapTexture(name, size = 256) {
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const [r, g, b] = sampleColormap(name, i / (size - 1));
    data[i * 4] = Math.round(r * 255);
    data[i * 4 + 1] = Math.round(g * 255);
    data[i * 4 + 2] = Math.round(b * 255);
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** CSS colour string, for the 2-D fallback and the colour bar. */
export function colormapCss(name, t) {
  const [r, g, b] = sampleColormap(name, t);
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

/**
 * Draw the colour bar. Without this the field view is colour-only encoding of a
 * continuous scale, which is the one thing a temperature map must never be.
 */
export function drawColorBar(canvas, { name, tMin, tMax, label = 'Temperature (°C)' }) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w <= 0 || h <= 0) return;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const style = getComputedStyle(document.documentElement);
  const ink = style.getPropertyValue('--ink-muted').trim() || '#898781';
  const font = getComputedStyle(document.body).fontFamily;

  const barH = 12;
  const barY = 4;
  const padL = 6;
  const padR = 6;
  const barW = w - padL - padR;

  for (let i = 0; i < barW; i++) {
    ctx.fillStyle = colormapCss(name, i / (barW - 1));
    ctx.fillRect(padL + i, barY, 1.5, barH);
  }
  ctx.strokeStyle = style.getPropertyValue('--axis').trim() || '#c3c2b7';
  ctx.lineWidth = 1;
  ctx.strokeRect(padL + 0.5, barY + 0.5, barW - 1, barH - 1);

  ctx.fillStyle = ink;
  ctx.font = `600 11px ${font}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(`${tMin.toFixed(1)} °C`, padL, barY + barH + 4);
  ctx.textAlign = 'right';
  ctx.fillText(`${tMax.toFixed(1)} °C`, padL + barW, barY + barH + 4);
  ctx.textAlign = 'center';
  ctx.fillText(label, padL + barW / 2, barY + barH + 4);
}
