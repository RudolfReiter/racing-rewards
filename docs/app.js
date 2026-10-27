(() => {
  'use strict';
  const data=window.EXPERIMENT, race=data.kind==='racing', $=id=>document.getElementById(id);
  const color={blue:'#2166ac',orange:'#b44819',gray:'#9ba8b2',purple:'#75559b',green:'#22754d'};
  let scenario=data.scenarios[race?0:2],run=scenario.runs[race?1:0],time=0,playing=false,visible=true,dirty=true,last=0;
  const scene=new window.DrivingScene($('driving-canvas'),data);
  const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const fmt=(v,n=2)=>v==null?'Not found':Number(v).toFixed(n);
  const duration=()=>run.trajectory.time.at(-1);
  $('scenario').innerHTML=data.scenarios.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $('scenario').value=scenario.id;
  $('strategy').innerHTML=data.strategies.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $('strategy').value=run.id;
  const baseline=()=>scenario.runs.find(r=>r.id===(race?'line':'short'));

  function graph(id,xmax,ymin,ymax,xlabel,ylabel){
    const host=$(id),w=Math.max(280,host.getBoundingClientRect().width||520),h=270,l=52,r=18,top=20,bottom=42;
    const X=x=>l+x/xmax*(w-l-r),Y=y=>h-bottom-(y-ymin)/(ymax-ymin)*(h-top-bottom);
    let body='';
    for(let i=0;i<=4;i++){const yy=ymin+(ymax-ymin)*i/4,py=Y(yy),xx=xmax*i/4,px=X(xx);
      body+=`<path d="M${l} ${py}H${w-r}" stroke="#e4e9ed"/><text x="${l-9}" y="${py+4}" text-anchor="end">${fmt(yy,Math.abs(ymax)<10?1:0)}</text><text x="${px}" y="${h-19}" text-anchor="middle">${fmt(xx,0)}</text>`;
    }
    body+=`<text x="${l}" y="13">${esc(ylabel)}</text><text x="${w-r}" y="${h-1}" text-anchor="end">${esc(xlabel)}</text>`;
    host.setAttribute('viewBox',`0 0 ${w} ${h}`);
    return {X,Y,w,h,l,r,top,bottom,
      line(xs,ys,c,width=2,dash=''){body+=`<path d="${xs.map((x,i)=>`${i?'L':'M'}${X(x).toFixed(2)} ${Y(ys[i]).toFixed(2)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="${width}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;},
      rect(x1,x2,y1,y2,c){body+=`<rect x="${X(x1)}" y="${Y(y2)}" width="${X(x2)-X(x1)}" height="${Y(y1)-Y(y2)}" fill="${c}"/>`;},
      point(x,y,c,label){body+=`<circle cx="${X(x)}" cy="${Y(y)}" r="4" fill="${c}"/><text x="${Math.min(w-130,Math.max(l+5,X(x)+9))}" y="${Y(y)-9}" fill="${c}">${esc(label)}</text>`;},
      finish(cursor){host.innerHTML=`<g fill="#526170" font-family="system-ui,sans-serif" font-size="14">${body}</g><line id="${cursor}" x1="${X(0)}" x2="${X(0)}" y1="${top}" y2="${h-bottom}" stroke="#202b38" stroke-width="1.2" stroke-dasharray="3 4"/>`;}
    };
  }
  let speedGraph,pathGraph;
  function drawCharts(){
    const comp=baseline(),xmax=Math.ceil(Math.max(...scenario.runs.map(r=>r.trajectory.time.at(-1))));
    speedGraph=graph('speed-chart',xmax,race?10:16,race?28:32,'Time (s)','Speed (m/s)');
    if(comp.id!==run.id)speedGraph.line(comp.trajectory.time,comp.trajectory.speed,color.orange,2,'5 4');
    speedGraph.line(run.trajectory.time,run.trajectory.speed,color.blue,2.5);speedGraph.finish('speed-cursor');
    if(race){
      pathGraph=graph('path-chart',240,-7,7,'Distance along track (m)','Lateral position (m)');
      for(const o of scenario.obstacles)pathGraph.rect(o.s-o.length/2,o.s+o.length/2,o.n-o.width/2,o.n+o.width/2,'#bc675670');
      for(const o of scenario.rewards)pathGraph.rect(o.s-o.length/2,o.s+o.length/2,o.n-o.width/2,o.n+o.width/2,'#3f956b70');
      if($('corridor').checked){pathGraph.line(run.corridor.s,run.corridor.lo,'#2166ac40',1);pathGraph.line(run.corridor.s,run.corridor.hi,'#2166ac40',1);}
      if(comp.id!==run.id)pathGraph.line(comp.trajectory.s,comp.trajectory.n,color.orange,2,'5 4');
      pathGraph.line(run.trajectory.s,run.trajectory.n,color.blue,2.5);
    }else{
      pathGraph=graph('path-chart',18,0,600,'Time (s)','Longitudinal position (m)');
      for(const v of scenario.vehicles.filter(v=>v.lane===2))pathGraph.line([0,18],[v.s,v.s+18*v.speed],color.purple,1.2);
      if(comp.id!==run.id){pathGraph.line(comp.trajectory.time,comp.trajectory.s,color.orange,2,'5 4');if(comp.transitions.length)pathGraph.point(comp.transitions[1].time,comp.transitions[1].s,color.orange,'Baseline transition');}
      pathGraph.line(run.trajectory.time,run.trajectory.s,color.blue,2.5);
      if(run.transitions.length){const end=run.trajectory.s.at(-1),p=run.transitions[1];pathGraph.line([6,p.time],[end,p.s],color.blue,1.5,'4 5');pathGraph.point(p.time,p.s,color.blue,'Planned transition');}
    }
    pathGraph.finish('path-cursor');
  }
  function describeGap(g){if(!g)return 'No reachable transition';if(!g[0])return `Behind vehicle ${g[1]}`;if(!g[1])return `Ahead of vehicle ${g[0]}`;return `Between ${g[0]} and ${g[1]}`;}
  function updateSelection(){
    $('timeline').max=duration();$('scenario-description').textContent=scenario.description;
    $('scene-title').textContent=scenario.name;$('scene-method').textContent=run.name;
    const m=run.metrics;
    const metrics=race?[
      ['Drive time',`${fmt(m.drive_time_s)} s`,'Computed speed profile'],['Rewards collected',`${m.reward_count} / ${scenario.rewards.length}`,'At the selected reward gates'],
      ['Obstacle clearance',`${fmt(m.min_inflated_clearance_m,3)} m`,'Beyond the inflated obstacle'],['Lateral acceleration',`${fmt(m.max_lateral_acceleration_mps2)} m/s²`,'Maximum over the planned path']]:[
      ['Future lane transition',`${fmt(m.goal_transition_s)} s`,'Coarse plan · not a realized maneuver'],['Speed tracking error',`${fmt(m.speed_rmse_mps)} m/s`,'RMSE over the detailed six seconds'],
      ['First lane crossing',`${fmt(m.first_transition_s,1)} s`,'Optimized short-term trajectory'],['Body separation',`${fmt(m.min_body_separation_m)} m`,'Minimum sampled rectangular separation']];
    $('metrics').innerHTML=metrics.map(([a,b,c])=>`<div class="metric"><span>${a}</span><strong>${b}</strong><small>${c}</small></div>`).join('');
    $('decisions').innerHTML=race?[
      ...scenario.obstacles.map((o,i)=>`<div class="decision"><strong>${o.name} · obstacle</strong><span class="selected">Pass ${run.decisions[i]?'left':'right'}</span><p>One binary variable selects the side.</p></div>`),
      ...scenario.rewards.map((o,i)=>`<div class="decision"><strong>${o.name} · reward</strong><span class="selected">${run.decisions[scenario.obstacles.length+i]?'Collect':'Optional · not selected'}</span><p>Value ${fmt(o.value,1)} · reward weight ${run.reward_weight}</p></div>`)
    ].join(''):`<div class="decision"><strong>1. First target gap</strong><span class="selected">${describeGap(run.gaps[0])}</span><p>Detailed motion from lane 1 to lane 2.</p></div><div class="decision"><strong>2. Goal-lane gap</strong><span class="selected">${describeGap(run.gaps[1])}</span><p>A continuous future time and position.</p></div><div class="decision"><strong>3. Discrete candidates</strong><span class="selected">${m.feasible_candidates} feasible / ${m.candidate_count} tested</span><p>Explicit enumeration of gap and crossing choices.</p></div>`;
    $('ghost').disabled=baseline().id===run.id;
    drawCharts();dirty=true;
  }
  function updateTime(){
    const s=window.sampleTrajectory(run.trajectory,time);
    $('timeline').value=time;$('clock').textContent=`${fmt(time,1)} / ${fmt(duration(),1)} s`;
    $('play').textContent=playing?'Pause':time>=duration()?'Replay':'Play';$('play').setAttribute('aria-pressed',String(playing));
    const a=speedGraph.X(time),b=pathGraph.X(race?s.s:time);
    for(const [id,x] of [['speed-cursor',a],['path-cursor',b]]){$(id).setAttribute('x1',x);$(id).setAttribute('x2',x);}
    $('live-state').textContent=`${fmt(s.speed*3.6,0)} km/h · ${race?`${fmt(s.s,0)} m along track`:`lane position ${fmt(1+s.n/3.6,1)}`}`;
  }
  $('scenario').addEventListener('change',()=>{const selected=run.id;scenario=data.scenarios.find(s=>s.id===$('scenario').value);run=scenario.runs.find(r=>r.id===selected);time=0;playing=false;scene.focus=null;updateSelection();});
  $('strategy').addEventListener('change',()=>{run=scenario.runs.find(r=>r.id===$('strategy').value);time=Math.min(time,duration());playing=false;updateSelection();});
  $('play').addEventListener('click',()=>{if(time>=duration()){time=0;scene.focus=null;}playing=!playing;dirty=true;});
  $('restart').addEventListener('click',()=>{time=0;playing=false;scene.focus=null;dirty=true;});
  $('timeline').addEventListener('input',()=>{time=Number($('timeline').value);playing=false;scene.focus=null;dirty=true;});
  for(const id of ['ghost','corridor'])$(id).addEventListener('change',()=>{drawCharts();dirty=true;});
  for(const mode of ['overview','follow'])$(mode).addEventListener('click',()=>{scene.view=mode;for(const v of ['overview','follow']){$(v).classList.toggle('active',v===mode);$(v).setAttribute('aria-pressed',String(v===mode));}dirty=true;});
  document.addEventListener('visibilitychange',()=>{last=0;});
  if(typeof IntersectionObserver!=='undefined')new IntersectionObserver(e=>{visible=e[0].isIntersecting;last=0;},{threshold:.05}).observe($('driving-canvas'));
  window.addEventListener('resize',()=>{drawCharts();dirty=true;});
  $('results-body').innerHTML=data.scenarios.flatMap(s=>s.runs.map(r=>{const m=r.metrics;return `<tr><td>${esc(s.name)}</td><td>${esc(r.name)}</td>${race?`<td>${fmt(m.drive_time_s)} s</td><td>${m.reward_count} / ${s.rewards.length}</td><td>${fmt(m.min_inflated_clearance_m,3)} m</td>`:`<td>${fmt(m.goal_transition_s)} s</td><td>${fmt(m.speed_rmse_mps)} m/s</td><td>${fmt(m.objective)}</td>`}<td>${m.collision_free?'Clear':'Collision'}</td></tr>`;})).join('');
  updateSelection();updateTime();
  function frame(stamp){const dt=last?Math.min((stamp-last)/1000,.05):0;last=stamp;
    if(visible&&!document.hidden){if(playing){time=Math.min(duration(),time+dt*Number($('speed').value));dirty=true;if(time>=duration())playing=false;}
      if(dirty||scene.dirty||scene.moving){updateTime();scene.render(scenario,run,time,{ghost:$('ghost').checked,corridor:$('corridor').checked,dt:dt||1/60});dirty=false;}}
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.plannerStatus=()=>({scenario:scenario.id,method:run.id,time,playing,view:scene.view,duration:duration(),camera:scene.focus});
})();
