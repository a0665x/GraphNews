const assert=require('node:assert/strict');const ui=require('../dist/interaction.js');
assert(ui.adaptiveRadius(24,65)>ui.adaptiveRadius(6,65),'Zoomed node needs proportionally larger capture radius');
assert(ui.adaptiveRadius(8,100)>ui.adaptiveRadius(8,20),'Strength changes effective capture radius');
let emitted=[];const focus=ui.stableFocus(id=>emitted.push(id));focus.offer('root');focus.offer(null);assert.equal(focus.get(),'root','Leaving node must retain the galaxy until explicit clear or idle timeout');focus.dispose();
let task=null,cleared=0,held=false;const idle=ui.idleFocus(()=>cleared++,{isBusy:()=>held,schedule:(fn,delay)=>{assert(delay>=5000);task=fn;return 1},cancel:()=>{task=null}});
idle.touch();held=true;task();assert.equal(cleared,0,'A held mouse drag must never time out');held=false;task();assert.equal(cleared,1);idle.dispose();
console.log('PASS: adaptive strength, retained root and idle protection during held drag');

const node={id:'a',x:0,y:0,z:0};let zoom=1;const handlers={};let captured=false;const controls={enabled:true,addEventListener(k,fn){this[k]=fn},removeEventListener(){}};
function vector(){return {set(x,y,z){Object.assign(this,{x,y,z});return this},project(){this.x*=zoom;this.y*=zoom;return this},unproject(){this.x/=zoom;this.y/=zoom;return this}};}
const graph={camera:()=>({position:{clone:vector}}),nodeRelSize:()=>.04,graphData:()=>({nodes:[node]}),controls:()=>controls,d3ReheatSimulation(){}};
const surface={setPointerCapture(){captured=true},hasPointerCapture:()=>captured,releasePointerCapture(){captured=false},getBoundingClientRect:()=>({width:100,height:100,left:0,top:0}),addEventListener:(k,fn)=>handlers[k]=fn,removeEventListener(){}};
let strength=10,root=null,clears=0;const ctl=ui.attach(surface,{getGraph:()=>graph,strength:()=>strength,onHover:n=>{if(n)root=n.id},onSelect(){},onBackground:()=>{root=null;clears++}});
const weak=ctl.guide('a').radius;strength=90;assert(ctl.guide('a').radius>weak);const normal=ctl.guide('a').radius;zoom=2;assert(ctl.guide('a').radius>normal,'Real projection scales capture area');zoom=1;
const baseRadius=ctl.guide('a').radius;graph.nodeVal=()=>()=>24;assert(ctl.guide('a').radius>baseRadius,'Time-sized geometry expands the live capture area');delete graph.nodeVal;node.__threeObj={scale:{x:2}};assert(ctl.guide('a').radius>baseRadius,'Capture follows rendered mesh scale, including perspective compensation');delete node.__threeObj;
const event=(x,y)=>({clientX:x,clientY:y,button:0,buttons:0,pointerId:1,isPrimary:true,preventDefault(){},stopImmediatePropagation(){}});
handlers.pointerdown(event(50,50));assert.equal(root,'a');handlers.pointermove(event(65,50));assert.equal(root,'a');handlers.pointerup(event(65,50));handlers.pointerleave();assert.equal(root,'a','Release and leave retain galaxy');handlers.pointerdown(event(1,1));handlers.pointerup(event(1,1));assert.equal(root,null);assert.equal(clears,1);ctl.dispose();
console.log('PASS: live strength and projection, root press/drag/release retention, explicit empty click');
