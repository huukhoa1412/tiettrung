/**
 * Bessel functions of the first kind, orders 0 and 1.
 *
 * Polynomial and asymptotic approximations from Abramowitz & Stegun,
 * "Handbook of Mathematical Functions" (1964), eqs. 9.4.1-9.4.6.
 * Stated accuracy: |eps| < 5e-8 for J0 on |x| <= 3, < 1.6e-8 for the
 * large-argument forms, < 1.3e-8 for J1 on |x| <= 3.
 *
 * That is several orders of magnitude tighter than the discretisation error we
 * are measuring against (~1e-3), so the analytical series can be treated as
 * exact for validation purposes. test/validate.mjs verifies this by checking
 * the computed values at the tabulated zeros of J0 and J1.
 */

/** Zeros of J0 -- upper brackets for the cylinder eigenvalue search. */
export const J0_ZEROS = [
  2.404825557695773, 5.520078110286311, 8.653727912911013, 11.79153443901428,
  14.93091770848779, 18.07106396791092, 21.21163662987926, 24.35247153074930,
  27.49347913204025, 30.63460646843198,
];

/** Zeros of J1 -- lower brackets for the cylinder eigenvalue search. */
export const J1_ZEROS = [
  0.0, 3.831705970207512, 7.015586669815619, 10.17346813506272,
  13.32369193631422, 16.47063005087763, 19.61585851046824, 22.76008438059277,
  25.90367208761838, 29.04682853491686,
];

export function besselJ0(x) {
  const ax = Math.abs(x);
  if (ax < 3.0) {
    const y = (x / 3.0) * (x / 3.0);
    return (
      1.0 +
      y *
        (-2.2499997 +
          y *
            (1.2656208 +
              y * (-0.3163866 + y * (0.0444479 + y * (-0.0039444 + y * 0.0002100)))))
    );
  }
  const z = 3.0 / ax;
  const f =
    0.79788456 +
    z *
      (-0.00000077 +
        z *
          (-0.00552740 +
            z * (-0.00009512 + z * (0.00137237 + z * (-0.00072805 + z * 0.00014476)))));
  const theta =
    ax -
    0.78539816 +
    z *
      (-0.04166397 +
        z *
          (-0.00003954 +
            z * (0.00262573 + z * (-0.00054125 + z * (-0.00029333 + z * 0.00013558)))));
  return f * Math.cos(theta) / Math.sqrt(ax);
}

export function besselJ1(x) {
  const ax = Math.abs(x);
  let result;
  if (ax < 3.0) {
    const y = (x / 3.0) * (x / 3.0);
    result =
      x *
      (0.5 +
        y *
          (-0.56249985 +
            y *
              (0.21093573 +
                y *
                  (-0.03954289 +
                    y * (0.00443319 + y * (-0.00031761 + y * 0.00001109))))));
    return result;
  }
  const z = 3.0 / ax;
  const f =
    0.79788456 +
    z *
      (0.00000156 +
        z *
          (0.01659667 +
            z * (0.00017105 + z * (-0.00249511 + z * (0.00113653 + z * -0.00020033)))));
  const theta =
    ax -
    2.35619449 +
    z *
      (0.12499612 +
        z *
          (0.00005650 +
            z * (-0.00637879 + z * (0.00074348 + z * (0.00079824 + z * -0.00029166)))));
  result = f * Math.cos(theta) / Math.sqrt(ax);
  return x < 0 ? -result : result;
}
