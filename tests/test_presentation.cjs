const assert=require('node:assert/strict');const glow=require('../dist/glow.js'),ui=require('../dist/interaction.js');
class Color{constructor(v){this.v=v}clone(){return new Color(this.v)}set(v){this.v=+v;return this}lerp(other,t){this.v+=(other.v-this.v)*t;return this}}
const material=()=>({color:new Color(.18),opacity:.05,clone(){const m=material();m.color=this.color.clone();m.opacity=this.opacity;return m},dispose(){}});
const shared=material(),meshA={material:shared},meshB={material:shared},line={material:material()};const data={nodes:[{id:'a',__threeObj:meshA},{id:'b',__threeObj:meshB}],links:[{__lineObj:line}]};const style=glow.appearance(),graph={graphData:()=>data};
style.step(graph,n=>n.id==='a'?'1':'.18',()=>({color:'1',opacity:.4}),16,false,false);
assert.notEqual(meshA.material,meshB.material,'Shared materials must be isolated before fading');assert.equal(shared.color.v,.18);
assert(meshA.material.color.v>.18&&meshA.material.color.v<.3,'Background must brighten gradually on first return frame');assert(line.material.opacity>.05&&line.material.opacity<.4);
for(let i=0;i<100;i++)style.step(graph,()=> '1',()=>({color:'1',opacity:.4}),16,false,false);
assert(meshA.material.color.v>.99&&meshB.material.color.v>.99,'Global brightness settles');
assert(glow.ease(1,0,16,false,260)>glow.ease(1,0,16,false,85),'Overview glow exit is slower than root switching');
class Vector{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z})}clone(){return new Vector(this.x,this.y,this.z)}set(x,y,z){Object.assign(this,{x,y,z});return this}project(c){this.x-=c.position.x;this.y-=c.position.y;this.z=0;return this}unproject(c){this.x+=c.position.x;this.y+=c.position.y;return this}}
const camera={position:new Vector(0,0,5),updateMatrixWorld(){}},controls={enabled:true,target:new Vector()},node={id:'root',x:0,y:0,z:0};
const g={camera:()=>camera,controls:()=>controls,nodeRelSize:()=>.04,graphData:()=>({nodes:[node]}),d3ReheatSimulation(){throw Error('Pan must not reheat physics')}};
const handlers={},surface={getBoundingClientRect:()=>({left:0,top:0,width:100,height:100}),setPointerCapture(){},hasPointerCapture:()=>false,addEventListener:(k,fn)=>handlers[k]=fn,removeEventListener(){}};let root=null,selected=0,cleared=0;
const ctl=ui.attach(surface,{getGraph:()=>g,onHover:n=>{root=n?.id||null},onSelect:()=>selected++,onBackground:()=>cleared++});
const event=(x,y,ctrl=false)=>({clientX:x,clientY:y,ctrlKey:ctrl,pointerId:1,button:0,buttons:0,preventDefault(){},stopImmediatePropagation(){}});
handlers.pointermove(event(50,50));assert.equal(root,'root');handlers.pointerdown(event(50,50,true));assert(ctl.isDragging());handlers.pointermove(event(70,60,true));
assert(camera.position.x<0);assert.equal(camera.position.x,controls.target.x);assert.equal(camera.position.y,controls.target.y);assert.equal(node.x,0);assert.equal(root,'root');
handlers.pointerup(event(70,60,true));assert(controls.enabled);assert.equal(root,'root');assert.equal(selected,0);assert.equal(cleared,0);ctl.dispose();
console.log('PASS: gradual global recovery, shared-material isolation, Ctrl-pan camera/target only and preserved root');
