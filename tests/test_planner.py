import json
from pathlib import Path
import numpy as np
import pytest
from racing_rewards.planner import SCENARIOS, Scenario, Object, GRID, select_corridor, solve, LONG_MARGIN, LATERAL_MARGIN

DATA = json.loads((Path(__file__).parents[1] / 'docs/data/experiment.json').read_text())


def test_rewards_change_the_integer_decisions():
    scenario = SCENARIOS[0]
    line = select_corridor(scenario, 0)
    rewards = select_corridor(scenario, 65)
    assert sum(line['bits'][3:]) == 0
    assert sum(rewards['bits'][3:]) == 3
    assert rewards['gap'] == 0


def test_previous_decisions_can_be_preserved():
    previous = select_corridor(SCENARIOS[0], 0)['bits']
    kept = select_corridor(SCENARIOS[0], 65, previous=previous, switch_weight=1000)
    np.testing.assert_array_equal(kept['bits'], previous)


def test_blocked_road_fails_explicitly():
    blocked = Scenario('blocked', 'Blocked road', '', (Object('wall', 80, 0, 10, 20),), ())
    with pytest.raises(RuntimeError, match='MILP failed'):
        select_corridor(blocked, 0)


def test_fresh_nonlinear_refinement_has_no_final_slack():
    result = solve(SCENARIOS[0], 8)
    assert result['refinement'][-1]['corridor_relaxation_m'] == 0
    assert result['refinement'][-1]['max_violation_m'] < 1e-5
    assert result['metrics']['reward_count'] == 1


@pytest.mark.parametrize('scenario', DATA['scenarios'], ids=lambda s: s['id'])
def test_exported_trajectories_independently(scenario):
    for run in scenario['runs']:
        t = run['trajectory']; time = np.array(t['time']); xy = np.array(t['xy'])
        s,n,v,kappa = map(np.array,(t['s'],t['n'],t['speed'],t['curvature']))
        assert np.isfinite(xy).all() and np.all(np.diff(time)>0)
        assert abs(n[0])<1e-6 and abs(n[-1])<1e-6
        assert np.max(abs(n)) <= 5.8+1e-5
        assert np.max(v*v*abs(kappa)) <= 5+1e-8
        acceleration=np.diff(v*v)/(2*np.linalg.norm(np.diff(xy,axis=0),axis=1))
        assert max(acceleration)<=3+1e-7 and min(acceleration)>=-5-1e-7
        for obj in scenario['obstacles']:
            ds=abs(s-obj['s'])-obj['length']/2-LONG_MARGIN
            dn=abs(n-obj['n'])-obj['width']/2-LATERAL_MARGIN
            assert np.min(np.maximum(ds,dn)) >= -1e-5
        for i,obj in enumerate(scenario['rewards']):
            gate=GRID[np.argmin(abs(GRID-obj['s']))]
            collected=abs(np.interp(gate,s,n)-obj['n']) <= obj['width']/2+1e-6
            assert bool(collected) == run['metrics']['collected'][i]
        assert abs(time[-1]-run['metrics']['drive_time_s'])<1e-8
