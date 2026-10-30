import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {PLAYER_RADIUS, resolveMovement} from '../src/collision.js';
import {PlayerControls} from '../src/controls.js';
import {createRoom116Boundary,room116Coordinates,isRoom116PositionAllowed,resolveRoom116Movement} from '../src/room116-boundary.js';
import {compileRoom116Exclusions,firstRoom116ExclusionContact,insideRoom116Exclusion} from '../src/room116-exclusions.js';

const config=JSON.parse(fs.readFileSync(new URL('../public/zones.json',import.meta.url)));
const studio=config.zones.find(z=>z.id==='project-studio'),hall=config.zones.find(z=>z.id==='hallway'),printing=config.zones.find(z=>z.id==='printing-room');
const b=createRoom116Boundary(studio),Y=4.236812761805356,R=PLAYER_RADIUS;
const near=(a,c,t=1e-8)=>assert(Math.abs(a-c)<=t,`${a} != ${c}`);
const point=(forward,left)=>({x:b.origin.x+forward*b.forward.x+left*b.left.x,z:b.origin.z+forward*b.forward.z+left*b.left.z});
const step=(forward,left)=>({x:forward*b.forward.x+left*b.left.x,z:forward*b.forward.z+left*b.left.z});
const distance=(a,c)=>Math.hypot(a.x-c.x,a.z-c.z);
function oracle(p){
  const q=room116Coordinates(p,b);
  for(const box of studio.walkingBoundary.exclusions){
    const d=Math.max(box.forward[0]-q.forward,0,q.forward-box.forward[1]);
    const w=Math.max(box.left[0]-q.left,0,q.left-box.left[1]);
    assert(Math.hypot(d,w)>=R-1e-8,`Penetrated ${box.id}: ${JSON.stringify(q)}`);
  }
}
function move(p,v){
  const next=resolveRoom116Movement(p,v,b);
  assert(isRoom116PositionAllowed(next,b),`Invalid ${JSON.stringify({p,v,next,local:room116Coordinates(next,b)})}`);
  oracle(next);assert(distance(p,next)<=Math.hypot(v.x,v.z)+1e-8,'Position snapped farther than requested step');return next;
}
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const source=main.slice(main.indexOf('let zoneSwitchInProgress = false;'),main.indexOf('// --- Frame loop ---'));
const makeLogic=new Function('zones','npcs','controls','console',`${source}\nreturn {switchZone,crossedTransition};`);
const crossed=makeLogic({}, {}, {}, console).crossedTransition;
const control=()=>Object.assign(Object.create(PlayerControls.prototype),{camera:new THREE.PerspectiveCamera(70,16/9,.05,200),enabled:true,keys:new Set(['KeyW']),yaw:0,pitch:0});

test('production geometry is the approved physical pair, with exactly one shared radius',()=>{
  assert.deepEqual(studio.walkingBoundary.exclusions,[
    {id:'entrance-right',forward:[0,1.9],left:[.3,Y]},
    {id:'right-wall-strip',forward:[1.9,11.049],left:[0,1.2192]},
  ]);
  assert.equal(b.radius,.35);assert.equal(b.exclusions.length,2);
  assert.deepEqual(studio.collision,[]);assert.equal(studio.debugCollision,false);assert.equal(config.startZone,'hallway');
  assert.equal(studio.splat,'./splats/project-studio.compressed.ply');
  assert.equal(studio.placeholder,false);
});

test('compiler rejects malformed/outside rectangles and never enables other-zone exclusions',()=>{
  for(const value of [null,[{id:'bad',forward:[0,12],left:[0,1]}],[{id:'bad',forward:[0,1],left:[1,0]}],[{id:'a',forward:[0,1],left:[0,1]},{id:'a',forward:[1,2],left:[0,1]}]])assert.throws(()=>compileRoom116Exclusions(value,b.width,b.depth));
  assert.throws(()=>createRoom116Boundary({...studio,id:'hallway'}));
  assert.deepEqual(createRoom116Boundary({...studio,walkingBoundary:{...studio.walkingBoundary,exclusions:undefined}}).exclusions,[]);
});

test('all finite physical rectangle faces sweep at radius once, including hidden faces in isolation',()=>{
  const box=compileRoom116Exclusions([{id:'isolated',forward:[2,4],left:[2,4]}],10,10);
  for(const [p,v,expected,normal]of [
    [{forward:1,left:3},{forward:2,left:0},.325,{forward:-1,left:0}],
    [{forward:5,left:3},{forward:-2,left:0},.325,{forward:1,left:0}],
    [{forward:3,left:1},{forward:0,left:2},.325,{forward:0,left:-1}],
    [{forward:3,left:5},{forward:0,left:-2},.325,{forward:0,left:1}],
  ]){const hit=firstRoom116ExclusionContact(p,v,box,R);near(hit.time,expected);assert.deepEqual(hit.normal,normal);}
});

test('quarter-circle sweeps are rounded, not an extra square or a second radius',()=>{
  const box=compileRoom116Exclusions([{id:'isolated',forward:[2,4],left:[2,4]}],10,10);
  assert.equal(insideRoom116Exclusion({forward:4+.30,left:4+.30},box,R),false);
  assert.equal(insideRoom116Exclusion({forward:4+.20,left:4+.20},box,R),true);
  for(const sf of [-1,1])for(const sl of [-1,1]){
    const center={forward:sf<0?2:4,left:sl<0?2:4};
    const hit=firstRoom116ExclusionContact({forward:center.forward+sf,left:center.left+sl},{forward:-2*sf,left:-2*sl},box,R);
    near(hit.time,(Math.SQRT2-R)/(2*Math.SQRT2));near(hit.normal.forward,sf/Math.SQRT2);near(hit.normal.left,sl/Math.SQRT2);
  }
});

test('yellow exposed side and back block repeated inward movement without snapping',()=>{
  for(const d of [.4,1,1.8]){
    let p=point(d,Y+R+.01);for(let i=0;i<20;i++)p=move(p,step(0,-.11));near(room116Coordinates(p,b).left,Y+R);
  }
  for(const w of [1.7,2.5,4]){
    let p=point(2.26,w);for(let i=0;i<20;i++)p=move(p,step(-.11,0));near(room116Coordinates(p,b).forward,2.25);
  }
});

test('orange side blocks at 1.5692, at near/middle/far depths',()=>{
  for(const d of [2.5,5.5,10.5]){
    let p=point(d,1.58);for(let i=0;i<20;i++)p=move(p,step(0,-.11));near(room116Coordinates(p,b).left,1.2192+R);
  }
});

test('verified narrow and wide corridor widths are attained by the actual resolver',()=>{
  for(const [d,minW,width]of [[1,Y+R,1.159187238194644],[5,1.2192+R,4.1768]]){
    const lo=move(point(d,minW+.01),step(0,-.11)),hi=move(point(d,b.maxLeft-.01),step(0,.11));
    near(room116Coordinates(lo,b).left,minW);near(room116Coordinates(hi,b).left,b.maxLeft);near(distance(lo,hi),width);
    const free=move(point(d,(minW+b.maxLeft)/2),step(.03,.04));near(distance(point(d,(minW+b.maxLeft)/2),free),.05);
  }
});

test('yellow and orange support both directions of diagonal tangential sliding',()=>{
  for(const direction of [-1,1])for(const [d,w,dd,dw,axis,expected]of [
    [1,Y+R,direction*.06,-.06,'forward',1+direction*6*.06],
    [2.25,3,-.06,direction*.06,'left',3+direction*6*.06],
    [6,1.2192+R,direction*.06,-.06,'forward',6+direction*6*.06],
  ]){let p=point(d,w);for(let i=0;i<6;i++)p=move(p,step(dd,dw));near(room116Coordinates(p,b)[axis],expected);}
});

test('rounded yellow back-left corner permits a continuous narrow-to-wide path and return',()=>{
  let p=point(1,Y+R+.02);
  for(let i=0;i<18;i++)p=move(p,step(.08,0));
  for(let i=0;i<27;i++)p=move(p,step(0,-.08));
  const wide=room116Coordinates(p,b);assert(wide.forward>2.4&&wide.left<2.6);
  for(let i=0;i<27;i++)p=move(p,step(0,.08));
  for(let i=0;i<18;i++)p=move(p,step(-.08,0));
  near(room116Coordinates(p,b).forward,1);near(room116Coordinates(p,b).left,Y+R+.02);
});

test('every yellow corner permits tangential exit and motion away from disk contact',()=>{
  const isolated={...studio,walkingBoundary:{...studio.walkingBoundary,exclusions:[{id:'island',forward:[4,5],left:[3,4]}]}};
  const boundary=createRoom116Boundary(isolated);
  for(const sf of [-1,1])for(const sl of [-1,1]){
    const d=sf<0?4:5,w=sl<0?3:4,p=point(d+sf*R/Math.SQRT2,w+sl*R/Math.SQRT2);
    const stopped=resolveRoom116Movement(p,step(-sf*.05,-sl*.05),boundary);near(distance(p,stopped),0);
    const escaped=resolveRoom116Movement(stopped,step(sf*.05,sl*.05),boundary);near(distance(stopped,escaped),Math.SQRT2*.05);
    const tangent=resolveRoom116Movement(p,step(-sl*.05,sf*.05),boundary);near(distance(p,tangent),Math.SQRT2*.05);
  }
});

test('junction cannot be crossed from either direction or diagonally at either end',()=>{
  // Shared edge w=.3..1.2192 is inside the union, not a walkable line.
  for(let i=0;i<=100;i++)assert(!isRoom116PositionAllowed(point(1.9,.3+.9192*i/100),b));
  for(const [d,w,dd,dw]of [[2.5,1.7,-.11,-.08],[2.5,2.5,-.11,0],[1.6,Y+.4,.11,-.08],[2.4,1.6,-.11,-.08],[2.4,1.6,.11,-.08]]){
    let p=point(d,w);for(let i=0;i<12;i++)p=move(p,step(dd,dw));oracle(p);
    const escaped=move(p,step(.05,.05));assert(distance(p,escaped)>.02);
  }
});

test('real inner junction corner stops inward input and releases forward/sideways immediately',()=>{
  const p=point(2.25,1.2192+R),stopped=move(p,step(-.07,-.07));near(distance(p,stopped),0);
  near(distance(stopped,move(stopped,step(.08,0))),.08);
  near(distance(stopped,move(stopped,step(0,.08))),.08);
});

test('supported maximum steps and oversized sweeps do not tunnel through either member',()=>{
  for(const size of [.11,10,100])for(const [d,w,dd,dw]of [[1,5,0,-size],[3,3,-size,0],[6,3,0,-size]]){
    const p=move(point(d,w),step(dd,dw));oracle(p);
    if(dd<0)assert(room116Coordinates(p,b).forward>=2.25-1e-8);
    else if(d===1)assert(room116Coordinates(p,b).left>=Y+R-1e-8);
    else assert(room116Coordinates(p,b).left>=1.2192+R-1e-8);
  }
});

test('invalid obstacle starts remain stationary rather than teleporting; no change to valid zero input',()=>{
  for(const p of [point(1,2),point(5,.8)]){
    assert(!isRoom116PositionAllowed(p,b));assert.deepEqual(resolveRoom116Movement(p,step(.1,.1),b),p);
  }
  const p=point(1,5);assert.deepEqual(move(p,step(0,0)),p);
});

test('all unexcluded floor remains valid: no unrelated furniture or conservative square corner blocks',()=>{
  for(const [d,w]of [[.7,5],[1.8,5.7],[2.2,Y+.3],[3,2],[6,2],[8,4],[10.5,5.7]])assert(isRoom116PositionAllowed(point(d,w),b));
  for(const [d,w]of [[2.25,3],[1,Y+R],[6,1.2192+R]]){
    const p=point(d,w),escaped=move(p,step(.03,.03));near(distance(p,escaped),Math.hypot(.03,.03));
  }
});

test('50,000 deterministic probes preserve outer limits, obstacle clearance and requested distance',()=>{
  let seed=916;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  let count=0;
  for(let i=0;i<50000;i++){
    const p=point(.35+random()*(b.maxForward-.35),.35+random()*(b.maxLeft-.35));
    if(!isRoom116PositionAllowed(p,b))continue;
    const a=random()*2*Math.PI,len=random()*.11;move(p,{x:Math.cos(a)*len,z:Math.sin(a)*len});count++;
  }
  assert(count>25000);
});

test('D3 continuous crossing envelope clears actual updated exclusion geometry by at least 10.026 mm',()=>{
  let min=Infinity;
  for(const x of [b.portalPlaneX-.11,b.portalPlaneX+.11])for(const z of [b.portalMinZ,b.portalMaxZ]){
    const p={x,z},q=room116Coordinates(p,b);assert(isRoom116PositionAllowed(p,b));oracle(p);
    min=Math.min(min,q.left-Y-R);assert.deepEqual(resolveRoom116Movement(p,{x:0,z:0},b),p);
  }
  near(min,.010026170283067182,1e-12);assert(min>1e7*1e-10);
});

test('84,810 updated-runtime D3 crossings: every sampled Z, both endpoints, diagonals, timesteps and overshoots',async()=>{
  const c=control(),zones={current:hall,async loadZone(id){this.current=config.zones.find(z=>z.id===id);return this.current;}};
  const logic=makeLogic(zones,{setNPCs(){}},c,{info(){},error(...args){throw Error(args.join(' '));}});
  let count=0;
  for(const direction of [1,-1])for(const dt of [1/120,1/60,.05])for(let zi=0;zi<=256;zi++)for(const deg of [-89,-75,-60,-45,-15,0,15,45,60,75,89])for(const phase of [1e-9,.001,.25,.5,.999999]){
    const z=b.portalMinZ+(b.portalMaxZ-b.portalMinZ)*zi/256,angle=deg*Math.PI/180,vx=direction*Math.cos(angle),vz=Math.sin(angle),dx=2.2*dt*vx;
    c.camera.position.set(b.portalPlaneX-dx*phase,1.65,z);c.enabled=true;c.yaw=Math.atan2(-vx,-vz);
    const zone=direction>0?hall:studio;zones.current=zone;
    const previous=c.camera.position.clone();c.update(dt,zone.collision,zone);
    const transition=zone.transitions.find(t=>logic.crossedTransition(previous,c.camera.position,t));
    assert(transition,`Blocked D3 ${JSON.stringify({direction,dt,z,deg,phase,previous,next:c.camera.position})}`);
    assert.equal(transition.target,direction>0?'project-studio':'hallway');oracle(c.camera.position);
    const position=c.camera.position.clone(),facing=c.camera.quaternion.clone(),pending=logic.switchZone(transition.target);
    assert.equal(c.enabled,false);await pending;assert(position.equals(c.camera.position));assert(facing.equals(c.camera.quaternion));
    assert(!zones.current.transitions.some(t=>logic.crossedTransition(c.camera.position,c.camera.position,t)));
    if(direction>0)assert(isRoom116PositionAllowed(c.camera.position,b));
    else for(const box of hall.collision){const p=c.camera.position;assert(!(p.x>box.min[0]-R&&p.x<box.max[0]+R&&p.z>box.min[2]-R&&p.z<box.max[2]+R));}
    count++;
  }
  assert.equal(count,84810);
});

test('every D3 lateral entry can proceed through the narrow corridor to the wide area and return without traps',()=>{
  const outerOnly=createRoom116Boundary({...studio,walkingBoundary:{...studio.walkingBoundary,exclusions:undefined}});
  for(let i=0;i<=256;i++){
    const z=b.portalMinZ+(b.portalMaxZ-b.portalMinZ)*i/256;
    let p={x:b.portalPlaneX+.001,z},baseline={...p};
    const advance=v=>{p=move(p,v);baseline=resolveRoom116Movement(baseline,v,outerOnly);near(distance(p,baseline),0,1e-8);};
    for(let n=0;n<28;n++)advance(step(.11,0));
    assert(room116Coordinates(p,b).forward>3);
    // At a usable jamb endpoint, F-directed input already slides against the existing
    // world-Z corridor. Match that baseline; a perfectly reversible free line is not assumed.
    for(let n=0;n<28;n++)advance(step(-.11,0));
    const out=move(p,{x:-.11,z:0});assert(out.x<b.portalPlaneX);
  }
});

test('100 repeated actual-control D3 entry/approach/return crossings retain position and facing',async()=>{
  let total=0;
  for(const dt of [1/60,.05])for(const z of [b.portalMinZ,b.portalMinZ+1e-7,(b.portalMinZ+b.portalMaxZ)/2,b.portalMaxZ-1e-7,b.portalMaxZ]){
    const c=control();c.camera.position.set(0,1.65,z);
    const zones={current:hall,async loadZone(id){this.current=config.zones.find(z=>z.id===id);return this.current;}};
    const logic=makeLogic(zones,{setNPCs(){}},c,{info(){},error(...args){throw Error(args.join(' '));}});
    for(let repeat=0;repeat<5;repeat++)for(const target of [2.5,0]){
      c.yaw=target>c.camera.position.x?-Math.PI/2:Math.PI/2;
      for(let frame=0;frame<600&&Math.abs(c.camera.position.x-target)>2.2*dt;frame++){
        const previous=c.camera.position.clone();c.update(dt,zones.current.collision,zones.current);oracle(c.camera.position);
        const t=zones.current.transitions.find(t=>logic.crossedTransition(previous,c.camera.position,t));
        if(t){const p=c.camera.position.clone(),q=c.camera.quaternion.clone();await logic.switchZone(t.target);assert(p.equals(c.camera.position));assert(q.equals(c.camera.quaternion));total++;}
      }
      assert(Math.abs(c.camera.position.x-target)<=2.2*dt+1e-8,'D3 round trip trapped');
    }
  }
  assert.equal(total,100);
});

test('20 repeated actual-control D1 crossings and legacy AABB behavior remain unchanged',()=>{
  for(const zone of [hall,printing])for(const p of [{x:0,z:0},{x:.7,z:10},{x:0,z:17},{x:-1.5,z:5.675}])for(const yaw of [0,.3,Math.PI/2,Math.PI]){
    const c=control();c.camera.position.set(p.x,1.65,p.z);c.yaw=yaw;
    const v=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(0,yaw,0)).multiplyScalar(2.2*.05),expected=resolveMovement(c.camera.position,v,zone.collision);
    c.update(.05,zone.collision,zone);assert.equal(c.camera.position.x,expected.x);assert.equal(c.camera.position.z,expected.z);
  }
  let count=0;
  for(const dt of [1/60,.05]){
    const c=control();c.camera.position.set(0,1.65,5.675);let zone=hall;
    for(let repeat=0;repeat<5;repeat++)for(const target of [-1.5,0]){
      c.yaw=target<c.camera.position.x?Math.PI/2:-Math.PI/2;
      for(let frame=0;frame<500&&Math.abs(c.camera.position.x-target)>2.2*dt;frame++){
        const previous=c.camera.position.clone();c.update(dt,zone.collision,zone);
        const t=zone.transitions.find(t=>crossed(previous,c.camera.position,t));if(t){zone=config.zones.find(z=>z.id===t.target);count++;}
      }
      assert(Math.abs(c.camera.position.x-target)<=2.2*dt+1e-8);
    }
  }
  assert.equal(count,20);
});

test('13,248 near-corner input sweeps preserve exact disk clearance and do not stick on tangency',()=>{
  let cases=0;
  for(let degree=0;degree<=90;degree+=2)for(let direction=0;direction<144;direction++)for(const gap of [0,1e-6]){
    const angle=degree*Math.PI/180,a=direction*2*Math.PI/144;
    const p=point(1.9+(R+gap)*Math.cos(angle),Y+(R+gap)*Math.sin(angle));
    move(p,step(.11*Math.cos(a),.11*Math.sin(a)));cases++;
    const escaped=move(p,step(.01*Math.cos(angle),.01*Math.sin(angle)));near(distance(p,escaped),.01);
  }
  assert.equal(cases,13248);
});
