/**
 * Governing equations, as native MathML.
 *
 * WHY MathML AND NOT KaTeX/MathJax
 * Every current browser renders MathML Core natively (Chrome and Edge since
 * 109, Firefox for years, Safari since 14.1). Using it means real typeset
 * mathematics -- proper fraction bars, stretchy brackets, correct spacing --
 * with no library, no web fonts, and nothing to load. That is what keeps the
 * deliverable a single file that works offline, and it scales cleanly when the
 * page is zoomed for a projector.
 *
 * Each entry pairs the equation with a short note saying what it MEANS, since
 * an equation without an interpretation teaches very little.
 */

const block = (body) => `<math display="block" class="eq">${body}</math>`;

const frac = (num, den) => `<mfrac>${num}${den}</mfrac>`;
const row = (...items) => `<mrow>${items.join('')}</mrow>`;
const partial = (v) => row('<mo>∂</mo>', `<mi>${v}</mi>`);

export const EQUATIONS = {
  /* ------------------------------------------------------------------ */
  conduction1D: {
    title: 'Transient conduction (one dimension)',
    mathml: block(
      row(
        frac(partial('T'), partial('t')),
        '<mo>=</mo>',
        '<mi>α</mi>',
        frac('<mn>1</mn>', '<msup><mi>r</mi><mi>m</mi></msup>'),
        frac('<mo>∂</mo>', partial('r')),
        '<mo form="prefix" stretchy="true">(</mo>',
        '<msup><mi>r</mi><mi>m</mi></msup>',
        frac(partial('T'), partial('r')),
        '<mo form="postfix" stretchy="true">)</mo>',
      ),
    ),
    note:
      'The shape exponent m is 0 for a slab, 1 for a cylinder and 2 for a sphere. ' +
      'α = k/ρc_p is the thermal diffusivity: how fast a temperature disturbance spreads, ' +
      'as opposed to k, which sets how much heat flows.',
  },

  conduction2D: {
    title: 'Transient conduction in a finite cylinder (a real can)',
    mathml: block(
      row(
        frac(partial('T'), partial('t')),
        '<mo>=</mo>',
        '<mi>α</mi>',
        '<mo form="prefix" stretchy="true">[</mo>',
        frac('<mn>1</mn>', '<mi>r</mi>'),
        frac('<mo>∂</mo>', partial('r')),
        '<mo stretchy="false">(</mo>',
        '<mi>r</mi>',
        frac(partial('T'), partial('r')),
        '<mo stretchy="false">)</mo>',
        '<mo>+</mo>',
        frac('<mrow><msup><mo>∂</mo><mn>2</mn></msup><mi>T</mi></mrow>', '<mrow><mo>∂</mo><msup><mi>z</mi><mn>2</mn></msup></mrow>'),
        '<mo form="postfix" stretchy="true">]</mo>',
      ),
    ),
    note:
      'Heat enters a can through the side wall AND both lids. The second term is what the ' +
      'infinite-cylinder solution throws away, and it is why a squat can heats faster at the centre ' +
      'than the textbook cylinder result predicts.',
  },

  boundaryCondition: {
    title: 'Convective boundary condition',
    mathml: block(
      row(
        '<mo>−</mo><mi>k</mi>',
        '<msub><mrow>' + frac(partial('T'), partial('n')) + '</mrow><mrow><mi>s</mi></mrow></msub>',
        '<mo>=</mo>',
        '<mi>h</mi>',
        '<mo stretchy="false">(</mo>',
        '<msub><mi>T</mi><mi>s</mi></msub>',
        '<mo>−</mo>',
        '<msub><mi>T</mi><mi>∞</mi></msub>',
        '<mo stretchy="false">)</mo>',
      ),
    ),
    note:
      'Heat conducted up to the surface from inside must equal the heat carried away by the ' +
      'fluid. The surface temperature is an OUTCOME of this balance, not something you set — ' +
      'which is why the surface does not instantly reach the retort temperature unless h is enormous.',
  },

  biot: {
    title: 'Biot number',
    mathml: block(
      row(
        '<mi>Bi</mi>',
        '<mo>=</mo>',
        frac('<mrow><mi>h</mi><msub><mi>L</mi><mi>c</mi></msub></mrow>', '<mi>k</mi>'),
        '<mo>=</mo>',
        frac(
          '<mrow><msub><mi>L</mi><mi>c</mi></msub><mo>/</mo><mi>k</mi></mrow>',
          '<mrow><mn>1</mn><mo>/</mo><mi>h</mi></mrow>',
        ),
      ),
    ),
    note:
      'The ratio of internal conduction resistance to surface film resistance. ' +
      'Bi ≪ 1: the film controls, and the food is nearly isothermal inside. ' +
      'Bi ≫ 1: conduction controls, and a steep gradient forms — the centre lags badly. ' +
      'Below Bi = 0.1 the lumped-capacitance model is usually accepted.',
  },

  fourier: {
    title: 'Fourier number',
    mathml: block(
      row(
        '<mi>Fo</mi>',
        '<mo>=</mo>',
        frac('<mrow><mi>α</mi><mi>t</mi></mrow>', '<msubsup><mi>L</mi><mi>c</mi><mn>2</mn></msubsup>'),
      ),
    ),
    note:
      'Dimensionless time. It compares how far heat has diffused with how far it must go. ' +
      'Two objects of different size and material at the same Fo and Bi are at the same point ' +
      'in their thermal history — which is what makes the dimensionless charts universal.',
  },

  series: {
    title: 'Exact solution (separation of variables)',
    mathml: block(
      row(
        '<mi>θ</mi>',
        '<mo>=</mo>',
        frac(
          '<mrow><mi>T</mi><mo>−</mo><msub><mi>T</mi><mi>∞</mi></msub></mrow>',
          '<mrow><msub><mi>T</mi><mi>i</mi></msub><mo>−</mo><msub><mi>T</mi><mi>∞</mi></msub></mrow>',
        ),
        '<mo>=</mo>',
        '<munderover><mo>∑</mo><mrow><mi>n</mi><mo>=</mo><mn>1</mn></mrow><mi>∞</mi></munderover>',
        '<msub><mi>C</mi><mi>n</mi></msub>',
        '<msup><mi>e</mi><mrow><mo>−</mo><msubsup><mi>ζ</mi><mi>n</mi><mn>2</mn></msubsup><mi>Fo</mi></mrow></msup>',
        '<mi>f</mi><mo stretchy="false">(</mo><msub><mi>ζ</mi><mi>n</mi></msub><mi>η</mi><mo stretchy="false">)</mo>',
      ),
    ),
    note:
      'The eigenvalues ζ_n depend on Bi alone. Higher terms decay as exp(−ζ_n²Fo), so after ' +
      'Fo ≈ 0.2 only the first survives — that is where the familiar one-term approximation and ' +
      'the Heisler charts come from. This app sums many terms, so it is also correct early on.',
  },

  lumped: {
    title: 'Lumped capacitance (valid when Bi < 0.1)',
    mathml: block(
      row(
        '<mi>θ</mi>',
        '<mo>=</mo>',
        '<msup><mi>e</mi><mrow><mo>−</mo>' +
          frac('<mrow><mi>h</mi><mi>A</mi><mi>t</mi></mrow>', '<mrow><mi>ρ</mi><msub><mi>c</mi><mi>p</mi></msub><mi>V</mi></mrow>') +
          '</mrow></msup>',
        '<mo>=</mo>',
        '<msup><mi>e</mi><mrow><mo>−</mo><mi>Bi</mi><mo>⋅</mo><mi>Fo</mi></mrow></msup>',
      ),
    ),
    note:
      'If the inside of the food has no meaningful gradient, the whole object cools on one ' +
      'exponential. Note the product Bi·Fo — the two dimensionless groups are not independent ' +
      'controls but combine into a single decay rate in this limit.',
  },

  /* ------------------------------------------------------------------ */
  lethality: {
    title: 'Process lethality',
    mathml: block(
      row(
        '<msub><mi>F</mi><mn>0</mn></msub>',
        '<mo>=</mo>',
        '<msubsup><mo>∫</mo><mn>0</mn><mi>t</mi></msubsup>',
        '<msup><mn>10</mn><mrow>' +
          frac(
            '<mrow><mi>T</mi><mo stretchy="false">(</mo><mi>t</mi><mo stretchy="false">)</mo><mo>−</mo><msub><mi>T</mi><mi>ref</mi></msub></mrow>',
            '<mi>z</mi>',
          ) +
          '</mrow></msup>',
        '<mi>d</mi><mi>t</mi>',
      ),
    ),
    note:
      'Equivalent minutes at the reference temperature. z is the temperature rise that speeds ' +
      'killing tenfold. For low-acid canned food T_ref = 121.1 °C and z = 10 °C, and F₀ = 3 min is ' +
      'the classic botulinum cook. Because the integrand is exponential, almost all lethality is ' +
      'accumulated in the last few degrees — which is why the curve stays flat then leaps.',
  },

  plank: {
    title: 'Plank’s freezing time',
    mathml: block(
      row(
        '<msub><mi>t</mi><mi>f</mi></msub>',
        '<mo>=</mo>',
        frac(
          '<mrow><msub><mi>ρ</mi><mi>f</mi></msub><msub><mi>L</mi><mi>f</mi></msub></mrow>',
          '<mrow><msub><mi>T</mi><mi>f</mi></msub><mo>−</mo><msub><mi>T</mi><mi>∞</mi></msub></mrow>',
        ),
        '<mo form="prefix" stretchy="true">(</mo>',
        frac('<mrow><mi>P</mi><mi>a</mi></mrow>', '<mi>h</mi>'),
        '<mo>+</mo>',
        frac('<mrow><mi>R</mi><msup><mi>a</mi><mn>2</mn></msup></mrow>', '<msub><mi>k</mi><mi>f</mi></msub>'),
        '<mo form="postfix" stretchy="true">)</mo>',
      ),
    ),
    note:
      'The two terms are the surface film resistance and the conduction resistance of the frozen ' +
      'shell. Shape factors: slab P = 1/2, R = 1/8; cylinder 1/4, 1/16; sphere 1/6, 1/24. ' +
      'Plank counts latent heat only — no pre-cooling, no sub-cooling, freezing at a single ' +
      'temperature — so it UNDERESTIMATES real freezing times, typically by 10–30 %.',
  },

  /* ------------------------------------------------------------------ */
  lmtd: {
    title: 'Log-mean temperature difference',
    mathml: block(
      row(
        '<mi>Q</mi><mo>=</mo><mi>U</mi><mi>A</mi><mo>⋅</mo>',
        '<mi>Δ</mi><msub><mi>T</mi><mi>lm</mi></msub>',
        '<mo>,</mo><mspace width="1em"/>',
        '<mi>Δ</mi><msub><mi>T</mi><mi>lm</mi></msub>',
        '<mo>=</mo>',
        frac(
          '<mrow><mi>Δ</mi><msub><mi>T</mi><mn>1</mn></msub><mo>−</mo><mi>Δ</mi><msub><mi>T</mi><mn>2</mn></msub></mrow>',
          '<mrow><mi>ln</mi><mo stretchy="false">(</mo><mi>Δ</mi><msub><mi>T</mi><mn>1</mn></msub><mo>/</mo><mi>Δ</mi><msub><mi>T</mi><mn>2</mn></msub><mo stretchy="false">)</mo></mrow>',
        ),
      ),
    ),
    note:
      'The correct average driving force along the exchanger. It is a log mean, not an arithmetic ' +
      'one, because the temperature difference decays exponentially with area. When both ends have ' +
      'the same ΔT the expression is 0/0 and tends to that common value.',
  },

  epsNtu: {
    title: 'Effectiveness–NTU',
    mathml: block(
      row(
        '<mi>NTU</mi><mo>=</mo>',
        frac('<mrow><mi>U</mi><mi>A</mi></mrow>', '<msub><mi>C</mi><mi>min</mi></msub>'),
        '<mo>,</mo><mspace width="1em"/>',
        '<mi>ε</mi><mo>=</mo>',
        frac('<mi>Q</mi>', '<msub><mi>Q</mi><mi>max</mi></msub>'),
        '<mo>,</mo><mspace width="1em"/>',
        '<mi>Q</mi><mo>=</mo><mi>ε</mi><msub><mi>C</mi><mi>min</mi></msub>',
        '<mo stretchy="false">(</mo><msub><mi>T</mi><mrow><mi>h</mi><mo>,</mo><mi>in</mi></mrow></msub>',
        '<mo>−</mo><msub><mi>T</mi><mrow><mi>c</mi><mo>,</mo><mi>in</mi></mrow></msub><mo stretchy="false">)</mo>',
      ),
    ),
    note:
      'Q_max is what an infinitely large exchanger would transfer: C_min times the full inlet ' +
      'temperature gap. Effectiveness needs no outlet temperatures, so unlike LMTD it works ' +
      'directly when the outlets are the unknowns.',
  },

  epsCounter: {
    title: 'Effectiveness: counter-current',
    mathml: block(
      row(
        '<mi>ε</mi><mo>=</mo>',
        frac(
          '<mrow><mn>1</mn><mo>−</mo><msup><mi>e</mi><mrow><mo>−</mo><mi>NTU</mi><mo stretchy="false">(</mo><mn>1</mn><mo>−</mo><msub><mi>C</mi><mi>r</mi></msub><mo stretchy="false">)</mo></mrow></msup></mrow>',
          '<mrow><mn>1</mn><mo>−</mo><msub><mi>C</mi><mi>r</mi></msub><msup><mi>e</mi><mrow><mo>−</mo><mi>NTU</mi><mo stretchy="false">(</mo><mn>1</mn><mo>−</mo><msub><mi>C</mi><mi>r</mi></msub><mo stretchy="false">)</mo></mrow></msup></mrow>',
        ),
      ),
    ),
    note:
      'As NTU → ∞ this tends to 1: a long enough counter-current exchanger can in principle ' +
      'recover ALL the available heat. At C_r = 1 it degenerates to ε = NTU/(1+NTU) and the ' +
      'temperature difference is constant along the whole exchanger.',
  },

  epsParallel: {
    title: 'Effectiveness: co-current',
    mathml: block(
      row(
        '<mi>ε</mi><mo>=</mo>',
        frac(
          '<mrow><mn>1</mn><mo>−</mo><msup><mi>e</mi><mrow><mo>−</mo><mi>NTU</mi><mo stretchy="false">(</mo><mn>1</mn><mo>+</mo><msub><mi>C</mi><mi>r</mi></msub><mo stretchy="false">)</mo></mrow></msup></mrow>',
          '<mrow><mn>1</mn><mo>+</mo><msub><mi>C</mi><mi>r</mi></msub></mrow>',
        ),
        '<mspace width="1.5em"/><mo>⟶</mo><mspace width="0.5em"/>',
        frac('<mn>1</mn>', '<mrow><mn>1</mn><mo>+</mo><msub><mi>C</mi><mi>r</mi></msub></mrow>'),
      ),
    ),
    note:
      'This is the whole argument for counter-current flow. However much area you buy, co-current ' +
      'effectiveness is capped at 1/(1+C_r) — with balanced flows, 0.5. Both streams are marching ' +
      'towards the same mixed temperature, and once they reach it no further transfer is possible.',
  },
};

/** Render one equation block into a container element. */
export function renderEquation(container, id, { collapsed = false } = {}) {
  const eq = EQUATIONS[id];
  if (!eq) throw new Error(`renderEquation: unknown equation "${id}"`);

  const wrap = document.createElement('figure');
  wrap.className = 'eq-block';
  wrap.innerHTML = `
    <figcaption class="eq-title">${eq.title}</figcaption>
    <div class="eq-body">${eq.mathml}</div>
    <p class="eq-note"${collapsed ? ' hidden' : ''}>${eq.note}</p>
  `;
  container.appendChild(wrap);
  return wrap;
}

/** Render several equations in order. */
export function renderEquations(container, ids, options) {
  container.innerHTML = '';
  for (const id of ids) renderEquation(container, id, options);
}

/** Which equations belong beside which scenario. */
export const SCENARIO_EQUATIONS = {
  retort: ['conduction1D', 'conduction2D', 'boundaryCondition', 'biot', 'fourier', 'series', 'lumped', 'lethality'],
  chill: ['conduction1D', 'boundaryCondition', 'biot', 'fourier', 'plank'],
  milk: ['lmtd', 'epsNtu', 'epsCounter', 'epsParallel'],
};
