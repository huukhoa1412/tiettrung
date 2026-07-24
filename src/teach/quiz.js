/**
 * Quiz bank with instant feedback.
 *
 * Every question has an explanation shown for RIGHT answers too, not only
 * wrong ones — a student who guessed correctly and a student who reasoned
 * correctly look identical from the outside, and only one of them has learned
 * anything.
 *
 * Several questions ask the student to read the live simulator rather than
 * recall a fact. Those are marked `live`, and the UI tells them to go and look.
 */

export const QUESTIONS = [
  {
    id: 'bi-meaning',
    topic: 'Biot number',
    question: 'The Biot number compares…',
    options: [
      'How fast heat diffuses with how fast it is stored',
      'Internal conduction resistance with surface film resistance',
      'Process time with the time for heat to cross the food',
      'The medium temperature with the initial temperature',
    ],
    correct: 1,
    explain:
      'Bi = hL/k = (L/k)/(1/h): the food\'s own resistance divided by the film\'s. The FIRST option describes ' +
      'the Prandtl number and the third describes the Fourier number — both easy to confuse with Biot, and ' +
      'both about time rather than resistance.',
  },
  {
    id: 'bi-lumped',
    topic: 'Biot number',
    question: 'Lumped capacitance is normally accepted when…',
    options: ['Bi > 10', 'Bi < 0.1', 'Fo > 0.2', 'Bi ≈ 1'],
    correct: 1,
    explain:
      'Below Bi ≈ 0.1 the internal gradient is small enough to ignore, and the whole object follows one ' +
      'exponential. Fo > 0.2 is a different criterion — it is when the one-term series approximation becomes ' +
      'accurate, which is about how many terms you need, not about whether gradients exist.',
  },
  {
    id: 'fo-scaling',
    topic: 'Fourier number',
    question:
      'A sphere takes 20 minutes for its centre to reach a target. A sphere of the same food with TWICE ' +
      'the radius takes about…',
    options: ['20 min', '40 min', '80 min', '160 min'],
    correct: 2,
    explain:
      'About 80 minutes. Fo = αt/L², so holding Fo fixed while doubling L quadruples t. Diffusion times ' +
      'scale with the square of the distance — this single fact explains most of thermal process design.',
  },
  {
    id: 'h-limit',
    topic: 'Biot number',
    live: true,
    question:
      'A can is processed at Bi = 200. The plant doubles the steam-side coefficient h. The centre heating ' +
      'time will…',
    options: [
      'Roughly halve',
      'Improve slightly — a few per cent at most',
      'Be unchanged exactly',
      'Get worse',
    ],
    correct: 1,
    explain:
      'Barely move. At Bi = 200 the film contributes about half a per cent of the total resistance; ' +
      'doubling h removes half of that. The food\'s own conduction is the bottleneck, and no amount of ' +
      'money spent on the retort will change it. Try it: set h = 2000, note the time, then set h = 4000.',
  },
  {
    id: 'f0-basis',
    topic: 'Lethality',
    question: 'F₀ = 3 min means the process is equivalent to…',
    options: [
      '3 minutes at 100 °C',
      '3 minutes at 121.1 °C, for an organism with z = 10 °C',
      '3 minutes of come-up time',
      'A 3-log reduction',
    ],
    correct: 1,
    explain:
      'F₀ is referenced to 121.1 °C with z = 10 °C. It is an equivalent TIME, not a log count — though with ' +
      'D₁₂₁.₁ = 0.25 min for C. botulinum, F₀ = 3 min happens to deliver 3/0.25 = 12 decimal reductions, ' +
      'the classic "12-D botulinum cook".',
  },
  {
    id: 'f0-shape',
    topic: 'Lethality',
    live: true,
    question: 'Why does the F₀ curve stay flat and then rise almost vertically?',
    options: [
      'The solver only starts integrating once the centre is hot',
      'Lethal rate is exponential in temperature, so it is negligible until the last few degrees',
      'Because F₀ is plotted on a log axis',
      'Because the come-up period is excluded by convention',
    ],
    correct: 1,
    explain:
      'The integrand is 10^((T−121.1)/10). At 101 °C that is 0.01 — a hundred minutes there is worth one ' +
      'minute at reference. Almost all lethality is delivered in the final few degrees, which is why ' +
      'trimming "just a few minutes" off the end of a process is so much more dangerous than it sounds.',
  },
  {
    id: 'cocurrent-ceiling',
    topic: 'Heat exchangers',
    question:
      'A co-current exchanger with balanced capacity rates (C_r = 1) has its effectiveness capped at…',
    options: ['1.0', '0.5', '0.75', 'There is no cap'],
    correct: 1,
    explain:
      'ε → 1/(1+C_r) = 0.5. Both streams converge on the same mixed temperature and the driving force ' +
      'vanishes everywhere at once. Counter-current has no such ceiling: as NTU → ∞, ε → 1.',
  },
  {
    id: 'lmtd-fail',
    topic: 'Heat exchangers',
    question:
      'The app sometimes reports the LMTD as "indeterminate". This happens because…',
    options: [
      'The solver failed to converge',
      'One end of the exchanger has essentially zero temperature difference, so the log mean is 0/0',
      'The flow is turbulent',
      'The area is too large to compute',
    ],
    correct: 1,
    explain:
      'It is a genuine limitation of the method, not a numerical failure. As an exchanger approaches ' +
      'thermal equilibrium, ΔT at one end collapses and Q = UA·ΔT_lm becomes an unbounded area times a ' +
      'vanishing difference. Effectiveness–NTU has no such problem — which is exactly why it exists.',
  },
  {
    id: 'hold-time',
    topic: 'Pasteurisation',
    question:
      'An HTST holding tube is sized so the MEAN residence time is 15 s. Is the process compliant?',
    options: [
      'Yes — 15 s is the requirement',
      'No — the fastest particle must be held 15 s, and it moves faster than the mean',
      'Only if the flow is laminar',
      'Only if the milk is above 75 °C',
    ],
    correct: 1,
    explain:
      'Compliance is set by the FASTEST particle, not the average one. In turbulent flow u_max/u_mean ≈ 1.2, ' +
      'so a 15 s mean gives only about 12.5 s for the quickest milk. In laminar flow the ratio is 2.0 and ' +
      'you would get 7.5 s — half the required hold. This is a real and consequential design error.',
  },
  {
    id: 'plank-bias',
    topic: 'Freezing',
    question: 'Compared with reality, Plank’s equation usually…',
    options: [
      'Overestimates freezing time, because it ignores the film',
      'Underestimates freezing time, because it ignores sensible heat and gradual freezing',
      'Is exact for spheres',
      'Only works below −18 °C',
    ],
    correct: 1,
    explain:
      'It underestimates, typically by 10–30 %. It counts latent heat only — no cooling to the freezing ' +
      'point, no sub-cooling afterwards — and assumes freezing happens at a single temperature rather than ' +
      'over a range. Useful, fast, and always optimistic; treat its answer as a lower bound.',
  },
  {
    id: 'frozen-k',
    topic: 'Freezing',
    question: 'Why is the thermal conductivity of frozen food roughly three to four times higher?',
    options: [
      'Because it is colder, and k rises as temperature falls',
      'Because ice conducts about four times better than liquid water',
      'Because freezing removes air',
      'Because density increases on freezing',
    ],
    correct: 1,
    explain:
      'Ice has k ≈ 2.4 W/m·K against water\'s 0.57 — a factor of four. Since high-moisture food is mostly ' +
      'water, the whole material inherits most of that jump. Density actually FALLS slightly on freezing, ' +
      'which is why containers can bulge.',
  },
  {
    id: 'coldspot-location',
    topic: 'Process design',
    question: 'In a conduction-heated can, the cold spot is at the geometric centre. In a can that heats by CONVECTION (a thin liquid), it is…',
    options: [
      'Still the geometric centre',
      'Lower down, roughly a third of the height from the base',
      'At the lid',
      'Against the side wall',
    ],
    correct: 1,
    explain:
      'Convection currents carry hot liquid up the walls and cool liquid sinks, so the slowest-heating ' +
      'region drifts DOWN, typically to around a third of the height. This simulator models pure ' +
      'conduction, so it locates the cold spot at the centre — correct for solid packs, but a real ' +
      'limitation to be aware of for liquids.',
  },
];

/** A shuffled subset for a quiz round. `rand` is injected so runs are reproducible. */
export function pickQuestions(count = 6, rand = Math.random) {
  const pool = [...QUESTIONS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}
