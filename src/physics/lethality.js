/**
 * Thermal process lethality: F-values, F0, and log reductions.
 *
 * The general lethality integral accumulates equivalent time at a reference
 * temperature, weighting each instant by how much faster the target organism
 * dies at the actual temperature:
 *
 *      F = integral of 10^((T(t) - Tref)/z) dt
 *
 * The integrand is the "lethal rate" L(t). z is the temperature change that
 * multiplies the death rate tenfold -- the slope of the thermal death time
 * curve on a semi-log plot.
 *
 * F0 is the special case Tref = 121.1 C (250 F) and z = 10 C, the standard
 * basis for low-acid canned food targeting Clostridium botulinum spores. The
 * classic "botulinum cook" is F0 = 3 min, a 12-decimal reduction of a spore
 * population with D121.1 = 0.25 min.
 *
 * SIGN CONVENTION AND UNITS
 * F carries the units of the time array. Canning practice quotes F0 in
 * MINUTES, so pass minutes (or use the helper below, which converts).
 *
 * Reference: Stumbo, "Thermobacteriology in Food Processing", 2nd ed.;
 * Holdsworth & Simpson, "Thermal Processing of Packaged Foods", ch. 3.
 */

/** Standard basis for low-acid canned foods (C. botulinum). */
export const F0_BASIS = { Tref: 121.1, z: 10.0 };

/** Reference D-value at 121.1 C for C. botulinum spores, minutes. */
export const D121_BOTULINUM = 0.25;

/** Instantaneous lethal rate: equivalent seconds at Tref per second at T. */
export function lethalRate(T, Tref = F0_BASIS.Tref, z = F0_BASIS.z) {
  return Math.pow(10, (T - Tref) / z);
}

/**
 * Cumulative lethality along a temperature history.
 *
 * Trapezoidal integration. The lethal rate varies over orders of magnitude,
 * but it is smooth, and the conduction solver supplies a dense uniform frame
 * series, so trapezoid is accurate and cheap. It is also monotone, which
 * matters: the curve is shown to students as an accumulating quantity and
 * must never dip.
 *
 * @param times  seconds
 * @param temps  degrees C, same length
 * @returns {{F: Float64Array, total: number, rate: Float64Array}} F in MINUTES
 */
export function cumulativeLethality(times, temps, { Tref = F0_BASIS.Tref, z = F0_BASIS.z } = {}) {
  const n = times.length;
  const F = new Float64Array(n);
  const rate = new Float64Array(n);

  rate[0] = lethalRate(temps[0], Tref, z);
  for (let i = 1; i < n; i++) {
    rate[i] = lethalRate(temps[i], Tref, z);
    const dtMin = (times[i] - times[i - 1]) / 60; // seconds -> minutes
    F[i] = F[i - 1] + 0.5 * (rate[i] + rate[i - 1]) * dtMin;
  }
  return { F, rate, total: F[n - 1] };
}

/** Convenience wrapper for the standard F0 basis. */
export function computeF0(times, temps) {
  return cumulativeLethality(times, temps, F0_BASIS);
}

/**
 * Time at which cumulative lethality first reaches `target`.
 * Linear interpolation between frames. Returns null if never reached, so the
 * UI can say "target not reached in this process time" rather than showing a
 * misleading clamped value.
 */
export function timeToReach(times, F, target) {
  for (let i = 1; i < F.length; i++) {
    if (F[i] >= target) {
      const span = F[i] - F[i - 1];
      const frac = span > 0 ? (target - F[i - 1]) / span : 0;
      return times[i - 1] + frac * (times[i] - times[i - 1]);
    }
  }
  return null;
}

/**
 * Decimal reductions achieved: log10(N0/N) = F / D_ref.
 * D_ref must be at the same reference temperature as F.
 */
export function logReductions(F, Dref = D121_BOTULINUM) {
  return F / Dref;
}

/**
 * Process time needed for a target number of log reductions.
 * F_required = logReductions * D_ref.
 */
export function requiredF(logs, Dref = D121_BOTULINUM) {
  return logs * Dref;
}

/**
 * Pasteurization lethality for the milk line.
 *
 * TARGET ORGANISM
 * Coxiella burnetii is the benchmark: the most heat-resistant non-spore-forming
 * pathogen of public-health significance in milk. Both 72 C / 15 s (HTST) and
 * 63 C / 30 min (LTLT) are set to deliver at least a 5-log reduction of it,
 * which Codex adopted as the performance criterion.
 *
 * THE DEFAULT z OF 5 C IS A CONVENTION, NOT A MEASUREMENT
 * Published z-values for C. burnetii span roughly 4.9 to 9.9 C across isolates
 * (Wittwer et al. 2022, Front. Microbiol. 12:753871); there is no single
 * accepted figure. 5 C is the conventional pasteurization design value and sits
 * at the conservative end of that range, so it is the default here -- but it
 * should be taught as a design convention rather than a property of the
 * organism, which is why both z and D are exposed as parameters.
 *
 * D72 is likewise uncertain: 1.88 s classically (Enright et al. 1957) and
 * 1.75 s in a modern re-measurement (Front. Food Sci. Technol. 2023). Using
 * 1.88 s, a nominal 15 s hold delivers roughly 8 log rather than the required
 * 5 -- the standard carries a real margin, which is worth showing students.
 */
export function pasteurizationLethality(
  times,
  temps,
  { Tref = 72.0, z = 5.0, Dref = 1.88 / 60 } = {},
) {
  const { F, rate, total } = cumulativeLethality(times, temps, { Tref, z });
  return { F, rate, total, logReductions: total / Dref, Tref, z, Dref };
}
