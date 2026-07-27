/**
 * Process equipment around the food.
 *
 * WHY THIS IS NOT DECORATION
 * A cylinder floating in space is a boundary-value problem. A can sitting on a
 * rack inside a retort, with steam entering through a pipe, is a food process.
 * Students who have seen the second one ask better questions about the first:
 * where does h come from, why is the medium temperature what it is, what
 * happens to the cans that are not in the middle of the basket.
 *
 * The equipment is drawn translucent and unlit-flat so it never competes with
 * the temperature field for attention -- it is context, and the food is the
 * subject. It carries no field coordinates and is skipped entirely when the
 * viewer turns it off.
 *
 * All parts are built in the same coordinate frame as the food: +y up, and the
 * food normalised so its largest half-extent is 1.
 */

export class PartBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.indices = [];
  }

  vertex(x, y, z, nx, ny, nz) {
    this.positions.push(x, y, z);
    this.normals.push(nx, ny, nz);
    return this.positions.length / 3 - 1;
  }

  tri(a, b, c) {
    this.indices.push(a, b, c);
  }

  quad(a, b, c, d) {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /** Stitch a rows x cols vertex grid into triangles. `flip` reverses winding. */
  grid(base, rows, cols, flip = false) {
    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = base + i * cols + j;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        if (flip) {
          this.tri(a, c, b);
          this.tri(b, c, d);
        } else {
          this.tri(a, b, c);
          this.tri(b, d, c);
        }
      }
    }
  }

  /** Open tube about the y axis. */
  tube(radius, yBottom, yTop, segments = 64) {
    const base = this.positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      const cx = Math.cos(t);
      const cz = Math.sin(t);
      this.vertex(radius * cx, yBottom, radius * cz, cx, 0, cz);
      this.vertex(radius * cx, yTop, radius * cz, cx, 0, cz);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2;
      this.quad(a, a + 1, a + 3, a + 2);
    }
    return this;
  }

  /** Flat annulus in the y plane. */
  annulus(rInner, rOuter, y, segments = 64, up = 1) {
    const base = this.positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      const cx = Math.cos(t);
      const cz = Math.sin(t);
      this.vertex(rInner * cx, y, rInner * cz, 0, up, 0);
      this.vertex(rOuter * cx, y, rOuter * cz, 0, up, 0);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2;
      this.quad(a, a + 1, a + 3, a + 2);
    }
    return this;
  }

  /** Axis-aligned box, given centre and half extents. */
  box(cx, cy, cz, hx, hy, hz) {
    const faces = [
      [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
      [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
      [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]],
      [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
      [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
      [[0, 0, -1], [[-1, 1, -1], [1, 1, -1], [1, -1, -1], [-1, -1, -1]]],
    ];
    for (const [n, corners] of faces) {
      const base = this.positions.length / 3;
      for (const [sx, sy, sz] of corners) {
        this.vertex(cx + sx * hx, cy + sy * hy, cz + sz * hz, n[0], n[1], n[2]);
      }
      this.quad(base, base + 1, base + 2, base + 3);
    }
    return this;
  }

  /** Ring header: a torus about the y axis, as used for spray manifolds. */
  torus(ringRadius, tubeRadius, y, ringSeg = 56, tubeSeg = 10, cx = 0, cz = 0) {
    const base = this.positions.length / 3;
    for (let i = 0; i <= ringSeg; i++) {
      const a = (i / ringSeg) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      for (let j = 0; j <= tubeSeg; j++) {
        const b = (j / tubeSeg) * Math.PI * 2;
        const cb = Math.cos(b);
        const sb = Math.sin(b);
        this.vertex(
          cx + (ringRadius + tubeRadius * cb) * ca,
          y + tubeRadius * sb,
          cz + (ringRadius + tubeRadius * cb) * sa,
          ca * cb, sb, sa * cb,
        );
      }
    }
    this.grid(base, ringSeg + 1, tubeSeg + 1, false);
    return this;
  }

  /** Tapered cylinder along an arbitrary axis. A valve body is two of these. */
  frustum(from, to, r0, r1, segments = 18) {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dz = to[2] - from[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    const ax = dx / len;
    const ay = dy / len;
    const az = dz / len;
    // Any vector not parallel to the axis will do for the first basis vector.
    let ux = Math.abs(ay) < 0.9 ? 0 : 1;
    let uy = Math.abs(ay) < 0.9 ? 1 : 0;
    let uz = 0;
    let bx = ay * uz - az * uy;
    let by = az * ux - ax * uz;
    let bz = ax * uy - ay * ux;
    const bl = Math.hypot(bx, by, bz) || 1;
    bx /= bl; by /= bl; bz /= bl;
    const cx2 = ay * bz - az * by;
    const cy2 = az * bx - ax * bz;
    const cz2 = ax * by - ay * bx;

    const base = this.positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const nx = bx * c + cx2 * s;
      const ny = by * c + cy2 * s;
      const nz = bz * c + cz2 * s;
      this.vertex(from[0] + nx * r0, from[1] + ny * r0, from[2] + nz * r0, nx, ny, nz);
      this.vertex(to[0] + nx * r1, to[1] + ny * r1, to[2] + nz * r1, nx, ny, nz);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2;
      this.quad(a, a + 1, a + 3, a + 2);
    }
    return this;
  }

  /** Constant-radius pipe. */
  pipe(from, to, radius, segments = 18) {
    return this.frustum(from, to, radius, radius, segments);
  }

  /**
   * A globe valve, drawn as the two opposed cones of the P&ID symbol plus a
   * stem and handwheel. Recognisable at a glance to anyone who has read a
   * process diagram, which is the point.
   */
  valve(from, to, radius) {
    const mid = [
      (from[0] + to[0]) / 2,
      (from[1] + to[1]) / 2,
      (from[2] + to[2]) / 2,
    ];
    this.frustum(from, mid, radius * 1.55, radius * 0.42, 16);
    this.frustum(to, mid, radius * 1.55, radius * 0.42, 16);
    // Stem and handwheel, rising from the body.
    const stemTop = [mid[0], mid[1] + radius * 2.6, mid[2]];
    this.pipe(mid, stemTop, radius * 0.3, 10);
    this.torus(radius * 1.15, radius * 0.22, stemTop[1], 20, 6, mid[0], mid[2]);
    return this;
  }

  finish() {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      indices: new Uint32Array(this.indices),
      count: this.indices.length,
    };
  }
}

/* ------------------------------------------------------------------ */
/**
 * A vertical still retort: shell, basket rails, the rack the can stands on,
 * and the steam inlet.
 *
 * `extent` is the food's own half-size in world units before normalisation, so
 * the vessel is always proportioned to whatever food is loaded.
 */
/**
 * The retort's inner clear radius and vertical span, in scene units.
 *
 * THE VESSEL NEVER CHANGES. It is a fixed piece of hardware, exactly as in a
 * real plant: you do not buy a new retort because you switched can size. Only
 * the FOOD changes size inside it, and that is the whole point of the size
 * sliders -- the comparison a student needs is the food against an unchanging
 * reference, so it must be the food that moves.
 *
 * An earlier version grew the vessel to contain oversized food. That destroyed
 * the comparison: both the food and its surroundings scaled together, so the
 * picture looked identical and the slider appeared to do nothing. The food's
 * drawn size is instead bounded by the slider ranges (see panel.js) and by the
 * caps on arbitrary dimensions in mesh.js, so the food always fits.
 */
export const RETORT_BOUNDS = Object.freeze({
  radius: 1.85,
  yBottom: -2.3,
  yTop: 2.4,
  waterLevel: 1.8,
});

/** Kept as a function for call sites; the vessel is fixed, so it ignores args. */
export function retortBounds() {
  return RETORT_BOUNDS;
}

/** Heights of the nozzle rows on the chamber wall. */
// Fractions of the vessel half-height, so the rows track a resized vessel.
const NOZZLE_ROWS = [-0.6, -0.06, 0.47];
const NOZZLES_PER_ROW = 8;

/**
 * Spray nozzles, mounted on the chamber WALL and discharging radially inward.
 *
 * This follows how a real water-spray retort is built, and it matters for the
 * picture: the medium does not drift up from the floor, it is fired inward from
 * the wall in overlapping conical fans that collide in the middle of the
 * chamber and merge into a uniform mist. That overlap is the entire design
 * intent of the distribution system -- no can may sit in a cold pocket -- and
 * it is why the sprays are aimed at each other rather than along the axis.
 *
 * Direction is not stored: it is exactly radially inward, so the shader derives
 * it from the position and no attribute is wasted on it.
 */
export function retortNozzles(bounds = RETORT_BOUNDS) {
  const out = [];
  const r = bounds.radius * 0.965;
  const rows = NOZZLE_ROWS.map((f) => f * bounds.yTop);
  rows.forEach((y, row) => {
    for (let i = 0; i < NOZZLES_PER_ROW; i++) {
      // Alternate rows are staggered so the fans interleave vertically rather
      // than stacking into corridors.
      const a = ((i + (row % 2 ? 0.5 : 0)) / NOZZLES_PER_ROW) * Math.PI * 2;
      out.push([r * Math.cos(a), y, r * Math.sin(a)]);
    }
  });
  return out;
}

/** What the product actually is, so the callout does not say "can" for a sphere. */
const PRODUCT_NOUN = {
  finiteCylinder: 'can',
  cylinder: 'cylinder',
  slab: 'slab',
  sphere: 'sphere',
};

export function productNoun(geometry) {
  return PRODUCT_NOUN[geometry] ?? 'product';
}

/** Anchor points for the on-screen part labels, in the current vessel. */
export function retortAnchors(bounds = RETORT_BOUNDS, geometry = 'finiteCylinder') {
  return [
    { id: 'vent', label: 'air vent', at: [0.8, bounds.yTop + 0.95, 0] },
    { id: 'nozzle', label: 'spray nozzles', at: [0, bounds.yTop * 0.5, -bounds.radius * 1.12] },
    { id: 'valves', label: 'steam / water valves', at: [bounds.radius + 1.5, bounds.yBottom - 0.05, 0.25] },
    { id: 'product', label: `product (${productNoun(geometry)})`, at: [0, bounds.yBottom * 0.78, 0.85] },
  ];
}

function retort(state, bounds = RETORT_BOUNDS) {
  // The vessel is normally fixed, like real hardware, and only grows when the
  // food would otherwise not fit. See retortBounds().
  const shellR = bounds.radius;
  const yBot = bounds.yBottom;
  const yTop = bounds.yTop;

  const shell = new PartBuilder().tube(shellR, yBot, yTop, 72).finish();
  const lid = new PartBuilder().annulus(0, shellR, yTop, 72, 1).finish();
  const floor = new PartBuilder().annulus(0, shellR, yBot, 72, -1).finish();

  // The perforated rack the basket sits on.
  const rack = new PartBuilder();
  rack.annulus(0.18, shellR * 0.81, yBot * 0.75, 56, 1);
  for (let i = 0; i < 4; i++) {
    const t = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const rr = shellR * 0.73;
    rack.pipe([rr * Math.cos(t), yBot * 0.75, rr * Math.sin(t)], [rr * Math.cos(t), yBot, rr * Math.sin(t)], 0.05, 12);
  }

  // --- spray nozzles on the wall, with the headers that feed them ----------
  const nozzles = retortNozzles(bounds);
  const spray = new PartBuilder();
  for (const p of nozzles) {
    const rr = Math.hypot(p[0], p[2]) || 1;
    const ux = p[0] / rr;
    const uz = p[2] / rr;
    // Body flush to the wall, then the discharge head standing proud of it.
    const outer = [ux * shellR * 1.02, p[1], uz * shellR * 1.02];
    const neck = [ux * (rr - 0.09), p[1], uz * (rr - 0.09)];
    const head = [ux * (rr - 0.17), p[1] - 0.015, uz * (rr - 0.17)];
    spray.pipe(outer, neck, 0.038, 12);
    spray.frustum(neck, head, 0.062, 0.030, 12);
  }
  // External ring headers feeding each row, plus the riser that supplies them.
  const headers = new PartBuilder();
  for (const f of NOZZLE_ROWS) headers.torus(shellR * 1.07, 0.05, f * yTop, 48, 8);
  headers.pipe([shellR * 1.07, yBot + 0.2, 0], [shellR * 1.07, yTop * 0.6, 0], 0.062, 14);
  headers.pipe([shellR * 1.07, yBot + 0.2, 0], [shellR + 0.62, yBot + 0.2, 0], 0.062, 14);

  // --- valve train ---------------------------------------------------------
  // Steam and water admitted low through their own valves, as on the reference
  // diagram; the air vent sits at the crown.
  const pipes = new PartBuilder();
  const vy = yBot + 0.3;
  pipes.pipe([shellR + 0.62, vy, 0], [shellR + 1.5, vy, 0], 0.09, 16);
  pipes.valve([shellR + 0.78, vy, 0], [shellR + 1.22, vy, 0], 0.09);
  pipes.pipe([shellR + 0.62, vy, 0], [shellR + 0.62, yBot + 0.2, 0], 0.09, 16);

  const wy = yBot - 0.4;
  pipes.pipe([shellR + 0.62, wy, 0.5], [shellR + 1.5, wy, 0.5], 0.075, 16);
  pipes.valve([shellR + 0.78, wy, 0.5], [shellR + 1.22, wy, 0.5], 0.075);
  pipes.pipe([shellR + 0.62, wy, 0.5], [shellR + 0.62, vy, 0.5], 0.075, 16);
  pipes.pipe([shellR + 0.62, vy, 0.5], [shellR + 0.62, vy, 0], 0.075, 12);

  // Vent at the top: a retort must vent its air before the process clock
  // starts, because trapped air lowers the effective medium temperature.
  const vent = new PartBuilder();
  vent.pipe([0.8, yTop - 0.05, 0], [0.8, yTop + 0.72, 0], 0.085, 16);
  vent.valve([0.8, yTop + 0.2, 0], [0.8, yTop + 0.56, 0], 0.085);

  // Brushed steel, lit for a dark viewport: bright enough that the silhouette
  // and the rim highlight read against the dark background, faint enough on
  // the faces that the food and the steam show clearly through.
  const STEEL = [0.62, 0.70, 0.82];
  const PIPEWORK = [0.74, 0.81, 0.90];
  const parts = [
    { mesh: shell, color: [...STEEL, 0.075] },
    { mesh: lid, color: [...STEEL, 0.10] },
    { mesh: floor, color: [0.42, 0.50, 0.62, 0.20] },
    { mesh: rack.finish(), color: [0.66, 0.73, 0.84, 0.55] },
    { mesh: headers.finish(), color: [0.60, 0.68, 0.80, 0.7] },
    { mesh: spray.finish(), color: [0.86, 0.90, 0.96, 0.92] },
    { mesh: pipes.finish(), color: [...PIPEWORK, 0.85] },
    { mesh: vent.finish(), color: [...PIPEWORK, 0.85] },
  ];

  // Water immersion: an actual body of water, filled above the can, so the
  // difference from steam is visible before any number is read.
  if (state?.heatingMedium === 'water') {
    const body = new PartBuilder();
    body.tube(shellR * 0.96, yBot + 0.02, bounds.waterLevel, 64);
    body.annulus(0, shellR * 0.96, bounds.waterLevel, 64, 1);
    parts.push({ mesh: body.finish(), color: [0.42, 0.62, 0.86, 0.17] });
  }

  return parts;
}

/* ------------------------------------------------------------------ */
/** An air-blast chiller or freezer: cabinet, evaporator fan, and a wire shelf. */
function blastChiller() {
  const hx = 2.1;
  const hy = 1.6;
  const hz = 1.7;

  const cabinet = new PartBuilder().box(0, 0.05, 0, hx, hy, hz).finish();

  // Wire shelf under the product.
  const shelf = new PartBuilder();
  shelf.box(0, -1.15, 0, 1.45, 0.03, 1.2);
  for (let i = -1; i <= 1; i += 2) {
    for (let j = -1; j <= 1; j += 2) {
      shelf.pipe([i * 1.3, -1.18, j * 1.05], [i * 1.3, -hy + 0.05, j * 1.05], 0.05, 12);
    }
  }

  // Evaporator fan on the left wall, with a duct.
  const fan = new PartBuilder();
  fan.pipe([-hx + 0.06, 0.7, 0], [-hx + 0.4, 0.7, 0], 0.55, 28);
  for (let i = 0; i < 5; i++) {
    const t = (i / 5) * Math.PI * 2;
    fan.box(-hx + 0.23, 0.7 + 0.3 * Math.cos(t), 0.3 * Math.sin(t), 0.14, 0.22, 0.05);
  }

  // Airflow across the product: this is what h actually IS in this scenario.
  const flow = new PartBuilder();
  for (let i = 0; i < 4; i++) {
    const y = 0.85 - i * 0.5;
    flow.pipe([-hx + 0.55, y, -0.75 + i * 0.5], [hx - 0.6, y, -0.75 + i * 0.5], 0.032, 10);
  }

  const STEEL = [0.34, 0.42, 0.52];
  return [
    { mesh: cabinet, color: [...STEEL, 0.09] },
    { mesh: shelf.finish(), color: [0.48, 0.55, 0.64, 0.6] },
    { mesh: fan.finish(), color: [0.52, 0.60, 0.70, 0.7] },
    // The airflow is the one part allowed a real hue: it is the mechanism, not
    // the enclosure, and students should be able to point at it.
    { mesh: flow.finish(), color: [0.30, 0.60, 0.90, 0.5] },
  ];
}

/* ------------------------------------------------------------------ */
/**
 * Equipment for the current scenario, or an empty list if none applies.
 * Returned parts are already in the food's normalised frame.
 */
export function buildEquipment(scenario, state, bounds = RETORT_BOUNDS) {
  if (scenario === 'chill') return blastChiller();
  if (scenario === 'retort') return retort(state, bounds);
  return [];
}

/**
 * Human-readable name, shown in the caption so the picture is labelled.
 * The article is part of the string because "an" and "a" differ by entry.
 */
export function equipmentLabel(scenario) {
  if (scenario === 'chill') return 'an air-blast chiller';
  if (scenario === 'retort') return 'a vertical still retort';
  return '';
}
