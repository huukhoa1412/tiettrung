# Instructor guide — one page

**Open it:** https://zhouxu-lab.github.io/Teaching-food-engineering-heat-transfer/

Offline instead? Right-click `heat-transfer-simulator.html` → *Open with* → your
browser. Do not double-click it: Windows often opens `.html` in Internet
Explorer, which cannot run the app.

---

## Connecting equations to parameters — the core teaching mechanism

The gap this tool is built to close is between **the slider a student is
dragging** and **the letter in the equation**. Three things do that:

1. **Each control group carries its own equation, inline.** The Geometry group
   shows the *conduction equation*, because its sliders set the coordinates in
   it — Radius bounds r, Height bounds z, and the equation switches between the
   1-D and 2-D forms as you change shape. α = k/ρc_p sits with the food
   properties; the convective boundary condition sits with *h*; the lethality
   integral sits with T_ref and z. The maths is beside the sliders that feed it,
   not in a separate column.
2. **Hovering a control lights up its symbol everywhere it appears** — in the
   inline equation, in the full equation list below, and on the result tile it
   produces. Hovering *k* lights up *k* in α = k/ρc_p **and** in
   −k ∂T/∂n = h(T_s − T_∞) at once, which is itself the lesson: the same
   property governs two different things.
3. **The link runs backwards too.** Hovering a result tile lights up the symbol
   and the control that produced it, so a student who notices a number
   behaving oddly can trace it to its parameter without hunting.

Worth doing on the projector once, slowly, before any lesson content.

---

## Demonstrations that reliably produce an argument

1. **Size dominates everything.** Drag the Radius slider from 43.7 mm to its
   maximum, 90 mm. The retort does not move — it is fixed hardware — but the
   can visibly fills much more of it, the cold spot falls from about 90 °C to
   about 36 °C at the same instant, Bi goes 436 → 900, and the F₀ tile flips to
   **under-processed**. Ask why doubling the radius did far more damage than
   doubling the time would repair: the answer is the L² in the Fourier number.
2. **The lids are not decoration.** Switch Shape from *Can* to *Cylinder* at
   the same radius. The cold spot drops from about 90 °C to 85 °C, because the
   infinite cylinder throws away the heat entering through both ends. That
   difference is the whole second term of the 2-D equation shown in the
   Geometry group.
3. **Money on the wrong resistance.** At the default Bi ≈ 436, drag *h* up and
   down. Almost nothing happens. Ask what they would spend the money on
   instead. Then drop *h* to ~5 and watch Bi cross into the lumped regime and
   the badge change.
4. **Steam versus water.** Switch the heating medium. It sets a representative
   *h* (6000 vs 1200 W/m²K) and the spray changes. Same can, same time — and
   F₀ barely moves. Why? Because at Bi ≫ 1 the film was never the bottleneck.
5. **The cold spot is the process.** Scrub the timeline and watch the cutaway.
   Every number in Live results follows the scrubber, so the tile and the
   picture always describe the same instant.
6. **F₀ arrives late.** Watch the F₀ plot stay flat on the axis and then leap.
   Almost all lethality is delivered in the last few degrees, which is why
   trimming "just a few minutes" is far more dangerous than it sounds.

---

## Reading the interface

- **Two Biot numbers are shown, and they are different on purpose.**
  *Bi on L_c* is the one in the equation block and the one whose 0.1 / 10
  thresholds describe the gradient regime. *Bi on V/A* is the one the
  lumped-capacitance criterion is properly built on, and it carries the
  LUMPED OK / GRADIENT badge. They differ by the shape factor. Students who
  notice the difference have found something real.
- **Gauges show regime, not just value.** Bi and Fo each sit on a log scale
  with the teaching thresholds marked, so the number is read as a position.
- **Fo and F₀ are different quantities that look alike.** *Fo* (roman “o”) is
  the **Fourier number**, a dimensionless time. *F₀* (subscript zero) is
  **lethality in equivalent minutes**. Worth saying out loud once — students
  reliably read one as the other, and the two equation blocks now say so
  explicitly in their notes.
- **F₀ is only called F₀ on its own basis.** Move T_ref or z and the label
  changes to F(T_ref, z), because F₀ means 121.1 °C with z = 10 °C and nothing
  else.
- **Editing a property drops the citation.** Drag k, ρ or c_p away from a
  preset and the dropdown says *Custom (edited)* — the USDA source no longer
  describes the numbers being solved.
- **Every plot has a "Data" button** that opens the underlying table.

## The equipment view

The food is drawn inside a spray retort: three ring headers feed twenty-four
wall nozzles firing conical fans inward, which collide in the middle and merge
into the uniform mist that fills the chamber. That overlap is the design intent
of the distribution system — no can may sit in a cold pocket — and it is the
physical reason we may treat *h* and T∞ as uniform in the maths. The air vent,
steam valve and water valve are drawn and labelled; callouts stay attached as
you orbit. The **Equipment** checkbox turns it all off.

The vessel NEVER changes. It is fixed hardware, exactly as in a plant: you do
not buy a new retort because you changed can size. Only the food changes size
inside it, which is the comparison the size sliders exist for. The slider
ranges are bounded so the food always fits: radius 10–90 mm covers every
standard can (a No. 10 is 78 mm), and height 30–250 mm likewise.

**Colour map.** Default is **Rainbow**, matching COMSOL and most simulation
output. It is not perceptually uniform — the green band compresses a wide range
— which is why the colour bar is always on screen. A **Viridis
(colour-blind safe)** option sits beside it; roughly one man in twelve cannot
reliably separate rainbow's red and green ends.

## What the tool deliberately does not model

- **Conduction only** — no convection currents inside the container. For liquid
  packs the real cold spot sits around a third of the height, not the centre.
- **Instant come-up** — real retorts take minutes to reach temperature.
- **Constant properties**, evaluated once at a representative temperature.
- **Plank for freezing** — latent heat only, so it *underestimates* freezing
  time by typically 10–30 %. The app says so on screen.

Full detail, with numbers, in [validation-note.md](validation-note.md).
