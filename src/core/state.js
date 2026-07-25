/**
 * Application state: a small observable store plus the default scenario values.
 *
 * WHY NOT A FRAMEWORK
 * The expensive work here is numerical, not DOM diffing. A solve produces
 * typed arrays that the plots and the WebGL view read directly; wrapping those
 * in a reactive framework would add a dependency and a copy for no benefit.
 * What is actually needed is "tell me when a parameter changed, and whether it
 * invalidates the physics" -- which is about forty lines.
 */

/**
 * Parameters that require a full re-solve when they change.
 *
 * Anything the SOLVER reads must be listed here. A key that the solver reads
 * but that is missing from this set produces the worst kind of bug: the
 * control moves, the interface repaints, and the numbers silently keep their
 * previous values — so the tool looks like it is working while telling the
 * student something untrue.
 *
 * `targetF0` is here because solveRetort computes timeToTarget from it;
 * `nFrames` and `meshN` because they set the discretisation.
 */
const PHYSICS_KEYS = new Set([
  'scenario', 'geometry', 'radius', 'halfThickness', 'canHeight',
  'k', 'rho', 'cp', 'h', 'heatingMedium', 'Tinitial', 'Tmedium', 'processTime',
  'meshN', 'nFrames',
  'Tref', 'zValue', 'targetF0',
  'kFrozen', 'rhoFrozen', 'cpFrozen', 'freezingPoint', 'waterFraction',
  'boundWaterFraction', 'chillMedium', 'chillH',
  'mdotHot', 'cpHot', 'ThotIn', 'mdotCold', 'cpCold', 'TcoldIn',
  'U', 'area', 'arrangement', 'tubeDiameter', 'tubeLength', 'flowRegime',
]);

export const SCENARIOS = {
  retort: {
    id: 'retort',
    label: 'Retort sterilisation',
    blurb: 'Canned food heated by saturated steam at 121 °C. Transient conduction with a convective boundary; lethality accumulates at the cold spot.',
    phase: 'solid',
  },
  chill: {
    id: 'chill',
    label: 'Chill & freeze',
    blurb: 'Blast chilling of the same geometries, then freezing with a phase-change plateau from Plank’s equation.',
    phase: 'solid',
  },
  milk: {
    id: 'milk',
    label: 'Milk line (HTST)',
    blurb: 'Continuous flow through a plate heat exchanger. 72 °C for 15 s; LMTD and ε-NTU, co-current versus counter-current.',
    phase: 'liquid',
  },
};

export const GEOMETRIES = {
  slab: { id: 'slab', label: 'Slab', note: 'Infinite slab, heated on both faces. Characteristic length = half-thickness.' },
  cylinder: { id: 'cylinder', label: 'Infinite cylinder', note: 'Radial conduction only; the ends are ignored.' },
  sphere: { id: 'sphere', label: 'Sphere', note: 'The fastest-heating shape for a given size: most surface per unit volume.' },
  finiteCylinder: { id: 'finiteCylinder', label: 'Finite cylinder (real can)', note: 'Two-dimensional: heat enters through the side wall and both lids.' },
};

/** Default state. Values that came from a cited source live in presets.js. */
export function defaultState() {
  return {
    scenario: 'retort',

    // --- Geometry ---
    geometry: 'finiteCylinder',
    radius: 0.04365, // m, 307x409 can
    halfThickness: 0.02, // m, used by the slab
    canHeight: 0.1159, // m, full height of the can

    // --- Food properties (overwritten by a preset) ---
    presetId: 'cannedPeas',
    k: 0.55,
    rho: 1050,
    cp: 3700,

    // --- Retort process ---
    // The heating medium is visual AND physical: switching it sets a
    // representative h, because condensing steam really does give a far higher
    // coefficient than hot water.
    heatingMedium: 'steam',
    h: 6000,
    Tinitial: 20,
    Tmedium: 121.1,
    processTime: 7200, // s
    Tref: 121.1,
    zValue: 10,
    targetF0: 3,

    // --- Chill / freeze ---
    chillH: 30,
    chillMedium: -35,
    freezingPoint: -1.5,
    waterFraction: 0.75,
    boundWaterFraction: 0.1,
    kFrozen: 1.6,
    rhoFrozen: 1000,
    cpFrozen: 1900,

    // --- Milk line ---
    mdotHot: 1.2,
    cpHot: 4180,
    ThotIn: 85,
    mdotCold: 1.0,
    // Whole milk from the Choi–Okos composition model at 50 °C; ASHRAE Table 3
    // lists 3890 J/kg/K for the same product, so the two agree to ~0.3 %.
    cpCold: 3903,
    TcoldIn: 4,
    U: 3500,
    area: 6,
    arrangement: 'counter',
    tubeDiameter: 0.0381,
    // Sized so the FASTEST particle is held for just over 15 s at the default
    // flow, which is the condition that actually governs HTST compliance.
    tubeLength: 18.0,
    flowRegime: 'turbulent',

    // --- Numerics ---
    // Chosen against the 100 ms interactivity budget measured in a BROWSER,
    // which runs this roughly twice as slow as Node. At 40x40 the centre
    // temperature is within about 2e-4 in dimensionless terms of the exact
    // product solution -- 0.02 K on a 100 K span, far below anything a student
    // could read off a plot. See docs/validation-note.md for the convergence
    // study behind this choice.
    meshN: 40,
    nFrames: 200,

    // --- Playback (does not trigger a re-solve) ---
    frame: 0,
    playing: false,
    playbackSpeed: 1,

    // --- View ---
    theme: 'auto',
    colormap: 'rainbow',
    showEquations: true,
    cutaway: 0.5,
    showEquipment: true,
  };
}

/**
 * Observable store.
 *
 * Subscribers receive (state, changedKeys, physicsChanged). `physicsChanged`
 * lets the 3-D view and plots skip a re-solve when only the scrubber moved,
 * which is what keeps playback smooth.
 */
export function createStore(initial = defaultState()) {
  let state = { ...initial };
  const subscribers = new Set();

  function notify(changed) {
    if (changed.size === 0) return;
    let physicsChanged = false;
    for (const key of changed) {
      if (PHYSICS_KEYS.has(key)) {
        physicsChanged = true;
        break;
      }
    }
    for (const fn of subscribers) fn(state, changed, physicsChanged);
  }

  return {
    get() {
      return state;
    },

    /** Merge a patch. Keys whose value is unchanged are not reported. */
    set(patch) {
      const changed = new Set();
      for (const [key, value] of Object.entries(patch)) {
        if (!Object.is(state[key], value)) {
          state[key] = value;
          changed.add(key);
        }
      }
      notify(changed);
      return changed;
    },

    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },

    /** True if any of the given keys force a re-solve. */
    affectsPhysics(keys) {
      for (const key of keys) if (PHYSICS_KEYS.has(key)) return true;
      return false;
    },
  };
}

/**
 * Derived quantities that several panels need, computed in one place so the
 * control panel, the plots and the teaching text can never disagree.
 */
export function derived(state) {
  const alpha = state.k / (state.rho * state.cp);

  // The chill scenario has its own surface coefficient and medium: a blast
  // chiller is not a retort. Using the retort h here would report a Biot
  // number two orders of magnitude too large on the freezing screen.
  const h = state.scenario === 'chill' ? state.chillH : state.h;
  const Tmedium = state.scenario === 'chill' ? state.chillMedium : state.Tmedium;

  // Characteristic length for the Biot number. For the finite cylinder there
  // are genuinely two -- radius and half-height -- and which one "the" Biot
  // number uses is a common source of confusion, so both are reported.
  const halfHeight = state.canHeight / 2;
  const L =
    state.geometry === 'slab'
      ? state.halfThickness
      : state.radius;

  const Bi = (h * L) / state.k;
  const BiAxial = state.geometry === 'finiteCylinder' ? (h * halfHeight) / state.k : null;

  // Volume-to-surface ratio, the length scale the lumped-capacitance criterion
  // is properly built on.
  let volumeOverArea;
  if (state.geometry === 'slab') volumeOverArea = state.halfThickness;
  else if (state.geometry === 'cylinder') volumeOverArea = state.radius / 2;
  else if (state.geometry === 'sphere') volumeOverArea = state.radius / 3;
  else {
    // Closed cylinder: V/A = (pi R^2 H) / (2 pi R H + 2 pi R^2) = R H / (2H + 2R)
    const R = state.radius;
    const H = state.canHeight;
    volumeOverArea = (R * H) / (2 * (H + R));
  }
  const BiLumped = (h * volumeOverArea) / state.k;

  return {
    alpha,
    L,
    halfHeight,
    /** The surface coefficient and medium actually in force for this scenario. */
    h,
    Tmedium,
    Bi,
    BiAxial,
    volumeOverArea,
    BiLumped,
    lumpedValid: BiLumped < 0.1,
    Fo: (t) => (alpha * t) / (L * L),
  };
}
