/**
 * Two-dimensional axisymmetric transient conduction in a FINITE cylinder --
 * an actual can -- solved by the alternating-direction implicit (ADI) method.
 *
 *      dT/dt = alpha [ (1/r) d/dr ( r dT/dr ) + d2T/dz2 ]
 *
 * WHY THIS MATTERS PEDAGOGICALLY
 * The infinite-cylinder solution students meet first ignores the ends. A real
 * 307x409 can is squat enough that heat entering through the lids reaches the
 * centre at a comparable rate to heat entering through the side wall, so the
 * true centre heats noticeably faster than the infinite-cylinder result. This
 * solver captures that; comparing it against the infinite cylinder is one of
 * the more revealing things a student can do with the app.
 *
 * DOMAIN
 * Symmetry in both directions lets us solve one quarter of the r-z plane:
 * r in [0, R] and z in [0, L] with L = H/2, where z is measured from the
 * mid-height plane. The can centre is the corner (r=0, z=0); the side wall is
 * r=R and the lid is z=L.
 *
 * WHY ADI
 * A fully implicit 2-D scheme needs a sparse matrix solve per step. ADI splits
 * each step into two half-steps -- implicit in r, then implicit in z -- each of
 * which is a set of independent tridiagonal systems solved by the Thomas
 * algorithm in O(N). The result is unconditionally stable and second-order in
 * both time and space, at a cost that is linear in the cell count. A 60x60
 * mesh with 1200 steps runs in a few milliseconds, so the whole time history
 * can be precomputed on every slider change.
 *
 * Peaceman & Rachford (1955), J. Soc. Indust. Appl. Math. 3(1), 28-41.
 *
 * STARTUP
 * Peaceman-Rachford is the 2-D analogue of Crank-Nicolson and shares its lack
 * of L-stability, so it rings on the step change at t = 0. The first few steps
 * therefore use the Douglas-Rachford variant, which is backward-Euler-like and
 * strongly damping, before switching to Peaceman-Rachford for accuracy.
 */

import { Tridiag } from './tridiag.js';
import { startupRamp, RANNACHER_STEPS } from './timestep.js';

/**
 * Build the axisymmetric control-volume mesh.
 * All measures are per 2*pi radians; the constant cancels throughout.
 */
export function buildMesh2D(R, halfHeight, Nr, Nz) {
  const dr = R / Nr;
  const dz = halfHeight / Nz;

  const rf = new Float64Array(Nr + 1);
  const rc = new Float64Array(Nr);
  const zc = new Float64Array(Nz);
  const Vr = new Float64Array(Nr); // radial volume measure (rf2^2 - rf1^2)/2

  for (let i = 0; i <= Nr; i++) rf[i] = i * dr;
  for (let i = 0; i < Nr; i++) {
    rc[i] = (i + 0.5) * dr;
    Vr[i] = (rf[i + 1] * rf[i + 1] - rf[i] * rf[i]) / 2;
  }
  for (let j = 0; j < Nz; j++) zc[j] = (j + 0.5) * dz;

  return { dr, dz, rf, rc, zc, Vr, Nr, Nz, R, halfHeight };
}

export function solveConduction2D({
  R,
  halfHeight,
  k,
  rho,
  cp,
  h,
  Ti,
  Tinf,
  tEnd,
  Nr = 48,
  Nz = 48,
  nFrames = 240,
  stepsPerFrame = 4,
}) {
  const mesh = buildMesh2D(R, halfHeight, Nr, Nz);
  const { dr, dz, rf, Vr } = mesh;
  const alpha = k / (rho * cp);
  const n = Nr * Nz;
  const idx = (i, j) => j * Nr + i;

  // ---- Conductances -------------------------------------------------------
  // Radial face i links cell (i-1,j) to (i,j); area = rf[i] * dz.
  const Kr = new Float64Array(Nr + 1);
  Kr[0] = 0; // axis: zero area, hence zero flux -> symmetry for free
  for (let i = 1; i < Nr; i++) Kr[i] = (k * rf[i] * dz) / dr;
  Kr[Nr] = h > 0 ? (rf[Nr] * dz) / (1 / h + dr / (2 * k)) : 0;

  // Axial faces: area = Vr[i], so the conductance varies with the column.
  const KzInt = new Float64Array(Nr); // between two interior cells
  const KzBnd = new Float64Array(Nr); // at the lid, z = L
  for (let i = 0; i < Nr; i++) {
    KzInt[i] = (k * Vr[i]) / dz;
    KzBnd[i] = h > 0 ? Vr[i] / (1 / h + dz / (2 * k)) : 0;
  }

  const C = new Float64Array(Nr); // capacity per cell, depends on i only
  for (let i = 0; i < Nr; i++) C[i] = rho * cp * Vr[i] * dz;

  // Capacity expanded over the whole field. Costs 8 bytes a cell and removes a
  // modulo from every inner loop, which measurably matters at this step count.
  const Cfull = new Float64Array(n);
  for (let j = 0; j < Nz; j++) for (let i = 0; i < Nr; i++) Cfull[j * Nr + i] = C[i];

  /** Axial conductance on the face between (i, j-1) and (i, j). */
  const kzFace = (i, j) => (j === 0 ? 0 : j === Nz ? KzBnd[i] : KzInt[i]);

  // ---- Operators ----------------------------------------------------------
  // Both include the Tinf contribution from the convective boundary, so they
  // represent the full spatial operator acting on the current field.
  // Loops run j-outer/i-inner to walk memory in order; branch flags are
  // hoisted out of the inner loop.
  const applyLr = (T, out) => {
    for (let j = 0; j < Nz; j++) {
      const base = j * Nr;
      for (let i = 0; i < Nr; i++) {
        const p = base + i;
        const Te = i < Nr - 1 ? T[p + 1] : Tinf;
        const Tw = i > 0 ? T[p - 1] : 0; // Kr[0] = 0, value unused
        const Tc = T[p];
        out[p] = Kr[i + 1] * (Te - Tc) - Kr[i] * (Tc - Tw);
      }
    }
    return out;
  };

  const applyLz = (T, out) => {
    for (let j = 0; j < Nz; j++) {
      const base = j * Nr;
      const isBottom = j === 0;
      const isTop = j === Nz - 1;
      for (let i = 0; i < Nr; i++) {
        const p = base + i;
        const ki = KzInt[i];
        const kd = isBottom ? 0 : ki;
        const ku = isTop ? KzBnd[i] : ki;
        const Tu = isTop ? Tinf : T[p + Nr];
        const Td = isBottom ? 0 : T[p - Nr]; // kd = 0 there, value unused
        const Tc = T[p];
        out[p] = ku * (Tu - Tc) - kd * (Tc - Td);
      }
    }
    return out;
  };

  // ---- Buffers ------------------------------------------------------------
  let T = new Float64Array(n).fill(Ti);
  const Tstar = new Float64Array(n);
  const work = new Float64Array(n);
  const scratch = new Float64Array(n);
  const lineOut = new Float64Array(Math.max(Nr, Nz));
  const sysR = new Tridiag(Nr);
  const sysZ = new Tridiag(Nz);

  /**
   * Implicit sweep in r: solve (g*C - Lr) X = rhs, one tridiagonal per row j.
   * `g` is C/dt scaled by the scheme's step fraction.
   */
  const sweepR = (rhs, out, g) => {
    // The radial matrix is identical for every axial row -- its coefficients
    // depend on i alone -- so assemble and factor it once, then reuse the
    // factorization for all Nz right-hand sides.
    const { a, b, c, d } = sysR;
    for (let i = 0; i < Nr; i++) {
      a[i] = -Kr[i];
      b[i] = g * C[i] + Kr[i] + Kr[i + 1];
      c[i] = -Kr[i + 1];
    }
    sysR.factor(Nr);

    const boundary = Kr[Nr] * Tinf; // known boundary value
    for (let j = 0; j < Nz; j++) {
      const base = j * Nr;
      for (let i = 0; i < Nr; i++) d[i] = rhs[base + i];
      d[Nr - 1] += boundary;
      sysR.solveFactored(lineOut, Nr);
      for (let i = 0; i < Nr; i++) out[base + i] = lineOut[i];
    }
  };

  /** Implicit sweep in z: one tridiagonal per column i. */
  const sweepZ = (rhs, out, g) => {
    const { a, b, c, d } = sysZ;
    for (let i = 0; i < Nr; i++) {
      const ki = KzInt[i];
      const kb = KzBnd[i];
      const gC = g * C[i];
      for (let j = 0; j < Nz; j++) {
        const kd = j === 0 ? 0 : ki;
        const ku = j === Nz - 1 ? kb : ki;
        a[j] = -kd;
        b[j] = gC + kd + ku;
        c[j] = -ku;
        let r = rhs[j * Nr + i];
        if (j === Nz - 1) r += kb * Tinf;
        d[j] = r;
      }
      sysZ.solve(lineOut, Nz);
      for (let j = 0; j < Nz; j++) out[j * Nr + i] = lineOut[j];
    }
  };

  /** Peaceman-Rachford: second-order, unconditionally stable. */
  const stepPR = (dt) => {
    const g = 2 / dt;
    // Half-step 1: implicit r, explicit z
    applyLz(T, work);
    for (let p = 0; p < n; p++) work[p] += g * Cfull[p] *T[p];
    sweepR(work, Tstar, g);
    // Half-step 2: implicit z, explicit r
    applyLr(Tstar, work);
    for (let p = 0; p < n; p++) work[p] += g * Cfull[p] *Tstar[p];
    sweepZ(work, T, g);
  };

  /** Douglas-Rachford: first-order but strongly damping; used for startup. */
  const stepDR = (dt) => {
    const g = 1 / dt;
    applyLz(T, scratch); // Lz T^n is needed by both stages, so keep it
    for (let p = 0; p < n; p++) work[p] = g * Cfull[p] *T[p] + scratch[p];
    sweepR(work, Tstar, g);
    for (let p = 0; p < n; p++) work[p] = g * Cfull[p] *Tstar[p] - scratch[p];
    sweepZ(work, T, g);
  };

  // ---- Derived quantities -------------------------------------------------
  // Quadratic extrapolation to the axis, then to the mid-plane. Symmetry makes
  // the profile locally even in each direction, giving T0 - (T1 - T0)/8.
  const centerOf = (Tarr) => {
    const c0 = Tarr[idx(0, 0)] - (Tarr[idx(1, 0)] - Tarr[idx(0, 0)]) / 8;
    const c1 = Tarr[idx(0, 1)] - (Tarr[idx(1, 1)] - Tarr[idx(0, 1)]) / 8;
    return c0 - (c1 - c0) / 8;
  };

  /** Side-wall surface temperature at mid-height. */
  const surfaceOf = (Tarr) => {
    if (h <= 0) return Tarr[idx(Nr - 1, 0)];
    const g = (2 * k) / dr;
    return (h * Tinf + g * Tarr[idx(Nr - 1, 0)]) / (h + g);
  };

  let Vtot = 0;
  for (let i = 0; i < Nr; i++) Vtot += Vr[i] * dz * Nz;
  const meanOf = (Tarr) => {
    let s = 0;
    for (let j = 0; j < Nz; j++)
      for (let i = 0; i < Nr; i++) s += Vr[i] * dz * Tarr[idx(i, j)];
    return s / Vtot;
  };

  /** Net heat flow into the food through the side wall plus the lid. */
  const surfaceFlux = () => {
    let q = 0;
    for (let j = 0; j < Nz; j++) q += Kr[Nr] * (Tinf - T[idx(Nr - 1, j)]);
    for (let i = 0; i < Nr; i++) q += KzBnd[i] * (Tinf - T[idx(i, Nz - 1)]);
    return q;
  };

  // ---- Time loop ----------------------------------------------------------
  const dtFrame = tEnd / nFrames;
  const dt = dtFrame / stepsPerFrame;
  // Graded sub-steps across the first frame; see timestep.js.
  const ramp = startupRamp(dtFrame);

  const times = new Float64Array(nFrames + 1);
  const field = new Float64Array((nFrames + 1) * n);
  const Tcenter = new Float64Array(nFrames + 1);
  const Tsurface = new Float64Array(nFrames + 1);
  const Tmean = new Float64Array(nFrames + 1);
  const energyStored = new Float64Array(nFrames + 1);
  const energyThroughSurface = new Float64Array(nFrames + 1);

  const record = (f, t, cumFlux) => {
    times[f] = t;
    field.set(T, f * n);
    Tcenter[f] = centerOf(T);
    Tsurface[f] = surfaceOf(T);
    Tmean[f] = meanOf(T);
    let e = 0;
    for (let j = 0; j < Nz; j++)
      for (let i = 0; i < Nr; i++) e += C[i] * (T[idx(i, j)] - Tinf);
    energyStored[f] = e;
    energyThroughSurface[f] = cumFlux;
  };

  let t = 0;
  let cumFlux = 0;
  record(0, 0, 0);

  // See the note in conduction1d.js: the half-cell flux balance that recovers
  // the surface temperature is invalid against the step initial condition, so
  // frame 0 is set from the uniform initial state instead.
  Tsurface[0] = Ti;

  let stepIndex = 0;
  for (let f = 1; f <= nFrames; f++) {
    const schedule = f === 1 ? ramp : null;
    const count = schedule ? schedule.length : stepsPerFrame;
    for (let s = 0; s < count; s++) {
      const dtStep = schedule ? schedule[s] : dt;
      const q0 = surfaceFlux();
      if (stepIndex < RANNACHER_STEPS) stepDR(dtStep);
      else stepPR(dtStep);
      const q1 = surfaceFlux();
      cumFlux += 0.5 * (q0 + q1) * dtStep;
      stepIndex++;
    }
    t = f * dtFrame; // set rather than accumulate, so frame times stay exact
    record(f, t, cumFlux);
  }

  return {
    mesh,
    Nr,
    Nz,
    nFrames,
    dt,
    alpha,
    Ti,
    Tinf,
    R,
    halfHeight,
    /** Biot numbers on each characteristic length -- both matter for a can. */
    BiR: (h * R) / k,
    BiL: (h * halfHeight) / k,
    times,
    field,
    Tcenter,
    Tsurface,
    Tmean,
    energyStored,
    energyThroughSurface,
    idx,
    /** Full r-z temperature field for one frame, as a view (no copy). */
    frame: (f) => field.subarray(f * n, (f + 1) * n),
    /** Temperature at cell (i, j) in frame f. */
    at: (f, i, j) => field[f * n + j * Nr + i],
  };
}
