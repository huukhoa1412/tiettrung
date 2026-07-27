/**
 * Triangle meshes for the food geometries, with a cutaway.
 *
 * THE POINT OF THE CUTAWAY
 * A clipping plane in a typical 3-D library cuts a HOLE: you see through the
 * object, not into it. That is useless here, because the whole lesson is what
 * the temperature is doing INSIDE the can. So the cut faces are generated as
 * real geometry, and each of their vertices carries a field coordinate that
 * indexes the computed temperature field. The exposed surface therefore shows
 * the true interior solution, not a shaded approximation of it.
 *
 * FIELD COORDINATES
 * Every vertex carries (u, v):
 *   u = r / R              radial position, 0 at the axis, 1 at the surface
 *   v = |z| / halfHeight   axial position for the two-dimensional can field
 * One-dimensional geometries (slab, infinite cylinder, sphere) set v = 0.5 and
 * use a field texture one texel tall, so the same shader serves both.
 *
 * Axis convention: +y is the axis of revolution, so the can stands upright.
 */

class MeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.indices = [];
  }

  vertex(x, y, z, nx, ny, nz, u, v) {
    this.positions.push(x, y, z);
    this.normals.push(nx, ny, nz);
    this.uvs.push(u, v);
    return this.positions.length / 3 - 1;
  }

  triangle(a, b, c) {
    this.indices.push(a, b, c);
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
          this.triangle(a, c, b);
          this.triangle(b, c, d);
        } else {
          this.triangle(a, b, c);
          this.triangle(b, d, c);
        }
      }
    }
  }

  finish() {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
      indices: new Uint32Array(this.indices),
      count: this.indices.length,
    };
  }
}

/* ------------------------------------------------------------------ */
function cylinderMesh({ R, halfHeight, cutAngle, twoD, segments = 120, zDiv = 40, rDiv = 24 }) {
  const b = new MeshBuilder();
  const t0 = cutAngle;
  const t1 = Math.PI * 2;
  const nT = Math.max(6, Math.round((segments * (t1 - t0)) / (Math.PI * 2)));
  const vOf = (z) => (twoD ? Math.min(1, Math.abs(z) / halfHeight) : 0.5);

  // --- outer lateral wall: r = R ---
  let base = b.positions.length / 3;
  for (let i = 0; i <= nT; i++) {
    const th = t0 + ((t1 - t0) * i) / nT;
    const cx = Math.cos(th);
    const cz = Math.sin(th);
    for (let j = 0; j <= zDiv; j++) {
      const z = -halfHeight + (2 * halfHeight * j) / zDiv;
      b.vertex(R * cx, z, R * cz, cx, 0, cz, 1, vOf(z));
    }
  }
  b.grid(base, nT + 1, zDiv + 1, true);

  // --- lids: z = +/- halfHeight ---
  for (const sign of [1, -1]) {
    base = b.positions.length / 3;
    for (let i = 0; i <= nT; i++) {
      const th = t0 + ((t1 - t0) * i) / nT;
      for (let j = 0; j <= rDiv; j++) {
        const r = (R * j) / rDiv;
        b.vertex(r * Math.cos(th), sign * halfHeight, r * Math.sin(th), 0, sign, 0, r / R, vOf(sign * halfHeight));
      }
    }
    b.grid(base, nT + 1, rDiv + 1, sign > 0);
  }

  // --- the two cut faces: constant-theta half planes showing the interior ---
  if (cutAngle > 1e-4) {
    for (const [th, flip] of [[t0, false], [t1, true]]) {
      const nx = Math.sin(th);
      const nz = -Math.cos(th);
      const s = flip ? -1 : 1;
      base = b.positions.length / 3;
      for (let j = 0; j <= rDiv; j++) {
        const r = (R * j) / rDiv;
        for (let m = 0; m <= zDiv; m++) {
          const z = -halfHeight + (2 * halfHeight * m) / zDiv;
          b.vertex(r * Math.cos(th), z, r * Math.sin(th), s * nx, 0, s * nz, r / R, vOf(z));
        }
      }
      b.grid(base, rDiv + 1, zDiv + 1, flip);
    }
  }

  return b.finish();
}

/* ------------------------------------------------------------------ */
function sphereMesh({ R, cutAngle, segments = 120, phiDiv = 60, rDiv = 24 }) {
  const b = new MeshBuilder();
  const t0 = cutAngle;
  const t1 = Math.PI * 2;
  const nT = Math.max(6, Math.round((segments * (t1 - t0)) / (Math.PI * 2)));

  // --- outer surface ---
  let base = b.positions.length / 3;
  for (let i = 0; i <= nT; i++) {
    const th = t0 + ((t1 - t0) * i) / nT;
    for (let j = 0; j <= phiDiv; j++) {
      const phi = (Math.PI * j) / phiDiv;
      const sp = Math.sin(phi);
      const x = sp * Math.cos(th);
      const y = Math.cos(phi);
      const z = sp * Math.sin(th);
      b.vertex(R * x, R * y, R * z, x, y, z, 1, 0.5);
    }
  }
  b.grid(base, nT + 1, phiDiv + 1, false);

  // --- cut faces: half discs in the constant-theta plane ---
  if (cutAngle > 1e-4) {
    for (const [th, flip] of [[t0, false], [t1, true]]) {
      const nx = Math.sin(th);
      const nz = -Math.cos(th);
      const s = flip ? -1 : 1;
      base = b.positions.length / 3;
      for (let j = 0; j <= rDiv; j++) {
        const r = (R * j) / rDiv;
        for (let m = 0; m <= phiDiv; m++) {
          const phi = (Math.PI * m) / phiDiv;
          const sp = Math.sin(phi);
          b.vertex(r * sp * Math.cos(th), r * Math.cos(phi), r * sp * Math.sin(th), s * nx, 0, s * nz, r / R, 0.5);
        }
      }
      b.grid(base, rDiv + 1, phiDiv + 1, flip);
    }
  }

  return b.finish();
}

/* ------------------------------------------------------------------ */
/**
 * Slab: a rectangular block whose temperature varies only through its
 * thickness. The cut removes the near half so the through-thickness gradient
 * is exposed on a full-width face -- for a slab the cross-section IS the
 * lesson, so it is made the most visible surface.
 */
function slabMesh({ halfThickness: L, width, height, cutAngle, xDiv = 48 }) {
  const b = new MeshBuilder();
  const hw = width / 2;
  const hh = height / 2;

  // WHERE THE CUTAWAY IS ALLOWED TO CUT.
  //
  // A cylinder's wedge is removed in THETA -- a direction along which the
  // temperature does not vary. That is why it looks right: the cut never
  // crosses a plane the physics cares about, and every exposed face still
  // shows a complete radial profile.
  //
  // The slab's field varies along x ONLY, and it is mirror-symmetric about
  // the mid-plane x = 0 because both faces are heated identically. So the
  // cut must stay out of x entirely and take material in y and z, where
  // nothing varies. Two earlier attempts got this wrong:
  //   - slicing off everything beyond z = zc walked the body off-centre
  //     (bounding-box centre reached -0.48 scene units at full cut);
  //   - notching the corner x > 0, z > zc kept it centred but cut ACROSS
  //     the mid-plane, leaving 98 vertices with no mirror twin and exposing
  //     x = 0 as one large uniformly-cold face -- which makes a slab heated
  //     on both faces look as though it is heated on one.
  //
  // Removing the quadrant y > 0, z > zc satisfies everything: the body stays
  // centred, mirror symmetry about x = 0 is exact, and BOTH exposed faces
  // run the full thickness, so each shows the complete hot-cold-hot profile
  // that is the whole point of the slab problem.
  const frac = Math.min(0.5, cutAngle / Math.PI);
  const zc = hw - 2 * hw * frac;
  const notched = hw - zc > 1e-9;

  const u = (x) => Math.min(1, Math.abs(x) / L);

  /**
   * Emit a face as an (nu x nv) grid.
   *
   * Any face that SPANS the thickness must be subdivided: the field
   * coordinate is |x|/L, which has a kink at the mid-plane. Drawn as a single
   * quad it interpolates 1 -> 1 across the plate and renders the whole face at
   * surface temperature, hiding the very gradient the picture exists to show.
   * Back-face culling is off, so winding is irrelevant and only the normal
   * matters for shading.
   */
  const face = (nu, nv, pt, n) => {
    const base = b.positions.length / 3;
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) {
        const [x, y, z] = pt(i / nu, j / nv);
        b.vertex(x, y, z, n[0], n[1], n[2], u(x), 0.5);
      }
    }
    b.grid(base, nu + 1, nv + 1, false);
  };

  const lerp = (a, c, t) => a + (c - a) * t;

  // --- the two heated faces, x = -L and x = +L ---
  // u is constant (1) on each, so no subdivision is needed. Each is L-shaped
  // once the notch bites, so it is emitted as the full-depth part plus the
  // lower tongue. Both faces are built identically, which is what guarantees
  // the mirror symmetry the physics has.
  for (const [x, n] of [[-L, [-1, 0, 0]], [L, [1, 0, 0]]]) {
    face(1, 1, (s, t) => [x, lerp(-hh, hh, s), lerp(-hw, zc, t)], n);
    if (notched) face(1, 1, (s, t) => [x, lerp(-hh, 0, s), lerp(zc, hw, t)], n);
  }

  // --- far end, z = -hw: spans the thickness, so subdivide in x ---
  face(xDiv, 1, (s, t) => [lerp(-L, L, s), lerp(-hh, hh, t), -hw], [0, 0, -1]);

  // --- near end, z = +hw: only the lower half survives the notch ---
  face(xDiv, 1, (s, t) => [lerp(-L, L, s), lerp(-hh, notched ? 0 : hh, t), hw], [0, 0, 1]);

  // --- bottom, y = -hh: untouched by the notch ---
  face(xDiv, 1, (s, t) => [lerp(-L, L, s), -hh, lerp(-hw, hw, t)], [0, -1, 0]);

  // --- top, y = +hh: only up to the notch ---
  face(xDiv, 1, (s, t) => [lerp(-L, L, s), hh, lerp(-hw, zc, t)], [0, 1, 0]);

  if (notched) {
    // Both cut faces run the FULL thickness, so each shows the complete
    // hot-cold-hot profile rather than a single-temperature plane.
    face(xDiv, 1, (s, t) => [lerp(-L, L, s), lerp(0, hh, t), zc], [0, 0, 1]);
    face(xDiv, 1, (s, t) => [lerp(-L, L, s), 0, lerp(zc, hw, t)], [0, 1, 0]);
  }

  return b.finish();
}

/* ------------------------------------------------------------------ */
/**
 * Scene units per metre of food.
 *
 * WHY A FIXED SCALE, AND NOT NORMALISATION
 * The food used to be scaled by 1/extent, i.e. normalised to unit size. That
 * makes every food fill the frame identically -- and therefore makes the
 * radius and half-thickness sliders INVISIBLE in the 3-D view. A student could
 * drag the radius from 5 mm to 150 mm, watch the heating time change by a
 * factor of nine hundred, and see the picture not move at all. Since "double
 * the size, quadruple the time" is one of the central lessons here, that was
 * the single most costly thing the view could get wrong.
 *
 * With a fixed scale, size is comparable across every setting and across every
 * geometry: a 5 mm sphere really is drawn a thirtieth the size of a 150 mm one.
 *
 * The constant is chosen so that the LARGEST food the sliders allow still fits
 * inside the fixed retort, while a standard 307x409 can (R = 43.65 mm) is
 * still large enough to read on a projector. With the retort bore at 1.85 and
 * its half-span at 2.3 scene units:
 *
 *   default can  R = 43.65 mm -> 0.70  (38 % of the bore)
 *   largest can  R = 90 mm    -> 1.44  (78 % of the bore)
 *
 * so the size sliders sweep the food across roughly half the vessel width, and
 * nothing ever pokes through the wall.
 */
export const SCENE_PER_METRE = 16;

/**
 * Caps on the dimensions the model does NOT actually specify.
 *
 * An "infinite slab" has no width and an "infinite cylinder" has no length --
 * those numbers are pictorial only, and the physics ignores them. Left
 * uncapped they grow with the size slider and would push the drawing through
 * the retort wall, so they are clamped to what the vessel can hold. The
 * THICKNESS of the slab and the RADIUS of the cylinder are real and are never
 * clamped.
 */
const MAX_PLATE_HALF_SPAN = 1.1; // circumscribed radius 1.1*sqrt(2) = 1.56 < bore
const MAX_HALF_LENGTH = 2.0;

/**
 * Build the mesh for the current geometry.
 *
 * Returns the mesh, the fixed scene scale, and the food's bounding radius and
 * half-height IN SCENE UNITS, so the vessel and the heating medium can be
 * placed around it without independently re-deriving its size.
 *
 * @param cut  0 = whole object, 1 = a quarter removed (a 90 degree wedge)
 */
export function buildGeometryMesh(geometry, state, cut) {
  const cutAngle = Math.max(0, Math.min(1, cut)) * (Math.PI / 2);
  const s = SCENE_PER_METRE;

  if (geometry === 'slab') {
    const L = state.halfThickness;
    // Show the slab as a plate wider than it is thick, which is what the
    // "infinite slab" idealisation actually assumes. The WIDTH is pictorial
    // and is capped to fit the vessel; the thickness is the physics and is not.
    const halfSpan = Math.min(L * 3, MAX_PLATE_HALF_SPAN / s);
    const span = halfSpan * 2;
    return {
      mesh: slabMesh({ halfThickness: L, width: span, height: span, cutAngle }),
      scale: s,
      // The plate's circumscribed radius in the horizontal plane.
      outerRadius: halfSpan * Math.SQRT2 * s,
      halfHeight: halfSpan * s,
    };
  }

  if (geometry === 'sphere') {
    return {
      mesh: sphereMesh({ R: state.radius, cutAngle }),
      scale: s,
      outerRadius: state.radius * s,
      halfHeight: state.radius * s,
    };
  }

  const R = state.radius;
  const twoD = geometry === 'finiteCylinder';
  // A finite cylinder has a real height. An infinite one does not: its drawn
  // length is pictorial, so it is capped to fit the vessel.
  const halfHeight = twoD
    ? state.canHeight / 2
    : Math.min(R * 1.6, MAX_HALF_LENGTH / s);
  return {
    mesh: cylinderMesh({ R, halfHeight, cutAngle, twoD }),
    scale: s,
    outerRadius: R * s,
    halfHeight: halfHeight * s,
  };
}
