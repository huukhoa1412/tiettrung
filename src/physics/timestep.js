/**
 * Time-step scheduling shared by the 1-D and 2-D conduction solvers.
 *
 * THE PROBLEM AT t = 0
 * The initial condition is a step: the food is uniformly at Ti and the medium
 * is suddenly at Tinf. At high Biot number the surface temperature jumps almost
 * instantly, so the surface heat flux behaves like 1/sqrt(t) -- it is integrable
 * but unbounded as t -> 0. A uniform time step cannot resolve that, which shows
 * up as a few percent error when the cumulative surface heat is compared with
 * the stored energy, even though the solver itself is conservative by
 * construction and the temperatures are accurate to ~1e-4.
 *
 * THE FIX
 * Cover the first output frame with geometrically growing sub-steps, so the
 * earliest step is orders of magnitude smaller than the frame and the singular
 * region is resolved. Cost is a few dozen extra tridiagonal solves, once.
 */

/** Sub-steps used to cover the first frame. */
export const STARTUP_STEPS = 30;

/** Growth ratio between consecutive startup sub-steps. */
export const STARTUP_GROWTH = 1.3;

/**
 * L-stable (backward Euler) sub-steps taken before switching to the
 * second-order scheme. See the Rannacher note in conduction1d.js.
 */
export const RANNACHER_STEPS = 4;

/**
 * Geometrically graded sub-steps that sum exactly to `dtFrame`.
 *
 * dt_i = dt_0 q^i, and sum_{i<m} dt_i = dt_0 (q^m - 1)/(q - 1) = dtFrame
 * fixes dt_0. With the defaults the first sub-step is ~1e-4 of the frame.
 * The final entry is adjusted so the sum matches dtFrame to round-off,
 * keeping frame times exact.
 */
export function startupRamp(dtFrame, m = STARTUP_STEPS, q = STARTUP_GROWTH) {
  const dt0 = (dtFrame * (q - 1)) / (Math.pow(q, m) - 1);
  const out = new Float64Array(m);
  let d = dt0;
  let sum = 0;
  for (let i = 0; i < m; i++) {
    out[i] = d;
    sum += d;
    d *= q;
  }
  out[m - 1] += dtFrame - sum;
  return out;
}
