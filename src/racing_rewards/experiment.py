"""Run the synthetic car examples and export all visualization data."""
import argparse
import json
from dataclasses import asdict
from pathlib import Path
import numpy as np
from .planner import SCENARIOS, STRATEGIES, solve, world


def jsonable(value):
    if isinstance(value, np.ndarray): return value.tolist()
    if isinstance(value, np.generic): return value.item()
    if isinstance(value, dict): return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)): return [jsonable(v) for v in value]
    return value


def run():
    s = np.linspace(0, 240, 401)
    data = {"kind": "racing", "version": 1, "recreated": True, "seed": None,
            "track": {"s": s, "center": world(s, 0), "left": world(s, 7), "right": world(s, -7)},
            "strategies": [{"id": k, "name": n, "weight": w} for k, n, w in STRATEGIES], "scenarios": []}
    for scenario in SCENARIOS:
        row = asdict(scenario)
        row["runs"] = []
        for key, name, weight in STRATEGIES:
            result = solve(scenario, weight)
            result.update(id=key, name=name, reward_weight=weight)
            row["runs"].append(result)
            m = result["metrics"]
            print(f"{scenario.id:8s} / {key:8s}: {m['drive_time_s']:.2f} s, {m['reward_count']} rewards, clearance {m['min_inflated_clearance_m']:.3f} m")
        data["scenarios"].append(row)
    return jsonable(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("docs/data"))
    args = parser.parse_args()
    data = run()
    args.output.mkdir(parents=True, exist_ok=True)
    content = json.dumps(data, separators=(",", ":"), allow_nan=False)
    (args.output / "experiment.json").write_text(content + "\n")
    (args.output / "experiment.js").write_text("window.EXPERIMENT=" + content + ";\n")
    summary = [{"scenario": s["id"], "method": r["id"], **r["metrics"]} for s in data["scenarios"] for r in s["runs"]]
    (args.output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")


if __name__ == "__main__":
    main()
