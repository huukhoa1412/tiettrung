/**
 * Scenario orchestration: turn app state into a solved result.
 *
 * This is the only place that knows which physics module serves which
 * scenario, so the UI never reaches into the solvers directly and the solvers
 * never learn about the UI. Each result carries its own solve time, because
 * the interactivity budget is a stated requirement and should be visible
 * rather than assumed.
 */

import { solveConduction1D } from '../physics/conduction1d.js';
import { solveConduction2D } from '../physics/conduction2d.js';
import { cumulativeLethality, timeToReach } from '../physics/lethality.js';
import { plankFreezingTime, latentHeatOfFood, frozenFraction, frontPosition } from '../physics/freezing.js';
import { solveExchanger, holdingTube } from '../physics/exchanger.js';

/** Relative residual of the closed energy balance, for display. */
function energyResidual(sol) {
  const n = sol.nFrames;
  const stored = sol.energyStored[n] - sol.energyStored[0];
  const through = sol.energyThroughSurface[n];
  if (!Number.isFinite(through) || Math.abs(through) < 1e-12) return 0;
  return Math.abs(stored - through) / Math.abs(through);
}

/* ------------------------------------------------------------------ */
function solveRetort(state) {
  const t0 = performance.now();
  const common = {
    k: state.k,
    rho: state.rho,
    cp: state.cp,
    h: state.h,
    Ti: state.Tinitial,
    Tinf: state.Tmedium,
    tEnd: state.processTime,
    nFrames: state.nFrames,
  };

  let sol;
  let meshLabel;
  if (state.geometry === 'finiteCylinder') {
    const N = state.meshN;
    sol = solveConduction2D({
      ...common,
      R: state.radius,
      halfHeight: state.canHeight / 2,
      Nr: N,
      Nz: N,
      stepsPerFrame: 4,
    });
    meshLabel = `${N}×${N} axisymmetric`;
  } else {
    const R = state.geometry === 'slab' ? state.halfThickness : state.radius;
    sol = solveConduction1D({
      ...common,
      geometry: state.geometry,
      R,
      N: Math.max(60, state.meshN * 2),
      stepsPerFrame: 4,
    });
    meshLabel = `${Math.max(60, state.meshN * 2)}-cell 1-D`;
  }

  const leth = cumulativeLethality(sol.times, sol.Tcenter, {
    Tref: state.Tref,
    z: state.zValue,
  });
  const timeToTarget = timeToReach(sol.times, leth.F, state.targetF0);

  return {
    kind: 'conduction',
    ...sol,
    meshLabel,
    lethality: { ...leth, timeToTarget },
    energyResidual: energyResidual(sol),
    solveMs: performance.now() - t0,
  };
}

/* ------------------------------------------------------------------ */
/**
 * Chill and freeze.
 *
 * Three segments, two models. Pre-cooling and sub-cooling are real transient
 * conduction solutions (with unfrozen and frozen properties respectively);
 * the plateau between them is Plank's. The seam is deliberately explicit so
 * the plot can label which model owns which segment.
 */
function solveChill(state) {
  const t0 = performance.now();
  const geometry = state.geometry === 'finiteCylinder' ? 'cylinder' : state.geometry;
  const R = geometry === 'slab' ? state.halfThickness : state.radius;
  const a = geometry === 'slab' ? state.halfThickness * 2 : state.radius * 2;

  const Lf = latentHeatOfFood(state.waterFraction, state.boundWaterFraction);
  const plank = plankFreezingTime({
    geometry,
    a,
    rhoF: state.rhoFrozen,
    Lf,
    Tf: state.freezingPoint,
    Tinf: state.chillMedium,
    h: state.chillH,
    kF: state.kFrozen,
  });

  // Pre-cooling: run long enough that the centre certainly reaches T_f, using
  // the lumped time constant as a scale, then locate the crossing.
  const alpha = state.k / (state.rho * state.cp);
  const tScale = (R * R) / alpha;
  const precool = solveConduction1D({
    geometry,
    R,
    k: state.k,
    rho: state.rho,
    cp: state.cp,
    h: state.chillH,
    Ti: state.Tinitial,
    Tinf: state.chillMedium,
    tEnd: tScale * 2.5,
    N: 120,
    nFrames: 240,
    stepsPerFrame: 4,
  });

  let tPrecool = null;
  for (let f = 0; f <= precool.nFrames; f++) {
    if (precool.Tcenter[f] <= state.freezingPoint) {
      tPrecool = precool.times[f];
      break;
    }
  }

  // Sub-cooling of the frozen solid, from T_f down towards the medium.
  const alphaF = state.kFrozen / (state.rhoFrozen * state.cpFrozen);
  const subcool = solveConduction1D({
    geometry,
    R,
    k: state.kFrozen,
    rho: state.rhoFrozen,
    cp: state.cpFrozen,
    h: state.chillH,
    Ti: state.freezingPoint,
    Tinf: state.chillMedium,
    tEnd: ((R * R) / alphaF) * 2.5,
    N: 120,
    nFrames: 240,
    stepsPerFrame: 4,
  });

  let tSubcool = null;
  for (let f = 0; f <= subcool.nFrames; f++) {
    if (subcool.Tcenter[f] <= -18) {
      tSubcool = subcool.times[f];
      break;
    }
  }

  const totalTime =
    tPrecool !== null && tSubcool !== null ? tPrecool + plank.time + tSubcool : NaN;

  const plankParams = {
    geometry,
    a,
    rhoF: state.rhoFrozen,
    Lf,
    Tf: state.freezingPoint,
    Tinf: state.chillMedium,
    h: state.chillH,
    kF: state.kFrozen,
  };

  // A uniform timeline spanning all three segments, so the scrubber and the
  // 3-D view can march through pre-cooling, the plateau and sub-cooling as one
  // continuous process rather than three disconnected solves.
  const nFrames = 200;
  const span = Number.isFinite(totalTime)
    ? totalTime
    : (tPrecool ?? 0) + plank.time + subcool.times[subcool.nFrames];
  const times = new Float64Array(nFrames + 1);
  for (let i = 0; i <= nFrames; i++) times[i] = (span * i) / nFrames;

  return {
    kind: 'freeze',
    geometry,
    plank,
    plankParams,
    latentHeat: Lf,
    precool,
    subcool,
    tPrecool,
    tSubcool,
    totalTime,
    R,
    times,
    nFrames,
    /** Segment boundaries on the shared timeline. */
    tPlateauStart: tPrecool ?? 0,
    tPlateauEnd: (tPrecool ?? 0) + plank.time,
    /** Frozen volume fraction at a time measured from the start of the plateau. */
    frozenAt: (tSincePlateau) => frozenFraction(tSincePlateau, plankParams),
    /** Front position at a time measured from the start of the plateau. */
    frontAt: (tSincePlateau) => frontPosition(tSincePlateau, plankParams),
    solveMs: performance.now() - t0,
  };
}

/* ------------------------------------------------------------------ */
function solveMilk(state) {
  const t0 = performance.now();

  const result = solveExchanger({
    mdotH: state.mdotHot,
    cpH: state.cpHot,
    mdotC: state.mdotCold,
    cpC: state.cpCold,
    U: state.U,
    A: state.area,
    ThIn: state.ThotIn,
    TcIn: state.TcoldIn,
    arrangement: state.arrangement,
  });

  // Milk density is needed to turn mass flow into volumetric flow for the
  // holding tube. 1030 kg/m3 is the conventional value for whole milk at
  // process temperature.
  const milkDensity = 1030;
  const hold = holdingTube({
    volumetricFlow: state.mdotCold / milkDensity,
    tubeDiameter: state.tubeDiameter,
    tubeLength: state.tubeLength,
    regime: state.flowRegime,
  });

  return { kind: 'exchanger', ...result, hold, milkDensity, solveMs: performance.now() - t0 };
}

/* ------------------------------------------------------------------ */
export function solveScenario(state) {
  if (state.scenario === 'milk') return solveMilk(state);
  if (state.scenario === 'chill') return solveChill(state);
  return solveRetort(state);
}
