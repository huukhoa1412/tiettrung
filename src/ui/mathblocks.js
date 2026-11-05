/**
 * Governing equations, as native MathML, with every symbol TAGGED so it can be
 * lit up from the control that drives it.
 *
 * WHY THE TAGGING MATTERS MORE THAN THE TYPESETTING
 * A student looking at ∂T/∂t = α ∇²T and a slider labelled "k" does not
 * necessarily connect the two. The gap between "the number I am dragging" and
 * "the letter in the equation" is where most of the confusion in a
 * heat-transfer course lives.
 *
 * So every occurrence of every symbol carries data-sym="<parameter key>".
 * Touching a control highlights that symbol EVERYWHERE it appears -- in the
 * inline equation beside the slider, in the full equation list, and on the
 * result tile it feeds. The chain slider → symbol → number becomes visible
 * rather than something the student has to reconstruct.
 *
 * WHY MathML AND NOT KaTeX/MathJax
 * Every current browser renders MathML Core natively. Real typeset
 * mathematics, no library, no web fonts, nothing to load -- which is what
 * keeps the deliverable a single offline file. It also means the symbols are
 * real DOM elements, which is precisely what makes the highlighting possible;
 * a canvas- or image-rendered equation could not do this.
 */

/* ------------------------------------------------------------------ */
/* Symbol helpers. `key` is the state parameter this symbol represents. */

/**
 * A tagged identifier: <mi data-sym="k">k</mi>
 *
 * `key` may be a SPACE-SEPARATED LIST when one symbol stands for more than one
 * control. The radial coordinate r, for instance, is bounded by the Radius
 * slider for a cylinder or sphere and by the Half-thickness slider for a slab;
 * both must light it up. Matching uses the `~=` attribute selector, which is
 * defined on whitespace-separated lists.
 */
const S = (key, glyph) => `<mi class="sym" data-sym="${key}">${glyph}</mi>`;

/** A tagged subscripted identifier, e.g. T_i or c_p. */
const Ssub = (key, base, sub) =>
  `<msub class="sym" data-sym="${key}"><mi>${base}</mi><mi>${sub}</mi></msub>`;

/** An untagged identifier, for symbols with no control behind them. */
const I = (glyph) => `<mi>${glyph}</mi>`;
const N = (glyph) => `<mn>${glyph}</mn>`;
const O = (glyph) => `<mo>${glyph}</mo>`;

const block = (body) => `<math display="block" class="eq">${body}</math>`;
const frac = (num, den) => `<mfrac>${num}${den}</mfrac>`;
const row = (...items) => `<mrow>${items.join('')}</mrow>`;

/** Derived quantities get their own tag namespace so tiles can light up too. */
const D = (key, glyph) => `<mi class="sym" data-sym="${key}">${glyph}</mi>`;

/* ------------------------------------------------------------------ */
/**
 * Which parameters each equation involves. Used to decide which equations to
 * flash when a control is touched, and to build the inline equation shown
 * beside each control group.
 */
export const EQUATIONS = {
  /* ---------------- conduction ---------------- */
  diffusivity: {
    title: 'Thermal diffusivity',
    params: ['k', 'rho', 'cp', 'alpha'],
    mathml: block(
      row(
        D('alpha', 'α'),
        O('='),
        frac(S('k', 'k'), row(S('rho', 'ρ'), Ssub('cp', 'c', 'p'))),
      ),
    ),
    note:
      'How fast a temperature disturbance SPREADS — as opposed to k alone, which sets how much heat flows. ' +
      'Raising c_p or ρ slows the food down even though it conducts just as well.',
  },

  /**
   * The 1-D conduction equation, shown beside the Geometry controls for the
   * slab, the infinite cylinder and the sphere. `r` is the radial coordinate
   * the Radius slider sets the outer limit of, so the connection between the
   * control and the maths is direct.
   */
  conduction1D: {
    title: 'Transient conduction',
    params: ['k', 'rho', 'cp', 'alpha', 'radius', 'halfThickness'],
    mathml: block(
      row(
        frac(row(O('∂'), I('T')), row(O('∂'), I('t'))),
        O('='),
        D('alpha', 'α'),
        frac(N('1'), `<msup>${S('radius halfThickness', 'r')}<mi>m</mi></msup>`),
        frac(O('∂'), row(O('∂'), S('radius halfThickness', 'r'))),
        O('('),
        `<msup>${S('radius halfThickness', 'r')}<mi>m</mi></msup>`,
        frac(row(O('∂'), I('T')), row(O('∂'), S('radius halfThickness', 'r'))),
        O(')'),
      ),
    ),
    note:
      'The shape exponent m is 0 for a slab, 1 for a cylinder and 2 for a sphere — the only thing that ' +
      'changes between the three. r runs from the centre out to the radius (or half-thickness) you set above.',
  },

  conduction2D: {
    title: 'Transient conduction in the can',
    params: ['k', 'rho', 'cp', 'alpha', 'radius', 'canHeight'],
    mathml: block(
      row(
        frac(row(O('∂'), I('T')), row(O('∂'), I('t'))),
        O('='),
        D('alpha', 'α'),
        O('['),
        frac(N('1'), S('radius halfThickness', 'r')),
        frac(O('∂'), row(O('∂'), S('radius halfThickness', 'r'))),
        O('('),
        S('radius halfThickness', 'r'),
        frac(row(O('∂'), I('T')), row(O('∂'), S('radius halfThickness', 'r'))),
        O(')'),
        O('+'),
        frac(row(`<msup>${O('∂')}${N('2')}</msup>`, I('T')), row(O('∂'), `<msup>${S('canHeight', 'z')}${N('2')}</msup>`)),
        O(']'),
      ),
    ),
    note:
      'Heat enters a can through the side wall AND both lids. The second term is what the infinite-cylinder ' +
      'solution throws away, and it is why a squat can heats faster at the centre than the textbook result predicts.',
  },

  boundary: {
    title: 'Convective boundary — where h acts',
    params: ['h', 'k', 'Tmedium'],
    mathml: block(
      row(
        O('−'),
        S('k', 'k'),
        frac(row(O('∂'), I('T')), row(O('∂'), I('n'))),
        O('='),
        S('h', 'h'),
        O('('),
        `<msub><mi>T</mi><mi>s</mi></msub>`,
        O('−'),
        Ssub('Tmedium', 'T', '∞'),
        O(')'),
      ),
    ),
    note:
      'Heat conducted up to the surface must equal heat carried away by the medium. The surface temperature is ' +
      'an OUTCOME of this balance, not something you set — which is why the surface does not instantly reach ' +
      'the retort temperature unless h is enormous.',
  },

  biot: {
    title: 'Biot number — which resistance is in charge',
    params: ['h', 'k', 'radius', 'halfThickness', 'Bi'],
    mathml: block(
      row(
        D('Bi', 'Bi'),
        O('='),
        frac(row(S('h', 'h'), Ssub('radius halfThickness', 'L', 'c')), S('k', 'k')),
        O('='),
        frac(
          row(Ssub('radius halfThickness', 'L', 'c'), O('/'), S('k', 'k')),
          row(N('1'), O('/'), S('h', 'h')),
        ),
      ),
    ),
    note:
      'Internal conduction resistance divided by surface film resistance. Bi ≪ 1: the film controls and the food ' +
      'is nearly isothermal inside. Bi ≫ 1: conduction controls and the centre lags badly. Below Bi = 0.1 the ' +
      'lumped model is usually accepted.',
  },

  fourier: {
    title: 'Fourier number Fo — dimensionless TIME',
    params: ['processTime', 'radius', 'halfThickness', 'alpha', 'Fo'],
    mathml: block(
      row(
        D('Fo', 'Fo'),
        O('='),
        frac(
          row(D('alpha', 'α'), S('processTime', 't')),
          `<msubsup class="sym" data-sym="radius halfThickness"><mi>L</mi><mi>c</mi><mn>2</mn></msubsup>`,
        ),
      ),
    ),
    note:
      'How far heat has diffused compared with how far it must go. Note the SQUARE: doubling the can radius ' +
      'quadruples the time to reach the same Fo. This one fact explains most of thermal process design.\n\n' +
      'Do not confuse Fo with F₀. Fo (roman “o”) is the Fourier number, a dimensionless time. ' +
      'F₀ (subscript zero) is the accumulated lethality in equivalent minutes. They are unrelated quantities ' +
      'that unfortunately look alike.',
  },

  lethality: {
    title: 'Process lethality F₀ — equivalent MINUTES',
    params: ['Tref', 'zValue', 'processTime', 'targetF0', 'F0'],
    mathml: block(
      row(
        // A proper msub, so it renders as F with a subscript zero and is
        // visually distinct from the Fourier number Fo.
        `<msub class="sym" data-sym="F0"><mi>F</mi><mn>0</mn></msub>`,
        O('='),
        `<msubsup><mo>∫</mo><mn>0</mn>${S('processTime', 't')}</msubsup>`,
        `<msup>${N('10')}<mrow>${frac(
          row(I('T'), O('('), I('t'), O(')'), O('−'), Ssub('Tref', 'T', 'ref')),
          S('zValue', 'z'),
        )}</mrow></msup>`,
        I('d'),
        I('t'),
      ),
    ),
    note:
      'Equivalent minutes at the reference temperature. Because the integrand is exponential, almost ALL ' +
      'lethality is delivered in the last few degrees — which is why the curve stays flat and then leaps.\n\n' +
      'F₀ (subscript zero) is a TIME IN MINUTES. It is not the Fourier number Fo, which is dimensionless.',
  },

  lumped: {
    title: 'Lumped capacitance (only when Bi < 0.1)',
    params: ['h', 'rho', 'cp', 'Bi', 'Fo'],
    mathml: block(
      row(
        I('θ'),
        O('='),
        `<msup><mi>e</mi><mrow><mo>−</mo>${D('Bi', 'Bi')}<mo>⋅</mo>${D('Fo', 'Fo')}</mrow></msup>`,
      ),
    ),
    note:
      'If there is no meaningful gradient inside, the whole object cools on one exponential. Note that Bi and Fo ' +
      'are not independent controls here — they combine into a single decay rate.',
  },

  series: {
    title: 'Exact solution (separation of variables)',
    params: ['Bi', 'Fo'],
    mathml: block(
      row(
        I('θ'),
        O('='),
        frac(
          row(I('T'), O('−'), Ssub('Tmedium', 'T', '∞')),
          row(Ssub('Tinitial', 'T', 'i'), O('−'), Ssub('Tmedium', 'T', '∞')),
        ),
        O('='),
        `<munderover><mo>∑</mo><mrow><mi>n</mi><mo>=</mo><mn>1</mn></mrow><mi>∞</mi></munderover>`,
        `<msub><mi>C</mi><mi>n</mi></msub>`,
        `<msup><mi>e</mi><mrow><mo>−</mo><msubsup><mi>ζ</mi><mi>n</mi><mn>2</mn></msubsup>${D('Fo', 'Fo')}</mrow></msup>`,
      ),
    ),
    note:
      'The eigenvalues ζₙ depend on Bi alone. Higher terms decay fast, so after Fo ≈ 0.2 only the first ' +
      'survives — that is where the one-term approximation and the Heisler charts come from.',
  },

  /* ---------------- freezing ---------------- */
  plank: {
    title: 'Plank’s freezing time',
    params: ['chillH', 'kFrozen', 'freezingPoint', 'chillMedium', 'rhoFrozen'],
    mathml: block(
      row(
        `<msub><mi>t</mi><mi>f</mi></msub>`,
        O('='),
        frac(
          row(Ssub('rhoFrozen', 'ρ', 'f'), `<msub><mi>L</mi><mi>f</mi></msub>`),
          row(Ssub('freezingPoint', 'T', 'f'), O('−'), Ssub('chillMedium', 'T', '∞')),
        ),
        O('('),
        frac(row(I('P'), I('a')), S('chillH', 'h')),
        O('+'),
        frac(row(I('R'), `<msup><mi>a</mi><mn>2</mn></msup>`), Ssub('kFrozen', 'k', 'f')),
        O(')'),
      ),
    ),
    note:
      'The two terms are the surface film resistance and the conduction resistance of the frozen shell. Plank ' +
      'counts latent heat only, so it UNDERESTIMATES real freezing times, typically by 10–30 %.',
  },

  /* ---------------- exchanger ---------------- */
  lmtd: {
    title: 'Log-mean temperature difference',
    params: ['U', 'area', 'ThotIn', 'TcoldIn'],
    mathml: block(
      row(
        I('Q'),
        O('='),
        S('U', 'U'),
        S('area', 'A'),
        I('Δ'),
        `<msub><mi>T</mi><mi>lm</mi></msub>`,
        O(','),
        `<mspace width="0.8em"/>`,
        I('Δ'),
        `<msub><mi>T</mi><mi>lm</mi></msub>`,
        O('='),
        frac(
          row(I('Δ'), `<msub><mi>T</mi><mn>1</mn></msub>`, O('−'), I('Δ'), `<msub><mi>T</mi><mn>2</mn></msub>`),
          row(I('ln'), O('('), I('Δ'), `<msub><mi>T</mi><mn>1</mn></msub>`, O('/'), I('Δ'), `<msub><mi>T</mi><mn>2</mn></msub>`, O(')')),
        ),
      ),
    ),
    note:
      'The correct average driving force along the exchanger. A log mean, not an arithmetic one, because the ' +
      'temperature difference decays exponentially with area.',
  },

  epsNtu: {
    title: 'Effectiveness–NTU',
    params: ['U', 'area', 'mdotHot', 'mdotCold', 'cpHot', 'cpCold'],
    mathml: block(
      row(
        I('NTU'),
        O('='),
        frac(row(S('U', 'U'), S('area', 'A')), `<msub><mi>C</mi><mi>min</mi></msub>`),
        O(','),
        `<mspace width="0.8em"/>`,
        I('ε'),
        O('='),
        frac(I('Q'), `<msub><mi>Q</mi><mi>max</mi></msub>`),
      ),
    ),
    note:
      'Q_max is what an infinitely large exchanger would transfer. Effectiveness needs no outlet temperatures, ' +
      'so unlike LMTD it works directly when the outlets are the unknowns.',
  },

  epsParallel: {
    title: 'Why counter-current wins',
    params: ['arrangement', 'mdotHot', 'mdotCold'],
    mathml: block(
      row(
        I('ε'),
        `<msub><mi></mi><mi>co</mi></msub>`,
        `<mspace width="0.4em"/>`,
        O('⟶'),
        `<mspace width="0.4em"/>`,
        frac(N('1'), row(N('1'), O('+'), `<msub><mi>C</mi><mi>r</mi></msub>`)),
      ),
    ),
    note:
      'However much area you buy, co-current effectiveness is capped at 1/(1+C_r) — with balanced flows, 0.5. ' +
      'Both streams march towards the same mixed temperature and transfer then stops. Counter-current has no ' +
      'such ceiling.',
  },
};

/* ------------------------------------------------------------------ */
/**
 * SHAPE-SPECIFIC EQUATIONS.
 *
 * Five retort equations change with the geometry: the conduction equation
 * itself, the Biot and Fourier numbers (through the characteristic length),
 * the exact series solution (through its eigenfunction, eigenvalue condition
 * and coefficients) and the lumped solution (through A/V). Each is written out
 * for the shape on screen, so picking a shape visibly changes the maths and no
 * student has to substitute m = 0, 1, 2 into a general form in their head.
 *
 * Generated from one table so the three shapes cannot drift apart, and kept
 * IDENTICAL to what the solver computes: the eigenfunctions, eigenvalue
 * conditions and C_n below are those in physics/analytical.js (Incropera &
 * DeWitt ch. 5), with Bi and Fo on the same characteristic length the result
 * tiles report -- the half-thickness L for a slab, the radius R otherwise.
 */
const zn = '<msub><mi>ζ</mi><mi>n</mi></msub>';
const zn2 = '<msubsup><mi>ζ</mi><mi>n</mi><mn>2</mn></msubsup>';
const Cn = '<msub><mi>C</mi><mi>n</mi></msub>';
const J = (order, power) =>
  power ? `<msubsup><mi>J</mi><mn>${order}</mn><mn>${power}</mn></msubsup>` : `<msub><mi>J</mi><mn>${order}</mn></msub>`;
const of = (...args) => row(O('('), ...args, O(')'));
const dTdt = frac(row(O('∂'), I('T')), row(O('∂'), I('t')));
const theta = I('θ');

const SHAPES = {
  slab: {
    noun: 'slab',
    key: 'halfThickness',
    Lc: 'L',
    coord: 'x',
    conduction: (x) =>
      row(dTdt, O('='), D('alpha', 'α'), frac(row(`<msup>${O('∂')}${N('2')}</msup>`, I('T')), row(O('∂'), `<msup>${x}${N('2')}</msup>`))),
    conductionNote:
      'Heat flows straight through the thickness, so there is no geometric factor. x runs from the mid-plane — ' +
      'the cold spot — out to the half-thickness L at either heated face.',
    eigenfunction: row(I('cos'), of(zn, I('η'))),
    eigenvalue: row(zn, I('tan'), zn, O('='), D('Bi', 'Bi')),
    coefficient: frac(row(N('4'), I('sin'), zn), row(N('2'), zn, O('+'), I('sin'), of(N('2'), zn))),
    lumpedFactor: '',
    volumeOverArea: 'L',
    sizeNote: 'doubling the thickness quadruples the time to reach the same Fo',
    lcNote: 'L is the HALF-thickness: the slab is heated from both faces, so heat only has to travel half way.',
  },
  cylinder: {
    noun: 'cylinder',
    key: 'radius',
    Lc: 'R',
    coord: 'r',
    conduction: (r) =>
      row(dTdt, O('='), D('alpha', 'α'), frac(N('1'), r), frac(O('∂'), row(O('∂'), r)), O('('), r, frac(row(O('∂'), I('T')), row(O('∂'), r)), O(')')),
    conductionNote:
      'Radial conduction only; the ends are ignored, which is the textbook model of a can. The factor r appears ' +
      'because each shell has more area than the one inside it, so heat converges as it moves in to the axis.',
    eigenfunction: row(J(0), of(zn, I('η'))),
    eigenvalue: row(frac(row(zn, J(1), of(zn)), row(J(0), of(zn))), O('='), D('Bi', 'Bi')),
    coefficient: row(
      frac(N('2'), zn),
      frac(row(J(1), of(zn)), row(J(0, 2), of(zn), O('+'), J(1, 2), of(zn))),
    ),
    lumpedFactor: '2',
    volumeOverArea: 'R/2',
    sizeNote: 'doubling the can radius quadruples the time to reach the same Fo',
    lcNote: 'R is the radius. The Biot on V/A tile uses V/A = R/2 instead; that one decides the lumped verdict.',
  },
  sphere: {
    noun: 'sphere',
    key: 'radius',
    Lc: 'R',
    coord: 'r',
    conduction: (r) => {
      const r2 = `<msup>${r}${N('2')}</msup>`;
      return row(dTdt, O('='), D('alpha', 'α'), frac(N('1'), r2), frac(O('∂'), row(O('∂'), r)), O('('), r2, frac(row(O('∂'), I('T')), row(O('∂'), r)), O(')'));
    },
    conductionNote:
      'Heat enters from every direction: shell area grows as r², so the sphere has the most surface per unit ' +
      'volume and heats fastest of the three shapes for the same characteristic length.',
    eigenfunction: frac(row(I('sin'), of(zn, I('η'))), row(zn, I('η'))),
    eigenvalue: row(N('1'), O('−'), zn, I('cot'), zn, O('='), D('Bi', 'Bi')),
    coefficient: frac(
      row(N('4'), O('['), I('sin'), zn, O('−'), zn, I('cos'), zn, O(']')),
      row(N('2'), zn, O('−'), I('sin'), of(N('2'), zn)),
    ),
    lumpedFactor: '3',
    volumeOverArea: 'R/3',
    sizeNote: 'doubling the radius quadruples the time to reach the same Fo',
    lcNote: 'R is the radius. The Biot on V/A tile uses V/A = R/3 instead; that one decides the lumped verdict.',
  },
};

for (const [g, sh] of Object.entries(SHAPES)) {
  const Lc = S(sh.key, sh.Lc);
  const coord = S(sh.key, sh.coord);
  const shapeName = sh.noun;

  EQUATIONS[`conduction_${g}`] = {
    title: `Transient conduction — ${shapeName}`,
    params: ['k', 'rho', 'cp', 'alpha', sh.key],
    mathml: block(sh.conduction(coord)),
    note: sh.conductionNote,
  };

  EQUATIONS[`biot_${g}`] = {
    title: 'Biot number — which resistance is in charge',
    params: ['h', 'k', sh.key, 'Bi'],
    mathml: block(
      row(
        D('Bi', 'Bi'),
        O('='),
        frac(row(S('h', 'h'), Lc), S('k', 'k')),
        O('='),
        frac(row(Lc, O('/'), S('k', 'k')), row(N('1'), O('/'), S('h', 'h'))),
      ),
    ),
    note:
      `${sh.lcNote} Bi is internal conduction resistance over surface film resistance. Bi ≪ 1: the film ` +
      'controls and the food is nearly isothermal inside. Bi ≫ 1: conduction controls and the centre lags badly.',
  };

  EQUATIONS[`fourier_${g}`] = {
    title: 'Fourier number Fo — dimensionless TIME',
    params: ['processTime', sh.key, 'alpha', 'Fo'],
    mathml: block(
      row(D('Fo', 'Fo'), O('='), frac(row(D('alpha', 'α'), S('processTime', 't')), `<msup>${Lc}${N('2')}</msup>`)),
    ),
    note:
      `How far heat has diffused compared with how far it must go. Note the SQUARE: ${sh.sizeNote}. ` +
      'This one fact explains most of thermal process design.\n\n' +
      'Do not confuse Fo with F₀. Fo (roman “o”) is the Fourier number, a dimensionless time. F₀ (subscript zero) ' +
      'is the accumulated lethality in equivalent minutes.',
  };

  EQUATIONS[`series_${g}`] = {
    title: `Exact solution — ${shapeName}`,
    params: ['Bi', 'Fo', 'Tinitial', 'Tmedium', sh.key],
    mathml:
      block(
        row(
          theta,
          O('='),
          frac(row(I('T'), O('−'), Ssub('Tmedium', 'T', '∞')), row(Ssub('Tinitial', 'T', 'i'), O('−'), Ssub('Tmedium', 'T', '∞'))),
          O(','),
          `<mspace width="0.8em"/>`,
          I('η'),
          O('='),
          frac(coord, Lc),
        ),
      ) +
      block(
        row(
          theta,
          O('='),
          `<munderover><mo>∑</mo><mrow><mi>n</mi><mo>=</mo><mn>1</mn></mrow><mi>∞</mi></munderover>`,
          Cn,
          `<msup><mi>e</mi><mrow><mo>−</mo>${zn2}${D('Fo', 'Fo')}</mrow></msup>`,
          sh.eigenfunction,
        ),
      ) +
      // Eigenvalue condition and coefficient on separate lines: together they
      // are too wide for the equation column.
      block(sh.eigenvalue) +
      block(row(Cn, O('='), sh.coefficient)),
    note:
      'Separation of variables. The eigenvalues ζₙ come from the second equation and depend on Bi alone. Higher ' +
      'terms decay fast, so after Fo ≈ 0.2 only n = 1 survives — the one-term approximation behind the Heisler ' +
      'charts. At the centre η = 0 the eigenfunction is 1.',
  };

  const factor = sh.lumpedFactor ? `${N(sh.lumpedFactor)}<mo>⁢</mo>` : '';
  EQUATIONS[`lumped_${g}`] = {
    title: 'Lumped capacitance (only when Bi on V/A < 0.1)',
    params: ['h', 'rho', 'cp', 'processTime', 'Bi', 'Fo'],
    mathml: block(
      row(
        theta,
        O('='),
        `<msup><mi>e</mi><mrow><mo>−</mo>${frac(
          row(S('h', 'h'), I('A'), S('processTime', 't')),
          row(S('rho', 'ρ'), I('V'), Ssub('cp', 'c', 'p')),
        )}</mrow></msup>`,
        O('='),
        `<msup><mi>e</mi><mrow><mo>−</mo>${factor}${D('Bi', 'Bi')}<mo>⋅</mo>${D('Fo', 'Fo')}</mrow></msup>`,
      ),
    ),
    note:
      `For a ${shapeName}, V/A = ${sh.volumeOverArea}. With Bi and Fo on ${sh.Lc} as above, the exponent ` +
      `hAt/(ρVc_p) works out to ${sh.lumpedFactor ? `${sh.lumpedFactor}·` : ''}Bi·Fo. If there is no ` +
      'meaningful gradient inside, the whole object follows one exponential — check the Biot on V/A tile first.',
  };
}

/** Resolve a shape-specific equation id, falling back to the general form. */
const forShape = (base, fallback) => (state) =>
  (EQUATIONS[`${base}_${state.geometry}`] ? `${base}_${state.geometry}` : fallback);

/**
 * Which equations belong to which scenario, in teaching order. An entry may be
 * a function of state, for equations that change with the selected shape.
 */
export const SCENARIO_EQUATIONS = {
  retort: [
    'diffusivity',
    forShape('conduction', 'conduction1D'),
    'boundary',
    forShape('biot', 'biot'),
    forShape('fourier', 'fourier'),
    forShape('series', 'series'),
    forShape('lumped', 'lumped'),
    'lethality',
  ],
  chill: ['diffusivity', 'boundary', forShape('biot', 'biot'), 'plank'],
  milk: ['lmtd', 'epsNtu', 'epsParallel'],
};

/** The equation ids to show for the current state. */
export function scenarioEquationIds(state) {
  return (SCENARIO_EQUATIONS[state.scenario] ?? []).map((e) => (typeof e === 'function' ? e(state) : e));
}

/**
 * The single equation shown INLINE beside each control group, so the maths sits
 * next to the sliders that drive it rather than in a separate column.
 */
/**
 * A group's entry may be a plain id or a function of state, for groups whose
 * relevant equation depends on what is selected.
 *
 * The Geometry group shows the CONDUCTION equation, because that is the one
 * whose coordinates its sliders actually set: Radius bounds r, Height bounds
 * z. It previously showed the Fourier number, which was wrong twice over --
 * Fo is about time, not geometry, and "Fo =" sitting under a Geometry heading
 * reads as "F₀ =", the lethality symbol, which has nothing to do with either.
 */
export const GROUP_EQUATION = {
  // Follows the selected shape, so switching shape visibly changes the maths.
  Geometry: forShape('conduction', 'conduction1D'),
  'Food properties': 'diffusivity',
  'Retort process': 'boundary',
  'Lethality basis': 'lethality',
  'Frozen properties': 'plank',
  'Blast chiller': 'boundary',
  'Plate pack': 'epsNtu',
  Arrangement: 'epsParallel',
};

/** Resolve a group's equation id for the current state. */
export function groupEquationId(groupTitle, state) {
  const entry = GROUP_EQUATION[groupTitle];
  return typeof entry === 'function' ? entry(state) : entry;
}

/* ------------------------------------------------------------------ */
/** Render one equation block. */
export function renderEquation(container, id, { compact = false } = {}) {
  const eq = EQUATIONS[id];
  if (!eq) return null;

  const wrap = document.createElement('figure');
  wrap.className = compact ? 'eq-block eq-compact' : 'eq-block';
  wrap.dataset.eq = id;
  wrap.innerHTML = compact
    ? `<div class="eq-body">${eq.mathml}</div>`
    : `<figcaption class="eq-title">${eq.title}</figcaption>
       <div class="eq-body">${eq.mathml}</div>
       <p class="eq-note">${eq.note}</p>`;
  container.appendChild(wrap);
  return wrap;
}

export function renderEquations(container, ids, options) {
  container.innerHTML = '';
  for (const id of ids) renderEquation(container, id, options);
}

/* ------------------------------------------------------------------ */
/**
 * Symbol highlighting.
 *
 * Highlights every tagged occurrence of `key` across the whole document —
 * inline equations, the equation list, and any result tile carrying the same
 * data-sym. `null` clears.
 */
let activeKey = null;

export function highlightSymbol(key) {
  if (key === activeKey) return;
  activeKey = key;

  // Match on the ATTRIBUTE, not on the .sym class. Result tiles carry
  // data-sym but are not MathML symbols, so a `.sym[data-sym]` selector
  // silently excluded exactly the third link this feature promises —
  // slider → equation → the number it produces.
  for (const el of document.querySelectorAll('[data-sym].is-active')) {
    el.classList.remove('is-active');
  }
  for (const el of document.querySelectorAll('.eq-block.is-active')) {
    el.classList.remove('is-active');
  }
  if (!key) return;

  for (const el of document.querySelectorAll(`[data-sym~="${key}"]`)) {
    el.classList.add('is-active');
    // Mark the containing equation too, so the whole block lifts rather than
    // one glyph flickering inside an otherwise inert panel.
    const block = el.closest('.eq-block');
    if (block) block.classList.add('is-active');
  }
}

/** Every parameter key that appears in at least one equation. */
export function taggedKeys() {
  const keys = new Set();
  for (const eq of Object.values(EQUATIONS)) {
    for (const p of eq.params) keys.add(p);
  }
  return keys;
}
