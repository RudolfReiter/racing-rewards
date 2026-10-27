"""Mixed-integer corridor selection and continuous path refinement.

The discrete stage follows the paper's lateral-deviation, slope, obstacle-side,
reward-gate and previous-decision costs. The second stage is a deliberately
smaller spatial path optimizer, not the paper's acados multiple-shooting OCP.
"""
from dataclasses import dataclass
from time import perf_counter

import numpy as np
from scipy.interpolate import CubicSpline
from scipy.optimize import Bounds, LinearConstraint, milp, minimize


@dataclass(frozen=True)
class Object:
    name: str
    s: float
    n: float
    length: float = 5.0
    width: float = 2.0
    value: float = 1.0


@dataclass(frozen=True)
class Scenario:
    id: str
    name: str
    description: str
    obstacles: tuple
    rewards: tuple


SCENARIOS = (
    Scenario("slalom", "Alternating obstacles", "Three obstacles interrupt the reference line; optional rewards change which side is preferable.",
             (Object("O1", 58, -.6), Object("O2", 119, 1.0), Object("O3", 183, -.7)),
             (Object("R1", 84, 3.9, 4, 1.8), Object("R2", 150, -3.9, 4, 1.8), Object("R3", 212, 3.8, 4, 1.8))),
    Scenario("choice", "A reward off the racing line", "A high-value reward asks for an extra excursion before the final obstacle.",
             (Object("O1", 73, 1.2, 6, 2.8), Object("O2", 165, -1.0, 7, 2.4)),
             (Object("R1", 40, -4.2, 4, 1.8, 1), Object("R2", 120, 4.2, 4, 1.8, 1.7), Object("R3", 204, -4, 4, 1.8, 1))),
    Scenario("narrow", "A constrained passage", "A wider obstacle leaves a narrow choice of corridors; reward gates compete with path smoothness.",
             (Object("O1", 55, 0, 7, 4.2), Object("O2", 132, 2.6, 7, 3), Object("O3", 189, -2.6, 7, 3)),
             (Object("R1", 92, -4.1, 4, 1.8), Object("R2", 161, 4.1, 4, 1.8))),
)
STRATEGIES = (("line", "Reference-line priority", 0.0), ("balanced", "Balanced rewards", 8.0), ("rewards", "Reward priority", 65.0))
GRID = np.linspace(0, 240, 81)
HALF_ROAD = 7.0
LATERAL_MARGIN = 1.2  # 0.9 m vehicle half-width + 0.3 m buffer
LONG_MARGIN = 2.8     # 2.3 m half-length + 0.5 m buffer
MAX_N = HALF_ROAD - LATERAL_MARGIN


def object_indices(obj, grid=GRID):
    # Include both neighbours of the inflated object extent, avoiding knot gaps.
    first = max(0, np.searchsorted(grid, obj.s - obj.length / 2 - LONG_MARGIN) - 1)
    last = min(len(grid) - 1, np.searchsorted(grid, obj.s + obj.length / 2 + LONG_MARGIN))
    return np.arange(first, last + 1)


def select_corridor(scenario, reward_weight, previous=None, switch_weight=0.0):
    """Solve an actual MILP with HiGHS; reject failed or nonoptimal solves."""
    start = perf_counter()
    count = len(GRID)
    # n, |n|, |dn/ds|, obstacle-side bits, reward bits.
    slope_start, bits_start = 2 * count, 3 * count - 1
    nbits = len(scenario.obstacles) + len(scenario.rewards)
    size = bits_start + nbits
    cost = np.zeros(size)
    cost[count:2 * count] = .22
    cost[slope_start:bits_start] = 5.0
    cost[bits_start + len(scenario.obstacles):] = -reward_weight * np.array([r.value for r in scenario.rewards])
    lower, upper = np.zeros(size), np.full(size, np.inf)
    lower[:count], upper[:count] = -MAX_N, MAX_N
    lower[0] = upper[0] = lower[count - 1] = upper[count - 1] = 0
    upper[slope_start:bits_start] = .28
    upper[bits_start:] = 1
    integrality = np.zeros(size)
    integrality[bits_start:] = 1
    rows, lows, highs = [], [], []

    def constraint(entries, low=-np.inf, high=np.inf):
        row = np.zeros(size)
        for i, v in entries.items():
            row[i] = v
        rows.append(row); lows.append(low); highs.append(high)

    for i in range(count):
        constraint({i: 1, count + i: -1}, high=0)
        constraint({i: -1, count + i: -1}, high=0)
    for i, ds in enumerate(np.diff(GRID)):
        constraint({i + 1: 1 / ds, i: -1 / ds, slope_start + i: -1}, high=0)
        constraint({i + 1: -1 / ds, i: 1 / ds, slope_start + i: -1}, high=0)
    big_m = 24.0  # Derived from road width and the bounded object coordinates.
    for j, obj in enumerate(scenario.obstacles):
        bit = bits_start + j
        lo = obj.n - obj.width / 2 - LATERAL_MARGIN
        hi = obj.n + obj.width / 2 + LATERAL_MARGIN
        for i in object_indices(obj):
            constraint({i: 1, bit: -big_m}, high=lo)
            constraint({i: 1, bit: -big_m}, low=hi - big_m)
    for j, obj in enumerate(scenario.rewards):
        bit = bits_start + len(scenario.obstacles) + j
        i = int(np.argmin(abs(GRID - obj.s)))
        constraint({i: 1, bit: big_m}, high=obj.n + obj.width / 2 + big_m)
        constraint({i: 1, bit: -big_m}, low=obj.n - obj.width / 2 - big_m)
    if previous is not None:
        previous = np.asarray(previous, dtype=int)
        if len(previous) != nbits:
            raise ValueError("Previous decisions must match every obstacle and reward")
        # |b - b_previous| = b (previous 0), or 1-b (previous 1).
        cost[bits_start:] += switch_weight * (1 - 2 * previous)
    result = milp(cost, integrality=integrality, bounds=Bounds(lower, upper),
                  constraints=LinearConstraint(np.array(rows), lows, highs),
                  options={"time_limit": 20, "mip_rel_gap": 0.0})
    if not result.success:
        raise RuntimeError(f"Corridor MILP failed: {result.message}")
    bits = np.rint(result.x[bits_start:]).astype(int)
    lo, hi = np.full(count, -MAX_N), np.full(count, MAX_N)
    for j, obj in enumerate(scenario.obstacles):
        inds = object_indices(obj)
        if bits[j]:
            lo[inds] = np.maximum(lo[inds], obj.n + obj.width / 2 + LATERAL_MARGIN)
        else:
            hi[inds] = np.minimum(hi[inds], obj.n - obj.width / 2 - LATERAL_MARGIN)
    for j, obj in enumerate(scenario.rewards):
        if bits[len(scenario.obstacles) + j]:
            i = int(np.argmin(abs(GRID - obj.s)))
            lo[i] = max(lo[i], obj.n - obj.width / 2)
            hi[i] = min(hi[i], obj.n + obj.width / 2)
    lo[[0, -1]], hi[[0, -1]] = 0, 0
    return {"n": result.x[:count], "bits": bits, "lo": lo, "hi": hi,
            "objective": float(result.fun + (switch_weight * sum(previous) if previous is not None else 0)),
            "gap": float(result.mip_gap), "solve_ms": (perf_counter() - start) * 1000}


def refine_path(selection):
    """Spline path optimization with progressive corridor tightening.

    Constraints apply at 0.6 m resolution; endpoints and endpoint slope are fixed.
    Every intermediate solve is checked. Only the final, unrelaxed path is used.
    """
    start = perf_counter()
    dense = np.linspace(0, 240, 401)
    basis = CubicSpline(GRID, np.eye(len(GRID)), bc_type=((1, np.zeros(len(GRID))), (1, np.zeros(len(GRID)))))
    B, D, D2 = basis(dense), basis(dense, 1), basis(dense, 2)
    lo, hi = np.interp(dense, GRID, selection["lo"]), np.interp(dense, GRID, selection["hi"])
    # Identical zero endpoint rows are handled with variable bounds, not paired inequalities.
    interior = np.arange(1, len(dense) - 1)
    x = selection["n"].copy()
    stages = []

    def objective(n):
        slope, curve = D @ n, D2 @ n
        return float(.012 * np.sum((B @ n) ** 2) + 1.4 * np.sum(np.sqrt(1 + slope ** 2) - 1) + 1200 * np.sum(curve ** 2))

    def jac(n):
        slope = D @ n
        return .024 * B.T @ (B @ n) + 1.4 * D.T @ (slope / np.sqrt(1 + slope ** 2)) + 2400 * D2.T @ (D2 @ n)

    bounds_lo, bounds_hi = np.full(len(GRID), -MAX_N), np.full(len(GRID), MAX_N)
    bounds_lo[[0, -1]] = bounds_hi[[0, -1]] = 0
    for slack in (1.5, .4, 0.0):
        result = minimize(objective, x, jac=jac, method="SLSQP", bounds=Bounds(bounds_lo, bounds_hi),
                          constraints=LinearConstraint(B[interior], lo[interior] - slack, hi[interior] + slack),
                          options={"maxiter": 250, "ftol": 1e-8})
        violation = max(float(np.max(lo - slack - B @ result.x)), float(np.max(B @ result.x - hi - slack)), 0)
        if not result.success or violation > 1e-5:
            raise RuntimeError(f"Path refinement failed: {result.message}; violation={violation}")
        x = result.x
        stages.append({"corridor_relaxation_m": slack, "objective": float(result.fun), "iterations": int(result.nit), "max_violation_m": violation})
    return {"s": dense, "n": B @ x, "lo": lo, "hi": hi, "stages": stages,
            "solve_ms": (perf_counter() - start) * 1000}


def reference(s):
    grid = np.linspace(0, 240, 2401)
    heading = .52 * np.sin(grid / 70) - .20
    ds = grid[1] - grid[0]
    x = np.r_[0, np.cumsum((np.cos(heading[:-1]) + np.cos(heading[1:])) * ds / 2)]
    y = np.r_[0, np.cumsum((np.sin(heading[:-1]) + np.sin(heading[1:])) * ds / 2)]
    return np.interp(s, grid, x), np.interp(s, grid, y), .52 * np.sin(np.asarray(s) / 70) - .20


def world(s, n):
    x, y, heading = reference(s)
    return np.column_stack((x - np.sin(heading) * n, y + np.cos(heading) * n))


def trajectory(path):
    """Curvature speed limit plus forward/backward acceleration passes.

    This reconstructs a rear-axle kinematic bicycle path. It is not a tire model
    or a tracking simulation; the animation shows the computed plan.
    """
    xy = world(path["s"], path["n"])
    derivative = np.gradient(xy, path["s"], axis=0, edge_order=2)
    second = np.gradient(derivative, path["s"], axis=0, edge_order=2)
    curvature = (derivative[:, 0] * second[:, 1] - derivative[:, 1] * second[:, 0]) / np.linalg.norm(derivative, axis=1) ** 3
    ds = np.linalg.norm(np.diff(xy, axis=0), axis=1)
    speed = np.minimum(26, np.sqrt(5 / np.maximum(abs(curvature), 1e-9)))
    speed[0] = min(speed[0], 15)
    for i in range(1, len(speed)):
        speed[i] = min(speed[i], np.sqrt(speed[i - 1] ** 2 + 2 * 3 * ds[i - 1]))
    for i in range(len(speed) - 2, -1, -1):
        speed[i] = min(speed[i], np.sqrt(speed[i + 1] ** 2 + 2 * 5 * ds[i]))
    time = np.r_[0, np.cumsum(2 * ds / (speed[:-1] + speed[1:]))]
    acceleration = np.diff(speed ** 2) / (2 * ds)
    return {"time": time, "xy": xy, "s": path["s"], "n": path["n"], "speed": speed,
            "heading": np.unwrap(np.arctan2(derivative[:, 1], derivative[:, 0])),
            "curvature": curvature, "steering": np.arctan(3 * curvature), "acceleration": acceleration}


def evaluate(scenario, selection, path, traj):
    clearances = []
    for obj in scenario.obstacles:
        longitudinal = abs(path["s"] - obj.s) - (obj.length / 2 + LONG_MARGIN)
        lateral = abs(path["n"] - obj.n) - (obj.width / 2 + LATERAL_MARGIN)
        clearances.append(float(np.min(np.maximum(longitudinal, lateral))))
    # Gates are at the closest optimization knot, so report the same gate coordinate.
    collected = [abs(np.interp(GRID[np.argmin(abs(GRID - obj.s))], path["s"], path["n"]) - obj.n) <= obj.width / 2 + 1e-6 for obj in scenario.rewards]
    return {"drive_time_s": float(traj["time"][-1]), "path_length_m": float(np.sum(np.linalg.norm(np.diff(traj["xy"], axis=0), axis=1))),
            "collected": collected, "reward_count": sum(collected), "reward_value": float(sum(o.value for o, c in zip(scenario.rewards, collected) if c)),
            "min_inflated_clearance_m": min(clearances), "collision_free": min(clearances) >= -1e-5,
            "max_lateral_acceleration_mps2": float(np.max(traj["speed"] ** 2 * abs(traj["curvature"]))),
            "max_steering_rad": float(np.max(abs(traj["steering"]))),
            "milp_ms": selection["solve_ms"], "refinement_ms": path["solve_ms"], "milp_gap": selection["gap"]}


def solve(scenario, reward_weight):
    selection = select_corridor(scenario, reward_weight)
    path = refine_path(selection)
    traj = trajectory(path)
    metrics = evaluate(scenario, selection, path, traj)
    if not metrics["collision_free"]:
        raise RuntimeError("Refined trajectory intersects an inflated obstacle")
    return {"trajectory": traj, "corridor": {"s": path["s"], "lo": path["lo"], "hi": path["hi"]},
            "coarse": {"s": GRID, "n": selection["n"]}, "decisions": selection["bits"],
            "refinement": path["stages"], "metrics": metrics}
