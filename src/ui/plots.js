/**
 * The plot panel: which charts appear for which scenario, and what goes in them.
 *
 * Each quantity keeps its own colour everywhere it appears -- centre
 * temperature is always slot 1, surface always slot 2 -- so a student who has
 * learned "blue is the cold spot" on the temperature plot reads the same
 * meaning on the profile plot.
 *
 * Every chart has ONE y-axis. Temperature and lethality share an x-axis (time)
 * but never a plot: putting degrees Celsius and equivalent minutes on the same
 * frame would let the eye read a relationship whose shape is an artefact of
 * where the two scales happened to be aligned.
 */

import { LinePlot, seriesColor } from './plot.js';
import { analyticalSolution, finiteCylinderProduct } from '../physics/analytical.js';

/** Down-sample a frame series to keep the tooltip's nearest-point search cheap. */
function thin(times, values, maxPoints = 300) {
  const n = times.length;
  const step = Math.max(1, Math.ceil(n / maxPoints));
  if (step === 1) return { x: times, y: values };
  const count = Math.ceil(n / step);
  const x = new Float64Array(count);
  const y = new Float64Array(count);
  for (let i = 0, j = 0; i < n; i += step, j++) {
    x[j] = times[i];
    y[j] = values[i];
  }
  return { x, y };
}

/** Seconds -> minutes, since every process here is minutes-to-hours long. */
function toMinutes(arr) {
  const out = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = arr[i] / 60;
  return out;
}

export function createPlots(container) {
  const slots = new Map();
  let currentKeys = '';

  /** Create or reuse the plots for a scenario, preserving them across redraws. */
  function ensure(keys, titles, heights) {
    const sig = keys.join('|');
    if (sig === currentKeys) return;
    currentKeys = sig;
    for (const p of slots.values()) p.destroy();
    slots.clear();
    container.innerHTML = '';
    keys.forEach((key, i) => {
      const div = document.createElement('div');
      container.appendChild(div);
      slots.set(key, new LinePlot(div, { title: titles[i], height: heights[i] ?? 190 }));
    });
  }

  return {
    render(state, der, result, baseline = null) {
      if (!result) return;
      if (result.kind === 'exchanger') renderExchanger(ensure, slots, state, result);
      else if (result.kind === 'freeze') renderFreeze(ensure, slots, state, result);
      else renderConduction(ensure, slots, state, der, result, baseline);
    },
  };
}

/* ------------------------------------------------------------------ */
function renderConduction(ensure, slots, state, der, result, baseline = null) {
  ensure(
    ['temp', 'profile', 'theta', 'f0'],
    [
      'Temperature against time',
      'Temperature through the food, at the scrubbed time',
      'Dimensionless temperature θ at the centre (log scale)',
      'Accumulated lethality F₀ at the cold spot',
    ],
    [200, 175, 185, 185],
  );

  const tMin = toMinutes(result.times);
  const frame = Math.min(Math.round(state.frame), result.nFrames);

  // --- 1. Temperature histories -------------------------------------
  const c = thin(tMin, result.Tcenter);
  const s = thin(tMin, result.Tsurface);
  const m = thin(tMin, result.Tmean);
  const tempSeries = [
    { id: 'centre', label: 'Centre', color: seriesColor(1), x: c.x, y: c.y },
    { id: 'surface', label: 'Surface', color: seriesColor(2), x: s.x, y: s.y },
    { id: 'mean', label: 'Volume mean', color: seriesColor(3), x: m.x, y: m.y },
  ];
  // A pinned run joins as a dashed line in the SAME colour as the quantity it
  // mirrors, so "centre" stays blue in both runs and the dash carries the
  // A-versus-B distinction instead of a fourth hue.
  if (baseline) {
    const b = thin(toMinutes(baseline.times), baseline.Tcenter);
    tempSeries.push({
      id: 'baseline', label: `${baseline.label} centre`, color: seriesColor(1),
      x: b.x, y: b.y, dash: [5, 4], width: 1.5,
    });
  }
  slots.get('temp').setData({
    title: 'Temperature against time',
    xLabel: 'Time', xUnit: ' min',
    yLabel: 'Temperature (°C)', yUnit: ' °C',
    xScale: 'lin', yScale: 'lin',
    series: tempSeries,
    markers: [
      { axis: 'y', value: state.Tmedium, label: 'Medium', color: seriesColor(4) },
      { axis: 'x', value: tMin[frame], label: 'now', dashed: false, weight: 1 },
    ],
  });

  // --- 2. Spatial profile at the scrubbed instant --------------------
  // The gradient IS the lesson here, so the profile is drawn from the actual
  // mesh values rather than a smoothed curve.
  const prof = spatialProfile(state, result, frame);
  slots.get('profile').setData({
    title: `Temperature through the food at ${(tMin[frame]).toFixed(1)} min`,
    xLabel: prof.xLabel, xUnit: ' mm',
    yLabel: 'Temperature (°C)', yUnit: ' °C',
    xScale: 'lin', yScale: 'lin',
    yDomain: [Math.min(state.Tinitial, state.Tmedium) - 3, Math.max(state.Tinitial, state.Tmedium) + 3],
    series: [{ id: 'profile', label: 'Temperature', color: seriesColor(1), x: prof.x, y: prof.y }],
    markers: [{ axis: 'y', value: state.Tmedium, label: 'Medium', color: seriesColor(4) }],
  });

  // --- 3. Dimensionless theta, log scale, against the exact solution --
  // On a log axis the single-term regime is a straight line, which is exactly
  // the point: after Fo ~ 0.2 all the higher eigenmodes have died away.
  const span = state.Tinitial - state.Tmedium;
  const theta = new Float64Array(result.nFrames + 1);
  for (let i = 0; i <= result.nFrames; i++) {
    theta[i] = span !== 0 ? (result.Tcenter[i] - state.Tmedium) / span : 0;
  }
  const foAxis = new Float64Array(result.nFrames + 1);
  for (let i = 0; i <= result.nFrames; i++) foAxis[i] = der.Fo(result.times[i]);

  const exact = exactCentre(state, der, result);
  const tn = thin(foAxis, theta);
  const series = [{ id: 'numeric', label: 'Numerical', color: seriesColor(1), x: tn.x, y: tn.y }];
  if (exact) {
    const en = thin(foAxis, exact);
    series.push({
      id: 'exact', label: 'Exact series', color: seriesColor(4),
      x: en.x, y: en.y, dash: [6, 4], width: 2,
    });
  }
  slots.get('theta').setData({
    title: 'Dimensionless centre temperature θ (log scale)',
    xLabel: 'Fourier number Fo', yLabel: 'θ = (T−T∞)/(Tᵢ−T∞)',
    xScale: 'lin', yScale: 'log',
    yDomain: [1e-3, 1.2],
    series,
  });

  // --- 4. Lethality --------------------------------------------------
  if (result.lethality) {
    const f = thin(tMin, result.lethality.F);
    const markers = [{ axis: 'y', value: state.targetF0, label: `target F₀ = ${state.targetF0}`, color: seriesColor(2) }];
    if (result.lethality.timeToTarget !== null) {
      markers.push({ axis: 'x', value: result.lethality.timeToTarget / 60, label: 'target met', color: seriesColor(2) });
    }
    slots.get('f0').setData({
      title: 'Accumulated lethality F₀ at the cold spot',
      xLabel: 'Time', xUnit: ' min',
      yLabel: 'F₀ (equivalent min)', yUnit: ' min',
      xScale: 'lin', yScale: 'lin',
      series: [{ id: 'f0', label: 'F₀', color: seriesColor(4), x: f.x, y: f.y }],
      markers,
    });
  }
}

/** Radial (or through-thickness) temperature profile for the scrubbed frame. */
function spatialProfile(state, result, frame) {
  if (result.Nr !== undefined) {
    // Finite cylinder: take the radial line at mid-height, the plane the cold
    // spot actually lives on.
    const { Nr, mesh } = result;
    const x = new Float64Array(Nr);
    const y = new Float64Array(Nr);
    for (let i = 0; i < Nr; i++) {
      x[i] = mesh.rc[i] * 1000;
      y[i] = result.at(frame, i, 0);
    }
    return { x, y, xLabel: 'Radius from the axis, at mid-height' };
  }
  const N = result.N;
  const field = result.frame(frame);
  const x = new Float64Array(N);
  const y = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    x[i] = result.mesh.rc[i] * 1000;
    y[i] = field[i];
  }
  return {
    x, y,
    xLabel: state.geometry === 'slab' ? 'Distance from the mid-plane' : 'Radius from the centre',
  };
}

/**
 * Exact centre temperature for the same run, so the student can see the
 * numerical solution sitting on top of the analytical one rather than being
 * told that it does.
 */
function exactCentre(state, der, result) {
  try {
    const out = new Float64Array(result.nFrames + 1);
    if (state.geometry === 'finiteCylinder') {
      const prod = finiteCylinderProduct({
        R: state.radius,
        halfHeight: state.canHeight / 2,
        k: state.k,
        alpha: der.alpha,
        h: der.h,
        nTerms: 40,
      });
      for (let i = 0; i <= result.nFrames; i++) out[i] = prod.thetaCenter(result.times[i]);
    } else {
      const L = state.geometry === 'slab' ? state.halfThickness : state.radius;
      const sol = analyticalSolution(state.geometry, (der.h * L) / state.k, 40);
      for (let i = 0; i <= result.nFrames; i++) out[i] = sol.thetaCenter((der.alpha * result.times[i]) / (L * L));
    }
    return out;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
function renderFreeze(ensure, slots, state, result) {
  ensure(
    ['plateau', 'front'],
    ['Centre temperature: the freezing plateau', 'Frozen fraction during the plateau'],
    [220, 185],
  );

  // Stitch the three segments into one curve. The seams are where the MODEL
  // changes, so they are marked -- the student should see that the plateau is
  // Plank's and the two legs are the conduction solver's.
  const xs = [];
  const ys = [];
  const tPre = result.tPrecool ?? 0;

  for (let i = 0; i <= result.precool.nFrames; i++) {
    const t = result.precool.times[i];
    if (t > tPre) break;
    xs.push(t / 60);
    ys.push(result.precool.Tcenter[i]);
  }
  xs.push(tPre / 60, (tPre + result.plank.time) / 60);
  ys.push(state.freezingPoint, state.freezingPoint);

  const tStart = tPre + result.plank.time;
  for (let i = 0; i <= result.subcool.nFrames; i++) {
    xs.push((tStart + result.subcool.times[i]) / 60);
    ys.push(result.subcool.Tcenter[i]);
    if (result.subcool.Tcenter[i] <= state.chillMedium + 0.5) break;
  }

  slots.get('plateau').setData({
    title: 'Centre temperature: the freezing plateau',
    xLabel: 'Time', xUnit: ' min',
    yLabel: 'Centre temperature (°C)', yUnit: ' °C',
    xScale: 'lin', yScale: 'lin',
    series: [{ id: 'centre', label: 'Centre', color: seriesColor(1), x: Float64Array.from(xs), y: Float64Array.from(ys) }],
    markers: [
      { axis: 'y', value: state.freezingPoint, label: `initial freezing point ${state.freezingPoint} °C`, color: seriesColor(2) },
      { axis: 'x', value: tPre / 60, label: 'plateau starts', color: seriesColor(4) },
      { axis: 'x', value: tStart / 60, label: 'plateau ends', color: seriesColor(4) },
      { axis: 'y', value: -18, label: 'frozen storage −18 °C', color: seriesColor(3) },
    ],
  });

  // Frozen fraction across the plateau, from Plank's own front integral.
  const n = 120;
  const fx = new Float64Array(n + 1);
  const fy = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * result.plank.time;
    fx[i] = (tPre + t) / 60;
    fy[i] = result.frozenAt(t) * 100;
  }
  slots.get('front').setData({
    title: 'Frozen fraction during the plateau',
    xLabel: 'Time', xUnit: ' min',
    yLabel: 'Frozen by volume (%)', yUnit: ' %',
    xScale: 'lin', yScale: 'lin',
    yDomain: [0, 105],
    series: [{ id: 'frozen', label: 'Frozen fraction', color: seriesColor(3), x: fx, y: fy }],
  });
}

/* ------------------------------------------------------------------ */
function renderExchanger(ensure, slots, state, result) {
  ensure(
    ['profile', 'sweep'],
    ['Stream temperatures along the exchanger', 'Effectiveness against exchanger size'],
    [215, 195],
  );

  const p = result.profiles;
  // Counter-current: the cold stream physically enters at xi = 1 and leaves at
  // xi = 0. Plotting it on the same axis as the hot stream is what makes the
  // near-constant approach temperature visible.
  slots.get('profile').setData({
    title: 'Stream temperatures along the exchanger',
    xLabel: 'Fraction of area from the hot inlet', yLabel: 'Temperature (°C)', yUnit: ' °C',
    xScale: 'lin', yScale: 'lin',
    series: [
      { id: 'hot', label: 'Heating medium', color: seriesColor(2), x: p.xi, y: p.Th },
      { id: 'cold', label: 'Milk', color: seriesColor(1), x: p.xi, y: p.Tc },
    ],
    markers: [{ axis: 'y', value: 72, label: 'HTST 72 °C', color: seriesColor(4) }],
  });

  // Effectiveness against NTU for BOTH arrangements, with the current
  // operating point marked. This is the plot that shows the co-current
  // ceiling as a horizontal asymptote rather than as an assertion.
  const n = 160;
  const ntu = new Float64Array(n + 1);
  const epsC = new Float64Array(n + 1);
  const epsP = new Float64Array(n + 1);
  const Cr = result.Cr;
  const maxNtu = Math.max(8, result.NTU * 1.6);
  for (let i = 0; i <= n; i++) {
    const v = (i / n) * maxNtu;
    ntu[i] = v;
    epsC[i] = counterEps(v, Cr);
    epsP[i] = (1 - Math.exp(-v * (1 + Cr))) / (1 + Cr);
  }

  slots.get('sweep').setData({
    title: 'Effectiveness against exchanger size',
    xLabel: 'NTU = UA / C_min', yLabel: 'Effectiveness ε',
    xScale: 'lin', yScale: 'lin',
    yDomain: [0, 1.05],
    series: [
      { id: 'counter', label: 'Counter-current', color: seriesColor(1), x: ntu, y: epsC },
      { id: 'parallel', label: 'Co-current', color: seriesColor(2), x: ntu, y: epsP },
    ],
    markers: [
      { axis: 'x', value: result.NTU, label: 'this exchanger', color: seriesColor(4) },
      { axis: 'y', value: 1 / (1 + Cr), label: `co-current ceiling ${(1 / (1 + Cr)).toFixed(3)}`, color: seriesColor(2) },
    ],
  });
}

function counterEps(NTU, Cr) {
  if (Math.abs(Cr - 1) < 1e-8) return NTU / (1 + NTU);
  const e = Math.exp(-NTU * (1 - Cr));
  return (1 - e) / (1 - Cr * e);
}
