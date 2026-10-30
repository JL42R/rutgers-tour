import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {PlayerControls} from '../src/controls.js';
import {ZoneManager} from '../src/zones.js';
import {room116ArrivalPosition} from '../src/room116-arrival.js';
import {createRoom116Boundary,room116Coordinates,isRoom116PositionAllowed,resolveRoom116Movement} from '../src/room116-boundary.js';

const config=JSON.parse(fs.readFileSync(new URL('../public/zones.json',import.meta.url)));
const room=config.zones.find(z=>z.id==='project-studio'),hall=config.zones.find(z=>z.id==='hallway'),printing=config.zones.find(z=>z.id==='printing-room');
const b=createRoom116Boundary(room),d3=hall.transitions.find(t=>t.id==='project-studio-door');
const sign=hall.signs.find(s=>s.id==='project-studio-entry-sign');
const near=(a,c,t=1e-8)=>assert(Math.abs(a-c)<=t,`${a} != ${c}`);
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const source=main.slice(main.indexOf('let zoneSwitchInProgress = false;'),main.indexOf('// --- Frame loop ---'));
const makeLogic=new Function('zones','npcs','controls','console','room116ArrivalPosition',`${source}\nreturn {switchZone,crossedTransition};`);
const control=()=>Object.assign(Object.create(PlayerControls.prototype),{camera:new THREE.PerspectiveCamera(70,16/9,.05,200),enabled:true,keys:new Set(['KeyW']),yaw:0,pitch:0});
function setup(current=hall){
  const c=control(),zones={current,async loadZone(id){await Promise.resolve();this.current=config.zones.find(z=>z.id===id);return this.current;}};
  const logic=makeLogic(zones,{setNPCs(){}},c,{info(){},warn(...a){throw Error(a.join(' '));},error(...a){throw Error(a.join(' '));}},room116ArrivalPosition);
  return {c,zones,logic};
}
function safeArrival(before,after){
  const q=room116Coordinates(after,b),old=room116Coordinates(before,b);
  near(q.forward,.6,1e-12);assert(isRoom116PositionAllowed(after,b));
  assert(after.z>=b.portalMinZ&&after.z<=b.portalMaxZ);
  const minW=(b.origin.z+b.forward.z*.6-b.portalMaxZ)/(-b.left.z);
  near(q.left,Math.max(old.left,minW),1e-12);
  assert(q.left-old.left>=-1e-12&&q.left-old.left<=.011100);
  const reached=resolveRoom116Movement(before,{x:after.x-before.x,z:after.z-before.z},b);
  near(reached.x,after.x);near(reached.z,after.z);
}

test('one Room 116 hallway sign, exact text, original printing-room sign unchanged',()=>{
  assert.equal(hall.signs.filter(s=>s.id==='project-studio-entry-sign').length,1);
  assert(!room.signs.some(s=>s.id==='project-studio-entry-sign'));
  assert.equal(sign.title,'PROJECT STUDIO — ROOM 116');assert.equal(sign.subtitle,'Walk through this door to enter');
  assert.deepEqual(hall.signs.find(s=>s.id==='printing-room-entry-sign'),{
    id:'printing-room-entry-sign',title:'3D PRINTING ROOM',subtitle:'Walk through this door to enter',position:[-.985,1.57,5.6775],rotation:[0,90,0],size:[1.2,.42],
  });
});

test('Room 116 sign faces hallway -X, centers on opening and matches existing height/dimensions',()=>{
  const normal=new THREE.Vector3(0,0,1).applyEuler(new THREE.Euler(...sign.rotation.map(THREE.MathUtils.degToRad)));
  near(normal.x,-1,1e-12);near(normal.z,0,1e-12);
  const print=hall.signs.find(s=>s.id==='printing-room-entry-sign');
  assert.deepEqual(sign.size,print.size);assert.equal(sign.position[1],print.position[1]);
  near(sign.position[2],(room.walkingBoundary.doorway.openingZ[0]+room.walkingBoundary.doorway.openingZ[1])/2,1e-12);
  assert(sign.position[0]<d3.plane);assert(sign.position[0]>0);
  assert(sign.position[2]-sign.size[0]/2>room.walkingBoundary.doorway.openingZ[0]);
  assert(sign.position[2]+sign.size[0]/2<room.walkingBoundary.doorway.openingZ[1]);
});

test('actual existing sign renderer retains white/red styling, fits title and adds no collisions',()=>{
  const calls=[],canvases=[],original=globalThis.document;
  globalThis.document={createElement(tag){assert.equal(tag,'canvas');const context={fillRect(...args){calls.push(['fillRect',this.fillStyle,...args]);},strokeRect(...args){calls.push(['strokeRect',this.strokeStyle,...args]);},fillText(...args){calls.push(['text',this.font,...args]);}};const canvas={getContext(){return context;}};canvases.push(canvas);return canvas;}};
  const group=new THREE.Group(),before=structuredClone(hall);
  try{
    ZoneManager.prototype.buildSigns.call({},group,hall);
    assert.equal(group.children.length,hall.signs.length);assert.deepEqual(hall,before);
    assert(calls.some(c=>c[0]==='fillRect'&&c[1]==='#ffffff'));
    assert(calls.some(c=>c[0]==='strokeRect'&&c[1]==='#cc0033'));
    assert(calls.some(c=>c[0]==='text'&&c[1]==='bold 72px system-ui, sans-serif'&&c[2]===sign.title&&c[5]===916));
    const mesh=group.children.find(m=>m.name==='sign-project-studio-entry-sign');
    assert.equal(mesh.material.side,THREE.FrontSide);assert.equal(mesh.material.depthTest,true);
    assert.deepEqual(mesh.position.toArray(),sign.position);assert.equal(mesh.geometry.parameters.width,1.2);
  }finally{globalThis.document=original;for(const mesh of group.children){mesh.geometry.dispose();mesh.material.map.dispose();mesh.material.dispose();}}
});

test('sign does not change approved outer boundary, exclusions, D3 or hallway startup',()=>{
  assert.equal(config.startZone,'hallway');assert.equal(d3.plane,1.2642833297509717);
  assert.deepEqual(d3.range,[16.505667581697203,17.573909531203245]);
  assert.deepEqual(room.walkingBoundary.exclusions,[{id:'entrance-right',forward:[0,1.9],left:[.3,4.236812761805356]},{id:'right-wall-strip',forward:[1.9,11.049],left:[0,1.2192]}]);
  assert.equal(room.walkingBoundary.width,6.096);assert.equal(room.walkingBoundary.depth,11.049);
  assert.deepEqual(room.spawn,[2,0,-1.5]);
  assert(main.includes('switchZone(transition.target, transition, previousPosition)'));
});

test('center landing is forward .60 with exact original local lateral position and forward heading',()=>{
  const p={x:d3.plane+.02,z:(d3.range[0]+d3.range[1])/2},arrival=room116ArrivalPosition(p,room);
  safeArrival(p,arrival);
  const amount=.6-room116Coordinates(p,b).forward;
  near(arrival.x-p.x,amount*b.forward.x,1e-12);near(arrival.z-p.z,amount*b.forward.z,1e-12);
});

test('right-edge minimal lateral correction prevents a blocked straight-back return',()=>{
  const p={x:d3.plane+1e-9,z:d3.range[1]},old=room116Coordinates(p,b),amount=.6-old.forward;
  const raw={x:p.x+amount*b.forward.x,z:p.z+amount*b.forward.z};
  assert(raw.z>b.portalMaxZ);assert(isRoom116PositionAllowed(raw,b));
  let blocked=raw;for(let i=0;i<20;i++)blocked=resolveRoom116Movement(blocked,{x:-.11,z:0},b);
  assert(blocked.x>d3.plane,'The uncorrected example should demonstrate the front-wall obstruction.');
  const next=room116ArrivalPosition(p,room);safeArrival(p,next);assert.equal(next.z,b.portalMaxZ);
  let out=next;for(let i=0;i<10&&out.x>=d3.plane;i++)out=resolveRoom116Movement(out,{x:-.11,z:0},b);
  assert(out.x<d3.plane);
});

test('all 1,028 continuous-envelope samples land safely and can reverse directly through D3',()=>{
  for(let zi=0;zi<=256;zi++)for(const dx of [1e-9,.001,.055,.11]){
    const p={x:d3.plane+dx,z:d3.range[0]+(d3.range[1]-d3.range[0])*zi/256},arrival=room116ArrivalPosition(p,room);
    assert(arrival);safeArrival(p,arrival);
    let out=arrival;for(let n=0;n<12&&out.x>=d3.plane;n++){out=resolveRoom116Movement(out,{x:-.11,z:0},b);assert(isRoom116PositionAllowed(out,b));}
    assert(out.x<d3.plane,'Could not return through D3');
  }
});

test('unsafe/irrelevant helper targets are rejected; no interior relocation through an obstacle',()=>{
  assert.equal(room116ArrivalPosition({x:0,z:0},hall),null);
  const p={x:d3.plane+.001,z:(d3.range[0]+d3.range[1])/2};
  const unsafe=structuredClone(room);unsafe.walkingBoundary.exclusions.push({id:'test-only-blocker',forward:[.4,.8],left:[4.5,5.7]});
  assert.equal(room116ArrivalPosition(p,unsafe),null);
});

test('actual D3 switch applies target only with original crossing context, preserving height and facing',async()=>{
  const {c,zones,logic}=setup();const previous={x:d3.plane-.02,z:17.04};
  c.camera.position.set(d3.plane+.02,1.65,17.04);c.yaw=-1.3;c.pitch=.24;c.update(0,[],hall);
  const before=c.camera.position.clone(),q=c.camera.quaternion.clone();
  const pending=logic.switchZone('project-studio',d3,previous);assert.equal(c.enabled,false);await pending;
  safeArrival(before,c.camera.position);assert.equal(c.camera.position.y,1.65);assert.equal(c.yaw,-1.3);assert.equal(c.pitch,.24);assert(c.camera.quaternion.equals(q));assert.equal(zones.current.id,'project-studio');
  assert(!room.transitions.some(t=>logic.crossedTransition(c.camera.position,c.camera.position,t)));
});

test('direct, stationary, forged, other-zone and wrong-door switches retain original position',async()=>{
  for(const mode of ['direct','stationary','forged','other-source','wrong-door']){
    const {c,zones,logic}=setup(mode==='other-source'?printing:hall);
    c.camera.position.set(d3.plane+.01,1.65,17.04);const p=c.camera.position.clone();
    const transition=mode==='direct'?undefined:mode==='forged'?{...d3}:mode==='wrong-door'?hall.transitions[0]:d3;
    const previous=mode==='stationary'?{x:p.x,z:p.z}:{x:d3.plane-.01,z:p.z};
    await logic.switchZone('project-studio',transition,previous);assert(p.equals(c.camera.position));assert.equal(zones.current.id,'project-studio');
  }
});

test('84,810 actual-context crossings apply safe inward entry only; return positions remain unchanged',async()=>{
  const {c,zones,logic}=setup();let crossings=0,adjustments=0,largestLateralChange=0;
  for(const direction of [1,-1])for(const dt of [1/120,1/60,.05])for(let zi=0;zi<=256;zi++)for(const deg of [-89,-75,-60,-45,-15,0,15,45,60,75,89])for(const phase of [1e-9,.001,.25,.5,.999999]){
    const z=d3.range[0]+(d3.range[1]-d3.range[0])*zi/256,angle=deg*Math.PI/180,vx=direction*Math.cos(angle),vz=Math.sin(angle),dx=2.2*dt*vx;
    c.camera.position.set(d3.plane-dx*phase,1.65,z);c.yaw=Math.atan2(-vx,-vz);c.pitch=.12;c.enabled=true;
    const zone=direction>0?hall:room;zones.current=zone;
    const previous=c.camera.position.clone();c.update(dt,zone.collision,zone);
    const t=zone.transitions.find(t=>logic.crossedTransition(previous,c.camera.position,t));assert(t);
    const crossed=c.camera.position.clone(),facing=c.camera.quaternion.clone(),yaw=c.yaw,pitch=c.pitch;
    await logic.switchZone(t.target,t,previous);
    assert.equal(c.camera.position.y,1.65);assert.equal(c.yaw,yaw);assert.equal(c.pitch,pitch);assert(c.camera.quaternion.equals(facing));
    if(direction>0){safeArrival(crossed,c.camera.position);const lateral=room116Coordinates(c.camera.position,b).left-room116Coordinates(crossed,b).left;largestLateralChange=Math.max(largestLateralChange,lateral);adjustments++;}
    else assert(crossed.equals(c.camera.position));
    assert(!zones.current.transitions.some(t=>logic.crossedTransition(c.camera.position,c.camera.position,t)));crossings++;
  }
  assert.equal(crossings,84810);assert.equal(adjustments,42405);assert(largestLateralChange<=.011100);
});

test('150 repeated full D3 entry/landing/backward-return crossings remain stable',async()=>{
  let crossings=0;
  for(const dt of [1/120,1/60,.05])for(const z of [d3.range[0],d3.range[0]+1e-7,(d3.range[0]+d3.range[1])/2,d3.range[1]-1e-7,d3.range[1]]){
    const {c,zones,logic}=setup();c.camera.position.set(0,1.65,z);
    for(let repeat=0;repeat<5;repeat++)for(const target of [2.5,0]){
      c.yaw=target>c.camera.position.x?-Math.PI/2:Math.PI/2;c.pitch=-.1;
      for(let frame=0;frame<800&&Math.abs(c.camera.position.x-target)>2.2*dt;frame++){
        const previous=c.camera.position.clone();c.update(dt,zones.current.collision,zones.current);
        const t=zones.current.transitions.find(t=>logic.crossedTransition(previous,c.camera.position,t));
        if(t){const crossed=c.camera.position.clone(),q=c.camera.quaternion.clone();await logic.switchZone(t.target,t,previous);assert(q.equals(c.camera.quaternion));if(t.target==='project-studio')safeArrival(crossed,c.camera.position);else assert(crossed.equals(c.camera.position));crossings++;}
      }
      assert(Math.abs(c.camera.position.x-target)<=2.2*dt+1e-8,'Repeated route trapped');assert.equal(c.camera.position.y,1.65);
    }
  }
  assert.equal(crossings,150);
});

test('20 D1 crossings using actual transition context preserve original arrival and orientation',async()=>{
  let count=0;
  for(const dt of [1/60,.05]){
    const {c,zones,logic}=setup();c.camera.position.set(0,1.65,5.675);
    for(let repeat=0;repeat<5;repeat++)for(const target of [-1.5,0]){
      c.yaw=target<c.camera.position.x?Math.PI/2:-Math.PI/2;
      for(let frame=0;frame<600&&Math.abs(c.camera.position.x-target)>2.2*dt;frame++){
        const previous=c.camera.position.clone();c.update(dt,zones.current.collision,zones.current);
        const t=zones.current.transitions.find(t=>logic.crossedTransition(previous,c.camera.position,t));
        if(t){const p=c.camera.position.clone(),q=c.camera.quaternion.clone();await logic.switchZone(t.target,t,previous);assert(p.equals(c.camera.position));assert(q.equals(c.camera.quaternion));count++;}
      }
      assert(Math.abs(c.camera.position.x-target)<=2.2*dt+1e-8);
    }
  }
  assert.equal(count,20);
});
