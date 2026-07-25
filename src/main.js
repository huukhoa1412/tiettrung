/**
 * Entry point: wire the store, the control panel, the readout and the solver.
 *
 * RECOMPUTE STRATEGY
 * Solving is cheap (a few milliseconds to about sixty for the 2-D can) but not
 * free, and a dragged slider fires many input events per second. So a change
 * only marks the model dirty; the actual solve happens once per animation
 * frame. That bounds the work to one solve per repaint no matter how fast the
 * slider moves, which is what keeps the interface inside its response budget.
 *
 * Playback moves through PRECOMPUTED frames, so scrubbing never triggers
 * physics and stays smooth regardless of mesh size.
 *
 * FRAME INDEXING
 * `state.frame` is a FLOAT while playing, because playback advances it by a
 * fractional number of frames each tick. Every use of it as an ARRAY INDEX
 * must round first: a typed array indexed at 1.5 returns undefined, not an
 * interpolated value, and the resulting NaN propagates silently into whatever
 * displays it. `frameIndex()` below is the single place that conversion
 * happens.
 */

import { createStore, defaultState, derived, SCENARIOS } from './core/state.js';
import { solveScenario } from './core/solve.js';
import { PRESETS, applyPreset, presetAppliedValues } from './core/presets.js';
import { createPanel } from './ui/panel.js';
import { createReadout } from './ui/readout.js';
import { createPlots } from './ui/plots.js';
import { createStage } from './render/stage.js';
import { MEDIA } from './render/medium.js';
import { renderEquations, SCENARIO_EQUATIONS, highlightSymbol } from './ui/mathblocks.js';
import { clock } from './core/units.js';

function boot() {
  const store = createStore(defaultState());
  const el = (id) => document.getElementById(id);

  /** The current frame as a valid integer index into the latest result. */
  const frameIndex = (result, frame) => {
    if (!result || !result.times) return 0;
    return Math.max(0, Math.min(result.nFrames, Math.round(frame)));
  };

  /* ------------------------- theme ------------------------- */
  const applyTheme = (theme) => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  };
  el('theme-toggle').addEventListener('click', () => {
    const order = ['auto', 'light', 'dark'];
    const next = order[(order.indexOf(store.get().theme) + 1) % order.length];
    store.set({ theme: next });
    applyTheme(next);
    el('theme-toggle').textContent = next === 'auto' ? 'Theme' : `Theme: ${next}`;
  });
  applyTheme(store.get().theme);

  /* ------------------------- tabs -------------------------- */
  function buildTabs(container, items, key) {
    container.innerHTML = '';
    const buttons = items.map((item) => {
      const b = document.createElement('button');
      b.className = 'tab';
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.textContent = item.label;
      b.addEventListener('click', () => store.set({ [key]: item.id }));
      container.appendChild(b);
      return { b, id: item.id };
    });
    return (state) => {
      for (const { b, id } of buttons) b.setAttribute('aria-selected', String(state[key] === id));
    };
  }

  const syncScenarioTabs = buildTabs(el('scenario-tabs'), Object.values(SCENARIOS), 'scenario');

  /* ---------------------- sub-components -------------------- */
  // Each preset is augmented with the exact values applying it would write, so
  // the panel can detect that the properties have since been edited by hand
  // and stop attributing them to a cited source. Computed once at boot.
  const PRESETS_WITH_VALUES = Object.fromEntries(
    Object.entries(PRESETS).map(([id, p]) => [id, { ...p, derived: presetAppliedValues(id) }]),
  );
  const presets = {
    all: () => PRESETS_WITH_VALUES,
    apply: (id, s) => applyPreset(id, s),
  };
  createPanel(el('control-panel'), store, presets);
  const readout = createReadout(el('metrics'), el('solve-note'));
  const plots = createPlots(el('plots'));
  const stage = createStage(el('stage'), store);

  // The reverse link: hovering a RESULT tile lights up the same symbol in the
  // equations and the control that drives it. A student who notices a number
  // behaving oddly can trace it back to its parameter without hunting.
  el('metrics').addEventListener('pointerover', (e) => {
    const t = e.target.closest('[data-sym]');
    highlightSymbol(t ? t.dataset.sym : null);
  });
  el('metrics').addEventListener('pointerleave', () => highlightSymbol(null));

  /* ------------------------ solve loop ---------------------- */
  let latest = null;
  let dirty = true;
  let scheduled = false;

  function runSolve() {
    if (dirty) {
      dirty = false;
      try {
        latest = solveScenario(store.get());
      } catch (err) {
        latest = null;
        el('solve-note').className = 'note note-warn';
        el('solve-note').textContent = `Solver error: ${err.message}`;
        console.error(err);
      }
      // A new solve may have fewer frames than the last (the frame count is
      // fixed, but the scenario can change shape entirely). Clamp so the
      // scrubber and every consumer stay inside the new result.
      if (latest && latest.times) {
        const s = store.get();
        if (s.frame > latest.nFrames) store.set({ frame: latest.nFrames });
      }
    }
    paint();
  }

  /**
   * Coalesce work to one solve per frame, WITHOUT making correctness depend on
   * requestAnimationFrame ever firing.
   *
   * rAF is the right coalescing signal when it runs, but there are real
   * situations where it does not: a hidden tab, a window with no compositor,
   * some remote-desktop and virtual-machine setups, and headless rendering.
   * The previous version took the rAF path whenever `document.hidden` was
   * false and set a `scheduled` latch first — so in any of those environments
   * the callback never arrived, the latch stayed raised, and EVERY subsequent
   * parameter change was silently dropped. The controls still moved and the
   * store still updated; only the physics stopped. That is the worst possible
   * failure mode for a teaching tool, because the interface looks alive while
   * the numbers quietly stop being true.
   *
   * Both a frame callback and a timer are armed; whichever arrives first does
   * the work and disarms the other. Behaviour is unchanged where rAF works,
   * and guaranteed where it does not.
   */
  function scheduleSolve() {
    if (scheduled) return;
    scheduled = true;

    let rafHandle = null;
    let timerHandle = null;
    const run = () => {
      if (!scheduled) return;
      scheduled = false;
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
      if (timerHandle !== null) clearTimeout(timerHandle);
      rafHandle = timerHandle = null;
      runSolve();
    };

    if (!document.hidden) rafHandle = requestAnimationFrame(run);
    // ~1.5 frames at 60 Hz: long enough that rAF normally wins and we still
    // coalesce, short enough that a starved rAF is imperceptible.
    timerHandle = setTimeout(run, 24);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleSolve();
  });

  function paint() {
    const state = store.get();
    const der = derived(state);

    const scenario = SCENARIOS[state.scenario];
    el('scenario-title').textContent = scenario.label;
    el('scenario-blurb').textContent = scenario.blurb;

    syncScenarioTabs(state);

    // Each view is isolated. A throw inside one of them used to abort the rest
    // of paint(), leaving later panels showing the PREVIOUS scenario's numbers
    // -- which reads as a subtle wrong answer rather than as a failure, and is
    // far harder to notice than a blank panel.
    const safely = (label, fn) => {
      try {
        fn();
      } catch (err) {
        console.error(`${label} failed to render:`, err);
        el('solve-note').className = 'note note-warn';
        el('solve-note').textContent = `${label} could not be drawn: ${err.message}`;
      }
    };

    safely('Results', () => readout.render(state, der, latest));
    safely('Plots', () => plots.render(state, der, latest));
    safely('3-D view', () => stage.render(state, latest));

    // Playback stops itself at the end of the run, so the glyph is driven from
    // state here rather than only from the click handler -- otherwise the
    // button sits showing "pause" on a run that has already finished.
    el('play').textContent = state.playing ? '❚❚' : '▶';

    const hasFrames = latest && latest.times;
    const scrub = el('scrub');
    const transport = scrub.closest('.transport');
    transport.style.visibility = hasFrames ? 'visible' : 'hidden';
    if (hasFrames) {
      const f = frameIndex(latest, state.frame);
      scrub.max = String(latest.nFrames);
      scrub.value = String(f);
      el('clock').textContent = clock(latest.times[f]);
    }
  }

  store.subscribe((state, changed, physicsChanged) => {
    if (physicsChanged) dirty = true;

    // Choosing a heating medium sets a representative surface coefficient,
    // because that is a real physical consequence and not just a change of
    // picture. The slider stays free afterwards, so it is a starting point
    // rather than a lock.
    if (changed.has('heatingMedium')) {
      const spec = MEDIA[state.heatingMedium];
      if (spec) store.set({ h: spec.h });
    }
    if (changed.has('scenario')) {
      renderEquations(el('equations'), SCENARIO_EQUATIONS[state.scenario]);
      store.set({ frame: 0 });
    }
    scheduleSolve();
  });

  /* ------------------------ transport ----------------------- */
  el('scrub').addEventListener('input', (e) => {
    store.set({ frame: Number(e.target.value), playing: false });
  });

  let rafId = null;
  let lastStamp = 0;
  function tick(stamp) {
    const state = store.get();
    if (!state.playing || !latest?.times) {
      rafId = null;
      return;
    }
    const dt = (stamp - lastStamp) / 1000;
    lastStamp = stamp;
    // Play the whole process in about 12 seconds of wall time.
    const framesPerSecond = (latest.nFrames / 12) * state.playbackSpeed;
    const next = state.frame + dt * framesPerSecond;
    if (next >= latest.nFrames) store.set({ frame: latest.nFrames, playing: false });
    else store.set({ frame: next });
    rafId = requestAnimationFrame(tick);
  }

  el('play').addEventListener('click', () => {
    const state = store.get();
    const playing = !state.playing;
    // Restarting from the end should replay rather than sit still.
    const frame = playing && latest && state.frame >= latest.nFrames ? 0 : state.frame;
    store.set({ playing, frame });
    if (playing && rafId === null) {
      lastStamp = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  });

  /* -------------------------- start ------------------------- */
  renderEquations(el('equations'), SCENARIO_EQUATIONS[store.get().scenario]);
  applyPreset(store.get().presetId, store);
  // Solve and paint synchronously on first load, so the interface is never
  // blank waiting on a frame that a background tab will not deliver.
  runSolve();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
