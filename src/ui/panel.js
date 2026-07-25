/**
 * Control panel: sliders paired with exact numeric inputs.
 *
 * Every control is declared as data, not markup, so a parameter can be added
 * in one place and appears with a slider, a typed input, correct units, a
 * range and an explanatory hint. Ranges are chosen to span the physically
 * sensible region for food processing and are deliberately generous at the
 * ends, because seeing a parameter pushed to an absurd value and watching the
 * result break is a legitimate way to learn what it does.
 *
 * Quantities that span decades (h, k, process time) use logarithmic sliders.
 * A linear slider for h from 5 to 15000 would put every realistic
 * natural-convection value in the leftmost 2 % of its travel.
 */

import { clamp, UNITS } from '../core/units.js';
import { renderEquation, highlightSymbol, GROUP_EQUATION } from './mathblocks.js';

/** Controls, grouped, per scenario. `visible` hides a control contextually. */
export const CONTROL_SPEC = {
  retort: [
    {
      title: 'Geometry',
      controls: [
        {
          key: 'geometry',
          type: 'segmented',
          label: 'Shape',
          options: [
            { value: 'finiteCylinder', label: 'Can' },
            { value: 'cylinder', label: 'Cylinder' },
            { value: 'slab', label: 'Slab' },
            { value: 'sphere', label: 'Sphere' },
          ],
        },
        {
          key: 'radius', type: 'slider', label: 'Radius', sym: 'R', unit: UNITS.mm,
          min: 0.005, max: 0.15, step: 0.0005, scale: 'lin', display: 'mm', decimals: 1,
          visible: (s) => s.geometry !== 'slab',
          hint: 'A 307×409 can has R = 43.65 mm.',
        },
        {
          key: 'canHeight', type: 'slider', label: 'Height', sym: 'H', unit: UNITS.mm,
          min: 0.02, max: 0.4, step: 0.001, scale: 'lin', display: 'mm', decimals: 1,
          visible: (s) => s.geometry === 'finiteCylinder',
          hint: 'Full height. The solver uses half of it, by symmetry about mid-height.',
        },
        {
          key: 'halfThickness', type: 'slider', label: 'Half-thickness', sym: 'L', unit: UNITS.mm,
          min: 0.002, max: 0.1, step: 0.0005, scale: 'lin', display: 'mm', decimals: 1,
          visible: (s) => s.geometry === 'slab',
          hint: 'Heated from both faces, so the characteristic length is HALF the slab.',
        },
      ],
    },
    {
      title: 'Food properties',
      controls: [
        { key: 'presetId', type: 'preset', label: 'Preset' },
        {
          key: 'k', type: 'slider', label: 'Thermal conductivity', sym: 'k', unit: UNITS.k,
          min: 0.1, max: 2.5, step: 0.005, scale: 'lin', decimals: 3,
        },
        {
          key: 'rho', type: 'slider', label: 'Density', sym: 'ρ', unit: UNITS.rho,
          min: 300, max: 1600, step: 1, scale: 'lin', decimals: 0,
        },
        {
          key: 'cp', type: 'slider', label: 'Specific heat', sym: 'c_p', unit: UNITS.cp,
          min: 1000, max: 4400, step: 5, scale: 'lin', decimals: 0,
        },
      ],
    },
    {
      title: 'Retort process',
      controls: [
        {
          key: 'heatingMedium', type: 'segmented', label: 'Heating medium',
          options: [
            { value: 'steam', label: 'Saturated steam' },
            { value: 'water', label: 'Water immersion' },
          ],
          hint: 'Switching also sets a representative h — condensing steam transfers far better than hot water.',
        },
        {
          key: 'h', type: 'slider', label: 'Surface coefficient', sym: 'h', unit: UNITS.h,
          min: 2, max: 20000, step: 1, scale: 'log', decimals: 0,
          hint: 'Steam/air in a pilot retort: 1260–10310 (Tung et al. 1984). Still air ≈ 5–25; forced air ≈ 25–250.',
        },
        {
          key: 'Tinitial', type: 'slider', label: 'Initial temperature', sym: 'T_i', unit: UNITS.T,
          min: 0, max: 100, step: 0.5, scale: 'lin', decimals: 1,
        },
        {
          key: 'Tmedium', type: 'slider', label: 'Retort temperature', sym: 'T_∞', unit: UNITS.T,
          min: 90, max: 145, step: 0.1, scale: 'lin', decimals: 1,
          hint: 'Standard low-acid process runs at 121.1 °C (250 °F).',
        },
        {
          key: 'processTime', type: 'slider', label: 'Process time', sym: 't', unit: UNITS.minutes,
          min: 60, max: 21600, step: 30, scale: 'log', display: 'min', decimals: 0,
        },
      ],
    },
    {
      title: 'Lethality basis',
      controls: [
        {
          key: 'Tref', type: 'slider', label: 'Reference temperature', sym: 'T_ref', unit: UNITS.T,
          min: 100, max: 135, step: 0.1, scale: 'lin', decimals: 1,
        },
        {
          key: 'zValue', type: 'slider', label: 'z-value', sym: 'z', unit: 'K',
          min: 4, max: 20, step: 0.1, scale: 'lin', decimals: 1,
          hint: 'Temperature rise that multiplies the death rate tenfold. C. botulinum: 10 K.',
        },
        {
          key: 'targetF0', type: 'slider', label: 'Target F₀', sym: 'F₀', unit: UNITS.minutes,
          min: 0.5, max: 20, step: 0.1, scale: 'lin', decimals: 1,
          hint: 'The classic botulinum cook is F₀ = 3 min (a 12-D reduction).',
        },
      ],
    },
  ],

  chill: [
    {
      title: 'Geometry',
      controls: [
        {
          key: 'geometry', type: 'segmented', label: 'Shape',
          options: [
            { value: 'slab', label: 'Slab' },
            { value: 'cylinder', label: 'Cylinder' },
            { value: 'sphere', label: 'Sphere' },
          ],
          hint: 'Plank’s shape factors are defined for these three.',
        },
        {
          key: 'radius', type: 'slider', label: 'Radius', sym: 'R', unit: UNITS.mm,
          min: 0.005, max: 0.15, step: 0.0005, scale: 'lin', display: 'mm', decimals: 1,
          visible: (s) => s.geometry !== 'slab',
        },
        {
          key: 'halfThickness', type: 'slider', label: 'Half-thickness', sym: 'L', unit: UNITS.mm,
          min: 0.002, max: 0.1, step: 0.0005, scale: 'lin', display: 'mm', decimals: 1,
          visible: (s) => s.geometry === 'slab',
        },
      ],
    },
    {
      title: 'Unfrozen properties',
      controls: [
        { key: 'presetId', type: 'preset', label: 'Preset' },
        { key: 'k', type: 'slider', label: 'Conductivity', sym: 'k', unit: UNITS.k, min: 0.1, max: 2.5, step: 0.005, scale: 'lin', decimals: 3 },
        { key: 'rho', type: 'slider', label: 'Density', sym: 'ρ', unit: UNITS.rho, min: 300, max: 1600, step: 1, scale: 'lin', decimals: 0 },
        { key: 'cp', type: 'slider', label: 'Specific heat', sym: 'c_p', unit: UNITS.cp, min: 1000, max: 4400, step: 5, scale: 'lin', decimals: 0 },
      ],
    },
    {
      title: 'Frozen properties',
      controls: [
        {
          key: 'kFrozen', type: 'slider', label: 'Conductivity (frozen)', sym: 'k_f', unit: UNITS.k,
          min: 0.3, max: 2.5, step: 0.005, scale: 'lin', decimals: 3,
          hint: 'Ice conducts about four times better than water, so frozen k is much higher.',
        },
        { key: 'rhoFrozen', type: 'slider', label: 'Density (frozen)', sym: 'ρ_f', unit: UNITS.rho, min: 300, max: 1300, step: 1, scale: 'lin', decimals: 0 },
        { key: 'cpFrozen', type: 'slider', label: 'Specific heat (frozen)', sym: 'c_pf', unit: UNITS.cp, min: 1000, max: 3000, step: 5, scale: 'lin', decimals: 0 },
      ],
    },
    {
      title: 'Phase change',
      controls: [
        {
          key: 'freezingPoint', type: 'slider', label: 'Initial freezing point', sym: 'T_f', unit: UNITS.T,
          min: -10, max: 0, step: 0.05, scale: 'lin', decimals: 2,
          hint: 'Depressed below 0 °C by dissolved sugars and salts.',
        },
        {
          key: 'waterFraction', type: 'slider', label: 'Water content', sym: 'x_w', unit: 'mass fraction',
          min: 0.2, max: 0.95, step: 0.005, scale: 'lin', decimals: 3,
        },
        {
          key: 'boundWaterFraction', type: 'slider', label: 'Bound (unfreezable) water', sym: 'x_b', unit: 'of total water',
          min: 0, max: 0.3, step: 0.005, scale: 'lin', decimals: 3,
          hint: 'Water held by proteins and polysaccharides that never crystallises.',
        },
      ],
    },
    {
      title: 'Blast chiller',
      controls: [
        {
          key: 'chillH', type: 'slider', label: 'Surface coefficient', sym: 'h', unit: UNITS.h,
          min: 2, max: 500, step: 1, scale: 'log', decimals: 0,
          hint: 'Still air 5–20; forced-air blast 10–200; plate or immersion freezer 100–500 (Holden et al., Table 6.1.4).',
        },
        {
          key: 'chillMedium', type: 'slider', label: 'Air temperature', sym: 'T_∞', unit: UNITS.T,
          min: -60, max: 10, step: 0.5, scale: 'lin', decimals: 1,
        },
        { key: 'Tinitial', type: 'slider', label: 'Initial temperature', sym: 'T_i', unit: UNITS.T, min: -5, max: 90, step: 0.5, scale: 'lin', decimals: 1 },
      ],
    },
  ],

  milk: [
    {
      title: 'Arrangement',
      controls: [
        {
          key: 'arrangement', type: 'segmented', label: 'Flow arrangement',
          options: [
            { value: 'counter', label: 'Counter-current' },
            { value: 'parallel', label: 'Co-current' },
          ],
          hint: 'Switch between them and watch the effectiveness — this is the whole lesson.',
        },
      ],
    },
    {
      title: 'Milk (cold stream)',
      controls: [
        { key: 'mdotCold', type: 'slider', label: 'Mass flow', sym: 'ṁ_c', unit: UNITS.mdot, min: 0.05, max: 10, step: 0.01, scale: 'log', decimals: 2 },
        { key: 'cpCold', type: 'slider', label: 'Specific heat', sym: 'c_pc', unit: UNITS.cp, min: 3000, max: 4400, step: 5, scale: 'lin', decimals: 0 },
        { key: 'TcoldIn', type: 'slider', label: 'Inlet temperature', sym: 'T_c,in', unit: UNITS.T, min: 0, max: 60, step: 0.5, scale: 'lin', decimals: 1 },
      ],
    },
    {
      title: 'Heating medium (hot stream)',
      controls: [
        { key: 'mdotHot', type: 'slider', label: 'Mass flow', sym: 'ṁ_h', unit: UNITS.mdot, min: 0.05, max: 10, step: 0.01, scale: 'log', decimals: 2 },
        { key: 'cpHot', type: 'slider', label: 'Specific heat', sym: 'c_ph', unit: UNITS.cp, min: 3000, max: 4400, step: 5, scale: 'lin', decimals: 0 },
        { key: 'ThotIn', type: 'slider', label: 'Inlet temperature', sym: 'T_h,in', unit: UNITS.T, min: 40, max: 130, step: 0.5, scale: 'lin', decimals: 1 },
      ],
    },
    {
      title: 'Plate pack',
      controls: [
        {
          key: 'U', type: 'slider', label: 'Overall coefficient', sym: 'U', unit: UNITS.U,
          min: 200, max: 8000, step: 10, scale: 'log', decimals: 0,
          hint: 'Plate packs on milk/water duty run in the low thousands, falling as fouling builds. Order of magnitude only — check a design manual for a real duty.',
        },
        {
          key: 'area', type: 'slider', label: 'Heat transfer area', sym: 'A', unit: UNITS.area,
          min: 0.2, max: 80, step: 0.1, scale: 'log', decimals: 1,
          hint: 'Add plates to add area. Watch how effectiveness saturates.',
        },
      ],
    },
    {
      title: 'Holding tube',
      controls: [
        { key: 'tubeDiameter', type: 'slider', label: 'Inside diameter', sym: 'd', unit: UNITS.mm, min: 0.01, max: 0.1, step: 0.0005, scale: 'lin', display: 'mm', decimals: 1 },
        { key: 'tubeLength', type: 'slider', label: 'Length', sym: 'L', unit: UNITS.m, min: 0.5, max: 30, step: 0.1, scale: 'lin', decimals: 1 },
        {
          key: 'flowRegime', type: 'segmented', label: 'Flow regime',
          options: [
            { value: 'turbulent', label: 'Turbulent' },
            { value: 'laminar', label: 'Laminar' },
          ],
          hint: 'The FASTEST particle sets compliance: u_max/u_mean is 2.0 laminar, ≈1.2 turbulent.',
        },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Logarithmic slider mapping                                          */

const SLIDER_STEPS = 1000;

function toSlider(control, value) {
  if (control.scale === 'log') {
    const r = Math.log(value / control.min) / Math.log(control.max / control.min);
    return Math.round(clamp(r, 0, 1) * SLIDER_STEPS);
  }
  const r = (value - control.min) / (control.max - control.min);
  return Math.round(clamp(r, 0, 1) * SLIDER_STEPS);
}

function fromSlider(control, pos) {
  const r = pos / SLIDER_STEPS;
  const raw =
    control.scale === 'log'
      ? control.min * Math.pow(control.max / control.min, r)
      : control.min + r * (control.max - control.min);
  // Both scales snap to the box's own precision, so a dragged value and a
  // typed value are the same kind of number and the box never lies.
  return clamp(snapToBox(control, raw), control.min, control.max);
}

/** Value shown in the numeric box, which may use a display unit (mm, min). */
function toDisplay(control, value) {
  if (control.display === 'mm') return value * 1000;
  if (control.display === 'min') return value / 60;
  return value;
}

function fromDisplay(control, shown) {
  if (control.display === 'mm') return shown / 1000;
  if (control.display === 'min') return shown * 60;
  return shown;
}

/**
 * Snap a value to exactly what the numeric box will display.
 *
 * THE INVARIANT THIS ENFORCES: the number on screen IS the number solved.
 *
 * Previously only the linear branch snapped, and it snapped in STEP space
 * while the box rounded in DISPLAY space. On a logarithmic slider (h, process
 * time, area, flow rates) nothing snapped at all, so the box would read
 * "6000" while the solver ran 6003.47. The two disagreed permanently and
 * invisibly, which is precisely the class of defect that makes a teaching
 * tool untrustworthy: a student reading h off the panel and recomputing Bi by
 * hand would not reproduce the Bi shown.
 *
 * Rounding at the box's own precision makes the round trip idempotent by
 * construction, on either scale.
 */
function snapToBox(control, value) {
  const decimals = control.decimals ?? 2;
  const shown = Number(toDisplay(control, value).toFixed(decimals));
  return fromDisplay(control, shown);
}

/* ------------------------------------------------------------------ */

/**
 * Mount the control panel.
 *
 * @param container  element to render into
 * @param store      the app store
 * @param presets    preset registry (id -> {label, apply})
 */
export function createPanel(container, store, presets) {
  /** Rebuild rows whose visibility depends on other state. */
  const registry = [];

  function build() {
    const state = store.get();
    const groups = CONTROL_SPEC[state.scenario] ?? [];
    container.innerHTML = '';
    registry.length = 0;

    for (const group of groups) {
      const section = document.createElement('div');
      section.className = 'control-group';
      const heading = document.createElement('h3');
      heading.textContent = group.title;
      section.appendChild(heading);

      // The equation this group drives, shown INLINE with the sliders that
      // feed it. Keeping the maths beside the controls is the whole point:
      // a student should not have to look across the screen to find out what
      // the slider they are holding actually does.
      const eqId = GROUP_EQUATION[group.title];
      if (eqId) {
        const holder = document.createElement('div');
        holder.className = 'group-eq';
        renderEquation(holder, eqId, { compact: true });
        section.appendChild(holder);
      }

      for (const control of group.controls) {
        const row = renderControl(control, store, presets);
        if (row) {
          attachHighlight(row.element, control.key);
          section.appendChild(row.element);
          registry.push({ control, ...row });
        }
      }
      container.appendChild(section);
    }
    refresh();
  }

  /** Push current state values into the widgets, and apply visibility rules. */
  function refresh() {
    const state = store.get();
    for (const entry of registry) {
      const visible = entry.control.visible ? entry.control.visible(state) : true;
      entry.element.hidden = !visible;
      if (visible) entry.update(state);
    }
  }

  build();

  store.subscribe((state, changed) => {
    // A scenario change swaps the whole control set; a geometry change only
    // alters which rows are visible.
    if (changed.has('scenario')) build();
    else refresh();
  });

  return { refresh, rebuild: build };
}

/**
 * Light up this parameter's symbol wherever it appears.
 *
 * Hover and keyboard focus both trigger it, so the connection is available to
 * a student exploring with the mouse AND to one tabbing through. Dragging
 * holds the highlight until the pointer leaves, which is what makes the link
 * legible during the drag itself -- the moment the number is actually moving.
 */
function attachHighlight(el, key) {
  if (!key) return;
  el.dataset.param = key;
  const on = () => {
    el.classList.add('is-active');
    highlightSymbol(key);
  };
  const off = () => {
    el.classList.remove('is-active');
    highlightSymbol(null);
  };
  el.addEventListener('pointerenter', on);
  el.addEventListener('pointerleave', off);
  el.addEventListener('focusin', on);
  el.addEventListener('focusout', off);
}

function renderControl(control, store, presets) {
  const el = document.createElement('div');
  el.className = 'control';

  if (control.type === 'segmented') {
    el.innerHTML = `<div class="control-label">${control.label}</div><div></div>`;
    const rowEl = document.createElement('div');
    rowEl.className = 'radio-row';
    const buttons = control.options.map((opt) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = opt.label;
      b.addEventListener('click', () => store.set({ [control.key]: opt.value }));
      rowEl.appendChild(b);
      return { button: b, value: opt.value };
    });
    el.appendChild(rowEl);
    if (control.hint) {
      const hint = document.createElement('p');
      hint.className = 'control-hint';
      hint.textContent = control.hint;
      el.appendChild(hint);
    }
    return {
      element: el,
      update(state) {
        for (const { button, value } of buttons) {
          button.setAttribute('aria-pressed', String(state[control.key] === value));
        }
      },
    };
  }

  if (control.type === 'preset') {
    el.innerHTML = `<div class="control-label">${control.label}</div><div></div>`;
    const select = document.createElement('select');
    select.className = 'control-select';
    for (const [id, preset] of Object.entries(presets.all())) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = preset.label;
      select.appendChild(opt);
    }
    // A "Custom" entry, so the dropdown can honestly report that the
    // properties no longer match any preset.
    const customOpt = document.createElement('option');
    customOpt.value = '__custom';
    customOpt.textContent = 'Custom (edited)';
    customOpt.disabled = true;
    select.appendChild(customOpt);

    select.addEventListener('change', () => {
      if (select.value !== '__custom') presets.apply(select.value, store);
    });
    el.appendChild(select);

    const cite = document.createElement('p');
    cite.className = 'control-hint';
    el.appendChild(cite);

    return {
      element: el,
      update(state) {
        const preset = presets.all()[state[control.key]];
        // Once k, rho or c_p have been dragged away from the preset, the
        // citation underneath is no longer true of the numbers being solved.
        // Continuing to show "USDA FoodData Central 170104" beside edited
        // properties teaches students to trust a provenance that has been
        // silently invalidated -- so the row says so instead.
        const edited =
          preset &&
          (Math.abs(state.k - preset.derived.k) > 5e-4 ||
            Math.abs(state.rho - preset.derived.rho) > 0.5 ||
            Math.abs(state.cp - preset.derived.cp) > 0.5);

        select.value = edited ? '__custom' : (state[control.key] ?? '');
        customOpt.disabled = !edited;
        cite.innerHTML = !preset
          ? ''
          : edited
            ? `Properties edited by hand — no longer the cited ${preset.label} values.`
            : preset.source;
      },
    };
  }

  // --- slider + exact numeric input ---
  const unit = control.display === 'mm' ? UNITS.mm : control.display === 'min' ? UNITS.minutes : control.unit;
  const label = document.createElement('div');
  label.className = 'control-label';
  label.innerHTML = `${control.label} <span class="control-unit">${control.sym ? `${control.sym} · ` : ''}${unit}</span>`;

  const number = document.createElement('input');
  number.type = 'number';
  number.className = 'control-value';
  number.step = 'any';

  const range = document.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.max = String(SLIDER_STEPS);
  range.step = '1';
  range.setAttribute('aria-label', `${control.label} (${unit})`);

  el.append(label, number, range);

  if (control.hint) {
    const hint = document.createElement('p');
    hint.className = 'control-hint';
    hint.textContent = control.hint;
    el.appendChild(hint);
  }

  let suppress = false;

  range.addEventListener('input', () => {
    if (suppress) return;
    const value = fromSlider(control, Number(range.value));
    number.value = toDisplay(control, value).toFixed(control.decimals ?? 2);
    store.set({ [control.key]: value });
    highlightSymbol(control.key);
  });

  const decimals = control.decimals ?? 2;
  /** Force the box to display the value that is actually stored. */
  const showStored = () => {
    const v = store.get()[control.key];
    if (Number.isFinite(v)) number.value = toDisplay(control, v).toFixed(decimals);
  };

  const commitNumber = () => {
    const raw = number.value.trim();
    // An empty box means "I have not finished typing", not "use the minimum".
    // Number('') is 0, which would silently clamp to control.min.
    if (raw === '') {
      showStored();
      return;
    }
    const shown = Number(raw);
    if (!Number.isFinite(shown)) {
      showStored();
      return;
    }
    const value = clamp(snapToBox(control, fromDisplay(control, shown)), control.min, control.max);
    store.set({ [control.key]: value });
    // Write the accepted value back UNCONDITIONALLY. A typed value outside the
    // range is clamped in the store, and previously the box kept showing what
    // was typed -- so the panel could read "R = 200 mm" while every result on
    // screen was for 150 mm, and nothing ever corrected it because the store
    // saw no change and therefore never refreshed the row.
    showStored();
  };
  // `change` already covers Enter, blur-after-edit, spinners and arrow keys.
  // A separate blur handler additionally fired on blur WITHOUT an edit, which
  // re-committed and could snap a value the user never touched.
  number.addEventListener('change', commitNumber);

  return {
    element: el,
    update(state) {
      const value = state[control.key];
      if (!Number.isFinite(value)) return;
      suppress = true;
      range.value = String(toSlider(control, value));
      // Never overwrite the box while it is being typed into.
      if (document.activeElement !== number) {
        number.value = toDisplay(control, value).toFixed(decimals);
      }
      suppress = false;
    },
  };
}
