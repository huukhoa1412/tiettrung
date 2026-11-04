/**
 * Validation harness for the heat-transfer simulator physics core.
 *
 *   node test/validate.mjs
 *
 * Every number in docs/validation-note.md is produced by this script, so the
 * validation note can be regenerated and re-checked at any time rather than
 * being a set of claims typed once and left to rot.
 *
 * Exit code 0 if every check passes, 1 otherwise.
 */

import { besselJ0, besselJ1, J0_ZEROS, J1_ZEROS } from '../src/physics/bessel.js';
import { analyticalSolution, finiteCylinderProduct } from '../src/physics/analytical.js';
import { solveConduction1D } from '../src/physics/conduction1d.js';
import { solveConduction2D } from '../src/physics/conduction2d.js';
import { cumulativeLethality, lethalRate } from '../src/physics/lethality.js';
import {
  plankFreezingTime,
  frontTime,
  frontPosition,
  frozenFraction,
  SHAPE_FACTORS,
} from '../src/physics/freezing.js';
import {
  solveExchanger,
  effectiveness,
  ntuFromEffectiveness,
  parallelFlowCeiling,
  lmtd,
} from '../src/physics/exchanger.js';
import {
  propertiesFromComposition,
  presetProperties,
  compositionSum,
  PRESETS,
  COMPOSITION_TOLERANCE,
  CHOI_OKOS_RANGE,
  FAT_K_AS_PRINTED,
} from '../src/core/presets.js';
import { buildGeometryMesh } from '../src/render/mesh.js';
import { RETORT_BOUNDS } from '../src/render/equipment.js';

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

function section(title) {
  console.log(`\n${'-'.repeat(78)}\n${title}\n${'-'.repeat(78)}`);
}

/** Record a check: `value` must be <= `tol`. */
function check(label, value, tol, extra = '') {
  const ok = Number.isFinite(value) && value <= tol;
  if (ok) passed++;
  else {
    failed++;
    failures.push(`${label}: ${value} > tol ${tol}`);
  }
  const status = ok ? 'PASS' : 'FAIL';
  console.log(
    `  [${status}] ${label.padEnd(46)} ${value.toExponential(2).padStart(10)}  (tol ${tol.toExponential(0)})${extra ? '  ' + extra : ''}`,
  );
}

function info(label, text) {
  console.log(`         ${label.padEnd(46)} ${text}`);
}

// Reference food: a canned vegetable-like solid. Used throughout so the
// numbers below are all for one physically coherent product.
const FOOD = { k: 0.55, rho: 1050, cp: 3700 };
const ALPHA = FOOD.k / (FOOD.rho * FOOD.cp);
const Ti = 20;
const Tinf = 121.1;

// ===========================================================================
console.log('='.repeat(78));
console.log('HEAT-TRANSFER SIMULATOR -- PHYSICS VALIDATION');
console.log('='.repeat(78));
info('Reference food', `k=${FOOD.k} W/mK  rho=${FOOD.rho} kg/m3  cp=${FOOD.cp} J/kgK`);
info('Thermal diffusivity alpha', `${ALPHA.toExponential(4)} m2/s`);

// ===========================================================================
section('1. Bessel functions (Abramowitz & Stegun 9.4.1-9.4.6)');
// The tabulated zeros are independent of the approximation, so evaluating
// there is a genuine accuracy test rather than a self-consistency check.
{
  let maxJ0 = 0;
  let maxJ1 = 0;
  for (const z of J0_ZEROS) maxJ0 = Math.max(maxJ0, Math.abs(besselJ0(z)));
  for (const z of J1_ZEROS.slice(1)) maxJ1 = Math.max(maxJ1, Math.abs(besselJ1(z)));
  check('max |J0| at the 10 tabulated zeros of J0', maxJ0, 1e-7);
  check('max |J1| at the 9 tabulated zeros of J1', maxJ1, 1e-7);

  // Spot values against standard tables.
  const spot = [
    ['J0(1)', besselJ0(1), 0.7651976866],
    ['J1(1)', besselJ1(1), 0.4400505857],
    ['J0(5)', besselJ0(5), -0.1775967713],
    ['J1(5)', besselJ1(5), -0.3275791376],
    ['J0(10)', besselJ0(10), -0.2459357645],
    ['J1(10)', besselJ1(10), 0.0434727462],
  ];
  let maxSpot = 0;
  for (const [, v, ref] of spot) maxSpot = Math.max(maxSpot, Math.abs(v - ref));
  check('max error over 6 tabulated spot values', maxSpot, 1e-7);
}

// ===========================================================================
section('2. Eigenvalues and series coefficients');
// Incropera & DeWitt Table 5.1, Bi = 1.0. Matching all three geometries
// simultaneously is strong evidence the transcendental equations and the
// coefficient formulas are both right.
{
  const ref = {
    slab: [0.8603, 1.1191],
    cylinder: [1.2558, 1.2071],
    sphere: [1.5708, 1.2732],
  };
  let maxZ = 0;
  let maxC = 0;
  for (const g of ['slab', 'cylinder', 'sphere']) {
    const s = analyticalSolution(g, 1.0);
    maxZ = Math.max(maxZ, Math.abs(s.zeta[0] - ref[g][0]));
    maxC = Math.max(maxC, Math.abs(s.C[0] - ref[g][1]));
  }
  check('max |zeta_1 - Incropera Table 5.1| at Bi=1', maxZ, 5e-5);
  check('max |C_1 - Incropera Table 5.1| at Bi=1', maxC, 5e-5);

  // Completeness: at Fo = 0 the series must reconstruct the uniform initial
  // condition, theta = 1 everywhere. This tests the coefficients independently
  // of any table. Convergence is slowest at the centre of the sphere.
  let worst = 0;
  for (const g of ['slab', 'cylinder', 'sphere']) {
    for (const eta of [0.25, 0.5, 0.75]) {
      const s = analyticalSolution(g, 5.0, 400);
      worst = Math.max(worst, Math.abs(s.theta(eta, 0) - 1));
    }
  }
  check('max |theta(eta,Fo=0) - 1|, 400 terms, eta>=0.25', worst, 5e-3);
  info('note', 'series converges slowly at eta=0 and Fo=0 (a step in time);');
  info('', 'comparisons below therefore start at Fo > 0.01.');
}

// ===========================================================================
section('3. 1-D solver vs analytical series (centre temperature)');
{
  const results = [];
  for (const g of ['slab', 'cylinder', 'sphere']) {
    for (const Bi of [0.1, 1, 10, 100, 1000]) {
      const R = 0.04;
      const h = (Bi * FOOD.k) / R;
      const tEnd = (0.6 * R * R) / ALPHA;
      const sol = solveConduction1D({
        geometry: g, R, ...FOOD, h, Ti, Tinf, tEnd,
        N: 160, nFrames: 200, stepsPerFrame: 4,
      });
      const ana = analyticalSolution(g, Bi, 200);

      let maxErr = 0;
      for (let f = 1; f <= sol.nFrames; f++) {
        const Fo = (ALPHA * sol.times[f]) / (R * R);
        if (Fo < 0.01) continue;
        const thNum = (sol.Tcenter[f] - Tinf) / (Ti - Tinf);
        maxErr = Math.max(maxErr, Math.abs(thNum - ana.thetaCenter(Fo)));
      }
      results.push([g, Bi, maxErr]);
    }
  }
  let overall = 0;
  for (const [g, Bi, e] of results) {
    overall = Math.max(overall, e);
    console.log(`         ${g.padEnd(9)} Bi=${String(Bi).padStart(5)}   max|d(theta_c)| = ${e.toExponential(2)}`);
  }
  check('worst centre-temperature error, all geometries', overall, 5e-4);
}

// ===========================================================================
section('4. 1-D energy conservation');
// Stored energy change must equal the heat that crossed the surface.
// The finite-volume scheme is conservative by construction, so any residual
// here is time-integration error in the reported flux, not a solver defect.
{
  let worst = 0;
  for (const g of ['slab', 'cylinder', 'sphere']) {
    for (const Bi of [0.1, 10, 1000]) {
      const R = 0.04;
      const h = (Bi * FOOD.k) / R;
      const tEnd = (0.6 * R * R) / ALPHA;
      const sol = solveConduction1D({
        geometry: g, R, ...FOOD, h, Ti, Tinf, tEnd,
        N: 160, nFrames: 200, stepsPerFrame: 4,
      });
      const nf = sol.nFrames;
      const dE = sol.energyStored[nf] - sol.energyStored[0];
      const q = sol.energyThroughSurface[nf];
      worst = Math.max(worst, Math.abs(dE - q) / Math.abs(q));
    }
  }
  check('worst relative energy-balance residual', worst, 1e-4);
}

// ===========================================================================
section('5. 1-D spatial + temporal convergence order');
// Halving dx and dt together should cut the error by 4 for a second-order
// scheme. The observed ratio is printed so the order is visible, not asserted.
{
  const g = 'cylinder';
  const R = 0.04;
  const Bi = 5;
  const h = (Bi * FOOD.k) / R;
  const tEnd = (0.5 * R * R) / ALPHA;
  const ana = analyticalSolution(g, Bi, 200);
  const errs = [];
  for (const [N, nF, spf] of [[20, 50, 2], [40, 100, 4], [80, 200, 8], [160, 400, 16]]) {
    const sol = solveConduction1D({
      geometry: g, R, ...FOOD, h, Ti, Tinf, tEnd, N, nFrames: nF, stepsPerFrame: spf,
    });
    let e = 0;
    for (let f = 1; f <= sol.nFrames; f++) {
      const Fo = (ALPHA * sol.times[f]) / (R * R);
      if (Fo < 0.01) continue;
      e = Math.max(e, Math.abs((sol.Tcenter[f] - Tinf) / (Ti - Tinf) - ana.thetaCenter(Fo)));
    }
    errs.push([N, e]);
  }
  for (let i = 0; i < errs.length; i++) {
    const ratio = i > 0 ? errs[i - 1][1] / errs[i][1] : NaN;
    const order = i > 0 ? Math.log2(ratio) : NaN;
    console.log(
      `         N=${String(errs[i][0]).padStart(4)}   err=${errs[i][1].toExponential(3)}` +
        (i > 0 ? `   ratio=${ratio.toFixed(2)}   order=${order.toFixed(2)}` : ''),
    );
  }
  const finalOrder = Math.log2(errs[errs.length - 2][1] / errs[errs.length - 1][1]);
  check('observed order of accuracy >= 1.8', 2.5 - finalOrder, 0.7, `order=${finalOrder.toFixed(2)}`);
}

// ===========================================================================
section('6. 2-D finite cylinder vs EXACT product solution');
// theta_2D = theta_infinite-cylinder * theta_slab is exact for this linear
// problem, so this is a real test of the ADI solver, not a sanity check.
// Geometry: 307x409 can (87.3 mm diameter, 115.9 mm tall).
{
  const R = 0.04365;
  const halfHeight = 0.05795;
  let worstC = 0;
  let worstF = 0;
  let worstE = 0;
  for (const BiR of [0.5, 2, 10, 200]) {
    const h = (BiR * FOOD.k) / R;
    const sol = solveConduction2D({
      R, halfHeight, ...FOOD, h, Ti, Tinf, tEnd: 4500,
      Nr: 64, Nz: 64, nFrames: 200, stepsPerFrame: 6,
    });
    const prod = finiteCylinderProduct({ R, halfHeight, k: FOOD.k, alpha: ALPHA, h, nTerms: 200 });

    let ec = 0;
    for (let f = 1; f <= sol.nFrames; f++) {
      const t = sol.times[f];
      if ((ALPHA * t) / (R * R) < 0.01) continue;
      ec = Math.max(ec, Math.abs((sol.Tcenter[f] - Tinf) / (Ti - Tinf) - prod.thetaCenter(t)));
    }

    // Whole-field comparison at mid-process.
    const fMid = 100;
    const tMid = sol.times[fMid];
    let ef = 0;
    for (let j = 0; j < sol.Nz; j++) {
      for (let i = 0; i < sol.Nr; i++) {
        const thNum = (sol.at(fMid, i, j) - Tinf) / (Ti - Tinf);
        ef = Math.max(ef, Math.abs(thNum - prod.theta(sol.mesh.rc[i], sol.mesh.zc[j], tMid)));
      }
    }

    const nf = sol.nFrames;
    const ee = Math.abs(
      (sol.energyStored[nf] - sol.energyStored[0] - sol.energyThroughSurface[nf]) /
        sol.energyThroughSurface[nf],
    );

    console.log(
      `         Bi_R=${String(BiR).padStart(5)}  centre=${ec.toExponential(2)}  field=${ef.toExponential(2)}  energy=${ee.toExponential(2)}`,
    );
    worstC = Math.max(worstC, ec);
    worstF = Math.max(worstF, ef);
    worstE = Math.max(worstE, ee);
  }
  check('worst 2-D centre error vs product solution', worstC, 5e-4);
  check('worst 2-D whole-field error vs product solution', worstF, 5e-4);
  check('worst 2-D relative energy-balance residual', worstE, 1e-4);
}

// ===========================================================================
section('7. 2-D convergence order');
{
  const R = 0.04365;
  const halfHeight = 0.05795;
  const BiR = 10;
  const h = (BiR * FOOD.k) / R;
  const prod = finiteCylinderProduct({ R, halfHeight, k: FOOD.k, alpha: ALPHA, h, nTerms: 200 });
  const errs = [];
  for (const [N, nF, spf] of [[16, 25, 2], [32, 50, 4], [64, 100, 8], [128, 200, 16]]) {
    const sol = solveConduction2D({
      R, halfHeight, ...FOOD, h, Ti, Tinf, tEnd: 4500,
      Nr: N, Nz: N, nFrames: nF, stepsPerFrame: spf,
    });
    let e = 0;
    for (let f = 1; f <= sol.nFrames; f++) {
      const t = sol.times[f];
      if ((ALPHA * t) / (R * R) < 0.01) continue;
      e = Math.max(e, Math.abs((sol.Tcenter[f] - Tinf) / (Ti - Tinf) - prod.thetaCenter(t)));
    }
    errs.push([N, e]);
  }
  for (let i = 0; i < errs.length; i++) {
    const ratio = i > 0 ? errs[i - 1][1] / errs[i][1] : NaN;
    console.log(
      `         Nr=Nz=${String(errs[i][0]).padStart(4)}  err=${errs[i][1].toExponential(3)}` +
        (i > 0 ? `   ratio=${ratio.toFixed(2)}   order=${Math.log2(ratio).toFixed(2)}` : ''),
    );
  }
  const finalOrder = Math.log2(errs[errs.length - 2][1] / errs[errs.length - 1][1]);
  check('observed 2-D order of accuracy >= 1.8', 2.5 - finalOrder, 0.7, `order=${finalOrder.toFixed(2)}`);
}

// ===========================================================================
section('8. Lumped-capacitance limit');
// At small Biot the internal gradient vanishes and the exact series must
// collapse onto the single exponential students are taught first.
{
  let worst = 0;
  for (const [g, shapeFactor] of [['slab', 1], ['cylinder', 2], ['sphere', 3]]) {
    const R = 0.02;
    const Bi = 0.01;
    const h = (Bi * FOOD.k) / R;
    const ana = analyticalSolution(g, Bi, 100);
    // Lumped: theta = exp(-h A t / (rho cp V)); A/V = shapeFactor / R.
    for (const Fo of [0.5, 2, 5]) {
      const t = (Fo * R * R) / ALPHA;
      const lumpedTheta = Math.exp(-((h * shapeFactor) / R) * t / (FOOD.rho * FOOD.cp));
      worst = Math.max(worst, Math.abs(ana.thetaCenter(Fo) - lumpedTheta));
    }
  }
  check('max |series - lumped| at Bi=0.01', worst, 5e-3);
  info('teaching point', 'Bi<0.1 is the usual lumped-capacitance criterion');
}

// ===========================================================================
section('9. Lethality (F0)');
{
  // Exact case: holding at a constant temperature for a known time.
  const T = 121.1;
  const n = 2001;
  const times = new Float64Array(n);
  const temps = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    times[i] = (i / (n - 1)) * 600; // 10 minutes
    temps[i] = T;
  }
  const { total } = cumulativeLethality(times, temps);
  check('F0 at 121.1 C for 10 min equals 10 min', Math.abs(total - 10), 1e-9);

  // A 10 C rise must multiply the lethal rate by exactly 10 (definition of z).
  check('lethal rate decade per z', Math.abs(lethalRate(131.1) / lethalRate(121.1) - 10), 1e-12);

  // Monotonicity: the curve is shown as an accumulating quantity.
  const R = 0.04365;
  const sol = solveConduction2D({
    R, halfHeight: 0.05795, ...FOOD, h: 2000, Ti, Tinf, tEnd: 5400,
    Nr: 48, Nz: 48, nFrames: 300, stepsPerFrame: 4,
  });
  const { F } = cumulativeLethality(sol.times, sol.Tcenter);
  let mono = true;
  for (let i = 1; i < F.length; i++) if (F[i] < F[i - 1]) mono = false;
  check('F0 curve is monotone non-decreasing', mono ? 0 : 1, 0);
  info('realistic can, h=2000, 90 min', `F0 at centre = ${F[F.length - 1].toFixed(2)} min`);
}

// ===========================================================================
section('10. Plank freezing: front integral reproduces the shape factors');
// frontTime evaluated at the centre must equal plankFreezingTime. This proves
// the animated front and the quoted freezing time come from ONE model.
{
  const params = {
    a: 0.05,
    rhoF: 1000,
    Lf: 0.75 * 333.6e3,
    Tf: -1.5,
    Tinf: -35,
    h: 30,
    kF: 1.6,
  };
  let worst = 0;
  for (const g of ['slab', 'cylinder', 'sphere']) {
    const p = { ...params, geometry: g };
    const tPlank = plankFreezingTime(p).time;
    const sCentre = g === 'slab' ? p.a / 2 : 0;
    const tFront = frontTime({ ...p, s: sCentre });
    worst = Math.max(worst, Math.abs(tPlank - tFront) / tPlank);
    console.log(
      `         ${g.padEnd(9)} P=${SHAPE_FACTORS[g].P.toFixed(4)} R=${SHAPE_FACTORS[g].R.toFixed(4)}  ` +
        `t_f=${(tPlank / 60).toFixed(2)} min   front integral=${(tFront / 60).toFixed(2)} min`,
    );
  }
  check('front integral vs Plank closed form', worst, 1e-12);

  // The inverted front must be monotone and hit the endpoints exactly.
  const p = { ...params, geometry: 'sphere' };
  const tf = plankFreezingTime(p).time;
  let monoOk = true;
  let prev = frozenFraction(0, p);
  for (let i = 1; i <= 200; i++) {
    const fr = frozenFraction((i / 200) * tf, p);
    if (fr < prev - 1e-12) monoOk = false;
    prev = fr;
  }
  check('frozen fraction monotone increasing', monoOk ? 0 : 1, 0);
  check('frozen fraction reaches 1 at t_f', Math.abs(frozenFraction(tf, p) - 1), 1e-9);
  check('front starts at the surface', Math.abs(frontPosition(0, p) - p.a / 2), 1e-12);
}

// ===========================================================================
section('11. Heat exchanger: LMTD vs eps-NTU vs marched profiles');
{
  // HTST milk duty: 72 C target, hot water heating medium.
  const base = {
    mdotH: 1.2, cpH: 4180, // hot water
    mdotC: 1.0, cpC: 3930, // milk
    U: 3500, A: 6.0,
    ThIn: 85, TcIn: 4,
  };
  let worstLmtd = 0;
  let worstBal = 0;
  let worstProf = 0;
  let worstClose = 0;
  let lmtdCompared = 0;
  let lmtdSkipped = 0;

  for (const arrangement of ['counter', 'parallel']) {
    for (const A of [2, 6, 20, 60]) {
      const r = solveExchanger({ ...base, A, arrangement });
      if (r.checks.lmtdVsNtu === null) {
        lmtdSkipped++;
      } else {
        lmtdCompared++;
        worstLmtd = Math.max(worstLmtd, r.checks.lmtdVsNtu);
      }
      worstBal = Math.max(worstBal, r.checks.energyBalance);
      worstProf = Math.max(worstProf, r.checks.profileOutlet);
      worstClose = Math.max(worstClose, r.checks.profileClosure);
      console.log(
        `         ${arrangement.padEnd(8)} A=${String(A).padStart(3)} m2  NTU=${r.NTU.toFixed(2).padStart(6)}  ` +
          `eps=${r.eps.toFixed(4)}  Tc,out=${r.TcOut.toFixed(2)} C  Th,out=${r.ThOut.toFixed(2)} C` +
          (r.lmtdValid ? '' : '   [LMTD indeterminate: eps -> ceiling]'),
      );
    }
  }
  info('LMTD comparison coverage', `${lmtdCompared} cases compared, ${lmtdSkipped} indeterminate (eps at ceiling)`);
  check('LMTD duty vs eps-NTU duty', worstLmtd, 1e-10);
  check('stream energy balance (Q_hot vs Q_cold)', worstBal, 1e-10);
  check('marched profile reproduces hot outlet', worstProf, 1e-8);
  check('counter-current profile closes on cold inlet', worstClose, 1e-8);

  // Balanced counter-current: the removable singularity at Cr = 1.
  const bal = solveExchanger({
    mdotH: 1, cpH: 4000, mdotC: 1, cpC: 4000,
    U: 3000, A: 8, ThIn: 85, TcIn: 4, arrangement: 'counter',
  });
  check('balanced counter-current (Cr=1) stays finite', Number.isFinite(bal.Q) ? 0 : 1, 0);
  check('Cr=1 temperature difference is constant', Math.abs(bal.dT1 - bal.dT2), 1e-9);
  check('Cr=1 LMTD equals that constant difference', Math.abs(bal.dTlm - bal.dT1), 1e-9);

  // LMTD limit dT1 -> dT2 must tend to the arithmetic mean.
  check('lmtd(10, 10) = 10', Math.abs(lmtd(10, 10) - 10), 1e-9);
  check('lmtd(10.0001, 10) ~ 10.00005', Math.abs(lmtd(10.0001, 10) - 10.00005), 1e-6);

  // Effectiveness relations must invert exactly.
  let worstInv = 0;
  for (const arrangement of ['counter', 'parallel']) {
    for (const Cr of [0, 0.4, 0.9, 1]) {
      for (const NTU of [0.3, 1, 3, 8]) {
        const e = effectiveness(NTU, Cr, arrangement);
        if (e >= 0.9999) continue; // inversion is ill-conditioned at the ceiling
        worstInv = Math.max(worstInv, Math.abs(ntuFromEffectiveness(e, Cr, arrangement) - NTU));
      }
    }
  }
  check('NTU <-> effectiveness round trip', worstInv, 1e-8);

  // The headline teaching result: co-current is capped, counter-current is not.
  for (const Cr of [0.5, 1.0]) {
    const ceil = parallelFlowCeiling(Cr);
    const epsPar = effectiveness(500, Cr, 'parallel');
    const epsCnt = effectiveness(500, Cr, 'counter');
    check(`co-current eps -> 1/(1+Cr) at Cr=${Cr}`, Math.abs(epsPar - ceil), 1e-9);
    info(`  Cr=${Cr}`, `co-current ceiling = ${ceil.toFixed(4)}, counter-current = ${epsCnt.toFixed(4)}`);
  }
}

// ===========================================================================
section('12. Performance (must stay well inside the 100 ms render budget)');
{
  const R = 0.04365;
  const t0 = performance.now();
  solveConduction2D({
    R, halfHeight: 0.05795, ...FOOD, h: 2000, Ti, Tinf, tEnd: 5400,
    Nr: 48, Nz: 48, nFrames: 240, stepsPerFrame: 4,
  });
  const ms2d = performance.now() - t0;

  const t1 = performance.now();
  solveConduction1D({
    geometry: 'cylinder', R, ...FOOD, h: 2000, Ti, Tinf, tEnd: 5400,
    N: 120, nFrames: 300, stepsPerFrame: 4,
  });
  const ms1d = performance.now() - t1;

  info('2-D can, 48x48, 240 frames', `${ms2d.toFixed(1)} ms`);
  info('1-D cylinder, 120 cells, 300 frames', `${ms1d.toFixed(1)} ms`);
  check('2-D full solve under 100 ms', ms2d, 100);
  check('1-D full solve under 20 ms', ms1d, 20);
}

// ===========================================================================
section('13. Food properties from composition (Choi–Okos 1986)');
// Pure water and pure ice are precisely known, so running the composition
// model on them is a genuine accuracy test of the correlations and of the
// mixing rules, independent of any food composition data.
{
  const waterRef = {
    0: [0.5610, 999.8, 4217], 20: [0.5984, 998.2, 4182], 40: [0.6305, 992.2, 4179],
    60: [0.6543, 983.2, 4185], 80: [0.6700, 971.8, 4197], 100: [0.6791, 958.4, 4216],
  };
  let wk = 0, wr = 0, wc = 0;
  for (const [T, ref] of Object.entries(waterRef)) {
    const p = propertiesFromComposition({ water: 1 }, Number(T));
    wk = Math.max(wk, Math.abs(p.k - ref[0]) / ref[0]);
    wr = Math.max(wr, Math.abs(p.rho - ref[1]) / ref[1]);
    wc = Math.max(wc, Math.abs(p.cp - ref[2]) / ref[2]);
  }
  check('water k vs steam tables, 0-100 C (relative)', wk, 0.02);
  check('water rho vs steam tables, 0-100 C (relative)', wr, 0.005);
  check('water cp vs steam tables, 0-100 C (relative)', wc, 0.01);

  const ice = propertiesFromComposition({ water: 1 }, -20, { frozen: true });
  check('ice k at -20 C vs 2.39 W/mK', Math.abs(ice.k - 2.39) / 2.39, 0.01);
  check('ice rho at -20 C vs 919 kg/m3', Math.abs(ice.rho - 919) / 919, 0.01);
  check('ice cp at -20 C vs 1943 J/kgK', Math.abs(ice.cp - 1943) / 1943, 0.01);

  // A conductivity correlation must never go negative inside its stated range.
  // This is the guard that exposes the printed fat coefficient: with ASHRAE's
  // -2.7604e-3 the fat branch crosses zero near 65 C, which is impossible for a
  // correlation declared valid to 150 C. See the note in presets.js.
  let minComponentK = Infinity;
  for (const name of ['water', 'protein', 'fat', 'carbohydrate', 'fiber', 'ash']) {
    for (let T = CHOI_OKOS_RANGE.min; T <= CHOI_OKOS_RANGE.max; T += 1) {
      const p = propertiesFromComposition({ [name]: 1 }, T);
      minComponentK = Math.min(minComponentK, p.k);
    }
  }
  check('all component k stay positive over -40..150 C', minComponentK > 0 ? 0 : 1, 0,
    `min k = ${minComponentK.toFixed(4)}`);

  const printedFatK = (T) => FAT_K_AS_PRINTED[0] + FAT_K_AS_PRINTED[1] * T + FAT_K_AS_PRINTED[2] * T * T;
  info('fat k as printed by ASHRAE', `k(20 C)=${printedFatK(20).toFixed(4)}, k(150 C)=${printedFatK(150).toFixed(4)} <- negative`);
  info('fat k as used here', `k(20 C)=${propertiesFromComposition({ fat: 1 }, 20).k.toFixed(4)} (measured fats ~0.17)`);

  // Every shipped preset must have a physically coherent composition, and its
  // computed specific heat is checked against the independently tabulated
  // ASHRAE value for the same food -- a genuine external cross-check.
  let worstSum = 0;
  let worstCp = 0;
  for (const id of Object.keys(PRESETS)) {
    const preset = PRESETS[id];
    worstSum = Math.max(worstSum, Math.abs(compositionSum(preset.composition) - 1));
    const { unfrozen, frozen } = presetProperties(id); // throws on a bad sum
    let cpNote = '';
    if (preset.ashrae) {
      const rel = Math.abs(unfrozen.cp - preset.ashrae.cpAbove) / preset.ashrae.cpAbove;
      worstCp = Math.max(worstCp, rel);
      cpNote = `  vs ASHRAE ${preset.ashrae.cpAbove} (${(rel * 100).toFixed(1)}%)`;
    }
    console.log(
      `         ${preset.label.padEnd(26)} k=${unfrozen.k.toFixed(3)} rho=${unfrozen.rho.toFixed(0)} ` +
        `cp=${unfrozen.cp.toFixed(0)}${cpNote}`,
    );
  }
  check('worst preset mass-fraction sum error', worstSum, COMPOSITION_TOLERANCE);
  check('computed cp vs ASHRAE Table 3 (relative)', worstCp, 0.05);
  info('note', 'frozen k is ~3.5x unfrozen because ice conducts far better than water');
}

// ===========================================================================
section('14. Geometry meshes sit centred in the vessel');
// The retort is fixed hardware, so the food must be centred in it for EVERY
// shape and every cutaway setting. The cylinder and sphere remove a wedge
// about their axis and stay centred for free; the slab originally lopped off
// one whole side, which walked its centre away from the origin as the cut
// deepened and made it visibly sit off to one side of the retort.
{
  const st = { halfThickness: 0.02, radius: 0.04365, canHeight: 0.1159 };
  let worst = 0;
  let worstCase = '';
  for (const cut of [0, 0.25, 0.5, 0.75, 1]) {
    for (const g of ['slab', 'sphere', 'cylinder', 'finiteCylinder']) {
      const built = buildGeometryMesh(g, st, cut);
      const p = built.mesh.positions;
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          if (p[i + k] < lo[k]) lo[k] = p[i + k];
          if (p[i + k] > hi[k]) hi[k] = p[i + k];
        }
      }
      // Offset of the bounding-box centre from the origin, in scene units.
      const off = Math.hypot(
        ((lo[0] + hi[0]) / 2) * built.scale,
        ((lo[1] + hi[1]) / 2) * built.scale,
        ((lo[2] + hi[2]) / 2) * built.scale,
      );
      if (off > worst) {
        worst = off;
        worstCase = `${g} at cut=${cut}`;
      }
    }
  }
  // 1e-3 scene units is far below one pixel; anything larger is a real offset,
  // not tessellation round-off on a curved surface.
  check('worst off-centre offset over all shapes and cuts', worst, 1e-3, worstCase);

  // The slab's field varies along y only (its thickness) and is
  // mirror-symmetric about the mid-plane, because both faces are heated
  // identically. The CUTAWAY must respect that: it may take material in x and
  // z, where nothing varies, but never across y. A cut that crossed the
  // mid-plane would expose y = 0 as one large uniformly-cold face and make a
  // slab heated on both faces look as though it is heated on one.
  let asym = 0;
  for (const cut of [0, 0.25, 0.5, 0.75, 1]) {
    const p = buildGeometryMesh('slab', st, cut).mesh.positions;
    const key = (x, y, z) => `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
    const set = new Set();
    for (let i = 0; i < p.length; i += 3) set.add(key(p[i], p[i + 1], p[i + 2]));
    for (let i = 0; i < p.length; i += 3) {
      if (!set.has(key(p[i], -p[i + 1], p[i + 2]))) asym++;
    }
  }
  check('slab vertices without a mirror twin about y = 0', asym, 0);

  // Both heated faces must carry the SAME field coordinate (the surface), or
  // the two sides of the slab would be drawn at different temperatures.
  {
    const built = buildGeometryMesh('slab', st, 0.5);
    const { positions: p, normals: n, uvs } = built.mesh;
    let minU = Infinity;
    let maxU = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      if (Math.abs(Math.abs(n[i + 1]) - 1) > 1e-6) continue; // y-facing (top/bottom) only
      const u = uvs[(i / 3) * 2];
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
    }
    check('both slab faces sit at the surface (u = 1)', Math.abs(minU - 1) + Math.abs(maxU - 1), 1e-9);
  }

  // The food must also fit inside the fixed vessel at the largest settings the
  // sliders allow, or it would be drawn poking through the retort wall.
  const big = { halfThickness: 0.05, radius: 0.09, canHeight: 0.25 };
  let worstFit = 0;
  let fitCase = '';
  for (const g of ['slab', 'sphere', 'cylinder', 'finiteCylinder']) {
    const built = buildGeometryMesh(g, big, 0);
    const rFrac = built.outerRadius / RETORT_BOUNDS.radius;
    const hFrac = built.halfHeight / RETORT_BOUNDS.yTop;
    const f = Math.max(rFrac, hFrac);
    console.log(`         ${g.padEnd(15)} radius ${(rFrac * 100).toFixed(0)}% of bore, half-height ${(hFrac * 100).toFixed(0)}% of span`);
    if (f > worstFit) {
      worstFit = f;
      fitCase = g;
    }
  }
  check('largest food still inside the vessel', worstFit, 1.0, fitCase);
}

// ===========================================================================
console.log(`\n${'='.repeat(78)}`);
console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('='.repeat(78));
process.exit(failed ? 1 : 0);
