const assert=require('node:assert/strict');
global.AtlasView=require('../dist/graph-view.js');global.AtlasGlow=require('../dist/glow.js');
const timeline=require('../dist/timeline.js');
const bounds=timeline.range([],{start:'2025-10-29',end:'2026-10-28'});
const focus={enabled:true,date:'2026-04-01'},article=date=>({published_at:date});
assert.equal(timeline.timeScale(article('2026-04-01T23:59:00Z'),focus,bounds),2);
assert(timeline.timeScale(article('2026-04-02'),focus,bounds)>timeline.timeScale(article('2026-07-02'),focus,bounds));
assert.equal(timeline.timeScale(article(null),focus,bounds),1);
assert.equal(timeline.timeScale(article('2026-04-01'),{...focus,enabled:false},bounds),1);
assert.equal(timeline.timeTicks(bounds).length,12);
assert.equal(timeline.timeTicks(bounds)[0].label,'2025-11');
assert.equal(timeline.timeTicks(bounds).at(-1).label,'2026-10');
assert.equal(timeline.timeTicks(timeline.range([],{start:'2026-01-01',end:'2026-01-01'})).length,0);
assert(timeline.timeTicks(bounds).every(t=>t.position>0&&t.position<100));
const defs=[{id:'a',name:'A'},{id:'b',name:'B'}],rows=['r','child','deep','other'].map((id,i)=>({id,title:id,published_at:`2026-04-0${i+1}`,source:{provider:'google'},primary_channel:i?'b':'a',channels:[{id:i?'b':'a'}]}));
const relations=[{id:'rc',source:'r',target:'child',weight:.9},{id:'cd',source:'child',target:'deep',weight:.9}];
const view={articles:rows,relations},roots=['r'],trace=AtlasView.traceMany(relations,roots,{depth:3});
const filtered=timeline.filter(view,'b');
const opts={getRoots:()=>roots,getTrace:()=>trace,glow:AtlasGlow.settings()};
assert.strictEqual(timeline.selectionTrace(filtered,opts,['other']),trace,'Hover cannot replace confirmed global forest');
assert.deepEqual(timeline.selectionSummary(filtered.articles,trace),{matched:2,total:3,roots:0,depth:1});
class Element{
 constructor(){this.children=[];this.attrs={};this.style={};this.handlers={};}
 setAttribute(k,v){this.attrs[k]=String(v)} append(...items){this.children.push(...items)} replaceChildren(...items){this.children=items} addEventListener(k,f){this.handlers[k]=f}
}
const doc={createElement:()=>new Element(),createElementNS:()=>new Element()},container=new Element();container.ownerDocument=doc;
const all=e=>[e,...e.children.flatMap(all)];
for(const render of [timeline.renderDensity,timeline.render]){
 render(container,filtered,defs,opts);
 const nodes=all(container).filter(e=>e.attrs['data-focus-depth']!==undefined);
 assert(nodes.some(e=>e.attrs['data-focus-depth']==='1'));
 assert(nodes.some(e=>e.attrs['data-focus-depth']==='2'));
 assert(nodes.some(e=>e.attrs['data-focus-depth']===''));
 const shallow=nodes.find(e=>e.attrs['data-focus-depth']==='1'),deep=nodes.find(e=>e.attrs['data-focus-depth']==='2');
 assert(Number(shallow.attrs.opacity)>Number(deep.attrs.opacity),'Depth drives dimming in both timeline modes');
 const outside=nodes.find(e=>e.attrs['data-focus-depth']==='');outside.handlers.pointerenter({});
 assert.equal(shallow.attrs['data-focus-depth'],'1','Hover keeps selected forest');
 assert(Number(outside.attrs.opacity)<Number(deep.attrs.opacity));
}
const forest=AtlasView.traceMany(relations,['r','deep'],{depth:3});
assert.equal(timeline.selectionSummary(rows,forest).roots,2,'Multiple roots remain distinguishable');
console.log('PASS: date lens bounds, UTC proximity, calendar ticks, missing dates, shared roots across filtered timeline and density depth gradients');
