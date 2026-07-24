/**
 * Live numeric readout.
 *
 * These are the numbers a student is meant to reason with, so they are large,
 * always carry units, and are annotated with what they MEAN rather than left
 * as bare figures. Where a value crosses a pedagogically important threshold
 * (Bi = 0.1 for lumped capacitance, F₀ = target, effectiveness at its
 * co-current ceiling) the tile changes state and says so.
 */

import { dimensionless, degC, duration, sig, power, fixed } from '../core/units.js';

/** Build one metric tile. */
function tile({ label, value, sub = '', wide = false, state = '', badge = '' }) {
  const classes = ['metric'];
  if (wide) classes.push('is-wide');
  if (state) classes.push(`is-${state}`);
  return `
    <div class="${classes.join(' ')}">
      <div class="metric-label"><span>${label}</span>${badge ? `<span class="badge badge-${badge.kind}">${badge.text}</span>` : ''}</div>
      <div class="metric-value">${value}</div>
      ${sub ? `<div class="metric-sub">${sub}</div>` : ''}
    </div>`;
}

export function createReadout(container, noteEl) {
  return {
    /**
     * @param state    app state
     * @param der      derived quantities
     * @param result   whatever the solver produced for the active scenario
     */
    render(state, der, result) {
      if (state.scenario === 'milk') renderMilk(container, noteEl, state, result);
      else if (state.scenario === 'chill') renderChill(container, noteEl, state, der, result);
      else renderRetort(container, noteEl, state, der, result);
    },
  };
}

/* ------------------------------------------------------------------ */
function renderRetort(container, noteEl, state, der, result) {
  const tiles = [];

  const lumped = der.lumpedValid;
  tiles.push(
    tile({
      label: 'Biot number',
      value: dimensionless(der.Bi, 3),
      sub: lumped
        ? 'Bi (V/A) &lt; 0.1 — lumped capacitance is acceptable'
        : 'Internal gradient matters; the centre lags the surface',
      state: lumped ? 'ok' : '',
      badge: lumped
        ? { kind: 'ok', text: 'LUMPED OK' }
        : { kind: 'warn', text: 'GRADIENT' },
    }),
  );

  tiles.push(
    tile({
      label: 'Fourier number',
      value: dimensionless(der.Fo(state.processTime), 3),
      sub: 'at end of process',
    }),
  );

  tiles.push(
    tile({
      label: 'Thermal diffusivity',
      value: sig(der.alpha, 3),
      sub: 'm²·s⁻¹',
    }),
  );

  if (der.BiAxial !== null) {
    tiles.push(
      tile({
        label: 'Biot (axial)',
        value: dimensionless(der.BiAxial, 3),
        sub: 'based on half-height',
      }),
    );
  } else {
    tiles.push(
      tile({
        label: 'Bi on V/A',
        value: dimensionless(der.BiLumped, 3),
        sub: 'the proper lumped criterion',
      }),
    );
  }

  if (result) {
    const n = result.nFrames;
    tiles.push(
      tile({
        label: 'Centre temperature',
        value: degC(result.Tcenter[n], 1),
        sub: `surface ${degC(result.Tsurface[n], 1)} · mean ${degC(result.Tmean[n], 1)}`,
        wide: true,
      }),
    );

    if (result.lethality) {
      const F = result.lethality.total;
      const hit = F >= state.targetF0;
      tiles.push(
        tile({
          label: 'F₀ at the cold spot',
          value: `${fixed(F, 2)} min`,
          sub: hit
            ? `target ${state.targetF0} min reached at ${duration(result.lethality.timeToTarget)}`
            : `target ${state.targetF0} min NOT reached in this process time`,
          wide: true,
          state: hit ? 'ok' : 'warn',
          badge: hit ? { kind: 'ok', text: 'SAFE' } : { kind: 'warn', text: 'UNDER-PROCESSED' },
        }),
      );
    }
  }

  container.innerHTML = tiles.join('');

  if (result) {
    noteEl.innerHTML =
      `Solved ${result.nFrames} frames on a ${result.meshLabel} mesh in ` +
      `<strong>${fixed(result.solveMs, 1)} ms</strong>. ` +
      `Energy balance closes to ${result.energyResidual.toExponential(1)}.`;
    noteEl.className = 'note';
  }
}

/* ------------------------------------------------------------------ */
function renderChill(container, noteEl, state, der, result) {
  const tiles = [];

  tiles.push(
    tile({
      label: 'Biot number',
      value: dimensionless(der.Bi, 3),
      sub: der.lumpedValid ? 'nearly uniform inside' : 'internal gradient matters',
      badge: der.lumpedValid ? { kind: 'ok', text: 'LUMPED OK' } : { kind: 'warn', text: 'GRADIENT' },
    }),
  );

  if (result?.plank) {
    const p = result.plank;
    tiles.push(
      tile({
        label: 'Plank freezing time',
        value: duration(p.time, 1),
        sub: 'phase change only — excludes cooling to T_f and below',
      }),
    );

    const pct = Math.round(p.surfaceFraction * 100);
    tiles.push(
      tile({
        label: 'Resistance split',
        value: `${pct} / ${100 - pct}`,
        sub: 'surface film / frozen-layer conduction',
        wide: true,
        badge:
          p.surfaceFraction > 0.6
            ? { kind: 'info', text: 'FILM-CONTROLLED — raise h' }
            : { kind: 'info', text: 'CONDUCTION-CONTROLLED — go thinner' },
      }),
    );

    tiles.push(
      tile({
        label: 'Latent heat',
        value: `${fixed(result.latentHeat / 1000, 0)} kJ·kg⁻¹`,
        sub: `${fixed(state.waterFraction * (1 - state.boundWaterFraction) * 100, 1)} % of mass freezes`,
      }),
    );

    tiles.push(
      tile({
        label: 'Total to core −18 °C',
        value: duration(result.totalTime, 1),
        sub: 'pre-cool + plateau + sub-cool',
      }),
    );
  }

  container.innerHTML = tiles.join('');

  noteEl.innerHTML =
    'Plank’s equation counts <strong>latent heat only</strong>: it assumes the food is already at ' +
    'its initial freezing point, freezes at a single temperature, and has constant frozen ' +
    'properties. It therefore <strong>underestimates</strong> real freezing time, typically by ' +
    '10–30 %. The legs either side of the plateau come from the transient conduction solver.';
  noteEl.className = 'note note-warn';
}

/* ------------------------------------------------------------------ */
function renderMilk(container, noteEl, state, result) {
  if (!result) {
    container.innerHTML = '';
    return;
  }

  const tiles = [];
  const atCeiling =
    result.ceiling !== null && Math.abs(result.eps - result.ceiling) / result.ceiling < 0.01;

  tiles.push(
    tile({
      label: 'Effectiveness ε',
      value: dimensionless(result.eps, 4),
      sub:
        result.ceiling !== null
          ? `co-current ceiling is ${dimensionless(result.ceiling, 4)}`
          : 'counter-current has no ceiling below 1',
      state: atCeiling ? 'warn' : 'ok',
      badge: atCeiling
        ? { kind: 'warn', text: 'AT CEILING' }
        : { kind: 'info', text: result.arrangement === 'counter' ? 'COUNTER' : 'CO-CURRENT' },
    }),
  );

  tiles.push(tile({ label: 'NTU', value: dimensionless(result.NTU, 3), sub: `C_r = ${dimensionless(result.Cr, 3)}` }));

  tiles.push(
    tile({
      label: 'Milk outlet',
      value: degC(result.TcOut, 2),
      sub: `target 72 °C · medium leaves at ${degC(result.ThOut, 1)}`,
      state: result.TcOut >= 72 ? 'ok' : 'warn',
      badge: result.TcOut >= 72 ? { kind: 'ok', text: 'AT TEMP' } : { kind: 'warn', text: 'TOO COLD' },
    }),
  );

  tiles.push(tile({ label: 'Duty Q', value: power(result.Q, 1), sub: `of ${power(result.Qmax, 1)} available` }));

  tiles.push(
    tile({
      label: 'LMTD',
      value: result.lmtdValid ? `${fixed(result.dTlm, 2)} K` : 'indeterminate',
      sub: result.lmtdValid
        ? `ΔT₁ = ${fixed(result.dT1, 2)} K · ΔT₂ = ${fixed(result.dT2, 2)} K`
        : 'streams have reached equilibrium at one end — use ε-NTU',
      wide: true,
      state: result.lmtdValid ? '' : 'warn',
    }),
  );

  if (result.hold) {
    const compliant = result.hold.fastestParticleTime >= 15;
    tiles.push(
      tile({
        label: 'Hold time (fastest particle)',
        value: `${fixed(result.hold.fastestParticleTime, 1)} s`,
        sub: `mean residence ${fixed(result.hold.meanResidenceTime, 1)} s · u_max/u_mean = ${result.hold.factor}`,
        wide: true,
        state: compliant ? 'ok' : 'warn',
        badge: compliant
          ? { kind: 'ok', text: '≥ 15 s' }
          : { kind: 'warn', text: 'BELOW 15 s' },
      }),
    );
  }

  container.innerHTML = tiles.join('');

  const checks = result.checks;
  noteEl.innerHTML =
    `Cross-checks — LMTD vs ε-NTU: ${checks.lmtdVsNtu === null ? 'n/a (indeterminate)' : checks.lmtdVsNtu.toExponential(1)}; ` +
    `stream energy balance: ${checks.energyBalance.toExponential(1)}; ` +
    `marched profile vs closed form: ${checks.profileOutlet.toExponential(1)}. ` +
    `All three should sit at round-off.`;
  noteEl.className = 'note';
}
