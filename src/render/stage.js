/**
 * The visualisation stage: chooses a renderer, owns the view controls, and
 * keeps the colour bar in step with what is drawn.
 *
 * WebGL2 is preferred for solids and degrades to a 2-D cross-section without
 * comment if it is unavailable -- a lecture should never stop because a lab
 * machine has WebGL disabled. Which renderer is in use is reported in the
 * caption rather than hidden, so an instructor can tell at a glance whether
 * they are looking at the full 3-D view.
 */

import { FieldRenderer } from './gl.js';
import { Fallback2D } from './fallback2d.js';
import { ExchangerView } from './exchanger2d.js';
import { buildGeometryMesh } from './mesh.js';
import { buildFieldImage, buildFreezeFieldImage, fieldRange } from './field.js';
import { drawColorBar, COLORMAPS } from './colormap.js';
import {
  buildEquipment, equipmentLabel, RETORT_BOUNDS, retortNozzles, RETORT_ANCHORS,
} from './equipment.js';
import { buildMediumParticles, mediumColor, MEDIA, VENT_PLUME, NOZZLE_JET } from './medium.js';
import { sampleColormap } from './colormap.js';

export function createStage(container, store) {
  container.innerHTML = `
    <!-- Two canvases, deliberately. A canvas can hold only ONE context type
         for its whole lifetime: once getContext('webgl2') succeeds,
         getContext('2d') on the same element returns null for ever. Sharing
         one element between the WebGL field view and the Canvas-2-D exchanger
         view therefore cannot work, and fails silently rather than loudly. -->
    <div class="stage-view">
      <canvas id="stage-canvas"></canvas>
      <canvas id="stage-canvas-2d" hidden></canvas>
      <div class="stage-labels" id="stage-labels" aria-hidden="true"></div>
    </div>
    <div class="stage-overlay">
      <div class="stage-caption" id="stage-caption"></div>
      <div class="stage-controls">
        <label class="stage-ctl stage-check">
          <input type="checkbox" id="equip-toggle" checked> Equipment
        </label>
        <label class="stage-ctl">Cut
          <input type="range" id="cut-slider" min="0" max="100" value="50" aria-label="Cutaway">
        </label>
        <label class="stage-ctl">Colours
          <select id="cmap-select" aria-label="Colour map">
            ${COLORMAPS.map((c) => `<option value="${c.id}">${c.label}</option>`).join('')}
          </select>
        </label>
        <button type="button" id="view-reset">Reset view</button>
      </div>
    </div>
    <canvas class="stage-colorbar" id="stage-colorbar" aria-label="Temperature colour scale"></canvas>`;

  const canvas = container.querySelector('#stage-canvas');
  const canvas2d = container.querySelector('#stage-canvas-2d');
  const colorbar = container.querySelector('#stage-colorbar');
  const caption = container.querySelector('#stage-caption');
  const cutSlider = container.querySelector('#cut-slider');
  const cmapSelect = container.querySelector('#cmap-select');

  const gl = FieldRenderer.create(canvas);
  // The 2-D renderers share the second canvas; only one is ever active.
  const fallback = gl ? null : new Fallback2D(canvas2d);
  const exchanger = new ExchangerView(canvas2d);
  const usingWebGL = Boolean(gl);

  /* ---------------------------------------------------------------------
   * Part callouts.
   *
   * Anchored to points on the 3-D model and re-projected every frame, so they
   * stay attached while the view is orbited. This is what turns the picture
   * into a labelled engineering drawing: a student can see that the thing at
   * the crown is the air vent, not decoration.
   * ------------------------------------------------------------------- */
  const labelLayer = container.querySelector('#stage-labels');
  const labelEls = new Map();

  function buildLabels(anchors) {
    labelLayer.innerHTML = '';
    labelEls.clear();
    for (const a of anchors) {
      const el = document.createElement('span');
      el.className = 'stage-label';
      el.textContent = a.label;
      labelLayer.appendChild(el);
      labelEls.set(a.id, { el, at: a.at });
    }
  }

  function updateLabels() {
    if (!gl || labelEls.size === 0) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    for (const { el, at } of labelEls.values()) {
      const p = gl.project(at);
      // Hide rather than clamp when a label falls behind the camera or off the
      // edge; a callout pinned to the frame border points at nothing.
      if (!p || p.x < 4 || p.x > w - 4 || p.y < 4 || p.y > h - 4) {
        el.style.opacity = '0';
        continue;
      }
      el.style.opacity = '1';
      el.style.transform = `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`;
    }
  }

  /** Show whichever canvas the active renderer owns. */
  function showCanvas(which) {
    canvas.hidden = which !== 'gl';
    canvas2d.hidden = which !== '2d';
  }
  showCanvas(usingWebGL ? 'gl' : '2d');

  const equipToggle = container.querySelector('#equip-toggle');

  let mode = null; // 'solid' | 'exchanger'
  let meshKey = '';
  let equipKey = '';
  let mediumKey = '';
  let latest = null;
  let animHandle = null;
  let animating = false;

  /**
   * Continuous redraw for the medium animation.
   *
   * This runs independently of playback: the steam keeps circulating even when
   * the process clock is paused, because the retort is still a retort. It stops
   * entirely when no medium is shown, so a paused, equipment-off view costs
   * nothing.
   */
  function startAnimation() {
    if (animating || !gl) return;
    animating = true;
    const tick = () => {
      if (!animating) {
        animHandle = null;
        return;
      }
      gl.setTime(performance.now() / 1000);
      gl.draw();
      updateLabels();
      animHandle = document.hidden ? setTimeout(tick, 200) : requestAnimationFrame(tick);
    };
    animHandle = document.hidden ? setTimeout(tick, 0) : requestAnimationFrame(tick);
  }

  function stopAnimation() {
    animating = false;
    if (animHandle !== null) {
      cancelAnimationFrame(animHandle);
      clearTimeout(animHandle);
      animHandle = null;
    }
  }

  cmapSelect.value = store.get().colormap;
  cutSlider.value = String(Math.round(store.get().cutaway * 100));
  equipToggle.checked = store.get().showEquipment;

  cutSlider.addEventListener('input', () => {
    store.set({ cutaway: Number(cutSlider.value) / 100 });
  });
  equipToggle.addEventListener('change', () => {
    store.set({ showEquipment: equipToggle.checked });
  });
  cmapSelect.addEventListener('change', () => {
    store.set({ colormap: cmapSelect.value });
  });
  container.querySelector('#view-reset').addEventListener('click', () => {
    (gl ?? fallback)?.resetView();
    render(store.get(), latest, true);
  });

  window.addEventListener('resize', () => render(store.get(), latest, true));

  function render(state, result, force = false) {
    latest = result;
    if (!result) return;

    const wantMode = result.kind === 'exchanger' ? 'exchanger' : 'solid';
    if (wantMode !== mode) {
      mode = wantMode;
      if (mode !== 'exchanger') exchanger.destroy();
      meshKey = '';
    }

    if (mode === 'exchanger') {
      showCanvas('2d');
      stopAnimation();
      mediumKey = '';
      exchanger.update(result, state.frame, state, state.colormap);
      caption.textContent = 'Drag nothing — this view animates continuously. Tracers show each stream’s true direction.';
      const tLo = Math.min(state.TcoldIn, result.ThOut);
      const tHi = Math.max(state.ThotIn, result.TcOut);
      drawColorBar(colorbar, { name: state.colormap, tMin: tLo, tMax: tHi });
      container.querySelector('.stage-controls').style.visibility = 'hidden';
      return;
    }

    container.querySelector('.stage-controls').style.visibility = 'visible';
    showCanvas(usingWebGL ? 'gl' : '2d');

    // Rebuild geometry only when its shape actually changes; the field texture
    // is what updates every frame.
    // A freeze run reports the geometry it actually solved -- Plank's shape
    // factors are not defined for a finite cylinder, so that case is solved as
    // an infinite one and must be drawn as one too.
    const geometry = result.geometry ?? state.geometry;
    const key = [
      geometry, state.radius, state.canHeight, state.halfThickness,
      Math.round(state.cutaway * 100),
    ].join(':');
    if (key !== meshKey || force) {
      meshKey = key;
      const { mesh, extent } = buildGeometryMesh(geometry, state, state.cutaway);
      if (gl) gl.setGeometry(mesh, extent);
    }

    // Equipment depends only on the scenario and the toggle, so it is rebuilt
    // far less often than the field.
    const wantEquip = gl && state.showEquipment ? `${state.scenario}:${state.heatingMedium}` : 'none';
    if (wantEquip !== equipKey || force) {
      if (gl) {
        const parts = wantEquip === 'none' ? [] : buildEquipment(state.scenario, state);
        gl.setEquipment(parts);
        // Reframe: the vessel is roughly three times the size of the food, so
        // without this the equipment would sit outside the frustum entirely.
        gl.setFraming(parts.length ? 2.95 : 1.15);
        buildLabels(parts.length && state.scenario === 'retort' ? RETORT_ANCHORS : []);
      }
      // The key is committed only AFTER the work succeeds. Setting it first
      // meant that if the build threw, every later render skipped the block
      // and the error message was overwritten by the next normal paint --
      // the failure then looked like a silent visual glitch rather than a bug.
      equipKey = wantEquip;
    }

    // --- heating medium ---------------------------------------------------
    // Only the retort has one to show. The particles live in the annulus
    // between the can's own outer radius (in normalised units) and the vessel
    // wall, which is exactly where the medium physically is.
    const showMedium = gl && state.showEquipment && state.scenario === 'retort';
    const wantMedium = showMedium ? `${state.heatingMedium}:${state.colormap}` : 'none';
    if (wantMedium !== mediumKey || force) {
      if (gl && !showMedium) {
        gl.setMedium(null);
        stopAnimation();
      } else if (gl) {
        const spec = MEDIA[state.heatingMedium] ?? MEDIA.steam;
        const isSteam = state.heatingMedium === 'steam';
        // The food is normalised so its largest half-extent is 1; the can's
        // radius in those units is what the medium must clear.
        const extent = Math.max(state.radius, state.canHeight / 2);
        const canR = state.radius / extent;
        const color = mediumColor(sampleColormap, state.colormap, spec.whiteness, spec.alpha);

        const sets = [
          {
            ...buildMediumParticles(spec),
            bounds: {
              rInner: canR * 1.05,
              rOuter: RETORT_BOUNDS.radius * 0.94,
              yBottom: RETORT_BOUNDS.yBottom + 0.06,
              yTop: isSteam ? RETORT_BOUNDS.yTop + 0.05 : RETORT_BOUNDS.waterLevel,
              center: [0, 0, 0],
              swirl: spec.swirl,
              grow: spec.grow,
              turb: spec.turb,
              wispy: spec.wispy,
              color,
            },
          },
        ];

        // Conical fans fired inward from every wall nozzle. Both media are
        // distributed this way -- a spray retort sprays whether it is running
        // steam or superheated water -- so the jets are always present.
        const nozzles = retortNozzles();
        sets.push({
          ...buildMediumParticles(NOZZLE_JET, 55117, nozzles),
          bounds: {
            rInner: 0, rOuter: 0, yBottom: 0, yTop: 0,
            center: [0, 0, 0],
            swirl: 0,
            grow: NOZZLE_JET.grow,
            turb: NOZZLE_JET.turb,
            wispy: NOZZLE_JET.wispy,
            mode: 1,
            jetLength: RETORT_BOUNDS.radius * NOZZLE_JET.throwFraction,
            jetCone: NOZZLE_JET.cone,
            color: [color[0], color[1], color[2], NOZZLE_JET.alpha],
          },
        });

        // Steam escaping the vent. Nothing signals "this vessel is full of
        // steam" faster than seeing some of it leave.
        if (isSteam) {
          sets.push({
            ...buildMediumParticles(VENT_PLUME, 991733),
            bounds: {
              rInner: 0.02,
              rOuter: 0.15,
              yBottom: 0,
              // Kept short enough that the plume dissipates inside the framed
              // volume rather than being clipped by the edge of the viewport.
              yTop: 1.05,
              center: [0.8, RETORT_BOUNDS.yTop + 0.28, 0],
              swirl: VENT_PLUME.swirl,
              grow: VENT_PLUME.grow,
              turb: VENT_PLUME.turb,
              wispy: VENT_PLUME.wispy,
              color: [color[0], color[1], color[2], VENT_PLUME.alpha],
            },
          });
        }

        gl.setMedium(sets);
        startAnimation();
      }
      mediumKey = wantMedium; // committed only after the build succeeds
    }

    const isFreeze = result.kind === 'freeze';
    if (gl) {
      const img = isFreeze
        ? buildFreezeFieldImage(result, state.frame, state, state.colormap, 160)
        : buildFieldImage(result, state.frame, state, state.colormap, 160, 160);
      gl.setField(img.rgba, img.width, img.height);
      gl.requestDraw();
    } else {
      fallback.update(result, state.frame, state, state.colormap);
    }

    const [tLo, tHi] = fieldRange(state);
    drawColorBar(colorbar, { name: state.colormap, tMin: tLo, tMax: tHi });
    updateLabels();

    const equip = usingWebGL && state.showEquipment ? equipmentLabel(state.scenario) : '';
    const mediumText =
      showMedium && MEDIA[state.heatingMedium]
        ? ` · ${MEDIA[state.heatingMedium].label.toLowerCase()} at ${state.Tmedium.toFixed(1)} °C circulating around the can`
        : '';
    caption.textContent = usingWebGL
      ? `Drag to orbit · scroll to zoom${equip ? ` · inside ${equip}` : ''}${mediumText}`
      : 'Cross-section view (WebGL unavailable on this machine — the physics is unaffected)';
  }

  return { render, usingWebGL };
}
