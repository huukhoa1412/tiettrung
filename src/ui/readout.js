/**
 * Live results.
 *
 * DESIGN INTENT
 * These are the numbers a student is meant to reason with, so the panel is
 * built around three ideas rather than a uniform grid of tiles:
 *
 *   1. HIERARCHY. The centre temperature and F₀ are what the process is FOR,
 *      so they are large and first. Diagnostics come second, properties last.
 *   2. REGIME, NOT JUST VALUE. "Bi = 145" means nothing to a beginner.
 *      "Bi = 145, far into the conduction-controlled zone" means something.
 *      Bi and Fo therefore carry a log-scale gauge with the teaching
 *      thresholds marked, so the number is read as a POSITION on a scale.
 *   3. LIVE WITH THE ANIMATION. Every time-dependent number follows the
 *      scrubber, so the tile and the 3-D view can never disagree. A tile
 *      frozen at the end of the run while the picture animates is worse than
 *      no tile at all.
 *
 * Tiles carry data-sym so that touching a control lights up the tile, the
 * symbol in the equation, and the slider together.
 */

import { degC, duration, fixed, dimensionless, diffusivity, sigFigs, power } from '../core/units.js';
import { lethalityLabel, isF0Basis } from '../physics/lethality.js';

/* ------------------------------------------------------------------ */
/**
 * A logarithmic regime gauge.
 *
 * Zones are drawn as bands and the current value as a marker, so the reader
 * sees which side of a threshold they are on without having to remember what
 * the threshold was.
 */
function gauge(value, { min, max, zones = [], label = '' }) {
  if (!Number.isFinite(value) || value <= 0) return '';
  const lo = Math.log10(min);
  const hi = Math.log10(max);
  const pos = Math.min(100, Math.max(0, ((Math.log10(value) - lo) / (hi - lo)) * 100));

  const bands = zones
    .map((z) => {
      const a = Math.min(100, Math.max(0, ((Math.log10(z.from) - lo) / (hi - lo)) * 100));
      const b = Math.min(100, Math.max(0, ((Math.log10(z.to) - lo) / (hi - lo)) * 100));
      return `<span class="gauge-zone gauge-${z.tone}" style="left:${a}%;width:${b - a}%"
                title="${z.name}"></span>`;
    })
    .join('');

  return `
    <div class="gauge" role="img" aria-label="${label} ${dimensionless(value)}">
      <div class="gauge-track">${bands}<span class="gauge-mark" style="left:${pos}%"></span></div>
      <div class="gauge-scale"><span>${min}</span><span>${max}</span></div>
    </div>`;
}

/** Standard tile. `sym` links it to the equation symbol and the slider. */
function tile({ label, value, unit = '', sub = '', sym = '', span = 1, tone = '', badge = null, extra = '' }) {
  const cls = ['tile'];
  if (span > 1) cls.push(`tile-span${span}`);
  if (tone) cls.push(`tile-${tone}`);
  return `
    <div class="${cls.join(' ')}"${sym ? ` data-sym="${sym}"` : ''}>
      <div class="tile-head">
        <span class="tile-label">${label}</span>
        ${badge ? `<span class="badge badge-${badge.kind}">${badge.text}</span>` : ''}
      </div>
      <div class="tile-value">${value}${unit ? `<span class="tile-unit">${unit}</span>` : ''}</div>
      ${extra}
      ${sub ? `<div class="tile-sub">${sub}</div>` : ''}
    </div>`;
}

export function createReadout(container, noteEl) {
  return {
    render(state, der, result) {
      if (!result) {
        container.innerHTML = '';
        return;
      }
      if (result.kind === 'exchanger') renderMilk(container, noteEl, state, result);
      else if (result.kind === 'freeze') renderChill(container, noteEl, state, der, result);
      else renderRetort(container, noteEl, state, der, result);
    },
  };
}

/* ================================================================== */
function renderRetort(container, noteEl, state, der, result) {
  // Everything time-dependent reads the SCRUBBED frame, so the panel and the
  // animation always describe the same instant.
  const f = Math.max(0, Math.min(result.nFrames, Math.round(state.frame)));
  const tNow = result.times[f];
  const Tc = result.Tcenter[f];
  const Ts = result.Tsurface[f];
  const Tm = result.Tmean[f];
  const F0now = result.lethality ? result.lethality.F[f] : 0;
  const F0end = result.lethality ? result.lethality.total : 0;
  const target = state.targetF0;
  const hitAtEnd = F0end >= target;

  // How far through the run the scrubber is, so the reader knows whether they
  // are looking at a snapshot or the finished process.
  const atEnd = f === result.nFrames;

  const out = [];

  /* ---- headline: what the process is doing right now ---- */
  out.push(`<div class="tile-section">At ${duration(tNow, 1)}${atEnd ? ' — end of process' : ''}</div>`);

  const approach = state.Tmedium - Tc;
  out.push(
    tile({
      label: 'Cold-spot temperature',
      value: fixed(Tc, 1),
      unit: '°C',
      sym: 'Tcenter',
      span: 2,
      tone: 'hero',
      sub:
        `surface <strong>${fixed(Ts, 1)} °C</strong> · volume mean <strong>${fixed(Tm, 1)} °C</strong>` +
        ` · still <strong>${fixed(Math.abs(approach), 1)} °C</strong> from the medium`,
    }),
  );

  /* ---- lethality ---- */
  const pct = Math.min(100, (F0now / Math.max(target, 1e-9)) * 100);
  const bar = `
    <div class="progress" role="img" aria-label="F-zero ${fixed(F0now, 2)} of target ${target}">
      <span style="width:${pct}%"></span>
    </div>`;
  // F₀ means Tref = 121.1 °C with z = 10 °C, and nothing else. Off that basis
  // the quantity is still a valid F-value but must not be called F₀.
  const onBasis = isF0Basis(state.Tref, state.zValue);
  const Fname = lethalityLabel(state.Tref, state.zValue);

  out.push(
    tile({
      label: `Accumulated lethality ${Fname}`,
      value: fixed(F0now, 2),
      unit: 'min',
      sym: 'F0',
      span: 2,
      // The TONE reflects whether the finished process is safe; the BADGE
      // reflects this instant. A process that reaches target only at the very
      // end is not a failure, and colouring it red mid-run would say it was.
      tone: hitAtEnd ? (F0now >= target ? 'ok' : '') : 'warn',
      extra: bar,
      badge:
        F0now >= target
          ? { kind: 'ok', text: 'TARGET MET' }
          : { kind: 'warn', text: `${fixed(target, 1)} min NEEDED` },
      sub:
        (hitAtEnd
          ? `target reached at <strong>${duration(result.lethality.timeToTarget, 1)}</strong>` +
            ` · ${fixed(F0end, 2)} min by the end`
          : `only <strong>${fixed(F0end, 2)} min</strong> by the end of this process — under-processed`) +
        (onBasis
          ? ''
          : ` · <strong>not F₀</strong>: basis is ${fixed(state.Tref, 1)} °C, z = ${fixed(state.zValue, 1)} °C`),
    }),
  );

  /* ---- dimensionless diagnostics, with regime gauges ---- */
  out.push('<div class="tile-section">Dimensionless groups</div>');

  // Two DIFFERENT Biot numbers exist here and they must not be mixed up:
  //   Bi(L_c) — on the characteristic length. This is the one in the equation
  //             block and the one whose 0.1 / 10 thresholds describe the
  //             gradient regime, so it is the headline.
  //   Bi(V/A) — on the volume-to-surface ratio. This is the one the lumped-
  //             capacitance criterion is properly built on.
  // They differ by the shape factor (1/2 for a cylinder, 1/3 for a sphere), so
  // over a wide band of h they straddle 0.1 in opposite directions. Captioning
  // the first with a verdict computed from the second produced a tile that
  // read "0.273" directly above "below 0.1 — lumped applies". Each number now
  // carries only the statement it can actually support.
  out.push(
    tile({
      label: 'Biot number — on L<sub>c</sub>',
      value: dimensionless(der.Bi),
      sym: 'Bi',
      span: 2,
      extra: gauge(der.Bi, {
        min: 0.01,
        max: 1000,
        label: 'Biot number',
        zones: [
          { from: 0.01, to: 0.1, tone: 'ok', name: 'small gradient' },
          { from: 0.1, to: 10, tone: 'mid', name: 'transition' },
          { from: 10, to: 1000, tone: 'hot', name: 'conduction-controlled — the centre lags' },
        ],
      }),
      sub:
        der.Bi > 10
          ? 'above 10 — conduction inside the food is the bottleneck, not the film. Raising h barely helps.'
          : der.Bi < 0.1
            ? 'below 0.1 — the internal gradient is small'
            : 'in transition — both the film and internal conduction matter',
    }),
  );

  const FoNow = der.Fo(tNow);
  out.push(
    tile({
      label: 'Fourier number',
      value: dimensionless(FoNow),
      sym: 'Fo',
      span: 2,
      // No gauge at Fo = 0: the marker would have to be clamped to the axis
      // floor, showing a position the printed value ("0") does not support.
      extra: gauge(FoNow, {
        min: 0.001,
        max: 10,
        label: 'Fourier number',
        zones: [
          { from: 0.001, to: 0.2, tone: 'mid', name: 'early — many series terms still matter' },
          { from: 0.2, to: 10, tone: 'ok', name: 'one-term regime — Heisler charts valid' },
        ],
      }),
      sub:
        FoNow >= 0.2
          ? 'past 0.2 — only the first series term survives, so the one-term approximation is valid'
          : 'below 0.2 — still early; the one-term approximation would be inaccurate here',
    }),
  );

  /* ---- properties ---- */
  out.push('<div class="tile-section">Properties &amp; geometry</div>');

  out.push(
    tile({
      label: 'Thermal diffusivity α',
      value: diffusivity(der.alpha),
      unit: 'mm²/s',
      sym: 'alpha',
      sub: `= k / ρc<sub>p</sub> · SI: ${sigFigs(der.alpha * 1e7, 3)}×10⁻⁷ m²/s`,
    }),
  );

  out.push(
    tile({
      label: 'Characteristic length',
      value: fixed(der.L * 1000, 1),
      unit: 'mm',
      sym: state.geometry === 'slab' ? 'halfThickness' : 'radius',
      sub: state.geometry === 'slab' ? 'half-thickness' : 'radius',
    }),
  );

  out.push(
    tile({
      label: 'Surface coefficient',
      value: dimensionless(der.h),
      unit: 'W/m²K',
      sym: 'h',
      sub: state.heatingMedium === 'water' ? 'water immersion' : 'condensing steam',
    }),
  );

  // The lumped verdict lives on the tile that shows the number deciding it.
  // This tile is ALWAYS rendered: it used to be swapped out for the axial Biot
  // on the can geometry, which meant that for the default scenario the number
  // behind the LUMPED OK / GRADIENT badge appeared nowhere on screen.
  out.push(
    tile({
      label: 'Biot on V/A',
      value: dimensionless(der.BiLumped),
      sym: 'Bi',
      sub: der.lumpedValid
        ? 'below 0.1 — lumped capacitance is acceptable'
        : 'above 0.1 — the lumped model would be wrong here',
      badge: der.lumpedValid ? { kind: 'ok', text: 'LUMPED OK' } : { kind: 'warn', text: 'GRADIENT' },
    }),
  );

  if (der.BiAxial !== null) {
    out.push(
      tile({
        label: 'Biot — axial',
        value: dimensionless(der.BiAxial),
        sym: 'canHeight',
        sub: 'on the half-height, for heat entering the lids',
      }),
    );
  }

  container.innerHTML = out.join('');

  noteEl.innerHTML =
    `Solved ${result.nFrames} frames on a ${result.meshLabel} mesh in <strong>${fixed(result.solveMs, 0)} ms</strong>. ` +
    `Energy balance closes to ${result.energyResidual.toExponential(1)}.`;
  noteEl.className = 'note';
}

/* ================================================================== */
function renderChill(container, noteEl, state, der, result) {
  const out = [];
  out.push('<div class="tile-section">Freezing</div>');

  if (result.plank) {
    const p = result.plank;
    out.push(
      tile({
        label: 'Plank freezing time',
        value: fixed(p.time / 60, 1),
        unit: 'min',
        span: 2,
        tone: 'hero',
        sub: 'phase change only — excludes cooling to T_f and below',
      }),
    );

    const pctFilm = Math.round(p.surfaceFraction * 100);
    out.push(
      tile({
        label: 'Where the resistance is',
        value: `${pctFilm} / ${100 - pctFilm}`,
        span: 2,
        sym: 'chillH',
        extra: `<div class="progress progress-split"><span style="width:${pctFilm}%"></span></div>`,
        sub: 'surface film / frozen-layer conduction',
        badge:
          p.surfaceFraction > 0.6
            ? { kind: 'info', text: 'FILM-CONTROLLED — RAISE h' }
            : { kind: 'info', text: 'CONDUCTION-CONTROLLED — GO THINNER' },
      }),
    );

    out.push(
      tile({
        label: 'Latent heat',
        value: fixed(result.latentHeat / 1000, 0),
        unit: 'kJ/kg',
        sym: 'waterFraction',
        sub: `${fixed(state.waterFraction * (1 - state.boundWaterFraction) * 100, 1)} % of mass freezes`,
      }),
    );

    out.push(
      tile({
        label: 'Total to core −18 °C',
        value: Number.isFinite(result.totalTime) ? fixed(result.totalTime / 60, 0) : '--',
        unit: 'min',
        sub: 'pre-cool + plateau + sub-cool',
      }),
    );
  }

  out.push(
    tile({
      label: 'Biot number',
      value: dimensionless(der.Bi),
      sym: 'Bi',
      span: 2,
      extra: gauge(der.Bi, {
        min: 0.01,
        max: 1000,
        label: 'Biot number',
        zones: [
          { from: 0.01, to: 0.1, tone: 'ok', name: 'lumped' },
          { from: 0.1, to: 10, tone: 'mid', name: 'transition' },
          { from: 10, to: 1000, tone: 'hot', name: 'conduction-controlled' },
        ],
      }),
      // Same separation as the retort panel: the gauge and the value are
      // Bi(L_c); the lumped verdict belongs to Bi(V/A) and is stated on its
      // own tile rather than captioning a different number.
      sub:
        der.Bi > 10
          ? 'above 10 — conduction inside the food controls'
          : der.Bi < 0.1
            ? 'below 0.1 — small internal gradient'
            : 'in transition',
    }),
  );

  out.push(
    tile({
      label: 'Biot on V/A',
      value: dimensionless(der.BiLumped),
      sym: 'Bi',
      sub: der.lumpedValid ? 'lumped capacitance is acceptable' : 'the lumped model would be wrong here',
      badge: der.lumpedValid ? { kind: 'ok', text: 'LUMPED OK' } : { kind: 'warn', text: 'GRADIENT' },
    }),
  );

  container.innerHTML = out.join('');

  noteEl.innerHTML =
    'Plank’s equation counts <strong>latent heat only</strong>: it assumes the food is already at its initial ' +
    'freezing point, freezes at a single temperature, and has constant frozen properties. It therefore ' +
    '<strong>underestimates</strong> real freezing time, typically by 10–30 %.';
  noteEl.className = 'note note-warn';
}

/* ================================================================== */
function renderMilk(container, noteEl, state, result) {
  const out = [];
  const atCeiling =
    result.ceiling !== null && Math.abs(result.eps - result.ceiling) / result.ceiling < 0.01;

  out.push('<div class="tile-section">Exchanger performance</div>');

  out.push(
    tile({
      label: 'Milk outlet temperature',
      value: fixed(result.TcOut, 1),
      unit: '°C',
      span: 2,
      tone: result.TcOut >= 72 ? 'hero' : 'warn',
      sub: `target 72 °C · medium leaves at <strong>${fixed(result.ThOut, 1)} °C</strong>`,
      badge: result.TcOut >= 72 ? { kind: 'ok', text: 'PASTEURISED' } : { kind: 'warn', text: 'TOO COLD' },
    }),
  );

  out.push(
    tile({
      label: 'Effectiveness ε',
      value: dimensionless(result.eps),
      sym: 'arrangement',
      span: 2,
      extra: `<div class="progress"><span style="width:${Math.min(100, result.eps * 100)}%"></span></div>`,
      sub:
        result.ceiling !== null
          ? `co-current can never exceed <strong>${dimensionless(result.ceiling)}</strong>, however much area you buy`
          : 'counter-current has no ceiling below 1',
      badge: atCeiling ? { kind: 'warn', text: 'AT CEILING' } : null,
    }),
  );

  out.push('<div class="tile-section">Design numbers</div>');

  out.push(tile({ label: 'NTU', value: dimensionless(result.NTU), sym: 'area', sub: `C_r = ${dimensionless(result.Cr)}` }));
  out.push(tile({ label: 'Duty Q', value: power(result.Q, 0), sym: 'U', sub: `of ${power(result.Qmax, 0)} available` }));

  out.push(
    tile({
      label: 'LMTD',
      value: result.lmtdValid ? fixed(result.dTlm, 1) : '—',
      unit: result.lmtdValid ? 'K' : '',
      span: 2,
      tone: result.lmtdValid ? '' : 'warn',
      sub: result.lmtdValid
        ? `ΔT₁ = ${fixed(result.dT1, 1)} K · ΔT₂ = ${fixed(result.dT2, 1)} K`
        : 'indeterminate — the streams have reached equilibrium at one end. Use ε-NTU.',
    }),
  );

  if (result.hold) {
    const ok = result.hold.fastestParticleTime >= 15;
    out.push(
      tile({
        label: 'Hold time — fastest particle',
        value: fixed(result.hold.fastestParticleTime, 1),
        unit: 's',
        sym: 'tubeLength',
        span: 2,
        tone: ok ? 'ok' : 'warn',
        badge: ok ? { kind: 'ok', text: '≥ 15 s' } : { kind: 'warn', text: 'BELOW 15 s' },
        sub: `mean residence ${fixed(result.hold.meanResidenceTime, 1)} s · u_max/u_mean = ${result.hold.factor}`,
      }),
    );
  }

  container.innerHTML = out.join('');

  const c = result.checks;
  noteEl.innerHTML =
    `Cross-checks — LMTD vs ε-NTU: ${c.lmtdVsNtu === null ? 'n/a' : c.lmtdVsNtu.toExponential(1)}; ` +
    `stream energy balance: ${c.energyBalance.toExponential(1)}; ` +
    `marched profile: ${c.profileOutlet.toExponential(1)}. All three should sit at round-off.`;
  noteEl.className = 'note';
}
