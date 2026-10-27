/* Projected 3D, using only the computed plan and deterministic scene geometry. */
(() => {
  const lerp=(a,b,f)=>a+(b-a)*f;
  function sampleTrajectory(trajectory,time){
    const t=trajectory.time;let lo=0,hi=t.length-1;
    time=Math.min(t[hi],Math.max(t[0],time));
    while(hi-lo>1){const m=(lo+hi)>>1;if(t[m]<=time)lo=m;else hi=m;}
    const f=(time-t[lo])/(t[hi]-t[lo]||1);
    return {x:lerp(trajectory.xy[lo][0],trajectory.xy[hi][0],f),y:lerp(trajectory.xy[lo][1],trajectory.xy[hi][1],f),
      heading:lerp(trajectory.heading[lo],trajectory.heading[hi],f),speed:lerp(trajectory.speed[lo],trajectory.speed[hi],f),
      s:lerp(trajectory.s[lo],trajectory.s[hi],f),n:lerp(trajectory.n[lo],trajectory.n[hi],f),index:lo};
  }
  class DrivingScene {
    constructor(canvas,data){
      this.canvas=canvas;this.ctx=canvas.getContext('2d');this.data=data;this.kind=data.kind;
      this.view='overview';this.focus=null;this.dirty=true;
      this.resize();if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>this.resize()).observe(canvas);
    }
    resize(){const box=this.canvas.getBoundingClientRect();this.w=box.width;this.h=box.height;const d=Math.min(window.devicePixelRatio||1,2);this.canvas.width=this.w*d;this.canvas.height=this.h*d;this.ctx.setTransform(d,0,0,d,0,0);this.dirty=true;}
    project(x,y,z=0){const dx=x-this.focus[0],dy=y-this.focus[1];return [this.w/2+(dx*.973-dy*.231)*this.scale,this.h*.53-(dx*.231+dy*.973)*this.scale*.9-z*this.scale*.85];}
    poly(points,color,stroke){const c=this.ctx;c.beginPath();points.forEach((v,i)=>{const p=this.project(...v);i?c.lineTo(...p):c.moveTo(...p);});c.closePath();c.fillStyle=color;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}}
    line(points,color,width=1,dash=[]){const c=this.ctx;c.beginPath();points.forEach((v,i)=>{const p=this.project(...v);i?c.lineTo(...p):c.moveTo(...p);});c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.stroke();c.setLineDash([]);}
    label(x,y,text,color='#526170',lift=26){const c=this.ctx,p=this.project(x,y,1);if(p[0]<-30||p[0]>this.w+30||p[1]<-30||p[1]>this.h+30)return;
      c.font='14px sans-serif';const width=c.measureText(text).width+16;
      c.fillStyle='#ffffffed';c.fillRect(p[0]-width/2,p[1]-lift-21,width,26);c.fillStyle=color;c.textAlign='center';c.fillText(text,p[0],p[1]-lift-3);
    }
    world(s,n){if(this.kind==='highway')return [s,n];const t=this.data.track,k=Math.min(t.s.length-2,Math.max(0,Math.floor(s/.6))),f=(s-t.s[k])/.6;
      const x=lerp(t.center[k][0],t.center[k+1][0],f),y=lerp(t.center[k][1],t.center[k+1][1],f),dx=t.left[k][0]-t.center[k][0],dy=t.left[k][1]-t.center[k][1];return [x+dx*n/7,y+dy*n/7];}
    box(x,y,length,width,height,color,heading=0){const sc=Math.cos(heading),sn=Math.sin(heading),p=(u,v,z)=>[x+u*sc-v*sn,y+u*sn+v*sc,z];
      this.poly([p(-length/2,-width/2,0),p(length/2,-width/2,0),p(length/2,-width/2,height),p(-length/2,-width/2,height)],color);
      this.poly([p(length/2,-width/2,0),p(length/2,width/2,0),p(length/2,width/2,height),p(length/2,-width/2,height)],'#526170');
      this.poly([p(-length/2,-width/2,height),p(length/2,-width/2,height),p(length/2,width/2,height),p(-length/2,width/2,height)],color);
      this.poly([p(-length/2,-width/2,height),p(length/2,-width/2,height),p(length/2,width/2,height),p(-length/2,width/2,height)],'#ffffff22');
    }
    car(state,color,ghost=false){const {x,y,heading}=state,sc=Math.cos(heading),sn=Math.sin(heading),p=(u,v,z)=>[x+u*sc-v*sn,y+u*sn+v*sc,z],c=this.ctx;
      c.save();if(ghost)c.globalAlpha=.55;
      this.poly([p(-2.6,-1.1,0),p(2.8,-1.1,0),p(2.8,1.3,0),p(-2.6,1.3,0)],'#26374733');
      for(const u of [-1.4,1.35])for(const v of [-.85,.85])this.poly([p(u-.4,v-.16,.3),p(u+.4,v-.16,.3),p(u+.4,v+.16,.3),p(u-.4,v+.16,.3)],'#24323c');
      this.poly([p(-2.3,-.85,.45),p(1.9,-.85,.45),p(2.3,-.5,.45),p(2.3,.5,.45),p(1.9,.85,.45),p(-2.3,.85,.45)],color);
      this.poly([p(-1.3,-.8,.5),p(1.2,-.75,.5),p(.65,-.62,1.25),p(-1,-.62,1.25)],color);
      this.poly([p(-1,-.62,1.25),p(.65,-.62,1.25),p(.65,.62,1.25),p(-1,.62,1.25)],color);
      this.poly([p(.65,-.62,1.25),p(1.45,-.73,.5),p(1.45,.73,.5),p(.65,.62,1.25)],'#334b61');
      this.poly([p(-.9,-.5,1.27),p(.15,-.5,1.27),p(.15,.5,1.27),p(-.9,.5,1.27)],'#263f53');
      for(const v of [-.62,.62])this.line([p(2.05,v,.55),p(2.23,v*.6,.55)],'#fff4ce',Math.max(1,this.scale*.13));
      if(ghost)this.line([p(-2.8,-1.3,.05),p(2.8,-1.3,.05),p(2.8,1.3,.05),p(-2.8,1.3,.05),p(-2.8,-1.3,.05)],color,1.5,[5,4]);
      c.restore();
    }
    road(state){if(this.kind==='racing'){
      const t=this.data.track;this.poly([...t.left,...t.right.slice().reverse()],'#d3dbde');
      this.line(t.left,'#8d9c99',2);this.line(t.right,'#8d9c99',2);this.line(t.center,'#fff',1.5,[10,12]);
      for(let i=0;i<t.s.length-6;i+=10){const side=i%20===0?t.left:t.right;this.line(side.slice(i,i+6),'#f7faf9',4);}
      for(let s=12;s<240;s+=24){for(const n of [-17,19]){const [x,y]=this.world(s,n);this.tree(x,y,2.5+(s%3));}}
      for(const s of [0,60,120,180,240]){const [x,y]=this.world(s,-10);this.label(x,y,`${s} m`,'#61716d',0);}
    }else{
      const left=this.view==='follow'?state.x-65:-80,right=this.view==='follow'?state.x+150:260;
      this.poly([[left,-2],[right,-2],[right,9.2],[left,9.2]],'#d3dbde');
      this.poly([[left,5.4],[right,5.4],[right,9],[left,9]],'#c5d8ce');
      this.line([[left,-1.8],[right,-1.8]],'#fff',2);this.line([[left,9],[right,9]],'#fff',2);
      for(const n of [1.8,5.4])this.line([[left,n],[right,n]],'#fff',2,[18,20]);
      this.line([[left,-3],[right,-3]],'#9aa7a5',1.5);this.line([[left,10.2],[right,10.2]],'#9aa7a5',1.5);
      for(let s=Math.floor(left/24)*24;s<right;s+=24){this.tree(s,17,2.6);this.tree(s+9,-12,2.3);}
      this.label(this.view==='follow'?state.x-20:30,12,'Lane 3 · goal','#22754d',15);
    }}
    tree(x,y,h){const p=this.project(x,y);if(p[0]<-40||p[0]>this.w+40||p[1]<-40||p[1]>this.h+40)return;
      this.poly([[x-1,y-1,0],[x+3,y-1,0],[x+4,y+1,0],[x,y+2,0]],'#7d8d7929');
      this.poly([[x-1.5,y-1.5,.4],[x+1.5,y-1.5,.4],[x,y,h]],'#9fb29a');
      this.poly([[x+1.5,y-1.5,.4],[x+1.5,y+1.5,.4],[x,y,h]],'#b7c7ac');
      this.poly([[x-1.5,y-1.5,.4],[x-1.5,y+1.5,.4],[x,y,h]],'#8ea186');
    }
    render(scenario,run,time,{ghost=true,corridor=false,dt=1/60}={}){
      const state=sampleTrajectory(run.trajectory,time),c=this.ctx;
      const target=this.view==='follow'?[state.x+14*Math.cos(state.heading),state.y+14*Math.sin(state.heading)]:this.kind==='racing'?[115,17]:[90,3.6];
      const desired=this.view==='follow'?Math.min(this.w/82,this.h/42):Math.min(this.w/(this.kind==='racing'?265:220),this.h/115);
      if(!this.focus){this.focus=target;this.scale=desired;}
      const f=1-Math.exp(-dt/.32);this.focus=this.focus.map((v,i)=>lerp(v,target[i],f));this.scale=lerp(this.scale,desired,f);
      this.moving=Math.hypot(this.focus[0]-target[0],this.focus[1]-target[1])>.01||abs(this.scale-desired)>.001;
      c.clearRect(0,0,this.w,this.h);c.fillStyle='#f2f5ef';c.fillRect(0,0,this.w,this.h);this.road(state);
      if(this.kind==='racing'){
        if(corridor){const cor=run.corridor;this.poly([...cor.s.map((s,i)=>this.world(s,cor.lo[i])),...cor.s.map((s,i)=>this.world(s,cor.hi[i])).reverse()],'#2166ac18');}
        for(const obj of scenario.obstacles){const p=this.world(obj.s,obj.n),q=this.world(obj.s+1,obj.n);this.box(...p,obj.length,obj.width,1.3,'#bc6756',Math.atan2(q[1]-p[1],q[0]-p[0]));this.label(...p,obj.name,'#934737',18);}
        for(let i=0;i<scenario.rewards.length;i++){const obj=scenario.rewards[i],p=this.world(obj.s,obj.n),taken=run.metrics.collected[i]&&state.s>obj.s;
          const color=taken?'#86a78c':'#3f956b';this.poly([this.world(obj.s-2,obj.n-obj.width/2),this.world(obj.s+2,obj.n-obj.width/2),this.world(obj.s+2,obj.n+obj.width/2),this.world(obj.s-2,obj.n+obj.width/2)],'#63a98566');
          this.poly([[p[0],p[1],2.6],[p[0]+.75,p[1],1.8],[p[0],p[1],1],[p[0]-.75,p[1],1.8]],color);this.label(...p,`${obj.name}${taken?' ✓':''}`,'#22754d',28);
        }
      }else{
        for(const v of scenario.vehicles){const s={x:v.s+v.speed*time,y:v.lane*3.6,heading:0};this.car(s,'#8d9da8');this.label(s.x,s.y,v.name,'#526170',18);}
      }
      const trajectory=run.trajectory;this.line(trajectory.xy,'#2166ac55',2,[6,7]);this.line(trajectory.xy.slice(0,state.index+2),'#2166ac',2.5);
      const comparison=scenario.runs.find(r=>r.id===(this.kind==='racing'?'line':'short'));
      if(ghost&&comparison.id!==run.id){const g=sampleTrajectory(comparison.trajectory,time);this.line(comparison.trajectory.xy,'#b4481944',1.5,[5,9]);this.car(g,'#c16b37',true);this.label(g.x,g.y,'Comparison','#a44d22',65);}
      this.car(state,'#2166ac');this.label(state.x,state.y,'Selected plan','#2166ac',-32);this.lastState=state;this.dirty=false;
    }
  }
  const abs=Math.abs;
  window.sampleTrajectory=sampleTrajectory;window.DrivingScene=DrivingScene;
})();
