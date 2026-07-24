/**
 * Freezing time by Plank's equation, with the freezing front recovered from
 * the same derivation so the 3-D view can animate a front that is consistent
 * with the model rather than decorative.
 *
 * PLANK'S MODEL
 * Assume the food is already uniformly at its initial freezing point Tf, that
 * a sharp front separates fully frozen from fully unfrozen material, and that
 * conduction through the frozen shell is quasi-steady (the shell's own heat
 * capacity is neglected). Latent heat released at the front is conducted out
 * through the frozen layer and the surface film in series. Integrating the
 * front motion from the surface to the centre gives
 *
 *      t_f = (rho_f * Lf) / (Tf - Tinf) * ( P*a/h + R*a^2/k_f )
 *
 * with a the characteristic dimension and shape factors
 *
 *      slab (thickness a, cooled both faces)   P = 1/2   R = 1/8
 *      infinite cylinder (diameter a)          P = 1/4   R = 1/16
 *      sphere (diameter a)                     P = 1/6   R = 1/24
 *
 * WHAT PLANK DELIBERATELY LEAVES OUT -- STATE THIS TO STUDENTS
 *   1. Sensible heat above Tf (pre-cooling) and below Tf (sub-cooling) are
 *      both ignored. Only latent heat is removed.
 *   2. Freezing is treated as isothermal at Tf. Real foods freeze over a
 *      range, releasing latent heat gradually, because solutes concentrate in
 *      the remaining water and depress its freezing point progressively.
 *   3. Frozen-region k and rho are constant, and equal to fully-frozen values
 *      from the first instant.
 *   4. h and Tinf are constant and uniform over the whole surface.
 * Consequences (1) and (2) push in opposite directions but (1) dominates, so
 * PLANK UNDERESTIMATES the true freezing time, typically by 10-30%. The app
 * says so on screen; an enthalpy / apparent-cp solver would remove
 * assumptions 1 and 2 and is the natural next step.
 *
 * Reference: Plank (1913, 1941); Singh & Heldman, "Introduction to Food
 * Engineering", 5th ed., sec. 7.4; Cleland & Earle (1977, 1979) for the
 * empirical corrections that account for sensible heat.
 */

export const SHAPE_FACTORS = {
  slab: { P: 1 / 2, R: 1 / 8, label: 'Infinite slab (thickness a)' },
  cylinder: { P: 1 / 4, R: 1 / 16, label: 'Infinite cylinder (diameter a)' },
  sphere: { P: 1 / 6, R: 1 / 24, label: 'Sphere (diameter a)' },
};

/**
 * Plank freezing time in seconds.
 *
 * @param a       characteristic dimension, m (slab thickness, or diameter)
 * @param rhoF    density of the frozen food, kg/m^3
 * @param Lf      latent heat of fusion per unit mass of FOOD, J/kg
 *                (= mass fraction of freezable water * 333.6 kJ/kg)
 * @param Tf      initial freezing point, degC
 * @param Tinf    medium temperature, degC (must be below Tf)
 * @param h       surface heat transfer coefficient, W/m^2K
 * @param kF      thermal conductivity of the frozen food, W/mK
 */
export function plankFreezingTime({ geometry, a, rhoF, Lf, Tf, Tinf, h, kF }) {
  const shape = SHAPE_FACTORS[geometry];
  if (!shape) throw new Error(`plankFreezingTime: unknown geometry "${geometry}"`);
  const driving = Tf - Tinf;
  if (!(driving > 0)) {
    return { time: Infinity, valid: false, reason: 'Medium is not below the freezing point' };
  }
  const surfaceTerm = (shape.P * a) / h;
  const conductionTerm = (shape.R * a * a) / kF;
  const time = ((rhoF * Lf) / driving) * (surfaceTerm + conductionTerm);
  return {
    time,
    valid: true,
    shape,
    surfaceTerm,
    conductionTerm,
    // Fraction of the resistance sitting in the surface film. Near 1 the
    // process is film-controlled and raising h helps; near 0 it is
    // conduction-controlled and a thinner product is the only real lever.
    surfaceFraction: surfaceTerm / (surfaceTerm + conductionTerm),
    driving,
  };
}

/**
 * Time at which the freezing front reaches position `s`, from the same
 * quasi-steady integration that produces Plank's equation.
 *
 * Slab: s is the depth frozen from each face, 0 -> a/2.
 * Cylinder / sphere: s is the radius of the still-unfrozen core, R0 -> 0.
 *
 * Setting beta = (Tf - Tinf)/(rho_f * Lf), the accumulated time is beta^-1
 * times the resistance integral:
 *
 *   slab       G = x/h + x^2/(2 k)
 *   cylinder   G = (R0^2 - s^2)/(2 h R0) + [ (R0^2 - s^2)/4 - (s^2/2) ln(R0/s) ] / k
 *   sphere     G = (R0^3 - s^3)/(3 h R0^2) + [ (R0^2 - s^2)/2 - (R0^3 - s^3)/(3 R0) ] / k
 *
 * Evaluating each at the centre reproduces the P and R shape factors exactly,
 * which is the check that this is the same model and not a lookalike.
 */
export function frontTime({ geometry, s, a, rhoF, Lf, Tf, Tinf, h, kF }) {
  const beta = (Tf - Tinf) / (rhoF * Lf);
  let G;
  if (geometry === 'slab') {
    const x = s; // depth frozen from each face
    G = x / h + (x * x) / (2 * kF);
  } else {
    const R0 = a / 2;
    if (geometry === 'cylinder') {
      const d = R0 * R0 - s * s;
      const logTerm = s > 0 ? ((s * s) / 2) * Math.log(R0 / s) : 0;
      G = d / (2 * h * R0) + (d / 4 - logTerm) / kF;
    } else {
      const d3 = R0 * R0 * R0 - s * s * s;
      const d2 = R0 * R0 - s * s;
      G = d3 / (3 * h * R0 * R0) + (d2 / 2 - d3 / (3 * R0)) / kF;
    }
  }
  return G / beta;
}

/**
 * Invert frontTime: where is the front at time t?
 *
 * Returns the frozen depth (slab) or unfrozen core radius (cylinder/sphere).
 * frontTime is strictly monotone in s, so bisection is safe and needs no
 * derivative. 80 iterations is far more than enough for a rendering target.
 */
export function frontPosition(t, params) {
  const { geometry, a } = params;
  const tf = plankFreezingTime(params).time;
  if (!(t > 0)) return geometry === 'slab' ? 0 : a / 2;
  if (t >= tf) return geometry === 'slab' ? a / 2 : 0;

  // Bracket in the physical range, then bisect on frontTime(s) - t.
  let lo = 0;
  let hi = geometry === 'slab' ? a / 2 : a / 2;
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (lo + hi);
    const tm = frontTime({ ...params, s: mid });
    // slab: time increases with s. cylinder/sphere: time decreases with s.
    const increasing = geometry === 'slab';
    if (increasing ? tm < t : tm > t) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Fraction of the product volume that is frozen at time t (0 to 1). */
export function frozenFraction(t, params) {
  const { geometry, a } = params;
  const s = frontPosition(t, params);
  if (geometry === 'slab') return Math.min(1, s / (a / 2));
  const R0 = a / 2;
  const core = geometry === 'cylinder' ? (s * s) / (R0 * R0) : (s * s * s) / (R0 * R0 * R0);
  return Math.min(1, 1 - core);
}

/**
 * Freezable water fraction and the resulting latent heat per kg of food.
 *
 * Not all water freezes: some stays bound to proteins and polysaccharides and
 * never crystallises. `boundWaterFraction` is that unfreezable part, expressed
 * as a fraction of TOTAL water.
 *
 * Latent heat of fusion of pure water at 0 C = 333.6 kJ/kg.
 */
export const LATENT_HEAT_WATER = 333.6e3; // J/kg

export function latentHeatOfFood(waterFraction, boundWaterFraction = 0.1) {
  return waterFraction * (1 - boundWaterFraction) * LATENT_HEAT_WATER;
}

/**
 * Build the composite centre-temperature curve for a chill-then-freeze run:
 * pre-cooling (real conduction solution) -> plateau at Tf lasting the Plank
 * time -> sub-cooling (real conduction solution, frozen properties).
 *
 * The plateau is Plank's contribution; the two legs either side come from the
 * transient solver. The seam is explicit so the plot can label which model is
 * responsible for which segment -- students should see where the assumption
 * changes rather than being handed one smooth curve.
 *
 * @param precool  {times, Tcenter} history down to Tf
 * @param subcool  {times, Tcenter} history starting at Tf with frozen properties
 */
export function compositeFreezeCurve({ precool, subcool, tFreeze, Tf }) {
  const times = [];
  const temps = [];
  const segments = [];

  // Leg 1: sensible cooling until the centre first reaches Tf.
  let tPre = precool.times[precool.times.length - 1];
  for (let i = 0; i < precool.times.length; i++) {
    if (precool.Tcenter[i] <= Tf) {
      tPre = precool.times[i];
      break;
    }
    times.push(precool.times[i]);
    temps.push(precool.Tcenter[i]);
  }
  segments.push({ label: 'Pre-cooling (transient conduction)', from: 0, to: tPre });

  // Leg 2: isothermal plateau, duration from Plank.
  times.push(tPre, tPre + tFreeze);
  temps.push(Tf, Tf);
  segments.push({ label: 'Phase change (Plank)', from: tPre, to: tPre + tFreeze });

  // Leg 3: sub-cooling of the now-frozen product.
  const tStart = tPre + tFreeze;
  for (let i = 0; i < subcool.times.length; i++) {
    times.push(tStart + subcool.times[i]);
    temps.push(subcool.Tcenter[i]);
  }
  segments.push({
    label: 'Sub-cooling (transient conduction)',
    from: tStart,
    to: tStart + subcool.times[subcool.times.length - 1],
  });

  return {
    times: Float64Array.from(times),
    temps: Float64Array.from(temps),
    segments,
    tPrecool: tPre,
    tFreeze,
  };
}
