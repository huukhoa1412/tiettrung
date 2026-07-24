/**
 * One-dimensional transient conduction in a slab, infinite cylinder or sphere
 * with a convective boundary, solved by a finite-volume Crank-Nicolson scheme.
 *
 * WHY FINITE VOLUME, NOT FINITE DIFFERENCE
 * The governing operator (1/r^m) d/dr (r^m dT/dr) is singular at r = 0 for the
 * cylinder and sphere. A naive finite difference has to special-case that
 * point with a limit argument. Writing an energy balance over control volumes
 * instead makes the axis fall out for free: the inner face of the first cell
 * has zero area, so it carries zero flux and symmetry is enforced exactly.
 * The same formulation makes the scheme conservative to machine precision,
 * which is what lets validate.mjs check a closed energy balance.
 *
 * WHY CRANK-NICOLSON, NOT EXPLICIT
 * An explicit scheme is stable only for dt <= dx^2 / (2 alpha). In this app a
 * student drags h and the can radius freely, so any fixed dt would eventually
 * violate that and the solution would blow up mid-lecture. Crank-Nicolson is
 * unconditionally stable and second-order in both time and space, so the time
 * step can be chosen for accuracy and frame count alone.
 *
 * WHY THE RANNACHER STARTUP
 * Crank-Nicolson is A-stable but not L-stable: the step change from Ti to Tinf
 * at t = 0 excites high-frequency modes that it damps only slowly, producing
 * visible oscillations in the surface temperature over the first few frames --
 * exactly where students look. Taking the first few steps with backward Euler
 * (which is L-stable) annihilates those modes, after which Crank-Nicolson
 * resumes with its full second-order accuracy. Reference: Rannacher (1984),
 * "Finite element solution of diffusion problems with irregular data".
 *
 * Geometry index m: 0 = slab (R is the half-thickness, symmetric heating on
 * both faces), 1 = infinite cylinder (R is the radius), 2 = sphere.
 */

import { Tridiag } from './tridiag.js';
import { startupRamp, RANNACHER_STEPS } from './timestep.js';

const GEOM_M = { slab: 0, cylinder: 1, sphere: 2 };

/**
 * Build the control-volume geometry: face positions, cell centres, cell
 * volume measures and face area measures.
 *
 * Measures are per unit depth (slab), per 2*pi per unit length (cylinder) or
 * per 4*pi (sphere). The constant factor cancels everywhere it is used, so it
 * is left out.
 */
export function buildMesh(geometry, R, N) {
  const m = GEOM_M[geometry];
  if (m === undefined) throw new Error(`buildMesh: unknown geometry "${geometry}"`);
  const dr = R / N;

  const rf = new Float64Array(N + 1); // face positions
  const rc = new Float64Array(N); // cell centres
  const V = new Float64Array(N); // cell volume measure
  const A = new Float64Array(N + 1); // face area measure

  for (let i = 0; i <= N; i++) {
    rf[i] = i * dr;
    A[i] = Math.pow(rf[i], m);
  }
  for (let i = 0; i < N; i++) {
    rc[i] = (i + 0.5) * dr;
    V[i] = (Math.pow(rf[i + 1], m + 1) - Math.pow(rf[i], m + 1)) / (m + 1);
  }

  return { m, dr, rf, rc, V, A, N, R };
}

/**
 * Solve the transient problem and return the full time history.
 *
 * The whole history is computed up front rather than stepped in real time.
 * A 200-cell, 600-frame run costs a few milliseconds, and precomputing means
 * the scrubber is instant and the 3-D view never waits on physics.
 *
 * @returns frames of cell-centre temperatures plus derived scalar histories.
 */
export function solveConduction1D({
  geometry,
  R,
  k,
  rho,
  cp,
  h,
  Ti,
  Tinf,
  tEnd,
  N = 120,
  nFrames = 300,
  stepsPerFrame = 4,
}) {
  const mesh = buildMesh(geometry, R, N);
  const { dr, V, A } = mesh;
  const alpha = k / (rho * cp);
  const Bi = (h * R) / k;

  // Face conductances. K[i] links cell i-1 to cell i.
  //   K[0]   = 0            symmetry at the centre (no flux)
  //   K[N]   = convective, with the half-cell conduction resistance dr/(2k)
  //            in series with the film resistance 1/h. Putting the half-cell
  //            in series is what keeps the boundary second-order accurate.
  const K = new Float64Array(N + 1);
  K[0] = 0;
  for (let i = 1; i < N; i++) K[i] = (k * A[i]) / dr;
  K[N] = h > 0 ? A[N] / (1 / h + dr / (2 * k)) : 0;

  const C = new Float64Array(N); // thermal capacity of each cell
  for (let i = 0; i < N; i++) C[i] = rho * cp * V[i];

  let T = new Float64Array(N).fill(Ti);
  const sys = new Tridiag(N);
  const Tnext = new Float64Array(N);

  const dtFrame = tEnd / nFrames;
  const dt = dtFrame / stepsPerFrame;
  // The first frame is covered by graded sub-steps to resolve the near-singular
  // surface flux at t = 0; every later frame uses uniform steps.
  const ramp = startupRamp(dtFrame);

  // Output buffers
  const times = new Float64Array(nFrames + 1);
  const field = new Float64Array((nFrames + 1) * N);
  const Tcenter = new Float64Array(nFrames + 1);
  const Tsurface = new Float64Array(nFrames + 1);
  const Tmean = new Float64Array(nFrames + 1);
  const energyStored = new Float64Array(nFrames + 1); // per unit measure
  const energyThroughSurface = new Float64Array(nFrames + 1);

  let Vtot = 0;
  for (let i = 0; i < N; i++) Vtot += V[i];

  // Centre temperature by quadratic extrapolation to r = 0.
  // Symmetry forces dT/dr = 0 there, so T(r) ~ Tc + b r^2 near the axis, and
  // fitting the first two cell centres gives Tc = T0 - (T1 - T0)/8.
  const centerOf = (Tarr) => Tarr[0] - (Tarr[1] - Tarr[0]) / 8;

  // Surface temperature from flux continuity across the last half-cell.
  const surfaceOf = (Tarr) => {
    if (h <= 0) return Tarr[N - 1];
    const g = (2 * k) / dr;
    return (h * Tinf + g * Tarr[N - 1]) / (h + g);
  };

  const meanOf = (Tarr) => {
    let s = 0;
    for (let i = 0; i < N; i++) s += V[i] * Tarr[i];
    return s / Vtot;
  };

  const record = (f, t, cumFlux) => {
    times[f] = t;
    field.set(T, f * N);
    Tcenter[f] = centerOf(T);
    Tsurface[f] = surfaceOf(T);
    Tmean[f] = meanOf(T);
    let e = 0;
    for (let i = 0; i < N; i++) e += C[i] * (T[i] - Tinf);
    energyStored[f] = e;
    energyThroughSurface[f] = cumFlux;
  };

  /** One theta-method step. theta = 1 backward Euler, 0.5 Crank-Nicolson. */
  const step = (dtStep, theta) => {
    sys.reset();
    const { a, b, c, d } = sys;
    for (let i = 0; i < N; i++) {
      const Kw = K[i];
      const Ke = K[i + 1];
      const Tw = i > 0 ? T[i - 1] : T[0]; // K[0] = 0 so the value is irrelevant
      const Te = i < N - 1 ? T[i + 1] : Tinf;

      a[i] = -theta * Kw;
      b[i] = C[i] / dtStep + theta * (Kw + Ke);
      c[i] = -theta * Ke;

      let rhs =
        (C[i] / dtStep) * T[i] +
        (1 - theta) * (Ke * (Te - T[i]) - Kw * (T[i] - Tw));
      if (i === N - 1) rhs += theta * Ke * Tinf; // known boundary value
      d[i] = rhs;
    }
    sys.solve(Tnext, N);
    T.set(Tnext);
  };

  /** Instantaneous heat flow into the food through the outer surface. */
  const surfaceFlux = () => K[N] * (Tinf - T[N - 1]);

  let t = 0;
  let cumFlux = 0;
  record(0, 0, 0);

  // The surface temperature is normally recovered by balancing the convective
  // flux against conduction across the last half cell, which assumes a
  // developed linear profile there. At t = 0 the profile is a step, so that
  // assumption is void and the formula returns a spuriously hot surface. The
  // initial condition is uniform by definition, so state it.
  Tsurface[0] = Ti;

  let stepIndex = 0;
  for (let f = 1; f <= nFrames; f++) {
    const schedule = f === 1 ? ramp : null;
    const count = schedule ? schedule.length : stepsPerFrame;
    for (let s = 0; s < count; s++) {
      const dtStep = schedule ? schedule[s] : dt;
      // Trapezoidal accumulation of the surface heat flow, consistent with the
      // second-order time scheme, so the energy balance closes to round-off.
      const q0 = surfaceFlux();
      const theta = stepIndex < RANNACHER_STEPS ? 1.0 : 0.5;
      step(dtStep, theta);
      const q1 = surfaceFlux();
      cumFlux += 0.5 * (q0 + q1) * dtStep;
      stepIndex++;
    }
    t = f * dtFrame; // set rather than accumulate, so frame times stay exact
    record(f, t, cumFlux);
  }

  return {
    geometry,
    mesh,
    N,
    nFrames,
    dt,
    alpha,
    Bi,
    Ti,
    Tinf,
    R,
    times,
    field,
    Tcenter,
    Tsurface,
    Tmean,
    energyStored,
    energyThroughSurface,
    /** Fourier number at a given time. */
    Fo: (time) => (alpha * time) / (R * R),
    /** Cell-centre temperatures for one frame, as a subarray view (no copy). */
    frame: (f) => field.subarray(f * N, (f + 1) * N),
  };
}
