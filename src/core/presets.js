/**
 * Food property presets, derived from composition rather than tabulated.
 *
 * WHY COMPUTE INSTEAD OF LOOKING UP
 * A table of "k = 0.55 for peas" is unfalsifiable to a student and rots
 * silently. Composition data, by contrast, is published, citable and
 * verifiable, and the Choi-Okos correlations turn it into properties by a
 * documented route. So the app stores COMPOSITION, computes properties, and
 * shows both. A student can then ask "why is frozen conductivity four times
 * higher?" and get an answer from the model instead of from authority.
 *
 * MODEL
 * Choi, Y. & Okos, M.R. (1986), "Effects of temperature and composition on the
 * thermal properties of foods", in Food Engineering and Process Applications,
 * Vol. 1: Transport Phenomena, Elsevier, pp. 93-101. Reproduced in ASHRAE
 * Handbook - Refrigeration (Thermal Properties of Foods) and in Singh &
 * Heldman, Introduction to Food Engineering.
 *
 * Component polynomials are valid for -40 to 150 degrees C, with T in degrees
 * Celsius throughout.
 *
 * MIXING RULES
 *   density        1/rho = sum( x_i / rho_i )        mass fractions
 *   specific heat  cp    = sum( x_i * cp_i )         mass fractions
 *   conductivity   k     = sum( xv_i * k_i )         VOLUME fractions
 * where the volume fraction xv_i = (x_i/rho_i) / sum(x_j/rho_j).
 *
 * The conductivity rule is the parallel model, which assumes the components
 * conduct side by side along the heat flow direction. It is the form Choi and
 * Okos published and it is what the ASHRAE tables reproduce. It slightly
 * OVERESTIMATES k for foods with a dispersed low-conductivity phase (fat
 * globules in milk, air cells in bread), because real structure is partly in
 * series. For the homogeneous, high-moisture foods used here the error is a
 * few per cent.
 */

/* ------------------------------------------------------------------ */
/* Choi-Okos component correlations                                    */

/** Valid temperature range of the Choi–Okos correlations, degrees C. */
export const CHOI_OKOS_RANGE = { min: -40, max: 150 };

/**
 * Thermal conductivity, W/m/K.
 *
 * ------------------------------------------------------------------
 * DELIBERATE DEPARTURE FROM THE PRINTED TABLE: the fat linear term.
 * ------------------------------------------------------------------
 * The ASHRAE Handbook–Refrigeration table (both the SI and the I-P edition,
 * which agree after unit conversion) prints the fat coefficient as
 * −2.7604e-3. We use −2.7604e-4 instead, and that is a considered choice
 * rather than a transcription slip:
 *
 *   1. With −2.7604e-3 the correlation gives k_fat = 0 at about 65 °C and
 *      NEGATIVE thermal conductivity above it. The table states validity to
 *      150 °C. A negative conductivity is thermodynamically impossible, so
 *      the printed value cannot be the coefficient that was fitted.
 *   2. With −2.7604e-3, k_fat(20 °C) = 0.125 W/m/K. With −2.7604e-4 it is
 *      0.175 W/m/K, which matches measured edible oils and fats (~0.17).
 *
 * The likeliest explanation is a long-propagated typographical error. The
 * validation harness asserts that no component conductivity goes negative
 * anywhere in the stated range, which is the check that catches this class of
 * error. Phinney et al. (2017), J. Food Sci. 82(1), re-fitted these component
 * groups and is the place to look for a modern replacement.
 *
 * IMPACT HERE IS SMALL: the shipped presets are high-moisture foods with 0.4–6 %
 * fat, so the two choices differ by well under 1 % in the mixture conductivity.
 * It is corrected because it is wrong, not because it changes the teaching.
 */
const K_COEFFS = {
  protein: [1.7881e-1, 1.1958e-3, -2.7178e-6],
  fat: [1.8071e-1, -2.7604e-4, -1.7749e-7],
  carbohydrate: [2.0141e-1, 1.3874e-3, -4.3312e-6],
  fiber: [1.8331e-1, 1.2497e-3, -3.1683e-6],
  ash: [3.2962e-1, 1.4011e-3, -2.9069e-6],
  water: [5.7109e-1, 1.7625e-3, -6.7036e-6],
  ice: [2.2196, -6.2489e-3, 1.0154e-4],
};

/** As printed by ASHRAE, retained so the validation note can show the contrast. */
export const FAT_K_AS_PRINTED = [1.8071e-1, -2.7604e-3, -1.7749e-7];

/** Density, kg/m^3. */
const RHO_COEFFS = {
  protein: [1.3299e3, -5.184e-1, 0],
  fat: [9.2559e2, -4.1757e-1, 0],
  carbohydrate: [1.5991e3, -3.1046e-1, 0],
  fiber: [1.3115e3, -3.6589e-1, 0],
  ash: [2.4238e3, -2.8063e-1, 0],
  water: [9.9718e2, 3.1439e-3, -3.7574e-3],
  ice: [9.1689e2, -1.3071e-1, 0],
};

/** Specific heat, J/kg/K. */
const CP_COEFFS = {
  protein: [2.0082e3, 1.2089, -1.3129e-3],
  fat: [1.9842e3, 1.4733, -4.8008e-3],
  carbohydrate: [1.5488e3, 1.9625, -5.9399e-3],
  fiber: [1.8459e3, 1.8306, -4.6509e-3],
  ash: [1.0926e3, 1.8896, -3.6817e-3],
  water: [4.1762e3, -9.0864e-2, 5.4731e-3],
  ice: [2.0623e3, 6.0769, 0],
};

/**
 * Liquid water has a SEPARATE specific-heat branch below 0 °C (supercooled or
 * unfrozen bound water). The two branches disagree by about 2.3 % at 0 °C —
 * a genuine discontinuity in the published model, not a rounding artefact.
 * We switch at 0 °C rather than blending, because interpolating across it
 * would invent a curve that Choi and Okos never fitted.
 */
const CP_WATER_BELOW_ZERO = [4.0817e3, -5.3062, 9.9516e-1];

const poly = (c, T) => c[0] + c[1] * T + c[2] * T * T;

/** Component specific heat, honouring the water branch split at 0 °C. */
function componentCp(key, T) {
  if (key === 'water' && T < 0) return poly(CP_WATER_BELOW_ZERO, T);
  return poly(CP_COEFFS[key], T);
}

export const COMPONENTS = ['water', 'protein', 'fat', 'carbohydrate', 'fiber', 'ash'];

/**
 * Properties of a food from its composition.
 *
 * @param composition mass fractions keyed by component; should sum to ~1
 * @param T           temperature, degrees C
 * @param frozen      if true, the water is treated as ice (see caveat below)
 */
export function propertiesFromComposition(composition, T, { frozen = false } = {}) {
  const parts = [];
  for (const name of COMPONENTS) {
    const x = composition[name] ?? 0;
    if (x <= 0) continue;
    // In the frozen state the water component is replaced by ice. This is a
    // simplification: real frozen food retains unfrozen water whose fraction
    // depends on temperature, so this OVERSTATES how ice-like the food is just
    // below the freezing point and is most accurate well below it.
    const key = frozen && name === 'water' ? 'ice' : name;
    parts.push({
      x,
      k: poly(K_COEFFS[key], T),
      rho: poly(RHO_COEFFS[key], T),
      cp: componentCp(key, T),
    });
  }

  let sumMassOverRho = 0;
  let cp = 0;
  for (const p of parts) {
    sumMassOverRho += p.x / p.rho;
    cp += p.x * p.cp;
  }
  const rho = 1 / sumMassOverRho;

  let k = 0;
  for (const p of parts) {
    const volumeFraction = p.x / p.rho / sumMassOverRho;
    k += volumeFraction * p.k;
  }

  return { k, rho, cp, alpha: k / (rho * cp) };
}

/* ------------------------------------------------------------------ */
/* Presets                                                             */

/**
 * Compositions are mass fractions. Each carries the source it came from so a
 * student (or an instructor checking the app) can go and look.
 *
 * CAUTION, AND A TRAP WORTH SHOWING STUDENTS
 * Food composition tables (USDA among them) report TOTAL carbohydrate, which
 * already INCLUDES dietary fibre. Choi-Okos treats carbohydrate and fibre as
 * separate components with different properties, so the total must be split:
 * `carbohydrate` below is total carbohydrate MINUS fibre. Entering the USDA
 * numbers directly double-counts the fibre and makes the mass fractions sum to
 * more than one -- which is exactly the error `presetProperties` now catches.
 */
export const PRESETS = {
  cannedPeas: {
    id: 'cannedPeas',
    label: 'Canned green peas',
    source: 'USDA FoodData Central 170104 (peas, green, canned, no salt, drained). Freezing point and reference properties: ASHRAE Refrigeration Handbook, Thermal Properties of Foods, Table 3.',
    fdcId: 170104,
    composition: { water: 0.817, protein: 0.0442, fat: 0.0035, carbohydrate: 0.0848, fiber: 0.041, ash: 0.0097 },
    evaluateAt: 60,
    freezingPoint: -0.6,
    // ASHRAE Table 3 reference values, used by the validation harness as an
    // independent check on the composition model.
    ashrae: { cpAbove: 3750, cpBelow: 1980, latent: 263e3 },
    scenarioHint: 'retort',
  },

  cannedCarrots: {
    id: 'cannedCarrots',
    label: 'Canned carrots',
    source: 'USDA FoodData Central 170396 (carrots, canned, regular pack, drained). Freezing point and reference properties: ASHRAE Table 3.',
    fdcId: 170396,
    composition: { water: 0.9295, protein: 0.0064, fat: 0.0019, carbohydrate: 0.0404, fiber: 0.015, ash: 0.0068 },
    evaluateAt: 60,
    freezingPoint: -1.4,
    ashrae: { cpAbove: 3920, cpBelow: 2000, latent: 293e3 },
    scenarioHint: 'retort',
  },

  leanBeef: {
    id: 'leanBeef',
    label: 'Lean beef (cooked sirloin)',
    source: 'USDA FoodData Central 168634 (beef, top sirloin, lean only, trimmed, broiled). Freezing point and reference properties: ASHRAE Table 3, beef sirloin lean.',
    fdcId: 168634,
    composition: { water: 0.6298, protein: 0.3055, fat: 0.0579, carbohydrate: 0.0, fiber: 0.0, ash: 0.0131 },
    evaluateAt: 60,
    freezingPoint: -1.7,
    ashrae: { cpAbove: 3530, cpBelow: 2110, latent: 239e3 },
    scenarioHint: 'retort',
  },

  wholeMilk: {
    id: 'wholeMilk',
    label: 'Whole milk (3.25 % fat)',
    source: 'USDA FoodData Central 171265 (milk, whole, 3.25 % milkfat). Mass fractions close to exactly 1.000. ASHRAE lists a freezing point of −0.6 °C; dairy cryoscopy gives −0.53 to −0.55 °C.',
    fdcId: 171265,
    composition: { water: 0.8813, protein: 0.0315, fat: 0.0325, carbohydrate: 0.048, fiber: 0.0, ash: 0.0067 },
    evaluateAt: 50,
    freezingPoint: -0.55,
    ashrae: { cpAbove: 3890, cpBelow: 1810, latent: 293e3 },
    scenarioHint: 'milk',
  },

  water: {
    id: 'water',
    label: 'Water (reference)',
    source: 'Pure water via the Choi–Okos water component. Included as a sanity check: its properties are exactly known, so any error in the mixing rules shows up here first.',
    composition: { water: 1.0 },
    evaluateAt: 60,
    freezingPoint: 0.0,
    scenarioHint: 'retort',
  },
};

/**
 * Bound (unfreezable) water as a fraction of TOTAL WATER.
 *
 * Schwartzberg (1976), as adopted by ASHRAE (Eq. 3), models bound water as a
 * fraction of the whole food: x_b = 0.4 * x_protein. This app expresses it
 * relative to the water instead, since that is the more intuitive quantity for
 * a student ("what share of the water never freezes?"), so the conversion is
 * x_b / x_water.
 *
 * The model is known to run high for lean muscle: it predicts ~19 % for the
 * beef above, where Riedel's calorimetry at −40 °C measured about 10 %.
 * Measured values across foods span roughly 3–46 % of total water. This is a
 * disagreement worth showing students rather than hiding.
 */
export function boundWaterOfWater(composition) {
  const xw = composition.water ?? 0;
  const xp = composition.protein ?? 0;
  if (xw <= 0) return 0;
  return Math.min(0.5, (0.4 * xp) / xw);
}

/** Sum of the mass fractions. Should be 1; deviation signals a data error. */
export function compositionSum(composition) {
  let s = 0;
  for (const name of COMPONENTS) s += composition[name] ?? 0;
  return s;
}

/** Largest allowed deviation of a composition from unity before we complain. */
export const COMPOSITION_TOLERANCE = 0.015;

/** Derived properties for a preset, at its own evaluation temperature. */
export function presetProperties(id) {
  const preset = PRESETS[id];
  if (!preset) throw new Error(`Unknown preset "${id}"`);

  // Guard against the fibre double-counting trap described above, and against
  // any future typo in a composition. Silently normalising would hide a data
  // error behind plausible-looking properties.
  const sum = compositionSum(preset.composition);
  if (Math.abs(sum - 1) > COMPOSITION_TOLERANCE) {
    throw new Error(
      `Preset "${id}": mass fractions sum to ${sum.toFixed(3)}, not 1. ` +
        'Check whether dietary fibre has been counted inside total carbohydrate as well as separately.',
    );
  }

  const unfrozen = propertiesFromComposition(preset.composition, preset.evaluateAt);
  // Frozen properties are evaluated at -20 C, a typical frozen storage
  // temperature and well below the initial freezing point, where treating the
  // water as fully converted to ice is a reasonable approximation.
  const frozen = propertiesFromComposition(preset.composition, -20, { frozen: true });
  return { preset, unfrozen, frozen };
}

/**
 * Apply a preset to the store.
 *
 * Note this sets the SOLID-food properties only. The milk line's cold-stream
 * specific heat is deliberately left alone: it belongs to the liquid being
 * pasteurised, and overwriting it from whichever canned solid happened to be
 * selected would silently corrupt the exchanger's capacity rate.
 */
export function applyPreset(id, store) {
  const { preset, unfrozen, frozen } = presetProperties(id);
  store.set({
    presetId: id,
    k: round(unfrozen.k, 4),
    rho: round(unfrozen.rho, 1),
    cp: round(unfrozen.cp, 1),
    kFrozen: round(frozen.k, 4),
    rhoFrozen: round(frozen.rho, 1),
    cpFrozen: round(frozen.cp, 1),
    waterFraction: preset.composition.water ?? 0,
    boundWaterFraction: round(boundWaterOfWater(preset.composition), 3),
    freezingPoint: preset.freezingPoint,
  });
}

function round(v, decimals) {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}
