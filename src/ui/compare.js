/**
 * Compare mode: pin a run, change something, see both at once.
 *
 * Rather than duplicating the whole interface into two panes -- which halves
 * the size of everything on a projector -- a pinned run is overlaid on the
 * existing plots as a dashed series and tabulated beside the live one. The
 * comparison a student needs is almost always ONE number against another
 * (how much longer, how much hotter), and a difference column answers that
 * directly where two side-by-side charts would leave them eyeballing it.
 */

import { degC, duration, fixed, dimensionless } from '../core/units.js';

/** Snapshot the quantities worth comparing, so the pin survives re-solving. */
function snapshot(state, der, result) {
  if (!result) return null;

  const base = {
    scenario: state.scenario,
    label: describe(state, result),
    kind: result.kind,
  };

  if (result.kind === 'exchanger') {
    return {
      ...base,
      rows: [
        ['Arrangement', result.arrangement === 'counter' ? 'Counter-current' : 'Co-current', null],
        ['Effectiveness ε', dimensionless(result.eps, 4), result.eps],
        ['NTU', dimensionless(result.NTU, 3), result.NTU],
        ['Milk outlet', degC(result.TcOut, 2), result.TcOut],
        ['Duty', `${fixed(result.Q / 1000, 1)} kW`, result.Q / 1000],
        ['Hold (fastest)', `${fixed(result.hold.fastestParticleTime, 1)} s`, result.hold.fastestParticleTime],
      ],
    };
  }

  if (result.kind === 'freeze') {
    return {
      ...base,
      rows: [
        ['Plank freezing time', duration(result.plank.time, 1), result.plank.time / 60],
        ['Pre-cooling', result.tPrecool === null ? '—' : duration(result.tPrecool, 1), (result.tPrecool ?? 0) / 60],
        ['Total to −18 °C', Number.isFinite(result.totalTime) ? duration(result.totalTime, 1) : '—', (result.totalTime ?? 0) / 60],
        ['Film share of resistance', `${Math.round(result.plank.surfaceFraction * 100)} %`, result.plank.surfaceFraction * 100],
        ['Latent heat', `${fixed(result.latentHeat / 1000, 0)} kJ/kg`, result.latentHeat / 1000],
      ],
    };
  }

  const n = result.nFrames;
  const F = result.lethality?.total ?? 0;
  const tt = result.lethality?.timeToTarget ?? null;
  return {
    ...base,
    times: result.times,
    Tcenter: result.Tcenter,
    rows: [
      ['Biot number', dimensionless(der.Bi, 3), der.Bi],
      ['Centre at end', degC(result.Tcenter[n], 1), result.Tcenter[n]],
      ['F₀ at end', `${fixed(F, 2)} min`, F],
      ['Time to target F₀', tt === null ? 'not reached' : duration(tt, 1), tt === null ? null : tt / 60],
    ],
  };
}

/** A short human description of what makes this run distinct. */
function describe(state, result) {
  if (result.kind === 'exchanger') {
    return `${result.arrangement === 'counter' ? 'Counter' : 'Co'}-current, A = ${fixed(state.area, 1)} m²`;
  }
  if (state.geometry === 'slab') return `Slab, L = ${fixed(state.halfThickness * 1000, 1)} mm, h = ${fixed(state.h, 0)}`;
  const h = state.scenario === 'chill' ? state.chillH : state.h;
  return `${state.geometry === 'finiteCylinder' ? 'Can' : state.geometry}, R = ${fixed(state.radius * 1000, 1)} mm, h = ${fixed(h, 0)}`;
}

export function createComparePanel() {
  let container = null;
  let pinned = null;
  let live = null;

  function render() {
    if (!container) return;
    if (!pinned) {
      container.innerHTML = `
        <p class="note">Set the simulator up however you like, then pin it as <strong>Run A</strong>.
        Change anything — can size, h, arrangement — and the two runs appear side by side, with
        Run A overlaid on the plots as a dashed line.</p>
        <div class="teach-nav"><button type="button" id="pin" class="primary">Pin current as Run A</button></div>`;
      container.querySelector('#pin').addEventListener('click', () => {
        pinned = live;
        render();
      });
      return;
    }

    const mismatch = live && live.kind !== pinned.kind;
    const rows = pinned.rows.map((row, i) => {
      const bCell = live && !mismatch ? live.rows[i] : null;
      let delta = '—';
      if (bCell && typeof row[2] === 'number' && typeof bCell[2] === 'number') {
        const d = bCell[2] - row[2];
        const sign = d > 0 ? '+' : '';
        delta = `${sign}${fixed(d, Math.abs(d) < 10 ? 2 : 1)}`;
      }
      return `<tr><th>${row[0]}</th><td>${row[1]}</td><td>${bCell ? bCell[1] : '—'}</td><td class="delta">${delta}</td></tr>`;
    });

    container.innerHTML = `
      <table class="compare-table">
        <thead><tr><th></th><th>Run A (pinned)</th><th>Run B (live)</th><th>B − A</th></tr></thead>
        <tbody>
          <tr class="compare-label"><th></th><td>${pinned.label}</td><td>${live && !mismatch ? live.label : '—'}</td><td></td></tr>
          ${rows.join('')}
        </tbody>
      </table>
      ${mismatch ? '<p class="note note-warn">Run B is a different kind of process, so only Run A is shown. Switch back to compare like with like.</p>' : ''}
      <div class="teach-nav">
        <button type="button" id="repin">Re-pin from current</button>
        <button type="button" id="clear">Clear</button>
      </div>`;

    container.querySelector('#repin').addEventListener('click', () => {
      pinned = live;
      render();
    });
    container.querySelector('#clear').addEventListener('click', () => {
      pinned = null;
      render();
    });
  }

  return {
    /** Attach to a container. The panel is rebuilt whenever the mode changes. */
    mount(el) {
      container = el;
      render();
    },
    update(state, der, result) {
      live = snapshot(state, der, result);
      render();
    },
    /** The pinned conduction history, for overlaying on the plots. */
    baseline() {
      return pinned && pinned.times ? { times: pinned.times, Tcenter: pinned.Tcenter, label: 'Run A' } : null;
    },
  };
}
