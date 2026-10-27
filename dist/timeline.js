/* UTC timeline layout and accessible SVG renderer. Edges are existing relations, not inferred causality. */
(function(root){
  const DAY=86400000;
  function day(value){const t=Date.parse(value || '');return Number.isFinite(t)?Math.floor(t/DAY)*DAY:null;}
  function range(rows,options={}){
    const times=rows.map(a=>day(a.published_at)).filter(t=>t!==null);
    let start=day(options.start),end=day(options.end);
    if(start===null)start=times.length?Math.min(...times):day(new Date().toISOString());
    if(end===null)end=times.length?Math.max(...times):start;
    end=Math.max(start,end);
    return {start,end,days:Math.round((end-start)/DAY),startDate:new Date(start).toISOString().slice(0,10),endDate:new Date(end).toISOString().slice(0,10)};
  }
  function filter(view,channel='all',cutoff=null){
    const end=day(cutoff);
    const articles=view.articles.filter(a=>(channel==='all'||(a.channels||[]).some(c=>c.id===channel))&&(end===null||day(a.published_at)===null||day(a.published_at)<=end));
    const ids=new Set(articles.map(a=>a.id));
    return {...view,articles,relations:view.relations.filter(e=>ids.has(e.source)&&ids.has(e.target))};
  }
  function layout(view,definitions,options={}){
    const dates=range(view.articles,options),width=Math.max(800,options.width||1000),left=210,right=40;
    const scale=(width-left-right)/Math.max(DAY,dates.end+DAY-dates.start);
    const definitionsById=new Map(definitions.map(c=>[c.id,c]));
    const visibleDefs=options.channel&&options.channel!=='all'?definitions.filter(c=>c.id===options.channel):definitions;
    const lanes=visibleDefs.map(c=>({...c,rows:[],tracks:[]}));
    const laneById=new Map(lanes.map(l=>[l.id,l]));
    if(!laneById.has('other')&&(!options.channel||options.channel==='all'||!lanes.length)){const other={id:'other',name:'其他／未分類',color:'#98a9ba',rows:[],tracks:[]};lanes.push(other);laneById.set(other.id,other);}
    const nodes=[];
    for(const a of [...view.articles].sort((a,b)=>(a.published_at||'').localeCompare(b.published_at||'')||a.id.localeCompare(b.id))){
      const primary=options.channel&&options.channel!=='all'?options.channel:a.primary_channel;
      const lane=laneById.get(primary)||laneById.get('other');
      const time=Date.parse(a.published_at||'');
      const x=Number.isFinite(time)?left+(Math.min(dates.end+DAY,Math.max(dates.start,time))-dates.start)*scale:185;
      let track=lane.tracks.findIndex(last=>x-last>=18);
      if(track===-1){track=lane.tracks.length;lane.tracks.push(x);}else lane.tracks[track]=x;
      const node={article:a,id:a.id,x,track,lane:lane.id};lane.rows.push(node);nodes.push(node);
    }
    let y=48;
    for(const lane of lanes){lane.top=y;lane.height=Math.max(110,lane.tracks.length*22+42);for(const n of lane.rows)n.y=y+34+n.track*22;y+=lane.height;}
    const ticks=[];const step=Math.max(1,Math.ceil((dates.days+1)/7));
    for(let d=0;d<=dates.days;d+=step){const time=dates.start+d*DAY;ticks.push({x:left+(time-dates.start)*scale,label:new Date(time).toISOString().slice(0,10)});}
    const byId=new Map(nodes.map(n=>[n.id,n]));
    const edges=view.relations.filter(e=>byId.has(e.source)&&byId.has(e.target)).map(e=>({...e,a:byId.get(e.source),b:byId.get(e.target)}));
    return {width,height:y+20,nodes,edges,lanes,ticks,dates};
  }
  function render(container,view,definitions,options={}){
    const doc=container.ownerDocument||document,ns='http://www.w3.org/2000/svg';
    const svgEl=(name,attrs={})=>{const e=doc.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
    const model=layout(view,definitions,options),sheet=doc.createElement('div');sheet.className='timeline-sheet';sheet.style.width=model.width+'px';
    const ruler=doc.createElement('div');ruler.className='timeline-ruler';const rulerBody=doc.createElement('div');rulerBody.className='timeline-ruler-body';rulerBody.style.width=model.width+'px';
    for(const tick of model.ticks){const label=doc.createElement('span');label.textContent=tick.label;label.style.left=tick.x+'px';rulerBody.append(label);}ruler.append(rulerBody);
    const labels=doc.createElement('div');labels.className='timeline-labels';
    for(const lane of model.lanes){const label=doc.createElement('div');label.className='timeline-lane-label';label.style.top=lane.top+'px';label.style.height=lane.height+'px';label.style.borderLeftColor=lane.color;const name=doc.createElement('strong');name.textContent=lane.name;const count=doc.createElement('small');count.textContent=lane.rows.length+' 篇';label.append(name,count);labels.append(label);}
    const svg=svgEl('svg',{width:model.width,height:model.height,role:'group','aria-label':'新聞發布日期與分類泳道'});
    for(const lane of model.lanes)svg.append(svgEl('rect',{x:170,y:lane.top,width:model.width-170,height:lane.height,fill:model.lanes.indexOf(lane)%2?'#0d1928':'#101f30',stroke:'#263a4d','stroke-width':.5}));
    for(const tick of model.ticks)svg.append(svgEl('line',{x1:tick.x,x2:tick.x,y1:48,y2:model.height,stroke:'#395169','stroke-opacity':.35}));
    const paths=[], nodeElements=[];
    for(const edge of model.edges){const {a,b}=edge;const bend=Math.max(20,Math.min(90,Math.abs(a.x-b.x)*.16));const path=svgEl('path',{d:`M ${a.x} ${a.y} C ${a.x} ${a.y-bend}, ${b.x} ${b.y-bend}, ${b.x} ${b.y}`,fill:'none',stroke:edge.scope==='cross'?'#f4cd84':'#79bcb3','stroke-width':1,'stroke-opacity':.28,'pointer-events':'none'});if(edge.scope==='cross')path.setAttribute('stroke-dasharray','5 4');svg.append(path);paths.push({edge,path});}
    function highlight(id){const related=new Set([id]);for(const {edge,path} of paths){const near=id===edge.source||id===edge.target;if(near){related.add(edge.source);related.add(edge.target);}path.setAttribute('stroke-opacity',id?(near?.95:.045):.28);path.setAttribute('stroke-width',near?2:1);}for(const {node,group} of nodeElements)group.setAttribute('opacity',id&&!related.has(node.id)?.3:1);}
    for(const node of model.nodes){const group=svgEl('g',{tabindex:0,role:'button','aria-label':`${node.article.title}，${node.article.published_at||'日期未知'}`,'data-node-id':node.id});group.style.cursor='pointer';group.append(svgEl('circle',{cx:node.x,cy:node.y,r:11,fill:'transparent'}),svgEl('circle',{cx:node.x,cy:node.y,r:5.5,fill:options.colors?.[node.article.display_provider||node.article.source.provider]||'#c9d8e5',stroke:'#d7e9f4','stroke-width':.7}));const title=svgEl('title');title.textContent=node.article.title;group.append(title);
      const show=e=>{highlight(node.id);options.onHover?.(node.article,e);};const hide=()=>{highlight(null);options.onHover?.(null);};
      group.addEventListener('pointerenter',show);group.addEventListener('pointerleave',hide);group.addEventListener('focus',show);group.addEventListener('blur',hide);group.addEventListener('click',()=>options.onSelect?.(node.article));group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();options.onSelect?.(node.article);}});svg.append(group);nodeElements.push({node,group});}
    sheet.append(ruler,labels,svg);container.replaceChildren(sheet);return model;
  }
  const api={range,filter,layout,render,day};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.AtlasTimeline=api;
})(globalThis);
