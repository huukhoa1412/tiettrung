/**
 * Guided lessons.
 *
 * SHAPE OF EVERY LESSON
 * Read a short framing, COMMIT TO A PREDICTION, then see the simulation
 * answer it. The prediction step is the part that matters: a student who has
 * publicly guessed "the centre will be about the same" and then watches it lag
 * by forty degrees remembers the Biot number. A student who is shown the same
 * plot without guessing first usually does not.
 *
 * Each step may carry `apply`, a patch pushed into the store, so the lesson
 * drives the simulator rather than describing it. Students can still touch any
 * control at any time; nothing here locks the interface.
 */

export const LESSONS = [
  /* ---------------------------------------------------------------- */
  {
    id: 'conduction',
    title: '1 · How heat gets in',
    concept: 'Transient conduction, thermal diffusivity, the role of the surface',
    setup: {
      scenario: 'retort', geometry: 'sphere', radius: 0.03, presetId: 'cannedPeas',
      h: 2000, Tinitial: 20, Tmedium: 121.1, processTime: 3600, cutaway: 0.5,
    },
    steps: [
      {
        type: 'read',
        title: 'Heat has to travel',
        body:
          'A can in a retort is surrounded by steam at 121 °C. The steam reaches the outside instantly, ' +
          'but the middle of the food is millimetres of solid away, and food conducts heat poorly — about ' +
          'as well as water, and roughly four hundred times worse than steel.\n\n' +
          'Press play and watch the colour move inward.',
      },
      {
        type: 'predict',
        question:
          'The sphere is 30 mm in radius. Its surface reaches nearly 121 °C within a minute or two. ' +
          'Roughly how long until the CENTRE is within 1 °C of the steam?',
        options: ['About 2 minutes', 'About 10 minutes', 'About 30 minutes', 'Over an hour'],
        correct: 2,
        reveal:
          'Around half an hour. Look at the centre-temperature plot: it barely moves for the first few ' +
          'minutes, then rises, then creeps. That long tail is the thing every thermal process has to pay for. ' +
          'The delay is not because heat enters slowly — the surface is hot almost at once — but because it ' +
          'must diffuse through the food.',
      },
      {
        type: 'read',
        title: 'What controls the speed',
        body:
          'The property that governs the timing is not conductivity k on its own but the thermal ' +
          'diffusivity α = k/(ρc_p) — conductivity divided by the heat the material must absorb to change ' +
          'temperature. Most high-moisture foods sit near 1.4×10⁻⁷ m²/s, which is why processes for foods ' +
          'of similar size come out similar regardless of what the food is.\n\n' +
          'Try dragging k and watch how far you have to push it to halve the heating time.',
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'biot',
    title: '2 · The Biot number',
    concept: 'Bi = hL/k: which resistance is in charge',
    setup: {
      scenario: 'retort', geometry: 'sphere', radius: 0.03, h: 5,
      Tinitial: 20, Tmedium: 121.1, processTime: 3600, cutaway: 0.5,
    },
    steps: [
      {
        type: 'read',
        title: 'Two resistances in series',
        body:
          'Heat crosses two obstacles: the fluid film at the surface (resistance 1/h) and the food itself ' +
          '(resistance L/k). Their ratio is the Biot number, Bi = hL/k.\n\n' +
          'Right now h is only 5 W/m²K — still air. Look at the Biot number in the results panel, and at ' +
          'the temperature profile plot.',
      },
      {
        type: 'predict',
        question:
          'With Bi well below 0.1, what does the temperature PROFILE inside the sphere look like?',
        options: [
          'Steep — the surface is hot, the centre still cold',
          'Almost flat — the whole sphere is at nearly one temperature',
          'Flat near the centre, steep near the surface',
        ],
        correct: 1,
        reveal:
          'Almost flat. When the film is the bottleneck, heat trickles in so slowly that conduction has no ' +
          'trouble spreading it evenly. The whole object rises together — this is the lumped-capacitance ' +
          'regime, and one exponential describes it. Note the LUMPED OK badge.',
      },
      {
        type: 'predict',
        apply: { h: 5000 },
        question:
          'h has just been raised to 5000 W/m²K — condensing steam. Biot is now in the hundreds. ' +
          'The centre now reaches 120 °C…',
        options: [
          'Much sooner — a thousandfold better h means a thousandfold faster',
          'Somewhat sooner, but nothing like a thousandfold',
          'At almost exactly the same time as before',
        ],
        correct: 1,
        reveal:
          'Sooner, but with steeply diminishing returns. Once Bi ≫ 1 the film has stopped being the ' +
          'bottleneck — the food\'s own conduction is. Raising h further changes almost nothing, because you ' +
          'are improving the resistance that is no longer in charge.\n\n' +
          'This is the practical lesson: know which resistance dominates before you spend money on the ' +
          'other one. A better retort cannot fix a can that is too big.',
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'coldspot',
    title: '3 · Why the centre lags',
    concept: 'The cold spot, and why can size dominates process time',
    setup: {
      scenario: 'retort', geometry: 'finiteCylinder', radius: 0.04365, canHeight: 0.1159,
      h: 3000, Tinitial: 20, Tmedium: 121.1, processTime: 7200, cutaway: 0.6,
    },
    steps: [
      {
        type: 'read',
        title: 'The slowest-heating point sets the process',
        body:
          'A process is safe only when its WORST point is safe. In a conduction-heated can that point is ' +
          'the geometric centre — the cold spot. Everything else is hotter, so if the centre is sterile the ' +
          'can is sterile.\n\n' +
          'Orbit the 3-D view and look into the cut. The cool core is what the whole process time is buying.',
      },
      {
        type: 'predict',
        question:
          'Double the can\'s radius, keeping everything else fixed. The time for the centre to reach a ' +
          'given temperature goes up by roughly…',
        options: ['×2', '×4', '×8', 'It barely changes'],
        correct: 1,
        reveal:
          'About ×4. Diffusion time scales with the SQUARE of the distance — it is in the Fourier number, ' +
          'Fo = αt/L². Doubling the radius quadruples the time.\n\n' +
          'Change the radius slider from 43.65 to 87 mm and watch. This is why large institutional cans are ' +
          'so hard to process without overcooking the outside, and why retort pouches — thin — are so much faster.',
      },
      {
        type: 'predict',
        apply: { geometry: 'cylinder' },
        question:
          'The geometry has just been switched from the real finite can to the INFINITE cylinder, which ' +
          'ignores the lids. Compared with the real can, its predicted centre temperature will be…',
        options: ['Higher — it heats faster', 'Lower — it heats slower', 'Identical'],
        correct: 1,
        reveal:
          'Lower: the infinite cylinder heats more slowly, because it throws away the heat entering through ' +
          'both lids. For a squat can that is a real difference — several degrees at the centre.\n\n' +
          'The idealisation is conservative, which is why it is tolerable for safety work, but it is not ' +
          'free: designing to it means overcooking the product. Switch back to Can and compare.',
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'f0',
    title: '4 · F₀ and designing a process',
    concept: 'Lethality accumulates exponentially with temperature',
    setup: {
      scenario: 'retort', geometry: 'finiteCylinder', radius: 0.04365, canHeight: 0.1159,
      h: 3000, Tinitial: 20, Tmedium: 121.1, processTime: 9000, targetF0: 3, cutaway: 0.5,
    },
    steps: [
      {
        type: 'read',
        title: 'Counting equivalent minutes',
        body:
          'Microbial death is exponential in temperature. F₀ counts how many minutes at 121.1 °C the ' +
          'process is WORTH, weighting every instant by 10^((T−121.1)/10). Ten degrees cooler counts for a ' +
          'tenth as much; twenty degrees cooler, a hundredth.\n\n' +
          'The target for low-acid canned food is F₀ = 3 min — a twelve-decimal reduction of C. botulinum.',
      },
      {
        type: 'predict',
        question:
          'Look at the F₀ plot. For most of the process the curve is flat on the axis. Why?',
        options: [
          'Because nothing is being killed until the centre is nearly at retort temperature',
          'Because the plot has a bug',
          'Because lethality only counts after the come-up period',
        ],
        correct: 0,
        reveal:
          'Because lethality below about 100 °C is negligible on this scale. At 100 °C the lethal rate is ' +
          '10^(−2.1) ≈ 0.008 — an hour there is worth half a minute at 121 °C.\n\n' +
          'This is why F₀ leaps at the end. Nearly all the killing happens in the last few degrees and the ' +
          'last few minutes, which is exactly the part of the process a shortcut would remove.',
      },
      {
        type: 'predict',
        apply: { Tmedium: 130 },
        question:
          'The retort has been raised from 121.1 to 130 °C. Everything else is unchanged. The time to ' +
          'reach F₀ = 3 will fall by roughly…',
        options: ['A few per cent', 'Around a quarter', 'Around half or more'],
        correct: 2,
        reveal:
          'Dramatically — roughly half or better. Nine degrees is nearly one z-value, so the lethal rate at ' +
          'the cold spot rises almost tenfold once it gets there.\n\n' +
          'This is the basis of HTST thinking: hotter and shorter delivers the same safety with less ' +
          'cooking. The catch is that quality damage has its own, much larger z (around 25–33 °C), so it ' +
          'is far less sensitive to temperature than microbial death. Raising the temperature therefore ' +
          'buys safety faster than it costs quality — the whole reason HTST exists.',
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'counter',
    title: '5 · Why counter-current wins',
    concept: 'Effectiveness, NTU, and the co-current ceiling',
    setup: {
      scenario: 'milk', arrangement: 'parallel', U: 3500, area: 6,
      ThotIn: 85, TcoldIn: 4, mdotHot: 1.2, mdotCold: 1.0,
    },
    steps: [
      {
        type: 'read',
        title: 'Same hardware, two plumbing choices',
        body:
          'A plate pack can be piped so the streams flow the same way (co-current) or in opposition ' +
          '(counter-current). Same plates, same area, same coefficient — only the direction changes.\n\n' +
          'The view is currently CO-CURRENT. Watch the tracers: both streams run the same way.',
      },
      {
        type: 'predict',
        question:
          'Co-current, with this area. If you kept ADDING plates — doubling, tripling the area — the milk ' +
          'outlet temperature would eventually…',
        options: [
          'Approach the hot inlet temperature, 85 °C',
          'Stop at some temperature below 85 °C, no matter how much area you add',
          'Keep rising without limit',
        ],
        correct: 1,
        reveal:
          'It stops. Both streams march towards the SAME mixed temperature, and once they meet there is no ' +
          'driving force left anywhere in the exchanger. Effectiveness is capped at 1/(1+C_r) — with these ' +
          'flows, about 0.56.\n\n' +
          'Drag the area slider up and watch ε stop moving and the AT CEILING badge appear. Infinite area, ' +
          'still not pasteurised.',
      },
      {
        type: 'predict',
        apply: { arrangement: 'counter' },
        question:
          'Now switched to COUNTER-CURRENT — same area, same everything. The milk outlet will be…',
        options: ['About the same', 'Somewhat warmer', 'Dramatically warmer'],
        correct: 2,
        reveal:
          'Dramatically warmer — from roughly 50 °C to nearly 78 °C on identical hardware. One arrangement ' +
          'cannot pasteurise; the other has margin to spare.\n\n' +
          'The reason is visible in the profile plot: counter-current keeps a temperature difference along ' +
          'the WHOLE length, instead of spending it all at the inlet. The hot stream meets progressively ' +
          'hotter milk as it cools. There is no ceiling below ε = 1.',
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'plateau',
    title: '6 · The freezing plateau',
    concept: 'Latent heat, Plank’s equation, and what it leaves out',
    setup: {
      scenario: 'chill', geometry: 'slab', halfThickness: 0.025, presetId: 'leanBeef',
      chillH: 30, chillMedium: -35, Tinitial: 10,
    },
    steps: [
      {
        type: 'read',
        title: 'Where the time goes',
        body:
          'Cooling meat from 10 °C to its freezing point removes sensible heat. Converting its water to ice ' +
          'removes LATENT heat — about 240 kJ per kg of food, which is as much as cooling it by sixty ' +
          'degrees would.\n\n' +
          'All of that comes out at essentially one temperature, so the centre temperature stops falling ' +
          'and sits on a plateau. Look at the plateau plot.',
      },
      {
        type: 'predict',
        question:
          'Plank\'s equation has two terms: surface film and frozen-layer conduction. For this 50 mm slab ' +
          'in a 30 W/m²K blast chiller, which dominates — and therefore what would you change first?',
        options: [
          'The film — so raise h (faster air)',
          'The conduction — so make the product thinner',
          'They are about equal',
        ],
        correct: 0,
        reveal:
          'The film dominates here — check the resistance-split tile. At this thickness and this modest h, ' +
          'most of the resistance is the air film, so faster air buys real time.\n\n' +
          'Now drag the thickness up. Watch the split shift towards conduction: the conduction term goes as ' +
          'a², the film term only as a. Past some thickness, better air stops helping and only a thinner ' +
          'product will do.',
      },
      {
        type: 'read',
        title: 'What Plank does not know',
        body:
          'Plank counts latent heat only. It assumes the food is ALREADY at its freezing point, that ' +
          'freezing happens at a single temperature, and that the frozen shell has constant properties.\n\n' +
          'None of those is quite true. Real foods freeze over a range, because as water crystallises the ' +
          'remaining solution concentrates and its freezing point falls further. So Plank UNDERESTIMATES ' +
          'real freezing time, typically by 10–30 %.\n\n' +
          'The two legs either side of the plateau in the plot come from the full conduction solver; only ' +
          'the plateau is Plank\'s. Knowing which part of a curve comes from which model — and where each ' +
          'stops being trustworthy — is most of engineering judgement.',
      },
    ],
  },
];

/** Look up a lesson by id. */
export function getLesson(id) {
  return LESSONS.find((l) => l.id === id) ?? null;
}
