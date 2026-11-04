# Heat-Transfer Simulator

An interactive teaching tool for undergraduate food engineering: transient
conduction in canned foods, freezing with a phase-change plateau, and
continuous pasteurisation in a plate heat exchanger.

---

## Running it

### Easiest — just open the link

**https://zhouxu-lab.github.io/Teaching-food-engineering-heat-transfer/**

Nothing to download, nothing to install. Works on any computer, tablet or
phone, and on any current browser.

## What it covers

**Retort sterilisation.** Transient conduction in the three classic idealised
shapes — slab, cylinder (radial conduction, the textbook model of a can) and
sphere. Live Biot and Fourier numbers, lumped-capacitance validity, and an F₀
lethality curve at the cold spot. The product is shown **inside a vertical still
retort** — on its rack, with the steam inlet and the vent — and the cutaway
reveals the true interior field.

> **This build ships the retort scenario only.** Chill & freeze and the milk
> line are still under development: their tabs appear but are disabled, and the
> code and tests for them remain in the tree (nothing is deleted). The two
> sections below describe where that work is headed.

**Chill and freeze** *(in development).* The product sits **inside an air-blast
chiller** — evaporator fan, wire shelf and airflow across the surface, which is
what *h* physically is here. Freezing uses Plank's equation with an animated
front; during the plateau the frozen shell carries its real quasi-steady profile
(linear, logarithmic or 1/r by geometry), derived from the same model that gives
the freezing time. Pre-cooling and sub-cooling come from the full transient
solver, and the seams between the two models are labelled on the plot.

**Milk line (HTST)** *(in development).* Plate heat exchanger at 72 °C with a
15 s hold. LMTD and ε-NTU side by side, co-current versus counter-current, and a
holding tube that checks the *fastest* particle rather than the average one.

### Connecting the maths to the sliders

The hardest gap in a heat-transfer course is between *the number I am dragging*
and *the letter in the equation*. So every symbol in every equation is tagged
with the parameter that drives it:

- each control group shows **the equation it drives, inline beside its sliders**
- **hovering a control lights up its symbol everywhere** — in the inline
  equation, in the full equation list, and on the result tile it produces
- hovering a **result tile** lights up the same chain in reverse

The guided-lesson, quiz and compare modes have been set aside for now; the
tool is a single Explore mode. Their source is still in `src/teach/` and
`src/ui/teachpanel.js`, unreferenced and therefore not bundled, if they are
wanted back.

---

## Stack, and why

| Choice | Reason |
|---|---|
| Vanilla ES modules | The expensive work is numerical; a framework would add a dependency and buy nothing |
| Raw WebGL2, no library | The cutaway must show the *real interior field*, which needs a custom shader and cap geometry either way — a library would contribute only matrix maths and orbit controls, for several hundred kilobytes |
| Canvas 2-D fallback | Locked-down lab machines and remote desktops ship broken WebGL more often than one would like; a lecture should not stop for it |
| Native MathML | Real typeset equations with no KaTeX/MathJax payload and no web fonts |
| Custom canvas plots | Six plot types with log axes and reference markers; a charting library costs 200 kB for less control |
| Zero-dependency Node build script | Keeps the source modular without making the deliverable depend on a toolchain |

**No third-party code ships in the deliverable.**

---

## Numerical method

**Crank–Nicolson** in one dimension; **ADI (Peaceman–Rachford)** for the
two-dimensional can. Both on a **finite-volume** mesh.

- *Finite volume, not finite difference* — the 1/r singularity at the axis falls
  out for free (the first cell's inner face has zero area), and conservation is
  exact by construction.
- *Implicit, not explicit* — an explicit scheme needs Δt ≤ Δx²/2α, so a student
  dragging *h* upward would eventually make it explode mid-lecture.
  Unconditional stability is what makes the sliders safe.
- *Graded backward-Euler startup* — Crank–Nicolson is A-stable but not L-stable
  and rings on the step change at t = 0. The first frame is covered by 30
  geometrically graded backward-Euler sub-steps, which also resolves the
  near-singular surface flux and improved the energy balance by three orders of
  magnitude.

Observed order of accuracy: **1.99** in both 1-D and 2-D.

---

## Food properties

Computed from composition via the **Choi–Okos (1986)** correlations rather than
tabulated, so every value is traceable. Compositions come from USDA FoodData
Central with their record IDs; freezing points and reference properties from
ASHRAE.

Validation: pure water lands within 0.2 % of steam tables for ρ and c_p across
0–100 °C, ice at −20 °C within 0.2 %, and computed specific heats sit within
0.1–3.5 % of ASHRAE's *independently tabulated* values for the same foods.

One deliberate departure from the printed ASHRAE table — the fat conductivity
coefficient, which as printed yields negative conductivity above 65 °C — is
documented in [the validation note](docs/validation-note.md#8-food-properties-choiokos-1986)
and in the source.

---

## Project layout

```
heat-transfer-simulator.html   ← THE DELIVERABLE: one file, offline
build.mjs                      ← zero-dependency bundler
test/validate.mjs              ← 44-check physics harness
docs/
  instructor-guide.md          ← one page: lesson → concept map
  validation-note.md           ← numerical vs analytical; energy balances
src/
  physics/    tridiag · bessel · analytical · timestep
              conduction1d · conduction2d · lethality · freezing · exchanger
  core/       state · units · presets · solve
  render/     gl · mesh · field · colormap · fallback2d · exchanger2d · stage
  ui/         panel · readout · plot · plots · mathblocks · teachpanel · compare
  teach/      lessons · quiz
```

Edit anything under `src/`, run `node build.mjs`, reload.

---

## Accessibility and classroom use

- Base type 17 px, nothing meaningful below 15 px; body text meets WCAG AAA
- Light and dark themes, both deliberately stepped rather than auto-inverted
- Chart palette validated for colour-vision deficiency against the app's own
  surfaces (worst adjacent ΔE 9.2 light / 9.4 dark)
- Every chart carries a legend plus direct labels — identity is never colour
  alone — and a table view for the same numbers
- The symbol highlight uses a background chip and a weight change, not colour
  alone, so it survives colour-vision deficiency and greyscale projection
- Respects `prefers-reduced-motion`

---

## Known limitations

Conduction only (no convection currents inside the container, so the cold spot
for liquid packs is placed at the centre rather than a third of the height);
constant properties; instant come-up; Plank's equation for freezing, which
underestimates real freezing times by typically 10–30 %; uniform *h*.

These are stated in the interface as well as here — the assumptions are part of
the lesson. Full detail in [docs/validation-note.md](docs/validation-note.md#9-known-limitations).

---

## Licence

Free and open for teaching use. The physics modules under `src/physics/` have no
dependency on the interface and can be lifted into other coursework directly.
