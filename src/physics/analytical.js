/**
 * Exact separation-of-variables solutions for one-dimensional transient
 * conduction in a slab, an infinite cylinder and a sphere, with a convective
 * boundary condition and uniform initial temperature.
 *
 * Problem:
 *      dT/dt = alpha * (1/r^m) d/dr ( r^m dT/dr )        m = 0, 1, 2
 *      T(r, 0) = Ti
 *      dT/dr = 0 at r = 0                                (symmetry)
 *      -k dT/dr = h (T_s - Tinf) at r = R                (convection)
 *
 * Dimensionless temperature theta = (T - Tinf) / (Ti - Tinf) is then
 *
 *      theta(eta, Fo) = sum_n  C_n exp(-zeta_n^2 Fo) f(zeta_n eta)
 *
 * with eta = r/R, Fo = alpha t / R^2, Bi = h R / k, and
 *
 *   slab      f = cos(zeta eta)          zeta tan zeta = Bi
 *   cylinder  f = J0(zeta eta)           zeta J1(zeta) / J0(zeta) = Bi
 *   sphere    f = sin(zeta eta)/(zeta eta)   1 - zeta cot zeta = Bi
 *
 * NOTE ON VALIDITY: this is the full series, not the one-term approximation
 * printed in most textbooks. With enough terms it is accurate at small Fourier
 * number too, so it can validate the numerical solver over the whole transient
 * rather than only the Fo > 0.2 region where the one-term form applies.
 *
 * Reference: Incropera & DeWitt, "Fundamentals of Heat and Mass Transfer",
 * ch. 5; Carslaw & Jaeger, "Conduction of Heat in Solids", ch. 3 & 9.
 */

import { besselJ0, besselJ1, J0_ZEROS, J1_ZEROS } from './bessel.js';

const TOL = 1e-14;
const MAX_BISECT = 200;

/**
 * Find a root of f in [lo, hi] by bisection.
 * Bisection rather than Newton: the eigenvalue functions have poles between
 * consecutive roots, and a Newton step can jump across one into the wrong
 * branch. Bracketed bisection cannot, and 200 iterations reach machine
 * precision regardless of the starting bracket.
 */
function bisect(f, lo, hi) {
  let flo = f(lo);
  let fhi = f(hi);
  if (flo === 0) return lo;
  if (fhi === 0) return hi;
  if (flo * fhi > 0) return NaN; // not bracketed
  for (let i = 0; i < MAX_BISECT; i++) {
    const mid = 0.5 * (lo + hi);
    const fmid = f(mid);
    if (fmid === 0 || hi - lo < TOL * Math.max(1, Math.abs(mid))) return mid;
    if (flo * fmid < 0) {
      hi = mid;
      fhi = fmid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  return 0.5 * (lo + hi);
}

/**
 * Eigenvalues zeta_n for the given geometry and Biot number.
 *
 * Each root is isolated in a bracket where the residual function is smooth and
 * changes sign, so the search cannot miss or duplicate a root:
 *   slab      ((n-1)pi, (n-1)pi + pi/2)
 *   cylinder  (j1_{n-1}, j0_n)   zeros of J1 and J0 interlace the roots
 *   sphere    ((n-1)pi, n pi)
 */
export function eigenvalues(geometry, Bi, nTerms = 60) {
  const z = new Float64Array(nTerms);
  const eps = 1e-12;

  if (Bi <= 0) {
    // Insulated limit: no heat transfer, theta stays 1. Signalled by zeta = 0.
    return z;
  }

  if (geometry === 'slab') {
    // zeta tan zeta = Bi  ->  f = zeta sin zeta - Bi cos zeta
    const f = (x) => x * Math.sin(x) - Bi * Math.cos(x);
    for (let n = 0; n < nTerms; n++) {
      const lo = n * Math.PI + eps;
      const hi = n * Math.PI + Math.PI / 2 - eps;
      z[n] = bisect(f, lo, hi);
    }
  } else if (geometry === 'cylinder') {
    // zeta J1(zeta) = Bi J0(zeta)
    const f = (x) => x * besselJ1(x) - Bi * besselJ0(x);
    for (let n = 0; n < nTerms; n++) {
      const lo = (n < J1_ZEROS.length ? J1_ZEROS[n] : J1_ZEROS[0] + n * Math.PI) + eps;
      const hi = (n < J0_ZEROS.length ? J0_ZEROS[n] : 2.404825557695773 + n * Math.PI) - eps;
      z[n] = bisect(f, lo, hi);
    }
  } else if (geometry === 'sphere') {
    // 1 - zeta cot zeta = Bi  ->  f = zeta cos zeta - (1 - Bi) sin zeta
    const c = 1 - Bi;
    const f = (x) => x * Math.cos(x) - c * Math.sin(x);
    for (let n = 0; n < nTerms; n++) {
      const lo = n * Math.PI + eps;
      const hi = (n + 1) * Math.PI - eps;
      z[n] = bisect(f, lo, hi);
    }
  } else {
    throw new Error(`eigenvalues: unknown geometry "${geometry}"`);
  }

  return z;
}

/** Series coefficients C_n. */
export function coefficients(geometry, zeta) {
  const n = zeta.length;
  const C = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const z = zeta[i];
    if (!(z > 0)) {
      C[i] = 0;
      continue;
    }
    if (geometry === 'slab') {
      C[i] = (4 * Math.sin(z)) / (2 * z + Math.sin(2 * z));
    } else if (geometry === 'cylinder') {
      const j0 = besselJ0(z);
      const j1 = besselJ1(z);
      C[i] = (2 / z) * (j1 / (j0 * j0 + j1 * j1));
    } else {
      C[i] = (4 * (Math.sin(z) - z * Math.cos(z))) / (2 * z - Math.sin(2 * z));
    }
  }
  return C;
}

/** Spatial eigenfunction f(zeta * eta), with the removable singularity at eta = 0 handled. */
function shape(geometry, z, eta) {
  if (geometry === 'slab') return Math.cos(z * eta);
  if (geometry === 'cylinder') return besselJ0(z * eta);
  const u = z * eta;
  return u < 1e-8 ? 1 - (u * u) / 6 : Math.sin(u) / u;
}

/**
 * Volume-average of the eigenfunction, used for the mean-temperature series:
 *   slab      sin(z)/z
 *   cylinder  2 J1(z)/z
 *   sphere    3 (sin z - z cos z)/z^3
 */
function shapeMean(geometry, z) {
  if (geometry === 'slab') return Math.sin(z) / z;
  if (geometry === 'cylinder') return (2 * besselJ1(z)) / z;
  return (3 * (Math.sin(z) - z * Math.cos(z))) / (z * z * z);
}

/**
 * Build a reusable analytical solution object for one (geometry, Bi) pair.
 * Eigenvalues are the expensive part, so they are computed once here and
 * reused across every (eta, Fo) evaluation.
 */
export function analyticalSolution(geometry, Bi, nTerms = 60) {
  const zeta = eigenvalues(geometry, Bi, nTerms);
  const C = coefficients(geometry, zeta);

  /** Dimensionless temperature at eta = r/R and Fourier number Fo. */
  function theta(eta, Fo) {
    if (Bi <= 0) return 1;
    let s = 0;
    for (let i = 0; i < zeta.length; i++) {
      const z = zeta[i];
      if (!(z > 0)) continue;
      const e = Math.exp(-z * z * Fo);
      // Terms decay monotonically; once the exponential underflows the tail is
      // negligible and further Bessel evaluations are wasted work.
      if (e < 1e-18 && i > 0) break;
      s += C[i] * e * shape(geometry, z, eta);
    }
    return s;
  }

  /** Dimensionless centre temperature (eta = 0). */
  function thetaCenter(Fo) {
    return theta(0, Fo);
  }

  /** Dimensionless volume-average temperature. */
  function thetaMean(Fo) {
    if (Bi <= 0) return 1;
    let s = 0;
    for (let i = 0; i < zeta.length; i++) {
      const z = zeta[i];
      if (!(z > 0)) continue;
      const e = Math.exp(-z * z * Fo);
      if (e < 1e-18 && i > 0) break;
      s += C[i] * e * shapeMean(geometry, z);
    }
    return s;
  }

  return { geometry, Bi, zeta, C, theta, thetaCenter, thetaMean };
}

/**
 * Product solution for a finite cylinder (a real can).
 *
 * For this linear problem with uniform initial temperature and constant,
 * uniform Tinf and h, the two-dimensional solution factorises exactly:
 *
 *     theta(r, z, t) = theta_infinite-cylinder(r, t) * theta_slab(z, t)
 *
 * This is not an approximation, which is what makes it a genuine test of the
 * 2-D ADI solver rather than a sanity check. Note the two factors use
 * different characteristic lengths -- radius R for the cylinder, half-height L
 * for the slab -- so they carry different Biot and Fourier numbers.
 *
 * Reference: Incropera & DeWitt sec. 5.8 (multidimensional effects).
 */
export function finiteCylinderProduct({ R, halfHeight, k, alpha, h, nTerms = 60 }) {
  const BiR = (h * R) / k;
  const BiL = (h * halfHeight) / k;
  const cyl = analyticalSolution('cylinder', BiR, nTerms);
  const slab = analyticalSolution('slab', BiL, nTerms);

  return {
    BiR,
    BiL,
    cyl,
    slab,
    /** theta at radial position r and axial position z (measured from mid-height), time t. */
    theta(r, z, t) {
      const FoR = (alpha * t) / (R * R);
      const FoL = (alpha * t) / (halfHeight * halfHeight);
      return cyl.theta(r / R, FoR) * slab.theta(z / halfHeight, FoL);
    },
    thetaCenter(t) {
      const FoR = (alpha * t) / (R * R);
      const FoL = (alpha * t) / (halfHeight * halfHeight);
      return cyl.thetaCenter(FoR) * slab.thetaCenter(FoL);
    },
    thetaMean(t) {
      const FoR = (alpha * t) / (R * R);
      const FoL = (alpha * t) / (halfHeight * halfHeight);
      return cyl.thetaMean(FoR) * slab.thetaMean(FoL);
    },
  };
}

/**
 * Lumped-capacitance solution, valid when Bi < 0.1.
 * theta = exp(-Bi * Fo) with both numbers based on V/A.
 */
export function lumped({ h, area, volume, rho, cp, t }) {
  return Math.exp(-(h * area * t) / (rho * cp * volume));
}
