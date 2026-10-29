const assert=require('node:assert/strict');
global.AtlasTimeline=require('../dist/timeline.js');const lens=require('../dist/time-lens.js'),T=AtlasTimeline;
const dates=T.range([],{start:'2025-10-29',end:'2026-10-28'}),row={published_at:'2026-04-01'};
let config=T.timeSettings({date:'2026-04-01'});
assert.equal(T.timeScale(row,config,dates),2);
config=T.timeSettings({...config,peak:12,width:.04});assert.equal(T.timeScale(row,config,dates),12);
const neighbor={published_at:'2026-05-01'};
assert(T.timeScale(neighbor,{...config,width:.3},dates)>T.timeScale(neighbor,config,dates));
assert.equal(T.timeScale({published_at:null},config,dates),1);
assert.equal(T.timeScale(row,{...config,enabled:false},dates),1);
assert.deepEqual(T.timeSettings({peak:100,width:-1}),{enabled:true,date:null,peak:12,width:.01});
assert.equal(lens.compensation(T.timeSettings({peak:2})),0);
assert.equal(lens.compensation(T.timeSettings({peak:5})),.5);
assert.equal(lens.compensation(T.timeSettings({peak:8})),1);
// Projection r/z: at full compensation a far focus node exceeds a nearer non-focus node.
const near=1*lens.depthScale(100,400,1)/100,far=8*lens.depthScale(1200,400,1)/1200;
assert(Math.abs(far/near-8)<1e-10);
assert.equal(lens.depthScale(-20,400,1),1);
for(const date of [dates.startDate,dates.endDate,'2026-04-01']){
 const c=lens.curve({...config,date},dates);assert(c.points.some(([x,y])=>x===c.center&&y===c.peakY));assert(c.points.every(([x,y])=>x>=0&&x<=1&&y>=16-1e-10&&y<=88));
}
class Element{constructor(){this.handlers={};this.attrs={};this.value='';this.classList={add(){},remove(){},toggle(){}};this.captured=false;}
 addEventListener(k,fn){this.handlers[k]=fn}setAttribute(k,v){this.attrs[k]=String(v)}getBoundingClientRect(){return {left:0,top:0,width:1000,height:100}}setPointerCapture(){this.captured=true}hasPointerCapture(){return this.captured}releasePointerCapture(){this.captured=false}}
const els=new Map(),$=id=>{if(!els.has(id))els.set(id,new Element());return els.get(id)};
let changes=0,busy=false;config=T.timeSettings({date:'2026-04-01'});
const control=lens.init($,{getState:()=>({config,dates}),onChange:v=>{config=T.timeSettings({...config,...v});changes++},onBusy:v=>busy=v});control.paint();
const event=(x,y)=>({clientX:x,clientY:y,button:0,pointerId:1,preventDefault(){},stopPropagation(){}});
const center=lens.curve(config,dates).center,grabX=12+976*(center+.14);
let before=config;const at=(cfg,offset)=>T.profileGain(cfg,offset,dates);
$('timeBellLine').handlers.pointerdown(event(grabX,80));$('timeBell').handlers.pointermove(event(grabX+90,80));assert(config.profile,'Pure horizontal drag must change width');$('timeBell').handlers.pointerup(event(grabX+90,80));$('timeBellUndo').onclick();before=config;
$('timeBellLine').handlers.pointerdown(event(grabX,80));assert(control.isDragging()&&busy);assert.strictEqual(config,before,'Pointer down must not jump or mutate');
$('timeBell').handlers.pointermove({...event(grabX,10),pointerId:2});assert.strictEqual(config,before,'Ignore another pointer');
$('timeBell').handlers.pointermove(event(grabX,50));assert(config.profile?.length===129);assert(at(config,.14)>at(before,.14)*2,'Dragged shoulder increases locally');
assert(Math.abs(at(config,-.3)-at(before,-.3))<.001,'Other side remains unchanged');
assert(Math.abs(at(config,0)-at(before,0))<1e-10,'Dragging a shoulder does not move the peak');
$('timeBell').handlers.pointermove(event(grabX,80));assert.deepEqual(config,before,'Reverse gesture restores exact original');
$('timeBell').handlers.pointermove(event(grabX,50));const sculpted=config;
$('timeBell').handlers.pointercancel(event(grabX,50));assert(!control.isDragging()&&!busy&&!$('timeBell').captured);
$('timeBellUndo').onclick();assert.deepEqual(config,before,'Undo restores previous complete shape');
$('timeBellLine').handlers.pointerdown(event(grabX,80));$('timeBell').handlers.pointermove(event(grabX,50));$('timeBell').handlers.lostpointercapture(event(grabX,50));assert(!control.isDragging());
$('timeBellReset').onclick();assert.equal(config.peak,2);assert.equal(config.width,.12);assert(!config.profile);
$('timeBellUndo').onclick();assert.deepEqual(config,sculpted,'Reset is reversible');
config=T.timeSettings({...config,date:'2026-04-02'});$('timeBellReset').onclick();$('timeBellUndo').onclick();assert.equal(config.date,'2026-04-02','Undo must not change focus date');
$('timeBellHandle').handlers.keydown({...event(0,0),key:'ArrowRight'});const preKey=config;
$('timeBellHandle').handlers.keydown({...event(0,0),key:'ArrowUp'});assert.notDeepEqual(config.profile,preKey.profile,'Keyboard sculpts chosen date');
config.enabled=false;const prev=changes;$('timeBellLine').handlers.pointerdown(event(grabX,80));$('timeBell').handlers.pointermove(event(grabX,10));assert.equal(changes,prev);
// Shapes are bounded, serializable and follow the focus date. Invalid local storage falls back.
const custom=T.timeSettings({date:'2026-04-01',profile:lens.sculpt(before,dates,0,20)});
assert.equal(T.timeScale(row,custom,dates),12);assert.equal(lens.compensation(custom),1);
assert.equal(T.timeScale({published_at:'2026-04-02'},{...custom,date:'2026-04-02'},dates),12);
assert.deepEqual(T.timeSettings(JSON.parse(JSON.stringify(custom))),custom);
for(const profile of [[],Array(128).fill(2),Array(129).fill(NaN),Array(129).fill(13),Array(129).fill(true)])assert(!T.timeSettings({profile}).profile);
assert(lens.sculpt(before,dates,0,-100).every(v=>v>=1&&v<=12));
assert.equal(T.timeScale({published_at:null},custom,dates),1);
assert.equal(T.timeScale(row,{...custom,enabled:false},dates),1);
// Per-frame scaling shares the graph camera and never calls graphData with new data.
config=T.timeSettings({date:'2026-04-01',peak:8});let renders=0,writes=0,scale=1;
const node={...row,x:0,y:0,z:-800,__threeObj:{scale:{setScalar(v){scale=v}}}};
const camera={matrixWorldInverse:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]},updateMatrixWorld(){}};
const renderer={render(){renders++}},scene={};const graph={renderer:()=>renderer,camera:()=>camera,scene:()=>scene,controls:()=>({target:{x:0,y:0,z:-400}}),graphData:(...args)=>{if(args.length)writes++;return {nodes:[node]}}};
const original=renderer.render,attached=lens.attach(graph,()=>({config,dates}));renderer.render(scene,camera);assert.equal(scale,16);
node.z=-1200;renderer.render(scene,camera);assert.equal(scale,24,'Recompute depth compensation as a node moves');assert.equal(writes,0);assert.equal(renders,2);
config.enabled=false;attached.refresh();assert.equal(scale,1);attached.dispose();assert.strictEqual(renderer.render,original);
console.log('PASS: local sculpting/undo/profile persistence, depth-compensated projected size, direct drag/reversal/cancellation/keyboard, no graph writes and renderer cleanup');
