# Instructor guide — one page

**Open it:** https://zhouxu-lab.github.io/Teaching-food-engineering-heat-transfer/

Offline instead? Right-click `heat-transfer-simulator.html` → *Open with* → your
browser. Do not double-click it: Windows often opens `.html` in Internet
Explorer, which cannot run the app.


## Lesson-to-concept map

| # | Lesson | Concept delivered | The moment that lands it |
|---|---|---|---|
| 1 | **How heat gets in** | Transient conduction; thermal diffusivity α = k/ρc_p | Students guess "10 minutes" for a 30 mm sphere; it takes about 30. The long tail is what a process pays for. |
| 2 | **The Biot number** | Bi = hL/k; which resistance is in charge; lumped capacitance | Raising h from 5 to 5000 — a thousandfold — barely moves the centre. You cannot fix a big can with a better retort. |
| 3 | **Why the centre lags** | The cold spot; Fo = αt/L² and the L² scaling | Doubling the radius quadruples the time. Then switching to the infinite cylinder shows what ignoring the lids costs. |
| 4 | **F₀ and process design** | Lethality is exponential in temperature | The F₀ curve sits flat on the axis, then leaps. Almost all killing happens in the last few degrees. |
| 5 | **Why counter-current wins** | ε-NTU; the co-current ceiling ε → 1/(1+C_r) | Identical hardware: co-current leaves milk at 50 °C, counter-current at 78 °C. One cannot pasteurise at any area. |
| 6 | **The freezing plateau** | Latent heat; Plank's equation and its assumptions | The resistance-split tile flips from film-controlled to conduction-controlled as thickness grows — and with it, what you'd fix. |

Each lesson is **read → predict → reveal**. The prediction step is the one that
matters; a student who has committed to a wrong answer remembers the correction.
Nothing is locked, so they can wander off and drag sliders mid-lesson.

---

## Suggested teaching sequence

**Lecture 1 — conduction and the dimensionless groups.** Lessons 1–3.
Project *Explore* mode with a can, orbit the cutaway while the field animates.
The single most useful live demonstration is dragging the radius slider and
watching the F₀ target go from "reached at 41 min" to "not reached".

**Lecture 2 — process design.** Lesson 4. Set a target F₀ and have the class
size the process. Then raise the retort temperature and discuss why HTST works:
microbial death has z ≈ 10 °C, quality damage z ≈ 25–33 °C, so hotter-and-shorter
buys safety faster than it costs quality.

**Lecture 3 — convection and exchangers.** Lesson 5. Start in co-current, add
area until the class agrees it has stalled, then flip the arrangement. Follow
with the holding tube: mean residence time is *not* the compliance criterion.

**Lecture 4 — freezing.** Lesson 6. Use *Compare* to pin a thin product against
a thick one and read the resistance split.

**Self-study.** *Quiz* mode, twelve questions with explanations on right answers
as well as wrong ones. Several are marked as answerable by experiment.

---

## Five demonstrations that reliably produce an argument

1. **Two cans, same food.** *Compare* → pin R = 30 mm → set R = 121 mm.
   F₀ goes from 16.5 min to 0.00. Ask why it is not merely four times slower.
2. **Money on the wrong resistance.** Lesson 2, Bi ≈ 200, double h. Almost
   nothing happens. Ask what they would spend the money on instead.
3. **The infinite cylinder tax.** Switch a can to *Infinite cylinder*. The
   predicted centre is several degrees colder. Conservative — but you pay for it
   in overcooked product.
4. **Co-current cannot pasteurise.** Lesson 5. Add plates indefinitely; ε stops.
   The AT CEILING badge appears while the milk is still too cold.
5. **The hold-time trap.** Milk line, set tube length so the *mean* residence is
   15 s. The fastest particle gets 12.5 s and the badge turns red. Then switch
   the regime to laminar and watch it halve again.

---

## The equipment view

The food is drawn **inside its process equipment**: a vertical still retort with
rack, steam inlet and vent; an air-blast chiller with evaporator fan and airflow
across the product; the plate pack with both streams and the holding tube. The
**Equipment** checkbox on the 3-D view turns it off if you want the bare
boundary-value problem instead.

This is worth a minute of lecture time on its own. The airflow arrows in the
chiller *are* the surface coefficient; the steam line *is* the medium
temperature. Students who have seen where *h* and T∞ come from stop treating
them as arbitrary numbers in a formula.

**The retort is modelled as a real spray vessel.** Three ring headers feed
twenty-four wall-mounted nozzles that fire conical fans radially inward; the
fans from opposite walls collide in the middle and merge into the uniform mist
that fills the chamber. That overlap is the whole design intent of a
distribution system — no can may sit in a cold pocket — and it is worth saying
out loud, because it is the physical reason we may treat T∞ and *h* as uniform
over the whole surface in the maths. The air vent, steam valve and water valve
are drawn and labelled; callouts stay attached to the model as you orbit.

**The heating medium is animated and switchable.** *Saturated steam* fills the
chamber with billowing vapour and vents a plume at the crown; *Water immersion*
floods the vessel and sprays hot water instead. Switching also **sets a
representative h** — 6000 W/m²K for condensing steam, 1200 for hot water —
because that is a real physical consequence, not just a change of picture. The
slider stays free afterwards, so it is a starting point rather than a lock.

That toggle is a demonstration in itself: same can, same 50 minutes, and the
Biot number moves from about 436 to about 87 while F₀ drops from 9.8 to 9.0 min.
Ask the class *why the F₀ barely moved* when h fell fivefold — the answer is
that at Bi ≫ 1 the film was never the bottleneck.

**Colour map.** The default is the COMSOL **Rainbow** table, so the picture
matches what students see in COMSOL and most simulation output. Be aware it is
not perceptually uniform — the green band compresses a wide temperature range
into one apparent shade — which is why the colour bar is always on screen. A
**Viridis (colour-blind safe)** option sits beside it in the dropdown; roughly
one man in twelve cannot reliably separate rainbow's red and green ends, so it
is worth switching if a student reports difficulty.

## Reading the interface

- **Badges change state at pedagogically meaningful thresholds**: LUMPED OK at
  Bi < 0.1, SAFE/UNDER-PROCESSED at the F₀ target, AT CEILING when co-current
  effectiveness saturates, BELOW 15 s on the holding tube.
- **Every plot has a "Data" button** that opens the underlying table — useful for
  problem sets, and the accessible path to the same numbers.
- **The equations panel** shows the governing equation next to each scenario with
  a plain-language note on what it *means*.
- **Presets cite their sources**, including USDA FoodData Central IDs. Properties
  are computed from composition via Choi–Okos, not looked up, so students can
  ask why frozen conductivity is roughly four times higher and get an answer
  from the model.

## What the tool deliberately does not model

Worth saying out loud in class, because the limitations are themselves teaching
material:

- **Conduction only** — no convection currents inside the container. For liquid
  packs the real cold spot sits around a third of the height, not the centre.
- **Instant come-up** — real retorts take minutes to reach temperature, and that
  period contributes lethality.
- **Constant properties**, evaluated once at a representative temperature.
- **Plank for freezing** — latent heat only, so it *underestimates* freezing time
  by typically 10–30 %. The app says so on screen.

Full detail, with numbers, in [validation-note.md](validation-note.md).
