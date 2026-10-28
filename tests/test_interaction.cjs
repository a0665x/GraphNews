const assert=require('node:assert/strict');const interaction=require('../dist/interaction.js');
const points=[{id:'a',x:50,y:50,z:.2},{id:'b',x:70,y:50,z:.3}];
assert.equal(interaction.nearest(points,{x:60,y:50}).id,'a');
assert.equal(interaction.nearest(points,{x:61,y:50},'a').id,'a','Boundary jitter retains previous node');
assert.equal(interaction.nearest(points,{x:69,y:50},'a').id,'b','Decisively closer node wins');
assert.equal(interaction.nearest(points,{x:20,y:50},'a').id,'a','Exit radius wider than entry');
assert.equal(interaction.nearest(points,{x:0,y:50},'a'),null);
let jobs=new Map(),next=0,changes=[];const focus=interaction.stableFocus(id=>changes.push(id),{schedule:f=>{jobs.set(++next,f);return next},cancel:id=>jobs.delete(id)});
focus.offer('a');focus.offer(null);focus.offer('a');assert.equal(jobs.size,0);assert.deepEqual(changes,['a'],'Transient misses must not flash off');
focus.offer('b');assert.equal(focus.get(),'a');[...jobs.values()][0]();assert.equal(focus.get(),'b');
focus.lock('a');focus.offer('b');assert.equal(focus.get(),'a','Drag freezes focus');focus.unlock();focus.clear();
const node={id:'node',x:0,y:0,z:0},controls={enabled:true};let heat=0,selected=0,dragged=0;
function vector(){return {x:0,y:0,z:0,set(x,y,z){Object.assign(this,{x,y,z});return this},project(){return this},unproject(){return this}};}
const graph={camera:()=>({position:{clone:vector}}),graphData:()=>({nodes:[node]}),nodeRelSize:()=>.04,controls:()=>controls,d3ReheatSimulation:()=>heat++};
const handlers={};const element={getBoundingClientRect:()=>({left:0,top:0,width:100,height:100}),setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){},addEventListener:(k,f)=>handlers[k]=f,removeEventListener(){}};
const ctl=interaction.attach(element,{getGraph:()=>graph,onHover(){},onSelect:()=>selected++,onDragEnd:()=>dragged++});
const event=(x,y)=>({clientX:x,clientY:y,pointerId:1,button:0,buttons:0,isPrimary:true,preventDefault(){},stopImmediatePropagation(){}});
handlers.pointerdown(event(62,50));assert(!controls.enabled,'Near-node drag must not orbit camera');handlers.pointermove(event(82,50));assert(Math.abs(node.x-.4)<1e-9,'Drag from halo keeps initial offset and moves force node');assert.equal(node.fx,node.x);handlers.pointerup(event(82,50));assert(controls.enabled);assert.equal(node.fx,undefined);assert.equal(dragged,1);assert.equal(selected,0);assert(heat>0);
handlers.pointerdown(event(70,50));handlers.pointerup(event(70,50));assert.equal(selected,1,'Near-node tap selects article');
handlers.pointerdown(event(70,50));handlers.pointercancel(event(70,50));assert(controls.enabled);assert.equal(selected,1,'Cancelled gesture does not select');
ctl.dispose();
console.log('PASS: proximity, hysteresis, retained focus, drag lock, offset-preserving drag, release, tap and cancellation');

let previewJob=null,previewChanges=[];const preview=interaction.stableFocus(id=>previewChanges.push(id),{retainOnLeave:false,schedule:fn=>{previewJob=fn;return 1},cancel:()=>{previewJob=null}});preview.offer('a');preview.offer(null);assert.equal(preview.get(),'a','Short exit is debounced');previewJob();assert.equal(preview.get(),null,'Candidate disappears after leaving');preview.offer('b');preview.lock('b');preview.offer(null);assert.equal(preview.get(),'b','Drag keeps candidate');preview.unlock();preview.clear();assert.deepEqual(previewChanges,['a',null,'b',null]);
