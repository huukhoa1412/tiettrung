# Heat-Transfer Simulator

An interactive teaching tool for undergraduate food engineering: transient
conduction in canned foods, freezing with a phase-change plateau, and
continuous pasteurisation in a plate heat exchanger.

**Free, open, zero-install, and fully offline.** One HTML file, no dependencies,
no build required to run it, no network access at any point.

---

## Running it

Double-click **`heat-transfer-simulator.html`**.

That is the whole procedure. It opens in any current browser, works from a USB
stick or a learning-management system, and never contacts the network. Nothing
to install, no server, no npm.

### Rebuilding it after editing

The source is modular; the deliverable is flattened. Node 18 or newer:

```bash
node build.mjs
```

This inlines every module and stylesheet into the single HTML file. The build
script has **no dependencies** — there is no `npm install`, so nothing can rot.

### Checking the physics

```bash
node test/validate.mjs
```

44 checks against analytical solutions, published tables and closed energy
balances. Exit code 0 means all passed. See
[docs/validation-note.md](docs/validation-note.md).

---

## What it covers

**Retort sterilisation.** Transient conduction in a slab, infinite cylinder,
sphere, or a real finite can solved in two dimensions. Live Biot and Fourier
numbers, lumped-capacitance validity, and an F₀ lethality curve at the cold spot.
The can is shown **inside a vertical still retort** — on its rack, with the steam
inlet and the vent — and the cutaway reveals the true interior field.

**Chill and freeze.** The product sits **inside an air-blast chiller** — evaporator
fan, wire shelf and airflow across the surface, which is what *h* physically is
here. Freezing uses Plank's equation with an animated front; during the plateau
the frozen shell carries its real quasi-steady profile (linear, logarithmic or
1/r by geometry), derived from the same model that gives the freezing time.
Pre-cooling and sub-cooling come from the full transient solver, and the seams
between the two models are labelled on the plot.

**Milk line (HTST).** Plate heat exchanger at 72 °C with a 15 s hold. LMTD and
ε-NTU side by side, co-current versus counter-current, and a holding tube that
checks the *fastest* particle rather than the average one.

### Four modes

- **Explore** — free experimentation with every parameter
- **Learn** — six guided lessons, each read → predict → reveal
- **Quiz** — twelve questions with explanations for right answers too
- **Compare** — pin a run, change something, see both with a difference column

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
- Quiz feedback uses a glyph and a border as well as colour
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
