# Validation note

Every number below is produced by `node test/validate.mjs`. Re-run it any time;
the harness exits non-zero if any check fails, so this document can be
regenerated rather than trusted.

**Current status: 44 checks, 0 failures.**

---

## 1. What is being validated, and against what

The two things that could silently be wrong in a tool like this are the
numerical solver and the property data. Each is checked against a source
independent of itself:

| Component | Checked against |
|---|---|
| 1-D conduction solver | Exact separation-of-variables series (full series, not the one-term form) |
| 2-D can solver | The **exact** product solution θ_cyl × θ_slab |
| Bessel functions | Tabulated zeros of J₀ and J₁, plus six tabulated spot values |
| Eigenvalues and coefficients | Incropera & DeWitt Table 5.1; independently, series completeness at Fo = 0 |
| Energy conservation | Closed balance: stored energy change vs. heat crossing the surface |
| Heat exchanger | Three independent routes to the same duty (LMTD, ε-NTU, marched ODEs) |
| Plank freezing | The front integral must reproduce the closed-form shape factors |
| Food properties | Steam tables for water; ASHRAE Table 3 for four real foods |

---

## 2. Transient conduction, one dimension

Crank–Nicolson on a finite-volume mesh, with graded backward-Euler startup.
Compared against the analytical series at Fo > 0.01, over five decades of Biot
number. Errors are in dimensionless temperature θ, so 1e-5 corresponds to
about 0.001 K on a 100 K span.

| Geometry | Bi = 0.1 | Bi = 1 | Bi = 10 | Bi = 100 | Bi = 1000 |
|---|---|---|---|---|---|
| Slab | 2.6e-7 | 1.7e-6 | 4.5e-6 | 5.6e-6 | 5.7e-6 |
| Cylinder | 6.2e-7 | 4.3e-6 | 1.1e-5 | 1.3e-5 | 1.3e-5 |
| Sphere | 1.0e-6 | 7.1e-6 | 2.0e-5 | 2.4e-5 | 2.5e-5 |

**Worst case 2.5e-5**, i.e. about 0.0025 K. Error grows with Biot number, as
expected: high Bi means a steep near-surface gradient for the mesh to resolve.

### Convergence order

Halving mesh spacing and time step together should divide the error by four for
a second-order scheme.

| Cells | Error | Ratio | Order |
|---|---|---|---|
| 20 | 6.13e-4 | | |
| 40 | 1.65e-4 | 3.72 | 1.89 |
| 80 | 4.23e-5 | 3.90 | 1.96 |
| 160 | 1.07e-5 | 3.97 | **1.99** |

Second order confirmed. This is what justifies the Crank–Nicolson choice over
an explicit scheme: the time step can be set for accuracy and frame count
rather than for stability.

---

## 3. The finite cylinder — the strongest test

For a linear problem with uniform initial temperature and constant, uniform
T∞ and h, the two-dimensional solution factorises **exactly**:

> θ(r, z, t) = θ_infinite-cylinder(r, t) · θ_slab(z, t)

This is an identity, not an approximation, which makes it a genuine test of the
ADI solver rather than a sanity check. Geometry: a 307×409 can
(87.3 mm diameter, 115.9 mm tall).

| Bi_R | Centre error | **Whole-field** error | Energy residual |
|---|---|---|---|
| 0.5 | 2.4e-5 | 2.3e-5 | 1.1e-8 |
| 2 | 5.5e-5 | 3.8e-5 | 1.4e-7 |
| 10 | 8.5e-5 | 6.6e-5 | 2.0e-6 |
| 200 | 8.8e-5 | 7.5e-5 | 2.0e-5 |

The whole-field column compares **every mesh point**, not just the centre.
Worst case 7.5e-5 in θ — under 0.01 K.

| Mesh | Error | Ratio | Order |
|---|---|---|---|
| 16×16 | 1.20e-3 | | |
| 32×32 | 3.26e-4 | 3.67 | 1.88 |
| 64×64 | 8.41e-5 | 3.88 | 1.96 |
| 128×128 | 2.12e-5 | 3.96 | **1.99** |

### Why the shipped default is 40×40

The app defaults to a 40×40 mesh with 200 frames, solving in about **60 ms in a
browser** (Node runs it in roughly half that). Interpolating the table above,
that sits near 2e-4 in θ — about **0.02 K** on a 100 K span, far below anything
readable from a plot, and it keeps the tool inside its 100 ms interactivity
budget. The mesh is a state variable, so a finer one can be substituted for
coursework that needs it.

---

## 4. Energy conservation

The finite-volume formulation is conservative by construction, so any residual
here is time-integration error in the *reported* surface flux, not a defect in
the solver.

- 1-D worst relative residual: **1.6e-5**
- 2-D worst relative residual: **2.0e-5**

### A note on how this was fixed

An earlier version integrated the surface flux on a uniform time step and
closed the balance to only 2.3 % at Bi = 200. The cause is physical: at high
Biot the surface flux behaves like 1/√t as t → 0 — integrable, but unbounded —
and no uniform step can resolve it. Covering the first output frame with 30
geometrically graded sub-steps reduced the residual by a factor of about a
thousand, to 2.0e-5. Temperatures were already accurate; it was the diagnostic
that was blunt.

---

## 5. Analytical machinery

- **Bessel functions** (Abramowitz & Stegun 9.4.1–9.4.6): max |J₀| at the ten
  tabulated zeros of J₀ is **3.6e-8**; max |J₁| at the nine tabulated zeros of
  J₁ is **8.2e-9**; worst error over six tabulated spot values **3.5e-9**.
- **Eigenvalues**: ζ₁ and C₁ match Incropera & DeWitt Table 5.1 at Bi = 1 for
  slab, cylinder and sphere simultaneously, to within **3.4e-5** and **4.0e-5**.
- **Series completeness**: at Fo = 0 the series must reconstruct θ = 1
  everywhere. With 400 terms it does so to **3.8e-6** for η ≥ 0.25.

  *Caveat, stated because it matters:* convergence is slow at exactly η = 0 and
  Fo = 0, where the solution has a step in time. All numerical comparisons
  therefore begin at Fo > 0.01. In that first sliver the **analytical** series
  is the less accurate of the two.

- **Lumped-capacitance limit**: at Bi = 0.01 the full series collapses onto the
  single exponential exp(−Bi·Fo) to within **3.0e-3** for all three geometries.

---

## 6. Heat exchanger

LMTD and ε-NTU are algebraically equivalent for single-pass co- and
counter-current arrangements (F = 1), so they must agree exactly. The stream
profiles are obtained by a *third*, independent route — RK4 marching of the
coupled energy equations — with the step count scaled to NTU.

| Check | Worst residual |
|---|---|
| LMTD duty vs. ε-NTU duty | 4.7e-13 |
| Stream energy balance (Q_hot vs. Q_cold) | 1.6e-16 |
| Marched profile reproduces hot outlet | 3.6e-10 |
| Counter-current profile closes on the cold inlet | 4.6e-10 |
| NTU ↔ ε round trip | 1.8e-10 |
| Co-current ε → 1/(1+C_r) as NTU → ∞ | exact |

The counter-current closure check is worth explaining: the cold inlet is at the
far end, so the marching is started from the ε-NTU cold *outlet* and must
arrive at the known cold *inlet*. Missing by 4.6e-10 is real evidence the
closed-form effectiveness is right, not a restatement of it.

### Where LMTD legitimately fails

As an exchanger approaches thermal equilibrium at one end, that end's ΔT
collapses and becomes the difference of two nearly equal temperatures. In one
test case ΔT₂ evaluated to 1.3e-12 K with only two or three significant digits
surviving, and ln(ΔT₁/ΔT₂) inherited the damage — Q = UA·ΔT_lm becomes an
unbounded area times a vanishing difference.

This is a genuine limitation of the method, not a numerical failure, so the app
**flags LMTD as indeterminate** and shows the ε-NTU result instead of printing
a plausible-looking wrong number. `solveExchanger` returns `lmtdValid: false`,
and the harness reports how many cases were excluded on that basis rather than
silently skipping them.

---

## 7. Plank freezing

The animated freezing front and the quoted freezing time must come from **one**
model. The front position is obtained by integrating the same quasi-steady
front motion from which Plank's equation is derived; evaluating that integral
at the centre must reproduce the closed form exactly.

| Geometry | P | R | Plank t_f | Front integral at centre |
|---|---|---|---|---|
| Slab | 0.5 | 0.125 | 128.04 min | 128.04 min |
| Cylinder | 0.25 | 0.0625 | 64.02 min | 64.02 min |
| Sphere | 0.1667 | 0.0417 | 42.68 min | 42.68 min |

Agreement to **3.6e-16** — machine precision. Also checked: frozen fraction is
monotone, reaches exactly 1 at t_f, and the front starts exactly at the surface.

**Model limitations, stated in the app as well as here.** Plank counts latent
heat only: it assumes the food is already at its initial freezing point,
that freezing occurs at a single temperature, and that frozen properties are
constant. It therefore **underestimates** real freezing times, typically by
10–30 %. The legs either side of the plateau come from the full transient
solver; only the plateau is Plank's, and the plot labels the seam.

---

## 8. Food properties (Choi–Okos 1986)

Properties are computed from composition, not tabulated, so they are traceable.
Pure water and pure ice are exactly known, which makes them a real test of both
the component correlations and the mixing rules.

**Water, 0–100 °C, worst relative error vs. steam tables:**
k 1.8e-2 · ρ 2.6e-3 · c_p 9.7e-3

**Ice at −20 °C:** k = 2.385 (ref 2.39) · ρ = 919.5 (ref 919) · c_p = 1941 (ref 1943)

**Foods, computed from USDA composition vs. ASHRAE Table 3 specific heats —
two entirely independent sources:**

| Food | FDC ID | Computed c_p | ASHRAE | Difference |
|---|---|---|---|---|
| Canned green peas | 170104 | 3753 | 3750 | **0.1 %** |
| Whole milk | 171265 | 3906 | 3890 | **0.4 %** |
| Canned carrots | 170396 | 4016 | 3920 | 2.4 % |
| Lean beef (cooked sirloin) | 168634 | 3408 | 3530 | 3.5 % |

The beef gap is the largest and is expected: ASHRAE's row is a different cut
from the USDA item used here.

### Two data traps the harness now guards against

**Fibre double-counting.** USDA reports *total* carbohydrate, which already
includes dietary fibre. Choi–Okos treats them as separate components, so the
total must be split. Entering the USDA numbers directly made two compositions
sum to 1.04 and 1.02. `presetProperties` now throws with an explanatory message
rather than producing plausible-looking properties from impossible data.

**The fat conductivity coefficient.** ASHRAE prints the fat linear term as
−2.7604e-3, and both its SI and I-P editions agree after conversion. **This app
uses −2.7604e-4 instead**, deliberately:

- With the printed value, k_fat = 0 near 65 °C and **negative above it** — the
  harness reports k(150 °C) = −0.2373 W/m·K. The correlation is declared valid
  to 150 °C, so a negative conductivity inside its own range cannot be the
  coefficient that was fitted.
- The printed value gives k_fat(20 °C) = 0.125 W/m·K; measured edible fats are
  about 0.17. The corrected value gives 0.175.

The most likely explanation is a long-propagated typographical error. A
validation check now asserts that **no component conductivity goes negative
anywhere in −40…150 °C**, which is the general guard for this class of fault.
The impact on this app is small — the shipped presets are 0.4–5.8 % fat, so the
two choices differ by under 1 % in mixture conductivity — and the change was
made because it is wrong, not because it changes the teaching. `FAT_K_AS_PRINTED`
is retained in the source for comparison. Phinney et al. (2017), *J. Food Sci.*
82(1) re-fitted these component groups and is the place to look for a modern
replacement.

---

## 9. Known limitations

Stated plainly, because a teaching tool that hides its assumptions teaches the
wrong lesson.

1. **Conduction only.** No natural convection inside the container. For liquid
   packs the real cold spot migrates downward to roughly a third of the height;
   this app places it at the geometric centre, which is correct for solid packs
   only. The quiz raises this explicitly.
2. **Constant properties.** k, ρ and c_p are evaluated once at a representative
   temperature and held fixed through the run.
3. **Instant come-up.** The medium is at its final temperature from t = 0. Real
   retorts take several minutes to come up, and that period contributes some
   lethality.
4. **Plank for freezing**, with the limitations in §7. An enthalpy or
   apparent-c_p method would remove them and drops into the same solver.
5. **Uniform h** over the entire surface.
6. **Frozen properties treat all water as ice**, evaluated at −20 °C. Just below
   the initial freezing point a real food retains substantial unfrozen water,
   so frozen properties are most accurate well below that point.
7. **Unverified constants.** The plate-exchanger U range could not be confirmed
   against an authoritative source and is labelled "order of magnitude only" in
   the interface. There is no single accepted z-value for *Coxiella burnetii* —
   measured values span 4.9–9.9 °C — so the 5 °C default is labelled in the code
   as a design convention rather than a property of the organism.

---

## Reproducing this

```bash
node test/validate.mjs
```

Exit code 0 means every check passed. Each section prints its own worst-case
residual, so a regression shows up as a specific number moving rather than as a
bare failure.
