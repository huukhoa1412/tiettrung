/**
 * Plate heat exchanger for the HTST milk line: LMTD and effectiveness-NTU,
 * co-current and counter-current, with an independent numerical integration of
 * the stream profiles used as a cross-check.
 *
 * WHY BOTH METHODS
 * LMTD and effectiveness-NTU are algebraically equivalent for these two
 * arrangements (correction factor F = 1), so they must agree exactly. Making
 * the app compute both and display the residual is not redundancy for its own
 * sake -- it is the check that catches a mis-typed capacity rate or area, and
 * it shows students that the two approaches they are taught separately are the
 * same statement rearranged.
 *
 * The temperature profiles along the exchanger come from marching the coupled
 * energy equations, NOT from the closed-form solution. That makes them a third
 * independent path to the same answer, so the outlet temperatures they predict
 * are a genuine test of the closed-form results.
 *
 * NOMENCLATURE
 *   C = m_dot * cp   capacity rate, W/K
 *   Cr = Cmin/Cmax   capacity ratio
 *   NTU = UA/Cmin    number of transfer units, the exchanger's "size"
 *   eps = Q/Qmax     effectiveness
 *
 * Reference: Incropera & DeWitt ch. 11; Kakac & Liu, "Heat Exchangers".
 */

/**
 * Log-mean temperature difference.
 *
 * The limit dT1 -> dT2 is a removable singularity (the log-mean tends to the
 * arithmetic mean). Guarding it matters in practice: a balanced counter-current
 * exchanger, which is exactly the case students are told to prefer, has a
 * CONSTANT temperature difference, so the naive formula divides by zero at the
 * most pedagogically important operating point.
 */
export function lmtd(dT1, dT2) {
  if (dT1 <= 0 || dT2 <= 0) return NaN; // temperature cross: arrangement infeasible
  const ratio = dT1 / dT2;
  if (Math.abs(ratio - 1) < 1e-6) return 0.5 * (dT1 + dT2);
  return (dT1 - dT2) / Math.log(ratio);
}

/** Effectiveness for a single-pass exchanger. */
export function effectiveness(NTU, Cr, arrangement) {
  if (NTU <= 0) return 0;
  if (arrangement === 'counter') {
    // Balanced counter-current (Cr = 1) is another removable singularity.
    if (Math.abs(Cr - 1) < 1e-8) return NTU / (1 + NTU);
    const e = Math.exp(-NTU * (1 - Cr));
    return (1 - e) / (1 - Cr * e);
  }
  if (arrangement === 'parallel') {
    return (1 - Math.exp(-NTU * (1 + Cr))) / (1 + Cr);
  }
  throw new Error(`effectiveness: unknown arrangement "${arrangement}"`);
}

/** Inverse relation: NTU required to reach a target effectiveness. */
export function ntuFromEffectiveness(eps, Cr, arrangement) {
  if (arrangement === 'counter') {
    if (Math.abs(Cr - 1) < 1e-8) return eps / (1 - eps);
    return (1 / (Cr - 1)) * Math.log((eps - 1) / (eps * Cr - 1));
  }
  const arg = 1 - eps * (1 + Cr);
  if (arg <= 0) return Infinity; // beyond the co-current ceiling
  return -Math.log(arg) / (1 + Cr);
}

/**
 * Maximum effectiveness a co-current exchanger can ever reach, however large.
 * As NTU -> infinity, eps -> 1/(1+Cr). This is the quantitative answer to
 * "why does counter-current win": co-current is capped, counter-current is not.
 */
export function parallelFlowCeiling(Cr) {
  return 1 / (1 + Cr);
}

/**
 * March the coupled stream energy equations along the exchanger.
 *
 * With xi the fraction of area traversed from the hot inlet:
 *      dTh/dxi = -(UA/Ch)(Th - Tc)
 *      dTc/dxi = +(UA/Cc)(Th - Tc)     co-current (cold flows with hot)
 *      dTc/dxi = -(UA/Cc)(Th - Tc)     counter-current (cold flows against)
 *
 * Counter-current is a boundary-value problem: the cold inlet is at xi = 1.
 * Rather than shoot for it, the cold temperature at xi = 0 is taken from the
 * effectiveness solution and the system marched forward. The integration must
 * then land on the known cold INLET at xi = 1, and the miss is reported as
 * `closureError`. That turns what would be a circular calculation into a real
 * consistency test of the closed-form effectiveness.
 *
 * Classical RK4, 400 steps -- overkill for an exponential, but it makes the
 * residual unambiguously a physics/algebra check rather than a numerical one.
 */
export function integrateProfiles({ UA, Ch, Cc, ThIn, TcIn, TcAtHotInlet, arrangement, n = 400 }) {
  const sign = arrangement === 'counter' ? -1 : 1;
  const dxi = 1 / n;

  const xi = new Float64Array(n + 1);
  const Th = new Float64Array(n + 1);
  const Tc = new Float64Array(n + 1);

  Th[0] = ThIn;
  Tc[0] = arrangement === 'counter' ? TcAtHotInlet : TcIn;

  const dThdxi = (th, tc) => -(UA / Ch) * (th - tc);
  const dTcdxi = (th, tc) => sign * (UA / Cc) * (th - tc);

  for (let i = 0; i < n; i++) {
    const th = Th[i];
    const tc = Tc[i];

    const k1h = dThdxi(th, tc);
    const k1c = dTcdxi(th, tc);
    const k2h = dThdxi(th + 0.5 * dxi * k1h, tc + 0.5 * dxi * k1c);
    const k2c = dTcdxi(th + 0.5 * dxi * k1h, tc + 0.5 * dxi * k1c);
    const k3h = dThdxi(th + 0.5 * dxi * k2h, tc + 0.5 * dxi * k2c);
    const k3c = dTcdxi(th + 0.5 * dxi * k2h, tc + 0.5 * dxi * k2c);
    const k4h = dThdxi(th + dxi * k3h, tc + dxi * k3c);
    const k4c = dTcdxi(th + dxi * k3h, tc + dxi * k3c);

    Th[i + 1] = th + (dxi / 6) * (k1h + 2 * k2h + 2 * k3h + k4h);
    Tc[i + 1] = tc + (dxi / 6) * (k1c + 2 * k2c + 2 * k3c + k4c);
    xi[i + 1] = (i + 1) * dxi;
  }

  return { xi, Th, Tc };
}

/**
 * Full exchanger solution: duty, outlet temperatures, profiles, and three
 * independent consistency checks.
 *
 * @param mdotH,mdotC  mass flow rates, kg/s
 * @param cpH,cpC      specific heats, J/kgK
 * @param U            overall heat transfer coefficient, W/m^2K
 * @param A            heat transfer area, m^2
 * @param ThIn,TcIn    inlet temperatures, degC
 * @param arrangement  'counter' | 'parallel'
 */
export function solveExchanger({ mdotH, cpH, mdotC, cpC, U, A, ThIn, TcIn, arrangement }) {
  const Ch = mdotH * cpH;
  const Cc = mdotC * cpC;
  const Cmin = Math.min(Ch, Cc);
  const Cmax = Math.max(Ch, Cc);
  const Cr = Cmin / Cmax;
  const UA = U * A;
  const NTU = UA / Cmin;

  const Qmax = Cmin * (ThIn - TcIn);
  const eps = effectiveness(NTU, Cr, arrangement);
  const Q = eps * Qmax;

  const ThOut = ThIn - Q / Ch;
  const TcOut = TcIn + Q / Cc;

  // --- Check 1: LMTD must reproduce the same duty ---------------------------
  // Counter-current pairs the hot inlet with the cold OUTLET.
  const dT1 = arrangement === 'counter' ? ThIn - TcOut : ThIn - TcIn;
  const dT2 = arrangement === 'counter' ? ThOut - TcIn : ThOut - TcOut;
  const dTlm = lmtd(dT1, dT2);
  const Qlmtd = UA * dTlm;

  // WHERE LMTD STOPS WORKING, AND WHY IT IS NOT A BUG
  // When an exchanger approaches thermal equilibrium at one end, that end's
  // driving difference collapses. dT is then the difference of two nearly
  // equal temperatures, so catastrophic cancellation destroys its precision:
  // at ThOut = TcOut = 49.42 C, a computed dT of 1e-12 K carries barely two
  // significant digits, and ln(dT1/dT2) inherits the damage. Q = UA * dTlm
  // becomes the finite product of an unbounded area and a vanishing
  // difference -- genuinely indeterminate, not merely hard to evaluate.
  //
  // The effectiveness-NTU form has no such problem, which is exactly why it
  // exists. So the app flags LMTD as inapplicable here and shows the
  // effectiveness result instead, rather than printing a plausible-looking
  // wrong number. A student who asks "why did LMTD blow up?" has found a real
  // limitation of the method, and the app should say so.
  //
  // The test is on resolvability of the smaller difference against the
  // temperature magnitudes it was computed from, which is what actually
  // governs the cancellation -- not on effectiveness, which is only a proxy.
  const tempScale = Math.max(Math.abs(ThIn), Math.abs(TcIn), 1);
  const dTmin = Math.min(dT1, dT2);
  const lmtdValid = Number.isFinite(dTlm) && dTmin > 1e-8 * tempScale;

  // --- Check 2: stream energy balances must match the duty ------------------
  const Qhot = Ch * (ThIn - ThOut);
  const Qcold = Cc * (TcOut - TcIn);

  // --- Check 3: marched profiles must reproduce the outlets -----------------
  // The profiles decay over a length scale of 1/NTU, so a fixed step count
  // would lose accuracy on a large exchanger and blunt the cross-check exactly
  // where it is most useful. Scale the step count with NTU instead.
  const nSteps = Math.min(4000, Math.max(400, Math.ceil(NTU * 60)));
  const prof = integrateProfiles({
    UA,
    Ch,
    Cc,
    ThIn,
    TcIn,
    TcAtHotInlet: TcOut, // counter-current: cold leaves where hot enters
    arrangement,
    n: nSteps,
  });
  const nEnd = prof.xi.length - 1;
  const ThOutProfile = prof.Th[nEnd];
  // Counter-current: marching forward must arrive at the known cold INLET.
  const closureTarget = arrangement === 'counter' ? TcIn : TcOut;
  const closureError = Math.abs(prof.Tc[nEnd] - closureTarget);

  const scale = Math.max(1e-12, Math.abs(Q));

  return {
    Ch,
    Cc,
    Cmin,
    Cmax,
    Cr,
    UA,
    NTU,
    eps,
    Q,
    Qmax,
    ThOut,
    TcOut,
    dT1,
    dT2,
    dTlm,
    Qlmtd,
    lmtdValid,
    Qhot,
    Qcold,
    profiles: prof,
    arrangement,
    /** Ceiling on effectiveness for co-current; null for counter-current. */
    ceiling: arrangement === 'parallel' ? parallelFlowCeiling(Cr) : null,
    /**
     * Relative residuals -- all should be at round-off level.
     * lmtdVsNtu is null where LMTD is indeterminate (see lmtdValid above);
     * null means "not applicable here", not "passed".
     */
    checks: {
      lmtdVsNtu: lmtdValid ? Math.abs(Qlmtd - Q) / scale : null,
      energyBalance: Math.abs(Qhot - Qcold) / scale,
      profileOutlet: Math.abs(ThOutProfile - ThOut) / Math.max(1, Math.abs(ThIn - TcIn)),
      profileClosure: closureError / Math.max(1, Math.abs(ThIn - TcIn)),
    },
  };
}

/**
 * Residence time and lethality in the holding tube.
 *
 * HTST legally requires the FASTEST particle to be held long enough, not the
 * average one. In a tube of circular cross-section the ratio of maximum to
 * mean velocity is 2.0 for fully developed laminar flow and about 1.2 for
 * turbulent flow, so the design hold time is the mean residence time divided
 * by that factor. Getting this wrong is a classic and consequential error, so
 * the app shows both times side by side.
 */
export function holdingTube({ volumetricFlow, tubeDiameter, tubeLength, regime = 'turbulent' }) {
  const area = (Math.PI * tubeDiameter * tubeDiameter) / 4;
  const volume = area * tubeLength;
  const meanVelocity = volumetricFlow / area;
  const meanTime = volume / volumetricFlow;
  const factor = regime === 'laminar' ? 2.0 : 1.2;
  return {
    area,
    volume,
    meanVelocity,
    maxVelocity: meanVelocity * factor,
    meanResidenceTime: meanTime,
    /** The time that actually counts for compliance. */
    fastestParticleTime: meanTime / factor,
    factor,
    regime,
  };
}

/** Reynolds number for the holding tube, to justify the laminar/turbulent choice. */
export function reynolds({ rho, velocity, diameter, mu }) {
  return (rho * velocity * diameter) / mu;
}
