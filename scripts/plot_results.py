"""Create publication-style comparison figures from the actual exported runs."""
from pathlib import Path
import json
import re
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root=Path(__file__).resolve().parents[1]
data=json.loads((root/'docs/data/experiment.json').read_text());race=data['kind']=='racing'
plt.rcParams.update({'font.size':13,'axes.spines.top':False,'axes.spines.right':False,'axes.labelcolor':'#526170','text.color':'#202b38','axes.edgecolor':'#c6d0da','svg.hashsalt':'research-recreation'})
fig,axes=plt.subplots(1,2,figsize=(12,4.5),layout='constrained');colors=['#697682','#2166ac','#22754d'] if race else ['#2166ac','#b44819']
count=len(data['strategies']);width=.75/count;x=np.arange(3)
keys=['drive_time_s','reward_count'] if race else ['goal_transition_s','speed_rmse_mps']
titles=['Computed drive time','Rewards collected'] if race else ['Coarse goal-lane transition','Short-term speed tracking error']
ylabels=['Time (s)','Count'] if race else ['Planned time (s)','RMSE (m/s)']
for ax,key,title,ylabel in zip(axes,keys,titles,ylabels):
    for i,strategy in enumerate(data['strategies']):
        vals=[next(r for r in s['runs'] if r['id']==strategy['id'])['metrics'][key] for s in data['scenarios']]
        bars=ax.bar(x+(i-(count-1)/2)*width,vals,width*.92,color=colors[i],label=strategy['name'])
        ax.bar_label(bars,fmt='%.1f' if key!='reward_count' else '%d',fontsize=12,padding=3)
    ax.set_xticks(x,[s['id'].capitalize() for s in data['scenarios']]);ax.set_title(title,fontsize=16,pad=15);ax.set_ylabel(ylabel)
    ax.set_ylim(0,ax.get_ylim()[1]*1.22);ax.grid(axis='y',color='#e4e9ed');ax.set_axisbelow(True)
handles,labels=axes[0].get_legend_handles_labels();fig.legend(handles,labels,loc='outside lower center',ncol=count,frameon=False,fontsize=12)
fig.savefig(root/'docs/assets/evaluation.svg',metadata={'Date':None})
fig.savefig(root/'docs/assets/evaluation.png',dpi=160)
table='| Scene | Setting | '+('Drive time | Rewards | Inflated clearance' if race else 'Future transition | Speed RMSE | Combined objective')+' |\n| --- | --- | ---: | ---: | ---: |\n'
for s in data['scenarios']:
    for r in s['runs']:
        m=r['metrics']
        values=f"{m['drive_time_s']:.2f} s | {m['reward_count']} / {len(s['rewards'])} | {m['min_inflated_clearance_m']:.3f} m" if race else f"{m['goal_transition_s']:.2f} s | {m['speed_rmse_mps']:.2f} m/s | {m['objective']:.2f}"
        table+=f"| {s['name']} | {r['name']} | {values} |\n"
readme=root/'README.md';readme.write_text(re.sub(r'<!-- RESULTS_START -->.*?<!-- RESULTS_END -->','<!-- RESULTS_START -->\n'+table+'<!-- RESULTS_END -->',readme.read_text(),flags=re.S))
svg=root/'docs/assets/evaluation.svg';svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines())+'\n')
print('Exported figures and refreshed the README results from solver data.')
