/**
 * WebGL2 renderer for the temperature field, with an orbit camera.
 *
 * WHY RAW WebGL AND NOT A LIBRARY
 * The one feature that makes this view teach anything is the cutaway showing
 * the REAL interior field. That needs a custom shader and real cap geometry
 * whichever route is taken, so a library would contribute matrix maths and
 * orbit controls -- roughly 150 lines -- in exchange for a few hundred
 * kilobytes and a vendoring step. Since the deliverable must be one
 * self-contained file that works offline, writing those 150 lines is the
 * cheaper trade.
 *
 * SHADING IS DELIBERATELY FLAT
 * Colour here IS the data. Strong directional lighting would make the same
 * temperature read as two different colours depending on which way a surface
 * happens to face, which is exactly the misreading the colour bar is meant to
 * prevent. So the lighting only modulates brightness between 0.82 and 1.0 --
 * just enough to give shape, never enough to move a colour a perceptible step
 * along the ramp.
 */

/** Vertical field of view, radians. Shared by the projection and the framing. */
const FOV_Y = 0.72;

/* ---------------------------- 4x4 matrices ---------------------------- */
function mat4Perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function mat4LookAt(eye, target, up) {
  const [ex, ey, ez] = eye;
  let zx = ex - target[0];
  let zy = ey - target[1];
  let zz = ez - target[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xy /= len; xz /= len;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * ex + xy * ey + xz * ez),
    -(yx * ex + yy * ey + yz * ez),
    -(zx * ex + zy * ey + zz * ez),
    1,
  ]);
}

/** Column-major 4x4 multiply, out = a * b. */
function multiply4(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

/* ------------------------------ shaders ------------------------------ */
const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aFieldUV;

uniform mat4 uProjection;
uniform mat4 uView;
uniform float uScale;

out vec3 vNormal;
out vec2 vFieldUV;

void main() {
  vNormal = aNormal;
  vFieldUV = aFieldUV;
  gl_Position = uProjection * uView * vec4(aPosition * uScale, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec2 vFieldUV;

uniform sampler2D uField;
uniform vec3 uLightDir;

out vec4 outColor;

void main() {
  // The field texture already holds mapped colour, so no ramp lookup is done
  // per fragment and the colour a reader sees is exactly the colour the
  // colour bar shows.
  vec3 base = texture(uField, vFieldUV).rgb;

  // Deliberately weak shading: enough to reveal form, too little to shift a
  // colour a readable step along the ramp.
  vec3 n = normalize(vNormal);
  float lambert = max(dot(n, normalize(uLightDir)), 0.0);
  float shade = 0.82 + 0.18 * lambert;

  outColor = vec4(base * shade, 1.0);
}`;

/* Flat translucent pass, for the process equipment around the food. */
const EQUIP_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
uniform mat4 uProjection;
uniform mat4 uView;
out vec3 vNormal;
out vec3 vViewDir;
void main() {
  vNormal = aNormal;
  vec4 world = vec4(aPosition, 1.0);
  vViewDir = normalize(-(uView * world).xyz);
  gl_Position = uProjection * uView * world;
}`;

const EQUIP_FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vViewDir;
uniform vec4 uColor;
uniform vec3 uLightDir;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  float lambert = max(dot(n, normalize(uLightDir)), 0.0);
  float shade = 0.65 + 0.35 * lambert;

  // Fresnel-style edge emphasis: a translucent shell reads as a SURFACE rather
  // than a wash of colour when its silhouette is brighter than its face. That
  // keeps the vessel legible while letting the food show clearly through it.
  float facing = abs(dot(n, normalize(vViewDir)));
  float rim = pow(1.0 - facing, 2.5);
  float alpha = clamp(uColor.a + rim * 0.5, 0.0, 1.0);

  // The additive term is kept small: pushed harder it washes the whole shell
  // towards white and the vessel stops reading as metal.
  outColor = vec4(uColor.rgb * shade + rim * 0.10, alpha);
}`;

/**
 * Heating medium: billowing steam, or bubbles in water.
 *
 * MAKING IT LOOK LIKE STEAM RATHER THAN LIKE DOTS
 * A point sprite with a smooth circular falloff always reads as a ball. Real
 * steam is a turbulent condensing cloud: soft, irregular, with density that
 * varies within each puff and builds where puffs overlap. Four things together
 * produce that, and all four are needed -- dropping any one takes it back to
 * looking like confetti:
 *
 *   1. Each sprite is carved by procedural fbm noise, so its edge is ragged
 *      and its interior is uneven. This is what stops it being a circle.
 *   2. Sprites are large, numerous and individually very faint, so density
 *      comes from ACCUMULATION across overlaps rather than from any one puff.
 *   3. Motion is curling, not helical: layered out-of-phase sines displace
 *      each puff radially and vertically as it rises.
 *   4. Puffs expand as they rise and fade out well before the top, the way a
 *      condensing plume actually disperses.
 *
 * Each sprite also carries its own rotation and noise offset, so the pattern
 * never visibly repeats across the field.
 */
const MEDIUM_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aSeed;   // radial 0..1, angle0, phase0, speed
layout(location = 1) in vec4 aSize;   // size, wobble phase, spin, noise offset
layout(location = 2) in vec3 aOrigin; // nozzle position (jet mode only)

uniform mat4 uProjection;
uniform mat4 uView;
uniform float uTime;
uniform float uRInner;
uniform float uROuter;
uniform float uYBottom;
uniform float uYTop;
uniform float uPointScale;
uniform vec3 uCenter;
uniform float uSwirl;
uniform float uGrow;
uniform float uTurb;
uniform float uMode;     // 0 = drifting chamber fill, 1 = nozzle jet
uniform vec2 uJet;       // x = throw length, y = cone half-width at full throw

out float vAlpha;
out float vRot;
out float vSeed;

void main() {
  // Each puff runs its own loop; fract() respawns it, so the field never
  // empties and nothing is recycled on the CPU.
  float t = fract(aSeed.z + uTime * aSeed.w);

  // Curling turbulence: out-of-phase oscillations at different frequencies,
  // which is what makes the medium billow instead of moving on rails.
  float p = aSeed.y * 3.7 + aSize.y;
  float tw1 = sin(uTime * 0.62 + p + t * 5.5);
  float tw2 = cos(uTime * 0.43 + p * 1.7 + t * 3.2);
  float tw3 = sin(uTime * 0.31 + p * 0.6 + t * 8.0);

  vec3 pos;
  float grow;

  if (uMode > 0.5) {
    // --- nozzle jet: a conical fan fired radially inward from the wall ------
    // The direction is derived from the nozzle's own position rather than
    // stored, since a wall nozzle always points at the axis. A slight downward
    // tilt matches how these are actually aimed.
    vec3 dir = normalize(vec3(-aOrigin.x, -0.14 * length(vec2(aOrigin.x, aOrigin.z)), -aOrigin.z));
    vec3 tang = normalize(cross(dir, vec3(0.0, 1.0, 0.0)));
    vec3 vert = normalize(cross(tang, dir));

    // The fan widens linearly with throw, so the spray is a cone, not a tube.
    float spread = uJet.y * t * aSeed.x;
    float a = aSeed.y;
    pos = aOrigin
        + dir * (uJet.x * t)
        + (tang * cos(a) + vert * sin(a)) * spread
        + uTurb * t * vec3(tw1, tw2 * 0.7, tw3);

    // Droplets break up and disperse as they travel.
    grow = mix(0.35, uGrow, t);
    // Bright and tight at the nozzle, holding most of the way across the
    // chamber before dissolving into the general haze near the far side.
    vAlpha = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.58, 1.0, t));
  } else {
    // --- chamber fill: slow, near-uniform drift ----------------------------
    float ang = aSeed.y + uTime * uSwirl + t * 0.85 + 0.18 * tw3;
    float r = mix(uRInner, uROuter, aSeed.x) + uTurb * tw1;
    float y = mix(uYBottom, uYTop, t) + uTurb * 0.55 * tw2;
    pos = uCenter + vec3(r * cos(ang), y, r * sin(ang));
    grow = mix(1.0, uGrow, t);
    vAlpha = smoothstep(0.0, 0.10, t) * (1.0 - smoothstep(0.45, 0.95, t));
  }

  vec4 clip = uProjection * uView * vec4(pos, 1.0);
  gl_Position = clip;
  gl_PointSize = clamp(aSize.x * grow * uPointScale / max(clip.w, 0.05), 2.0, 150.0);
  vRot = aSize.z + uTime * 0.25;
  vSeed = aSize.w;
}`;

const MEDIUM_FRAG = `#version 300 es
precision highp float;
in float vAlpha;
in float vRot;
in float vSeed;
uniform vec4 uColor;
uniform float uWispy;   // 0 = smooth droplet (bubbles), 1 = noisy cloud (steam)
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

/** Three octaves is enough for a puff and stays cheap on software renderers. */
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float c = cos(vRot);
  float s = sin(vRot);
  uv = mat2(c, -s, s, c) * uv;          // per-sprite rotation kills repetition

  float d = length(uv);
  if (d > 0.5) discard;

  float falloff = smoothstep(0.5, 0.02, d);
  float n = fbm(uv * 3.4 + vec2(vSeed, vSeed * 1.7));

  // Blend between a clean droplet and a noise-carved cloud.
  float cloud = smoothstep(0.03, 0.5, falloff * (0.30 + 1.05 * n));
  float density = mix(falloff, cloud, uWispy);

  float a = uColor.a * vAlpha * density;
  if (a < 0.004) discard;
  outColor = vec4(uColor.rgb, a);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

/* ---------------------------- the renderer ---------------------------- */
export class FieldRenderer {
  /** Returns null if WebGL2 is unavailable, so the caller can fall back. */
  static create(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) return null;
    try {
      return new FieldRenderer(canvas, gl);
    } catch (err) {
      console.warn('WebGL2 initialisation failed, falling back to 2-D:', err);
      return null;
    }
  }

  constructor(canvas, gl) {
    this.canvas = canvas;
    this.gl = gl;

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    this.program = program;
    this.uniforms = {
      projection: gl.getUniformLocation(program, 'uProjection'),
      view: gl.getUniformLocation(program, 'uView'),
      scale: gl.getUniformLocation(program, 'uScale'),
      field: gl.getUniformLocation(program, 'uField'),
      lightDir: gl.getUniformLocation(program, 'uLightDir'),
    };

    const equipProgram = gl.createProgram();
    gl.attachShader(equipProgram, compile(gl, gl.VERTEX_SHADER, EQUIP_VERT));
    gl.attachShader(equipProgram, compile(gl, gl.FRAGMENT_SHADER, EQUIP_FRAG));
    gl.linkProgram(equipProgram);
    if (!gl.getProgramParameter(equipProgram, gl.LINK_STATUS)) {
      throw new Error(`Equipment program link failed: ${gl.getProgramInfoLog(equipProgram)}`);
    }
    this.equipProgram = equipProgram;
    this.equipUniforms = {
      projection: gl.getUniformLocation(equipProgram, 'uProjection'),
      view: gl.getUniformLocation(equipProgram, 'uView'),
      color: gl.getUniformLocation(equipProgram, 'uColor'),
      lightDir: gl.getUniformLocation(equipProgram, 'uLightDir'),
    };
    this.equipParts = [];

    const mediumProgram = gl.createProgram();
    gl.attachShader(mediumProgram, compile(gl, gl.VERTEX_SHADER, MEDIUM_VERT));
    gl.attachShader(mediumProgram, compile(gl, gl.FRAGMENT_SHADER, MEDIUM_FRAG));
    gl.linkProgram(mediumProgram);
    if (!gl.getProgramParameter(mediumProgram, gl.LINK_STATUS)) {
      throw new Error(`Medium program link failed: ${gl.getProgramInfoLog(mediumProgram)}`);
    }
    this.mediumProgram = mediumProgram;
    this.mediumUniforms = {
      projection: gl.getUniformLocation(mediumProgram, 'uProjection'),
      view: gl.getUniformLocation(mediumProgram, 'uView'),
      time: gl.getUniformLocation(mediumProgram, 'uTime'),
      rInner: gl.getUniformLocation(mediumProgram, 'uRInner'),
      rOuter: gl.getUniformLocation(mediumProgram, 'uROuter'),
      yBottom: gl.getUniformLocation(mediumProgram, 'uYBottom'),
      yTop: gl.getUniformLocation(mediumProgram, 'uYTop'),
      pointScale: gl.getUniformLocation(mediumProgram, 'uPointScale'),
      color: gl.getUniformLocation(mediumProgram, 'uColor'),
      center: gl.getUniformLocation(mediumProgram, 'uCenter'),
      swirl: gl.getUniformLocation(mediumProgram, 'uSwirl'),
      grow: gl.getUniformLocation(mediumProgram, 'uGrow'),
      turb: gl.getUniformLocation(mediumProgram, 'uTurb'),
      wispy: gl.getUniformLocation(mediumProgram, 'uWispy'),
      mode: gl.getUniformLocation(mediumProgram, 'uMode'),
      jet: gl.getUniformLocation(mediumProgram, 'uJet'),
    };
    this.mediumSets = [];
    this.time = 0;

    this.vao = gl.createVertexArray();
    this.buffers = {
      position: gl.createBuffer(),
      normal: gl.createBuffer(),
      uv: gl.createBuffer(),
      index: gl.createBuffer(),
    };
    this.indexCount = 0;

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.enable(gl.DEPTH_TEST);
    // Both faces of a cut plane are meaningful, so nothing is culled.
    gl.disable(gl.CULL_FACE);

    // Camera state, in spherical coordinates about the origin.
    // Opening azimuth points into the cutaway wedge (which is removed from
    // theta = 0 outward), so the interior field is visible without the viewer
    // having to discover that the object can be rotated.
    this.camera = { azimuth: 0.45, elevation: 0.34, distance: 3.4 };
    this.scale = 1;
    this.frameRadius = 1.15;
    this.minDistance = 1.4;
    this.maxDistance = 12;
    this.attachControls();
  }

  /**
   * Frame the view on a sphere of the given radius in normalised units.
   *
   * The food alone occupies about 1; a retort shell around it occupies nearly
   * 3. Without reframing, switching equipment on would put the vessel entirely
   * outside the frustum and the view would appear to break.
   */
  setFraming(radius, { keepUserZoom = false } = {}) {
    const halfFov = FOV_Y / 2;
    const fitted = (radius / Math.tan(halfFov)) * 1.12;
    this.minDistance = fitted * 0.35;
    this.maxDistance = fitted * 3.5;
    if (!keepUserZoom || Math.abs(this.frameRadius - radius) > 1e-6) {
      this.camera.distance = fitted;
    }
    this.frameRadius = radius;
    this.defaultDistance = fitted;
  }

  attachControls() {
    const canvas = this.canvas;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      // Capture can reject an id the browser did not issue (synthetic events,
      // some assistive tooling). Dragging still works without it.
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* not capturable; ignore */
      }
      canvas.style.cursor = 'grabbing';
    });
    const end = (e) => {
      dragging = false;
      canvas.style.cursor = 'grab';
      if (e.pointerId !== undefined && canvas.hasPointerCapture?.(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.camera.azimuth -= (e.clientX - lastX) * 0.008;
      // Clamped just short of the poles: at exactly vertical the up vector
      // becomes degenerate and the view flips.
      this.camera.elevation = Math.max(
        -1.45,
        Math.min(1.45, this.camera.elevation + (e.clientY - lastY) * 0.008),
      );
      lastX = e.clientX;
      lastY = e.clientY;
      this.requestDraw();
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.camera.distance = Math.max(
          this.minDistance,
          Math.min(this.maxDistance, this.camera.distance * Math.exp(e.deltaY * 0.0012)),
        );
        this.requestDraw();
      },
      { passive: false },
    );

    canvas.style.cursor = 'grab';
    canvas.style.touchAction = 'none';
  }

  /**
   * Coalesce redraws to one per frame.
   *
   * requestAnimationFrame does not fire in a hidden or non-compositing tab, so
   * a page loaded in the background would present an empty canvas until it was
   * brought forward. Falling back to a timeout keeps the buffer correct
   * regardless, at no cost when the tab is visible.
   */
  requestDraw() {
    if (this._pending) return;
    this._pending = true;
    // Same reasoning as scheduleSolve() in main.js: arm both a frame callback
    // and a timer so a starved rAF cannot leave the latch raised and freeze
    // every future redraw.
    let raf = null;
    let timer = null;
    const run = () => {
      if (!this._pending) return;
      this._pending = false;
      if (raf !== null) cancelAnimationFrame(raf);
      if (timer !== null) clearTimeout(timer);
      this.draw();
    };
    if (!document.hidden) raf = requestAnimationFrame(run);
    timer = setTimeout(run, 24);
  }

  setGeometry(mesh, scale) {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);

    const upload = (buffer, data, location, size) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    };
    upload(this.buffers.position, mesh.positions, 0, 3);
    upload(this.buffers.normal, mesh.normals, 1, 3);
    upload(this.buffers.uv, mesh.uvs, 2, 2);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    this.indexCount = mesh.count;

    gl.bindVertexArray(null);
    // A FIXED scene scale, supplied by the caller. It used to be 1/extent,
    // which normalised every food to the same on-screen size and so hid the
    // size sliders completely. See SCENE_PER_METRE in mesh.js.
    this.scale = scale > 0 ? scale : 1;
  }

  /**
   * Upload the surrounding equipment.
   *
   * Parts are stored with their own buffers because each is drawn in its own
   * colour; there are only a handful, so the extra draw calls are irrelevant
   * next to the clarity of keeping them separate.
   */
  setEquipment(parts) {
    const gl = this.gl;
    for (const old of this.equipParts) {
      gl.deleteVertexArray(old.vao);
      gl.deleteBuffer(old.position);
      gl.deleteBuffer(old.normal);
      gl.deleteBuffer(old.index);
    }
    this.equipParts = [];

    for (const part of parts) {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const position = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, position);
      gl.bufferData(gl.ARRAY_BUFFER, part.mesh.positions, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      const normal = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, normal);
      gl.bufferData(gl.ARRAY_BUFFER, part.mesh.normals, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      const index = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, part.mesh.indices, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      this.equipParts.push({ vao, position, normal, index, count: part.mesh.count, color: part.color });
    }
  }

  /**
   * Upload the heating-medium particle field.
   *
   * Takes an ARRAY of sets, because the retort needs two with different
   * placement: the body of steam circulating in the annulus around the can,
   * and the plume escaping from the vent at the top. The vent plume is the
   * cue that makes the picture instantly readable as steam.
   *
   * @param sets  [{ seed, size, count, bounds }] or null to clear
   */
  setMedium(sets) {
    const gl = this.gl;
    for (const old of this.mediumSets) {
      gl.deleteVertexArray(old.vao);
      gl.deleteBuffer(old.seed);
      gl.deleteBuffer(old.size);
      if (old.origin) gl.deleteBuffer(old.origin);
    }
    this.mediumSets = [];
    if (!sets || !sets.length) return;

    for (const set of sets) {
      if (!set || !set.count) continue;
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const seed = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, seed);
      gl.bufferData(gl.ARRAY_BUFFER, set.seed, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      const size = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, size);
      gl.bufferData(gl.ARRAY_BUFFER, set.size, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);

      // Jet sets carry a per-particle nozzle origin; fill sets do not, and the
      // attribute is left at its default for them.
      let origin = null;
      if (set.origin) {
        origin = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, origin);
        gl.bufferData(gl.ARRAY_BUFFER, set.origin, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
      }
      gl.bindVertexArray(null);
      this.mediumSets.push({ vao, seed, size, origin, count: set.count, bounds: set.bounds });
    }
  }

  /** Advance the animation clock, in seconds. */
  setTime(seconds) {
    this.time = seconds;
  }

  /**
   * Project a world point to CSS pixels within the canvas.
   *
   * Used to hang part labels off the model so the view reads as a labelled
   * engineering drawing rather than a picture. Returns null when the point is
   * behind the camera, so callers can simply hide the label.
   */
  project(p) {
    const vp = this._viewProj;
    if (!vp) return null;
    const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
    const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
    const w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
    if (!(w > 1e-6)) return null;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    return { x: ((x / w) * 0.5 + 0.5) * cw, y: (0.5 - (y / w) * 0.5) * ch, depth: w };
  }

  /** Upload the already colour-mapped field. */
  setField(rgba, width, height) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  }

  draw() {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.indexCount) return;

    const { azimuth, elevation, distance } = this.camera;
    const ce = Math.cos(elevation);
    const eye = [
      distance * ce * Math.cos(azimuth),
      distance * Math.sin(elevation),
      distance * ce * Math.sin(azimuth),
    ];
    const view = mat4LookAt(eye, [0, 0, 0], [0, 1, 0]);
    const proj = mat4Perspective(FOV_Y, w / h, 0.05, 60);

    // Kept for project(); the label layer needs the same transform the frame
    // was actually drawn with, not a recomputed approximation of it.
    this._viewProj = multiply4(proj, view);

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.projection, false, proj);
    gl.uniformMatrix4fv(this.uniforms.view, false, view);
    gl.uniform1f(this.uniforms.scale, this.scale);
    // Light rides with the camera so no face is ever left unreadably dark.
    const len = Math.hypot(eye[0], eye[1] + 0.6, eye[2]) || 1;
    gl.uniform3f(this.uniforms.lightDir, eye[0] / len, (eye[1] + 0.6) / len, eye[2] / len);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uniforms.field, 0);

    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);

    // --- equipment: translucent, drawn after the food ---
    // Depth WRITES are disabled so the shell never hides the food behind it,
    // while depth TESTING stays on so parts genuinely behind the food are
    // still occluded by it. Blending is plain source-alpha; with only a few
    // convex shells there is nothing to gain from sorting.
    if (this.equipParts.length) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);

      gl.useProgram(this.equipProgram);
      gl.uniformMatrix4fv(this.equipUniforms.projection, false, proj);
      gl.uniformMatrix4fv(this.equipUniforms.view, false, view);
      gl.uniform3f(this.equipUniforms.lightDir, eye[0] / len, (eye[1] + 0.6) / len, eye[2] / len);

      for (const part of this.equipParts) {
        gl.uniform4f(this.equipUniforms.color, part.color[0], part.color[1], part.color[2], part.color[3]);
        gl.bindVertexArray(part.vao);
        gl.drawElements(gl.TRIANGLES, part.count, gl.UNSIGNED_INT, 0);
      }
      gl.bindVertexArray(null);

      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // --- heating medium: soft animated points in the annulus ---
    // Drawn last, still depth-tested, so wisps behind the can are correctly
    // hidden by it and the food never looks like it is floating in front of a
    // flat backdrop.
    if (this.mediumSets.length) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);

      const u = this.mediumUniforms;
      gl.useProgram(this.mediumProgram);
      gl.uniformMatrix4fv(u.projection, false, proj);
      gl.uniformMatrix4fv(u.view, false, view);
      gl.uniform1f(u.time, this.time);
      // Scale point size with the drawing-buffer height so puffs keep their
      // apparent size on a projector as well as on a laptop.
      gl.uniform1f(u.pointScale, h / 900);

      for (const set of this.mediumSets) {
        const m = set.bounds;
        gl.uniform1f(u.rInner, m.rInner);
        gl.uniform1f(u.rOuter, m.rOuter);
        gl.uniform1f(u.yBottom, m.yBottom);
        gl.uniform1f(u.yTop, m.yTop);
        gl.uniform3f(u.center, m.center[0], m.center[1], m.center[2]);
        gl.uniform1f(u.swirl, m.swirl);
        gl.uniform1f(u.grow, m.grow);
        gl.uniform1f(u.turb, m.turb);
        gl.uniform1f(u.wispy, m.wispy);
        gl.uniform1f(u.mode, m.mode ?? 0);
        gl.uniform2f(u.jet, m.jetLength ?? 1, m.jetCone ?? 0.2);
        gl.uniform4f(u.color, m.color[0], m.color[1], m.color[2], m.color[3]);
        gl.bindVertexArray(set.vao);
        gl.drawArrays(gl.POINTS, 0, set.count);
      }
      gl.bindVertexArray(null);

      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
  }

  resetView() {
    this.camera = { azimuth: 0.45, elevation: 0.34, distance: this.defaultDistance ?? 3.4 };
    this.requestDraw();
  }
}
