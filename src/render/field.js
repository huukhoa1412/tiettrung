/**
 * Turn a solved temperature history into a colour-mapped image the renderers
 * can sample.
 *
 * The solver's mesh is cell-centred, so it has no value exactly at the axis or
 * exactly at the surface -- yet those are the two places a student looks first.
 * Both are reconstructed here rather than approximated by the nearest cell:
 * the centre by the same quadratic symmetry argument the solver uses, and the
 * surface from the convective flux balance. The resampled image therefore runs
 * from a true centre value at u = 0 to a true surface value at u = 1.
 *
 * THE COLOUR SCALE IS FIXED FOR THE WHOLE RUN, not per frame. Rescaling each
 * frame to its own min and max would make a nearly-uniform can look violently
 * hot, and would make the colours mean something different at every instant.
 */

import { sampleColormap } from './colormap.js';

/**
 * Temperature limits for the run: the two temperatures this process spans.
 *
 * The medium is scenario-specific. Folding the blast-chiller temperature into
 * the retort's scale would stretch the ramp from -35 to 121 degrees and waste
 * most of it on temperatures the food never reaches, flattening exactly the
 * contrast the view exists to show.
 */
export function fieldRange(state) {
  const medium = state.scenario === 'chill' ? state.chillMedium : state.Tmedium;
  const lo = Math.min(state.Tinitial, medium);
  const hi = Math.max(state.Tinitial, medium);
  return lo === hi ? [lo - 1, hi + 1] : [lo, hi];
}

/** Linear interpolation over a cell-centred array with reconstructed ends. */
function sampleRadial(values, centre, surface, N, s) {
  // s runs 0 (axis) to 1 (surface). Cell i sits at (i + 0.5)/N.
  const x = s * N - 0.5;
  if (x <= 0) {
    const f = s * N * 2; // blend centre -> first cell across the half cell
    return centre + (values[0] - centre) * Math.min(1, Math.max(0, f));
  }
  if (x >= N - 1) {
    const f = (x - (N - 1)) / 0.5;
    return values[N - 1] + (surface - values[N - 1]) * Math.min(1, Math.max(0, f));
  }
  const i = Math.floor(x);
  const f = x - i;
  return values[i] + (values[i + 1] - values[i]) * f;
}

/**
 * Build an RGBA image of the field for one frame.
 *
 * One-dimensional geometries produce a width x 1 image indexed by r/R.
 * The finite cylinder produces width x height indexed by (r/R, |z|/halfHeight).
 */
export function buildFieldImage(result, frame, state, colormap, width = 128, height = 128) {
  const [tLo, tHi] = fieldRange(state);
  const span = tHi - tLo || 1;
  const f = Math.max(0, Math.min(result.nFrames, Math.round(frame)));

  const is2D = result.Nr !== undefined;
  const h = is2D ? height : 1;
  const rgba = new Uint8Array(width * h * 4);

  const write = (idx, T) => {
    const [r, g, b] = sampleColormap(colormap, (T - tLo) / span);
    rgba[idx * 4] = Math.round(r * 255);
    rgba[idx * 4 + 1] = Math.round(g * 255);
    rgba[idx * 4 + 2] = Math.round(b * 255);
    rgba[idx * 4 + 3] = 255;
  };

  if (!is2D) {
    const values = result.frame(f);
    const N = result.N;
    const centre = result.Tcenter[f];
    const surface = result.Tsurface[f];
    for (let i = 0; i < width; i++) {
      write(i, sampleRadial(values, centre, surface, N, i / (width - 1)));
    }
    return { rgba, width, height: 1, tLo, tHi };
  }

  // --- two-dimensional can ---
  const { Nr, Nz, mesh } = result;
  const centre = result.Tcenter[f];
  const surface = result.Tsurface[f];

  // Extract each axial row, reconstruct its ends, then resample in z.
  const rowCache = [];
  for (let j = 0; j < Nz; j++) {
    const row = new Float64Array(Nr);
    for (let i = 0; i < Nr; i++) row[i] = result.at(f, i, j);
    // Centre of this row by the same quadratic symmetry extrapolation.
    const rowCentre = row[0] - (row[1] - row[0]) / 8;
    // Surface of this row from the flux balance across the last half cell.
    // At f = 0 that balance is invalid against the step initial condition, so
    // the uniform initial state is used instead -- otherwise the very first
    // frame shows a hot skin on a can that has not yet been heated.
    const g = (2 * state.k) / mesh.dr;
    const hSurf = state.scenario === 'chill' ? state.chillH : state.h;
    const Tinf = state.scenario === 'chill' ? state.chillMedium : state.Tmedium;
    const rowSurface =
      f === 0 || hSurf <= 0 ? row[Nr - 1] : (hSurf * Tinf + g * row[Nr - 1]) / (hSurf + g);
    rowCache.push({ row, rowCentre, rowSurface });
  }

  // The LID temperature, reconstructed the same way as the side wall but in
  // the axial direction. Without this the top of the can is drawn from the
  // last cell CENTRE, half a cell in from the lid, so the lids appeared far
  // colder than the side wall on the same can -- worst exactly where h is
  // high, which is the default. The lids are heated by the same medium and
  // must reach the same surface temperature.
  const gz = (2 * state.k) / mesh.dz;
  const hS = state.scenario === 'chill' ? state.chillH : state.h;
  const Tinf2 = state.scenario === 'chill' ? state.chillMedium : state.Tmedium;
  const lid = new Float64Array(Nr);
  for (let i = 0; i < Nr; i++) {
    const top = result.at(f, i, Nz - 1);
    lid[i] = f === 0 || hS <= 0 ? top : (hS * Tinf2 + gz * top) / (hS + gz);
  }
  const lidCentre = lid[0] - (lid[1] - lid[0]) / 8;
  const lidSurface =
    f === 0 || hS <= 0 ? lid[Nr - 1] : (hS * Tinf2 + ((2 * state.k) / mesh.dr) * lid[Nr - 1]) / (hS + (2 * state.k) / mesh.dr);

  for (let jy = 0; jy < height; jy++) {
    // v = 0 is the mid-height plane (the cold spot), v = 1 is the lid.
    const v = jy / (height - 1);
    const zx = v * Nz - 0.5;
    const j0 = Math.max(0, Math.min(Nz - 1, Math.floor(zx)));
    const j1 = Math.max(0, Math.min(Nz - 1, j0 + 1));
    const fz = Math.max(0, Math.min(1, zx - j0));
    // Past the last cell centre, blend on to the reconstructed lid rather than
    // holding the last interior value.
    const toLid = Math.max(0, Math.min(1, (zx - (Nz - 1)) / 0.5));

    for (let i = 0; i < width; i++) {
      const s = i / (width - 1);
      const a = rowCache[j0];
      const b = rowCache[j1];
      const Ta = sampleRadial(a.row, a.rowCentre, a.rowSurface, Nr, s);
      const Tb = sampleRadial(b.row, b.rowCentre, b.rowSurface, Nr, s);
      let T = Ta + (Tb - Ta) * fz;
      if (toLid > 0) {
        const Tlid = sampleRadial(lid, lidCentre, lidSurface, Nr, s);
        T = T + (Tlid - T) * toLid;
      }
      write(jy * width + i, T);
    }
  }

  return { rgba, width, height, tLo, tHi };
}

/**
 * Field image for the chill-and-freeze run.
 *
 * Three segments, and the middle one is the interesting case. During the
 * plateau there is no transient solve to sample -- Plank's model replaces it
 * with a sharp front and a QUASI-STEADY frozen shell. That shell has a real,
 * derivable temperature profile, so it is computed here rather than faked:
 *
 *   slab       linear between the front and the surface
 *   cylinder   logarithmic in r
 *   sphere     linear in 1/r
 *
 * with the heat flux fixed by the series combination of the frozen layer and
 * the surface film, exactly as in the derivation of Plank's equation. The
 * unfrozen core sits isothermal at the initial freezing point.
 *
 * The result is that the animation shows a genuine freezing front sweeping
 * inward with a physically correct gradient behind it -- the same model that
 * produced the quoted freezing time, not a decorative approximation of it.
 */
export function buildFreezeFieldImage(result, frame, state, colormap, width = 160) {
  const [tLo, tHi] = fieldRange(state);
  const span = tHi - tLo || 1;
  const rgba = new Uint8Array(width * 4);

  const write = (i, T) => {
    const [r, g, b] = sampleColormap(colormap, (T - tLo) / span);
    rgba[i * 4] = Math.round(r * 255);
    rgba[i * 4 + 1] = Math.round(g * 255);
    rgba[i * 4 + 2] = Math.round(b * 255);
    rgba[i * 4 + 3] = 255;
  };

  const f = Math.max(0, Math.min(result.nFrames, Math.round(frame)));
  const t = result.times[f];
  const { geometry, plankParams } = result;
  const Tf = plankParams.Tf;
  const Tinf = plankParams.Tinf;
  const kF = plankParams.kF;
  const hS = plankParams.h;

  /** Sample one of the two transient solves, mapped onto its own time axis. */
  const fromSolve = (solve, tLocal) => {
    const nf = solve.nFrames;
    const tEnd = solve.times[nf];
    const idx = Math.max(0, Math.min(nf, Math.round((tLocal / tEnd) * nf)));
    const values = solve.frame(idx);
    const centre = solve.Tcenter[idx];
    const surface = idx === 0 ? values[solve.N - 1] : solve.Tsurface[idx];
    for (let i = 0; i < width; i++) {
      write(i, sampleRadial(values, centre, surface, solve.N, i / (width - 1)));
    }
  };

  if (t <= result.tPlateauStart && result.tPlateauStart > 0) {
    fromSolve(result.precool, t);
    return { rgba, width, height: 1, tLo, tHi };
  }

  if (t <= result.tPlateauEnd) {
    // --- the plateau: sharp front, quasi-steady frozen shell ---
    const tSince = t - result.tPlateauStart;
    const s = result.frontAt(tSince); // slab: depth frozen; else: core radius
    const R = geometry === 'slab' ? plankParams.a / 2 : plankParams.a / 2;
    const driving = Tf - Tinf;

    // Frozen thickness, and the heat flux it passes, per the Plank derivation.
    let profileAt;
    if (geometry === 'slab') {
      const d = Math.max(s, 1e-9); // frozen depth from each face
      const q = driving / (1 / hS + d / kF); // W/m^2
      profileAt = (u) => {
        // u is |x|/L measured from the mid-plane, L = a/2.
        const x = u * R;
        const frontX = R - d;
        if (x <= frontX) return Tf;
        return Tf + (q / kF) * (x - frontX);
      };
    } else if (geometry === 'cylinder') {
      const core = Math.max(s, 1e-6);
      const qL = (2 * Math.PI * driving) / (1 / (hS * R) + Math.log(R / core) / kF);
      profileAt = (u) => {
        const r = Math.max(u * R, 1e-9);
        if (r <= core) return Tf;
        return Tf + (qL / (2 * Math.PI * kF)) * Math.log(r / core);
      };
    } else {
      const core = Math.max(s, 1e-6);
      const q = (4 * Math.PI * driving) / (1 / (hS * R * R) + (1 / core - 1 / R) / kF);
      profileAt = (u) => {
        const r = Math.max(u * R, 1e-9);
        if (r <= core) return Tf;
        return Tf + (q / (4 * Math.PI * kF)) * (1 / core - 1 / r);
      };
    }

    for (let i = 0; i < width; i++) write(i, profileAt(i / (width - 1)));
    return { rgba, width, height: 1, tLo, tHi, front: s, plateau: true };
  }

  fromSolve(result.subcool, t - result.tPlateauEnd);
  return { rgba, width, height: 1, tLo, tHi };
}
