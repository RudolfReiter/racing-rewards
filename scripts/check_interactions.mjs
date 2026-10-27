/** Application-state and renderer checks, not browser layout verification. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'docs/data/experiment.json'),'utf8'));
const race=data.kind==='racing';
class Node{
  constructor(id){this.id=id;this.value=id==='speed'?'1':'0';this.checked=id==='ghost';this.listeners={};this.attributes={};this.innerHTML='';this.textContent='';this.classList={toggle(){}};}
  addEventListener(event,fn){this.listeners[event]=fn;}
  fire(event){this.listeners[event]?.({target:this});}
  setAttribute(key,value){this.attributes[key]=value;}
  getBoundingClientRect(){return {width:this.id==='driving-canvas'?1100:500,height:570};}
  getContext(){return context;}
}
const context=new Proxy({measureText:t=>({width:String(t).length*8}),save(){},restore(){}},{get:(obj,key)=>key in obj?obj[key]:(()=>{}),set:(obj,key,v)=>(obj[key]=v,true)});
const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Node(id));return nodes.get(id);};
let frame;
const doc={getElementById:get,addEventListener(){},hidden:false};
const win={EXPERIMENT:data,devicePixelRatio:1,addEventListener(){}};
const sandbox={window:win,document:doc,requestAnimationFrame:fn=>{frame=fn;},ResizeObserver:class{observe(){}},IntersectionObserver:class{observe(){}},Math};
for(const name of ['scene.js','app.js'])vm.runInNewContext(fs.readFileSync(path.join(root,'docs',name),'utf8'),sandbox);
let stamp=1;const tick=()=>{stamp+=16.6666667;frame(stamp);};
tick();assert.equal(win.plannerStatus().playing,false);assert.equal(win.plannerStatus().time,0);
assert.match(get('results-body').innerHTML,/Clear/);
assert.ok(get('path-chart').innerHTML.includes('<path'));
for(const scenario of data.scenarios){get('scenario').value=scenario.id;get('scenario').fire('change');tick();assert.equal(win.plannerStatus().scenario,scenario.id);
  for(const strategy of data.strategies){get('strategy').value=strategy.id;get('strategy').fire('change');tick();assert.equal(win.plannerStatus().method,strategy.id);}}
get('strategy').value=race?'balanced':'coupled';get('strategy').fire('change');
get('timeline').value='3';get('timeline').fire('input');tick();assert.equal(win.plannerStatus().time,3);
get('follow').fire('click');tick();assert.equal(win.plannerStatus().view,'follow');
get('play').fire('click');tick();assert.ok(win.plannerStatus().time>3);
const previous=win.plannerStatus().time;doc.hidden=true;for(let i=0;i<10;i++)tick();assert.equal(win.plannerStatus().time,previous);doc.hidden=false;
for(let i=0;i<1000;i++)tick();assert.equal(win.plannerStatus().playing,false);assert.equal(win.plannerStatus().time,win.plannerStatus().duration);
const end=win.plannerStatus().time;for(let i=0;i<10;i++)tick();assert.equal(win.plannerStatus().time,end);
get('restart').fire('click');tick();assert.equal(win.plannerStatus().time,0);
get('overview').fire('click');get('ghost').checked=false;get('ghost').fire('change');get('corridor').checked=true;get('corridor').fire('change');tick();
const scenario=data.scenarios[0],run=scenario.runs[0];const scene=new win.DrivingScene(get('driving-canvas'),data);
scene.view='follow';scene.render(scenario,run,1);const old=scene.focus.slice();scene.render(scenario,run,1.01,{dt:.01});
assert.ok(Math.hypot(scene.focus[0]-old[0],scene.focus[1]-old[1])<1,'Camera moves continuously');
const state=win.sampleTrajectory(run.trajectory,2);assert.ok(Number.isFinite(state.x)&&Number.isFinite(state.y));
console.log('Checks passed: scenario/method controls, synchronized replay, charts, camera continuity, pause when hidden, no automatic loop. Browser layout unverified.');
