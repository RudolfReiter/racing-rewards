# Reproduction scope

This is a new, simplified implementation of **Mixed-integer optimization-based planning for autonomous racing with obstacles and rewards**, Reiter et al., IFAC NMPC 2021. It is **not the original repository**. The [paper](https://publications.syscop.de/Reiter2021a.pdf) is the source of the planning architecture; all code, scenarios, figures and results here are newly created.

## Paper-to-code mapping

| Paper concept | Implementation | Difference |
| --- | --- | --- |
| Frenet geometric model, Eq. 5 | `select_corridor`: bounded differences of lateral positions | Uniform 3 m spatial grid |
| Obstacle-side decisions, Section 3.1 | One binary per inflated rectangular obstacle | Rectangles instead of arbitrary polygons |
| Short reward gates, Eq. 21 | One binary activates a gate at the nearest spatial knot | Long rewards and gate OR logic are omitted |
| Lateral and slope L1 costs, Eqs. 15–19 | Epigraph variables for absolute position and slope | Newly selected weights |
| Re-decision penalty, Eq. 26 | Optional fixed previous bits and switch weight | No distance/history-dependent update from Eq. 14 |
| Corridor selection, Eq. 28 | Actual MILP solved with SciPy/HiGHS | No proprietary solver or original race data |
| Continuous refinement, Eq. 29 | Smooth spatial spline optimization within the selected corridor | Replaces the original single-track multiple-shooting OCP |
| Homotopy iterations | Three progressively tightened spatial corridors | Not the paper’s increasing slack penalties |

`src/racing_rewards/planner.py` contains the full formulation and explicit failure checks. `experiment.py` evaluates every scenario and preference; browser controls only select these exported results.

## Discrete optimization

The reference path has arc-length coordinate `s` from 0 to 240 m. The road half-width is 7 m. There are 81 lateral position variables `n`, 81 absolute-position epigraphs, 80 absolute-slope epigraphs, and one binary per obstacle/reward. Endpoint offsets are zero. The maximum geometric slope is 0.28.

The surrogate objective is

```
0.22 sum |n[k]| + 5 sum |(n[k+1]-n[k])/3|
  - reward_weight sum value[j] collect[j]
  + switch_weight sum |decision[j]-previous[j]|.
```

The three reward weights are **0, 8 and 65**. The first prioritizes the reference line; the others trade greater deviation against reward collection. This is not direct lap-time minimization. SciPy's `milp` requests zero relative MIP gap and a 20 s limit. A solver failure is an error, not a substitute trajectory.

The chosen obstacle side constrains all knots spanning the obstacle and their immediate exterior neighbours. Obstacles are inflated by **1.2 m laterally** and **2.8 m longitudinally**, including a nominal 4.6 × 1.8 m car footprint allowance and buffers. This is a conservative axis-aligned Frenet representation, not an exact rotated-body collision model.

Reward gates lie at the spatial knot nearest the reward's center. All example reward rectangles are 4 m long, so the gate remains inside the rectangle. Selecting a reward enforces entry to its lateral interval at that gate; passing it accidentally also counts as collection in evaluation.

## Continuous path and motion

A cubic spline with zero endpoint slope interpolates the optimized lateral positions. Its value and derivatives are linear functions of its knot coefficients. The second optimizer minimizes lateral deviation, a nonlinear slope-length penalty and squared second derivatives. Corridor bounds are enforced at **0.6 m** resolution using the spline basis matrix. Relaxations of **1.5, 0.4 and 0 m** are used successively. Only the final unrelaxed solution is exported. Both solver status and maximum constraint residual are checked at every stage.

This path is transformed into Cartesian coordinates. Numerical curvature gives a rear-axle kinematic-bicycle steering equivalent `atan(3 κ)` with a nominal 3 m wheelbase. The path is not integrated through the paper's vehicle model and there is no independent tracking controller. A curvature speed cap enforces `v² |κ| ≤ 5 m/s²`; a forward pass enforces at most **3 m/s² acceleration**, and a backward pass at most **5 m/s² braking**. Maximum speed is 26 m/s, with initial speed at most 15 m/s. The car in the animation follows this computed motion.

## Evaluation

Three deterministic curved-road scenes contain two or three obstacles and two or three rewards. Each scene is solved with all three weights, yielding **nine runs**. There is no randomness or train/test split.

Reported quantities are computed from the exported path and speed:

- Drive time integrates segment distance using the average of adjacent speeds.
- Reward count checks the path against the short gate at its actual optimization knot.
- Inflated clearance is the minimum, over path samples and objects, of `max(longitudinal separation, lateral separation)` relative to the inflated rectangle. It is a signed rectangular separation, not Euclidean distance.
- Acceleration and lateral acceleration use the exported speed and curvature.
- Solve times cover each optimization stage on the local machine; they are not embedded timings. First-call overhead can be significant.

At these weights, reference-line priority collects no rewards, the balanced setting collects one per scene, and reward priority collects all rewards. No original Roborace trial, benchmark lap time, success rate or convergence advantage has been recovered.

## Validation and reproduction

The tests solve a fresh MILP and refinement, verify that reward weights change decisions, verify switching penalties, reject a completely blocked road, and independently check every exported path for bounds, obstacle separation, reward collection and acceleration limits. Numerical checks are sampled, not a proof of continuous-time collision avoidance or vehicle-level safety.

```bash
python -m pip install -r requirements-reproduce.txt -e .
OPENBLAS_NUM_THREADS=1 python -m racing_rewards.experiment
MPLCONFIGDIR=/tmp/racing-rewards-mpl python scripts/plot_results.py
OPENBLAS_NUM_THREADS=1 python -m pytest -q
node scripts/check_interactions.mjs
python scripts/build_site.py
python scripts/check_site.py
```

Pinned versions record the environment used for the committed experiment. Regeneration may differ slightly across solver/library versions; solve times will differ. The data itself is finite and serialized identically to JSON and JavaScript. Figures and README tables are generated from those exports.

The UI has application-state tests and scene exports from its actual renderer. Those checks do not replace browser layout testing. No browser screenshot verification was possible in the development sandbox.
