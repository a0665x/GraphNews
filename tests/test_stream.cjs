const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
class Element {
  constructor() { this.value=''; this.children=[]; this.handlers={}; this.style={}; this.className=''; this.disabled=false; this.classList={add(){},remove(){},toggle(){}}; }
  setAttribute(name,value){this[name]=value}
  append(...e){this.children.push(...e)} replaceChildren(...e){this.children=e}
  addEventListener(name,cb){this.handlers[name]=cb} getBoundingClientRect(){return {width:900,height:600,left:0,top:0}} click(){}
}
const elements = new Map();
const get = id => {if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
get('query').value='TSLA';get('ticker').value='TSLA';get('start').value='2026-01-01';get('end').value='2026-01-07';
let data={nodes:[],links:[]};const graph=new Proxy(function(){},{get(t,k){if(k==='graphData')return x=>{if(x){data=x;return graph}return data};if(k==='d3Force')return ()=>({strength(){return this},distance(){return this}});return ()=>graph},apply(){return graph}});
const article={id:'one',title:'Tesla launches product',source:{provider:'massive',publisher:'Publisher'},symbols:['TSLA'],url:'https://example.com/a',published_at:'2026-01-01T00:00:00Z',summary:''};
let finish;const wait=new Promise(resolve=>finish=resolve);let reads=0;
const document={getElementById:get,createElement:()=>new Element(),createElementNS:()=>new Element(),querySelectorAll:()=>[{value:'massive'},{value:'google'}],body:new Element()};
const context={document,ForceGraph3D:()=>()=>graph,ResizeObserver:class{observe(){}},console,Date,URL,Blob,TextDecoder,TextEncoder,Uint8Array,AbortController,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},fetch:async()=>({ok:true,body:{getReader:()=>({read:async()=>{reads++;if(reads===1)return {value:new TextEncoder().encode(JSON.stringify({type:'source',source:'massive',completed:1,total:2,articles:[article],error:null})+'\n'),done:false};await wait;return {value:new TextEncoder().encode(JSON.stringify({type:'done'})+'\n'),done:reads>2}},cancel(){}})}})};
vm.createContext(context);vm.runInContext(fs.readFileSync('dist/graph-view.js','utf8'),context);vm.runInContext(fs.readFileSync('dist/timeline.js','utf8'),context);vm.runInContext(fs.readFileSync('dist/app.js','utf8'),context);
(async()=>{
  get('start').value='2026-01-01';get('end').value='2026-01-07';
  const pending=get('form').handlers.submit({preventDefault(){}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(data.nodes.length,1,'Massive results must render before the slower Google source finishes');
  finish();await pending;
  assert.equal(get('saveDB').disabled,false,'Completed results can be saved');
  assert.equal(get('progress').value,1);
  assert.equal(get('composition').children.length,1,'Source composition bar contains newly fetched data');
  data.nodes[0].x=57;data.nodes[0].y=18;data.nodes[0].z=-5;
  get('view-massive').checked=false;get('view-massive').handlers.change();
  assert.equal(data.nodes.length,0,'Unchecking source immediately removes its nodes');
  assert.equal(get('saveDB').disabled,true,'Empty graph cannot be saved');
  get('view-massive').checked=true;get('view-massive').handlers.change();
  assert.equal(data.nodes.length,1);
  assert.equal(data.nodes[0].id,'one','Default is mixed source graph');
  assert.equal(data.nodes[0].x,57,'Source toggle retains prior coordinates');
  get('separateSources').checked=true;get('separateSources').handlers.change();
  assert.equal(data.nodes[0].id,'massive::one');
  get('separateSources').checked=false;get('separateSources').handlers.change();
  assert.equal(data.nodes[0].id,'one','Merged view restores canonical IDs');
  get('modeTimeline').onclick();
  assert.equal(get('timeline').hidden,false);assert.equal(get('graph').hidden,true);
  assert.equal(get('timeline').children.length,1,'Timeline SVG sheet rendered');
  get('timelineCutoff').value=0;get('timelineCutoff').oninput();
  assert.equal(get('cutoffLabel').textContent,'2026-01-01 UTC');
  get('modeNetwork').onclick();
  assert.equal(get('graph').hidden,false);assert.equal(data.nodes[0].x,57,'Timeline switching preserves network coordinates');
  let savedBody;
  context.fetch=async(url,options)=>{
    if(options?.method==='POST'){savedBody=JSON.parse(options.body);return {ok:true,json:async()=>({id:'saved',name:'TSLA',db:{articles:1,snapshots:1}})}}
    return {ok:true,json:async()=>({snapshots:[]})};
  };
  await get('saveDB').onclick();
  assert.equal(savedBody.source_graphs.massive.articles.length,1);
  assert.equal(savedBody.view.separate,false);
  assert.equal(savedBody.source_graphs.massive.articles[0].id,'one');
  assert(!('massive_key' in savedBody.search));
  assert(get('saveStatus').textContent.startsWith('已儲存'));
  console.log('PASS: live stream, source toggles, progress composition, grouping, timeline mode, position continuity and save payload');
})().catch(e=>{finish();console.error(e);process.exitCode=1});
