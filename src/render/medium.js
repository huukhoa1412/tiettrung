/**
 * The heating medium: animated steam or water around the can.
 *
 * WHY IT EARNS ITS PLACE
 * The convective boundary condition is the part of this problem students most
 * often treat as an arbitrary number. "h = 2000" means nothing; steam
 * condensing on the outside of a can means something. Showing the medium
 * moving in the annulus between the can and the vessel wall makes three things
 * concrete at once: that the medium is a physical thing, that it surrounds the
 * whole can, and that h and T-infinity are properties of THAT, not of the food.
 *
 * Switching medium also changes h, because it genuinely does. Condensing steam
 * gives a coefficient several times higher than hot water, and that is one of
 * the more useful facts a process engineer carries around.
 *
 * The particles are animated entirely in the vertex shader from a per-particle
 * seed and a time uniform, so nothing is uploaded per frame and the CPU cost of
 * the animation is zero.
 */

/**
 * Small deterministic generator. Reproducibility matters here: with Math.random
 * the steam pattern would differ between a lecturer's screen and the projector,
 * and every screenshot of the same state would look different.
 */
function makeRandom(seed = 20260723) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const MEDIA = {
  steam: {
    id: 'steam',
    label: 'Saturated steam',
    /** Representative surface coefficient, W/m^2K. */
    h: 6000,
    note: 'Condensing steam gives a very high coefficient — the film stops being the bottleneck.',
    // Many large, very faint puffs. Density has to come from OVERLAP, not from
    // any single sprite: a few strong sprites read as confetti, hundreds of
    // faint overlapping ones read as cloud.
    // The ambient haze the jets settle into. Slow and near-uniform, so the
    // chamber reads as FULL of medium rather than as a set of separate sprays.
    count: 700,
    speed: [0.018, 0.055],
    size: [95, 185],
    // Mostly white, because that is what condensing steam looks like, but
    // tinted slightly towards the hot end of the scale so it visibly belongs
    // to the same temperature scale as the food.
    whiteness: 0.80,
    alpha: 0.115,
    swirl: 0.16,
    grow: 2.1,
    turb: 0.20,
    wispy: 1.0,
  },
  water: {
    id: 'water',
    label: 'Water immersion',
    h: 1200,
    note: 'Hot water gives a lower coefficient than condensing steam — the film matters more.',
    // Bubbles are the opposite problem: few, small, crisp and well defined.
    count: 260,
    speed: [0.10, 0.24],
    size: [14, 34],
    whiteness: 0.9,
    alpha: 0.7,
    swirl: 0.30,
    grow: 1.25,
    turb: 0.05,
    wispy: 0.0,
    hasBody: true,
  },
};

/** The plume escaping the vent: narrower, faster, and it expands hard. */
export const VENT_PLUME = {
  count: 320,
  speed: [0.10, 0.22],
  size: [55, 120],
  alpha: 0.10,
  swirl: 0.34,
  grow: 3.0,
  turb: 0.14,
  wispy: 1.0,
};

/**
 * The conical fan fired inward from each wall nozzle.
 *
 * Tight and bright at the nozzle, widening and dissolving as it throws toward
 * the axis — which is exactly what the sprays do in a real chamber. The fans
 * from opposite walls meet in the middle, and where they overlap the
 * accumulated alpha builds into the uniform haze that fills the centre.
 */
export const NOZZLE_JET = {
  count: 1800,
  speed: [0.26, 0.50],
  size: [22, 52],
  alpha: 0.24,
  grow: 3.0,
  turb: 0.05,
  wispy: 1.0,
  /** Throw as a fraction of the chamber radius, and cone half-width at full throw. */
  throwFraction: 1.2,
  // A tighter cone keeps each fan legible as a distinct spray rather than
  // letting all twenty-four dissolve into one undifferentiated fog.
  cone: 0.24,
};

/**
 * Per-particle attributes.
 *
 * Layout 0 (vec4): radial parameter 0..1, starting angle, starting height 0..1,
 * rise speed. Layout 1 (vec4): point size, wobble phase, spin, noise offset.
 */
export function buildMediumParticles(spec, seedValue = 20260723, origins = null) {
  const rand = makeRandom(seedValue);
  const n = spec.count;
  const seed = new Float32Array(n * 4);
  const size = new Float32Array(n * 4);
  // Jet sets spread their particles evenly across the nozzles, so every nozzle
  // carries the same spray density however many there are.
  const origin = origins ? new Float32Array(n * 3) : null;

  for (let i = 0; i < n; i++) {
    if (origin) {
      const o = origins[i % origins.length];
      origin[i * 3] = o[0];
      origin[i * 3 + 1] = o[1];
      origin[i * 3 + 2] = o[2];
    }
    // Bias outward: in an annulus, uniform in r crowds the inner wall, since
    // area grows with radius.
    seed[i * 4 + 0] = Math.sqrt(rand());
    seed[i * 4 + 1] = rand() * Math.PI * 2;
    seed[i * 4 + 2] = rand(); // stagger so they do not all start at the bottom
    seed[i * 4 + 3] = spec.speed[0] + rand() * (spec.speed[1] - spec.speed[0]);
    size[i * 4 + 0] = spec.size[0] + rand() * (spec.size[1] - spec.size[0]);
    size[i * 4 + 1] = rand() * Math.PI * 2;
    size[i * 4 + 2] = rand() * Math.PI * 2;   // per-sprite rotation
    size[i * 4 + 3] = rand() * 40;            // per-sprite noise offset
  }

  return { seed, size, origin, count: n };
}

/**
 * Colour for the medium, tied to the temperature scale.
 *
 * The medium sits at the top of the colour scale, so its tint is taken from the
 * colour map's hot end and then blended towards white. Taking it from the map
 * rather than hard-coding a colour means that when the map changes, the steam
 * still visibly belongs to the same scale as the food.
 */
export function mediumColor(sampleFn, colormap, whiteness, alpha, position = 1) {
  // `position` is where the MEDIUM sits on the temperature scale, not a
  // constant. It used to be hard-coded to 1.0 -- the hot end -- so when a
  // student set the food hotter than the retort (making the medium the cold
  // boundary) the steam was still tinted as if it were the hottest thing in
  // the picture, contradicting the colour bar directly beneath it.
  const [r, g, b] = sampleFn(colormap, Math.min(1, Math.max(0, position)));
  const w = whiteness;
  return [r + (1 - r) * w, g + (1 - g) * w, b + (1 - b) * w, alpha];
}

/**
 * Translucent water body filling the vessel to just above the can.
 * Returned in the same shape as an equipment part so it can share that pass.
 */
export function waterBody(builder, shellRadius, yBottom, level) {
  const b = new builder();
  b.tube(shellRadius * 0.97, yBottom, level, 64);
  b.annulus(0, shellRadius * 0.97, level, 64, 1);
  return b.finish();
}
