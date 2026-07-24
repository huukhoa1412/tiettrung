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
 */

import { createStore, defaultState, derived, SCENARIOS } from './core/state.js';
import { solveScenario } from './core/solve.js';
import { PRESETS, applyPreset } from './core/presets.js';
import { createPanel } from './ui/panel.js';
import { createReadout } from './ui/readout.js';
import { createPlots } from './ui/plots.js';
import { createStage } from './render/stage.js';
import { createLearnPanel, createQuizPanel } from './ui/teachpanel.js';
import { createComparePanel } from './ui/compare.js';
import { MEDIA } from './render/medium.js';
import { renderEquations, SCENARIO_EQUATIONS } from './ui/mathblocks.js';
import { clock } from './core/units.js';

const MODES = [
  { id: 'explore', label: 'Explore' },
  { id: 'learn', label: 'Learn' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'compare', label: 'Compare' },
];

function boot() {
  const store = createStore(defaultState());
  const el = (id) => document.getElementById(id);

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
  const syncModeTabs = buildTabs(el('mode-tabs'), MODES, 'mode');

  /* ---------------------- sub-components -------------------- */
  const presets = {
    all: () => PRESETS,
    apply: (id, s) => applyPreset(id, s),
  };
  createPanel(el('control-panel'), store, presets);
  const readout = createReadout(el('metrics'), el('solve-note'));
  const plots = createPlots(el('plots'));
  const stage = createStage(el('stage'), store);

  // The three teaching modes share one card; only the active one is built, so
  // a lesson's state is not lost by glancing at the quiz.
  const teachCard = el('teach-card');
  const teachPanel = el('teach-panel');
  const compare = createComparePanel();
  let mountedMode = null;

  function mountMode(mode) {
    if (mode === mountedMode) return;
    mountedMode = mode;
    teachCard.hidden = mode === 'explore';
    if (mode === 'explore') return;

    if (mode === 'learn') {
      el('teach-title').textContent = 'Guided lesson';
      teachPanel.innerHTML = '';
      createLearnPanel(teachPanel, store);
    } else if (mode === 'quiz') {
      el('teach-title').textContent = 'Quiz';
      teachPanel.innerHTML = '';
      createQuizPanel(teachPanel);
    } else if (mode === 'compare') {
      el('teach-title').textContent = 'Compare two runs';
      teachPanel.innerHTML = '';
      compare.mount(teachPanel);
    }
  }

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
    }
    paint();
  }

  function scheduleSolve() {
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      runSolve();
    };
    // requestAnimationFrame does not fire in a hidden or non-compositing tab.
    // Without this fallback a page opened in a background tab -- or restored
    // from one -- would sit with an empty results panel until it was brought
    // to the front, which looks exactly like a crash.
    if (document.hidden) setTimeout(run, 0);
    else requestAnimationFrame(run);
  }

  // Re-run on return to the foreground, in case anything was missed.
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
    syncModeTabs(state);

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

    mountMode(state.mode);
    safely('Results', () => readout.render(state, der, latest));
    safely('Plots', () => plots.render(state, der, latest, compare.baseline()));
    safely('3-D view', () => stage.render(state, latest));
    if (state.mode === 'compare') safely('Compare', () => compare.update(state, der, latest));

    // Playback stops itself at the end of the run, so the glyph is driven from
    // state here rather than only from the click handler -- otherwise the
    // button sits showing "pause" on a run that has already finished.
    el('play').textContent = state.playing ? '❚❚' : '▶';

    // Transport applies only to the time-marching scenarios.
    const hasFrames = latest && latest.times;
    const scrub = el('scrub');
    const transport = scrub.closest('.transport');
    transport.style.visibility = hasFrames ? 'visible' : 'hidden';
    if (hasFrames) {
      scrub.max = String(latest.nFrames);
      scrub.value = String(Math.min(state.frame, latest.nFrames));
      el('clock').textContent = clock(latest.times[Math.min(state.frame, latest.nFrames)]);
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
