'use strict';
const $ = id => document.getElementById(id);
const colors = { google: '#72dfbd', yahoo: '#c59cfc', massive: '#80b4ff' };
const sourceNames = { google: 'Google', yahoo: 'Yahoo', massive: 'Massive' };
const relationNames = { shared_entity: '共同實體', shared_topic: '共同主題', similar_title: '相似標題' };
let articles = [], relations = [], hovered = null, selected = null, controller = null, exportMeta = {}, currentSearch = 0;
let graph = null, fitTimer = null, sourceArticles = new Map();
let basePayload = {articles:[],relations:[]}, currentView = {articles:[],relations:[]}, sourceStates = {}, saving = false, restoredPositions = new Map();
const providers = ['google','yahoo','massive'];
const viewSources = () => providers.filter(p => $('view-'+p).checked !== false);
const isSeparate = () => $('separateSources').checked === true;
let viewMode='network', channelDefinitions=[], channelCatalog=[], channelFilter='all', timelineCutoff=null, timelineTimer=null, editingChannel=null;
let classifying=false, classificationEpoch=0, timelineBounds=null, timelineFocusRequested=true;
const networkPositions=new Map(), internalLengths=new Map();
const edgeKey=l=>l.scope+':'+[(l.raw_relation||l).source,(l.raw_relation||l).target].sort().join(':');
let exploration=AtlasView.settings(AtlasUI.read('exploration',{})), activeTrace=AtlasView.trace([],null), candidateTrace=AtlasView.trace([],null);
let glowConfig=AtlasGlow.settings(AtlasUI.read('glow',{})), glowLayer=null, pinnedRoot=null, interaction=null, idleFocus=null, stickyGuideUntil=0;
let lockedRoots=[], keywordLocked=false, rootSearchState=null, rootSearchTicket=0, rootSearchBusy=false;
let focusView={articles:[],relations:[]};
let timeFocus=AtlasTimeline.timeSettings(AtlasUI.read('timeFocus',{}));
const focusRoot=()=>lockedRoots[0]??null;
let timelineStyle=AtlasUI.read('timelineStyle','density');
const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function el(tag, text, cls) { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
function date(value) { if (!value) return '日期未知'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '日期未知' : d.toLocaleString(AtlasI18n.language()==='en'?'en-US':'zh-TW'); }
try {
  graph = ForceGraph3D()($('graph')).backgroundColor('#090f1b').nodeId('id')
    .nodeColor(nodeColor).nodeVal(nodeValue).nodeOpacity(.95)
    .linkColor(linkColor).linkWidth(.6).linkOpacity(1)
    .onNodeHover(n => {if(interaction&&interaction.supported!==false)return;setHovered(n);})
    .onNodeClick(n => showArticle(n)).onBackgroundClick(()=>{if(!interaction)clearFocus();}).onNodeDragEnd(n => { n.fx = undefined; n.fy = undefined; n.fz = undefined; rememberNetwork(); graph.d3ReheatSimulation(); });
  graph.d3Force('charge').strength(-45); graph.d3Force('link').distance(l => AtlasView.linkStyle(l,internalLengths.get(edgeKey(l))).distance).strength(l=>AtlasView.linkStyle(l).strength); graph.cooldownTime(reducedMotion ? 800 : 8000);
  graph.d3Force('source-cluster', alpha => {
    if (!isSeparate()) return;
    const active = viewSources();
    for (const n of graph.graphData().nodes) { const center = (active.indexOf(n.display_provider) - (active.length - 1) / 2) * 240; n.vx = (n.vx || 0) + (center - (n.x || 0)) * .035 * alpha; n.vy = (n.vy || 0) - (n.y || 0) * .012 * alpha; n.vz = (n.vz || 0) - (n.z || 0) * .012 * alpha; }
  });
  graph.d3Force('preserve-position', alpha=>{if(isSeparate())return;for(const n of graph.graphData().nodes){if(!n.anchor)continue;for(const k of ['x','y','z'])n['v'+k]=(n['v'+k]||0)+(n.anchor[k]-(n[k]||0))*.012*alpha;}});
  new ResizeObserver(() => { const r = $('stage').getBoundingClientRect(); graph.width(r.width).height(r.height); if(viewMode==='timeline')renderTimeline(); }).observe($('stage'));
} catch (error) { graph = null; $('empty').textContent = '此瀏覽器無法啟動 3D 圖譜，仍可搜尋並使用右側新聞清單。'; }
function nodeValue(n){return 3*Math.pow(AtlasTimeline.timeScale(n,timeFocus,timelineBounds),3);}
function nodeColor(n){const base=colors[n.display_provider||n.source.provider]||'#b9d8df';if(focusRoot()===null)return base;const hit=activeTrace.nodes.get(n.id);if(!hit)return AtlasGlow.tint(base,glowConfig.background);return AtlasGlow.tint(base,Math.max(.12,Math.pow(glowConfig.decay,hit.depth)));}
function edgeLight(l){const id=typeof l.target==='object'?l.target.id:l.target,other=typeof l.source==='object'?l.source.id:l.source;return Math.pow(glowConfig.decay,Math.max(activeTrace.nodes.get(id)?.depth||0,activeTrace.nodes.get(other)?.depth||0));}
function linkColor(l){if(focusRoot()===null)return l.scope==='cross'?'rgba(244,205,132,.45)':'rgba(130,200,210,.4)';return activeTrace.edges.has(AtlasView.identity(l))?`rgba(140,255,220,${Math.max(.05,edgeLight(l))})`:`rgba(120,155,180,${glowConfig.background*.25})`;}
function edgeStyle(l){if(focusRoot()===null)return {color:l.scope==='cross'?'#f4cd84':'#82c8d2',opacity:l.scope==='cross'?.45:.4};return activeTrace.edges.has(AtlasView.identity(l))?{color:'#8cffdc',opacity:Math.max(.05,edgeLight(l))}:{color:'#789bb4',opacity:glowConfig.background*.25};}
function acquireRoot(n){if(!n||lockedRoots.length)return;lockedRoots=[n.id];pinnedRoot=n.id;keywordLocked=false;rootSearchState=null;$('rootResults').replaceChildren();refreshFocus();}
function setHovered(n){const id=n?.id||null;if(hovered!==id){hovered=id;refreshFocus();}touchFocus();showPreview(n);}
function clearFocus(){rootSearchTicket++;idleFocus?.stop();interaction?.clear();lockedRoots=[];keywordLocked=false;rootSearchState=null;pinnedRoot=null;hovered=null;$('rootResults').replaceChildren();refreshFocus();showPreview(null);if(viewMode==='timeline')renderTimeline();}
function touchFocus(){if(focusRoot()!==null&&!keywordLocked&&!rootSearchBusy)idleFocus?.touch();}
function refreshFocus(){pinnedRoot=focusRoot();activeTrace=AtlasView.traceMany(focusView.relations,lockedRoots,exploration);candidateTrace=AtlasView.traceMany(relations,!pinnedRoot&&hovered?[hovered]:[],exploration);showTrace(pinnedRoot,activeTrace);if(!pinnedRoot&&hovered)$('traceStatus').textContent=AtlasI18n.t('候選 tree 預覽 · 點一下確認 root')+' · '+candidateTrace.nodes.size;glowLayer?.refresh();}
function showTrace(id,trace){$('traceStatus').textContent=id?`延伸 ${trace.nodes.size-(trace.roots?.length||1)} 個節點 · 最多 ${exploration.depth} 層 · 每節點 ${exploration.branchLimit} 分支`+(trace.truncated?' · 已達顯示上限':''):'';}
function showPreview(n) { const box = $('preview'); box.replaceChildren(); box.hidden = !n; if (!n) return;if(!focusRoot())box.append(el('div',AtlasI18n.t('預覽中 · 點一下進入星系'),'meta')); box.append(el('div', (n.source.publisher || n.source.provider) + ' · ' + (n.display_sources || [n.source.provider]).map(p=>sourceNames[p]).join('／'), 'meta'), el('strong', n.title,'raw'), el('div', date(n.published_at), 'muted')); }
$('graph').addEventListener('pointermove', e => { const box = $('preview'), r = $('stage').getBoundingClientRect(); if (!box.hidden) { box.style.left = Math.max(8, Math.min(r.width - box.offsetWidth - 8, e.clientX - r.left + 18)) + 'px'; box.style.top = Math.max(8, Math.min(r.height - box.offsetHeight - 8, e.clientY - r.top + 18)) + 'px'; } });
function evidenceText(edge) {
  return (edge.evidence || []).map(e => e.entity ? `${e.entity}：${e.source.method === 'provider_ticker' ? AtlasI18n.t('來源標註') : AtlasI18n.t('文章文字')}「${e.source.evidence}」↔ ${e.target.method === 'provider_ticker' ? AtlasI18n.t('來源標註') : AtlasI18n.t('文章文字')}「${e.target.evidence}」` : `共同詞：${(e.title_terms || []).join('、')}；標題相似度 ${e.title_similarity}`).join('；');
}
function showArticle(n,pin=true) {
  selected = n.id;if(pin){acquireRoot(n);touchFocus();}
  const root = $('article'); root.replaceChildren(); const card = el('div', null, 'card');
  card.append(el('div', `${n.source.publisher || n.source.provider} · ${date(n.published_at)}`, 'meta raw'), el('h3', n.title,'raw'), el('p', n.summary || '來源未提供摘要。', n.summary?'muted raw':'muted'));
  for (const entity of n.entities || []) card.append(el('span', `${entity.id} · ${entity.method === 'provider_ticker' ? '來源標註' : '文字辨識'}`, 'tag'));
  const link = el('a', '閱讀原文 ↗'); link.href = n.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(el('p'), link);
  if (n.source.via) card.append(el('p', '取得途徑：' + n.source.via, 'muted'));
  root.append(card, el('h3', 'Channel 分類依據'));
  for(const c of n.channels||[]){const block=el('div',null,'channel-evidence');block.append(el('strong',c.name+(c.id===n.primary_channel?' · 主要分類':''),c.id.startsWith('custom-')?'raw':''),el('p',c.evidence.length?c.evidence.map(e=>`${e.field==='title'?AtlasI18n.t('標題'):AtlasI18n.t('摘要')}：${e.match}`).join('；'):'未命中目前分類規則',c.evidence.length?'raw':''));root.append(block);}
  root.append(el('h3', '與這篇新聞的關聯'));
  const related = relations.filter(r => r.source === n.id || r.target === n.id);
  for (const edge of related) {
    const target = articles.find(a => a.id === (edge.source === n.id ? edge.target : edge.source)); if (!target) continue;
    const item = el('div', null, 'card'), button = el('button', target.title,'raw');
    button.addEventListener('click', () => showArticle(target));
    item.append(el('div', `${edge.scope==='cross'?'跨來源 · ':''}${relationNames[edge.type] || edge.type} · 相隔 ${edge.days_apart ?? '—'} 天`, 'meta'), button, el('p', evidenceText(edge), 'muted raw'));
    root.append(item);
  }
  if (!related.length) root.append(el('p', '目前沒有足夠文字依據建立關聯，保留為獨立節點。', 'muted'));
  renderNodeJson(n);
  $('detail').classList.add('open');if(pin&&viewMode==='timeline')renderTimeline();
}
function rebuild(payload) {
  rootSearchTicket++;
  interaction?.clear();
  const previousCount = articles.length;
  if (payload) {basePayload = payload;classificationEpoch++;}
  if(basePayload.channel_definitions)channelDefinitions=basePayload.channel_definitions;
  renderChannelFilter();
  currentView = AtlasView.select(basePayload, viewSources(), isSeparate());
  currentView.relations=AtlasView.filterEdges(currentView.relations,exploration);
  focusView=currentView;
  syncTimelineRange(currentView.articles);
  syncTimeFocus();
  if(viewMode==='timeline') currentView=AtlasTimeline.filter(currentView,channelFilter,timelineCutoff);
  articles = currentView.articles; relations = currentView.relations;lockedRoots=lockedRoots.filter(id=>focusView.articles.some(a=>a.id===id));pinnedRoot=focusRoot();if(!lockedRoots.length)keywordLocked=false;if(rootSearchState)renderRootResults();
  exportMeta.total_articles = basePayload.total_articles ?? articles.length;
  hovered = null;activeTrace=AtlasView.trace([],null);showTrace(null,activeTrace); showPreview(null);
  $('count').textContent = articles.length; $('edges').textContent = relations.length;
  $('empty').hidden = articles.length > 0 && (viewMode==='timeline'||!!graph); $('export').disabled = !focusView.articles.length;
  $('saveDB').disabled = !focusView.articles.length || !!controller || saving;
  $('empty').textContent = viewSources().length ? '目前來源沒有可顯示新聞。' : '請勾選至少一個顯示來源。';
  const groups = AtlasView.groups(basePayload);
  for (const p of providers) $('view-count-'+p).textContent = groups[p]?.articles.length || 0;
  const total = viewSources().reduce((n,p)=>n+(groups[p]?.total_articles ?? groups[p]?.articles.length ?? 0),0);
  $('viewLimit').textContent = `顯示 ${articles.length} 節點 · 所選來源共 ${total} 筆 · 上限 800`;
  const list = $('list'); list.replaceChildren();
  for (const a of articles) { const b = el('button'); b.append(el('div', (a.display_sources || []).map(p=>sourceNames[p]).join('／') + ' · ' + date(a.published_at), 'meta'), el('div', a.title,'raw')); b.addEventListener('click', () => showArticle(a)); list.append(b); }
  if (selected) { const n = articles.find(a => a.id === selected); if (n) showArticle(n,false); else { selected = null; $('nodeJson').replaceChildren(); $('article').replaceChildren(el('p', '點擊新聞查看來源與關聯依據。', 'muted')); } }
  if (graph && viewMode==='network') {
    rememberNetwork();
    const old = new Map((graph.graphData()?.nodes || []).map(n => [n.id, n]));
    const nodes = articles.map(a => {
      const pos=restoredPositions.get(a.id)||networkPositions.get(a.id)||networkPositions.get(a.display_provider+'::'+a.article_id)||networkPositions.get(a.article_id);
      const n=Object.assign(old.get(a.id)||{},a,pos||{});
      if(pos)n.anchor={x:pos.x,y:pos.y,z:pos.z};
      return n;
    });
    restoredPositions.clear();
    graph.graphData({ nodes, links: relations.map(r => ({ ...r, from: r.source, to: r.target })) });
    if (articles.length && !old.size) { clearTimeout(fitTimer); fitTimer = setTimeout(() => graph.zoomToFit(reducedMotion ? 0 : 500, 65), 1000); }
  }
  refreshFocus();if(viewMode==='timeline')renderTimeline();
}
function rememberNetwork(distances=false){
  if(!graph)return;
  const data=graph.graphData();
  for(const n of data.nodes||[])if(['x','y','z'].every(k=>Number.isFinite(n[k])))networkPositions.set(n.id,{x:n.x,y:n.y,z:n.z});
  if(distances){const nodes=new Map(data.nodes.map(n=>[n.id,n]));for(const l of data.links||[]){if(l.scope==='cross')continue;const a=typeof l.source==='object'?l.source:nodes.get(l.source),b=typeof l.target==='object'?l.target:nodes.get(l.target);if(a&&b){const length=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);if(Number.isFinite(length)&&length>0)internalLengths.set(edgeKey(l),length);}}}
}
function renderChannelFilter(){
  const select=$('channelFilter');select.replaceChildren();const all=el('option','全部分類');all.value='all';select.append(all);
  for(const c of channelDefinitions){const option=el('option',c.name,c.id.startsWith('custom-')?'raw':'');option.value=c.id;select.append(option);}
  if(channelFilter!=='all'&&!channelDefinitions.some(c=>c.id===channelFilter))channelFilter='all';
  select.value=channelFilter;
}
function syncTimelineRange(rows){
  const range=AtlasTimeline.range(rows,{start:exportMeta.start,end:exportMeta.end});timelineBounds=range;
  const slider=$('timelineCutoff');slider.min=0;slider.max=range.days;
  if(!timelineCutoff||timelineCutoff<range.startDate||timelineCutoff>range.endDate)timelineCutoff=range.endDate;
  slider.value=Math.round((AtlasTimeline.day(timelineCutoff)-range.start)/86400000);slider.disabled=!rows.length;
  $('cutoffLabel').textContent=timelineCutoff+' UTC';$('timelinePlay').disabled=!rows.length;
}
function syncTimeFocus(){
  const bounds=timelineBounds||AtlasTimeline.range([],{start:$('start').value,end:$('end').value});
  const stamp=AtlasTimeline.day(timeFocus.date);
  timeFocus.date=new Date(stamp===null?bounds.end:Math.min(bounds.end,Math.max(bounds.start,stamp))).toISOString().slice(0,10);
  $('timeSizeEnabled').checked=timeFocus.enabled;
  const slider=$('timeFocusSlider');slider.min=0;slider.max=bounds.days;slider.value=Math.round((AtlasTimeline.day(timeFocus.date)-bounds.start)/86400000);
  slider.disabled=!timeFocus.enabled||!focusView.articles.length||!bounds.days;
  slider.setAttribute('aria-valuetext',timeFocus.date+' UTC');
  $('timeFocusDate').textContent=timeFocus.date+' UTC';
  $('timeFocusStart').textContent=bounds.startDate;$('timeFocusEnd').textContent=bounds.endDate;
  const ticks=$('timeFocusTicks');ticks.replaceChildren();
  for(const tick of AtlasTimeline.timeTicks(bounds)){const span=el('span',tick.label);span.style.left=tick.position+'%';ticks.append(span);}
  $('timeFocusBar').classList.toggle('disabled',!timeFocus.enabled);
  graph?.nodeVal(n=>nodeValue(n));
}
function updateTimeFocus(){
  timeFocus.enabled=$('timeSizeEnabled').checked;
  if(timelineBounds)timeFocus.date=new Date(timelineBounds.start+Number($('timeFocusSlider').value)*86400000).toISOString().slice(0,10);
  syncTimeFocus();AtlasUI.write('timeFocus',timeFocus);touchFocus();glowLayer?.refresh();
  if(viewMode==='timeline')renderTimeline();
}
function positionPreview(event){
  if(!event)return;const box=$('preview'),r=$('stage').getBoundingClientRect();const bounds=event.currentTarget?.getBoundingClientRect?.();
  const x=Number.isFinite(event.clientX)?event.clientX:bounds?.left||r.left+30,y=Number.isFinite(event.clientY)?event.clientY:bounds?.top||r.top+30;
  box.style.left=Math.max(8,Math.min(r.width-box.offsetWidth-8,x-r.left+16))+'px';box.style.top=Math.max(8,Math.min(r.height-box.offsetHeight-8,y-r.top+16))+'px';
}
function renderTimeline(){
  if(viewMode!=='timeline')return;
  showPreview(null);
  $('timeline').style.top=(($('graphTools').offsetHeight||220)+25)+'px';
  const width=Math.max(900,$('stage').getBoundingClientRect().width)*(Number($('timelineZoom').value)||1);
  const renderer=timelineStyle==='density'?AtlasTimeline.renderDensity:AtlasTimeline.render;
  const model=renderer($('timeline'),currentView,channelDefinitions,{width,start:timelineBounds?.startDate,end:timelineBounds?.endDate,channel:channelFilter,zoom:Number($('timelineZoom').value)||1,colors,exploration,glow:glowConfig,rootId:pinnedRoot,getRoots:()=>lockedRoots,getTrace:()=>activeTrace,nodeScale:n=>AtlasTimeline.timeScale(n,timeFocus,timelineBounds),getPreviewRoot:()=>hovered,onTrace:showTrace,onBucketSelect:showBucket,onBucketHover:previewBucket,onSelect:showArticle,onHover:(n,e)=>{setHovered(n);positionPreview(e);}});
  if(timelineFocusRequested&&model.nodes.length){const focused=model.nodes.filter(n=>(n.articles||[n.article]).some(a=>lockedRoots.includes(a.id)));const related=model.nodes.filter(n=>(n.articles||[n.article]).some(a=>activeTrace.nodes.has(a.id)));const candidates=focused.length?focused:related.length?related:model.nodes;const anchor=candidates.reduce((a,b)=>a.x<b.x?a:b);$('timeline').scrollLeft=Math.max(0,anchor.x-210);$('timeline').scrollTop=Math.max(0,anchor.y-Math.max(56,(($('timeline').clientHeight||156)+48)/2));timelineFocusRequested=false;}
}
function stopPlayback(){if(timelineTimer){clearInterval(timelineTimer);timelineTimer=null;}$('timelinePlay').textContent='播放';}
function applyMode(){
  const timeline=viewMode==='timeline';$('graph').hidden=timeline;$('glowCanvas').hidden=timeline;glowLayer?.refresh();$('timeline').hidden=!timeline;$('timelineControls').hidden=!timeline;
  $('modeNetwork').classList.toggle('active',!timeline);$('modeTimeline').classList.toggle('active',timeline);
  $('modeNetwork').setAttribute('aria-pressed',String(!timeline));$('modeTimeline').setAttribute('aria-pressed',String(timeline));
  $('stageHint').textContent=timeline?'橫向捲動／縮放 · 發布日期（UTC）× 主要分類 · 連線非因果':'拖曳節點牽動關聯 · 空白旋轉 · Ctrl＋左鍵拖拉平移 · 金色線跨來源';
  if(graph){if(timeline)graph.pauseAnimation();else graph.resumeAnimation();}
}
function switchMode(mode){interaction?.clear();rememberNetwork(true);stopPlayback();timelineFocusRequested=true;viewMode=mode;applyMode();rebuild();}

function updateDB(stats) { if (stats) $('dbStatus').textContent = `DB ${stats.articles} 筆 · 圖譜快照 ${stats.snapshots || 0} 份`; }
function paintProgress() {
  const root = $('status'); root.replaceChildren();
  const composition = $('composition'); composition.replaceChildren();
  const values = Object.entries(sourceStates), total = values.reduce((n,[,v])=>n+(v.total || 0),0);
  const finished = values.filter(([,v])=>v.done).length;
  $('progress').max = Math.max(1,values.length); $('progress').value = finished;
  $('progressLabel').textContent = `${finished} / ${values.length} 個來源完成`;
  for (const [source,v] of values) {
    const row = el('div',null,'source-progress'), title = el('div',null,'source-title'), dot = el('i'); dot.style.background=colors[source];
    title.append(dot,el('strong',sourceNames[source]),el('small',v.phase || '等待中',v.error?'error':''));
    const counts = el('div',null,'source-counts');
    for (const [label,num] of [['DB',v.cached||0],['新增',v.new||0],['合計',v.total||0]]) { const part=el('span',label+' ');part.append(el('b',num));counts.append(part); }
    row.append(title,counts);
    if (v.error || v.details?.length) { const details=el('details'), summary=el('summary',v.error?'查看錯誤':'覆蓋／來源說明');details.append(summary); if(v.error)details.append(el('p',v.error,'error'));for(const line of v.details||[])details.append(el('p',line));row.append(details); }
    root.append(row);
    for(const [kind,value] of [['cached',v.cached||0],['new',v.new||0]]) { if(!value)continue;const seg=el('div',null,'segment '+kind);seg.style.width=(value/Math.max(1,total)*100)+'%';seg.style.backgroundColor=colors[source];seg.title=`${sourceNames[source]} · ${kind==='cached'?'DB 既有':'本次新增'} ${value} 筆`;composition.append(seg); }
  }
  composition.setAttribute('aria-label',values.map(([s,v])=>`${sourceNames[s]}：DB ${v.cached||0}，新增 ${v.new||0}`).join('；') || '尚無資料');
}
function handleEvent(msg) {
  if (msg.type === 'heartbeat') { $('elapsed').textContent = `處理中 · ${msg.elapsed} 秒`; return; }
  if (msg.type === 'status') {
    const v=sourceStates[msg.source] ||= {cached:0,new:0,total:0};
    v.phase=msg.phase==='fetching' ? `讀取中 · ${msg.requests || 0} 次請求` : '檢查／補抓中';
    if(Number.isFinite(msg.cached)) Object.assign(v,{cached:msg.cached,new:msg.new,total:msg.total});
    paintProgress(); return;
  }
  if (msg.type === 'cache') {
    for(const [s,count] of Object.entries(msg.counts || {})) sourceStates[s]={cached:count,new:0,total:count,phase:'檢查快取'};
    rebuild(msg.graph);paintProgress(); return;
  }
  if (msg.type === 'source') {
    sourceArticles.set(msg.source, msg.articles);
    rebuild(msg.graph || { articles: [...sourceArticles.values()].flat(), relations: [] });
    const c=msg.cache, v=sourceStates[msg.source] ||= {};
    const cached=c?.existing_articles ?? v.cached ?? 0;
    Object.assign(v,{cached,new:c?.new_articles ?? Math.max(0,msg.articles.length-cached),total:msg.articles.length,done:true,error:msg.error,
      phase:msg.error ? (msg.error_code==='missing_ticker'?'已略過':'部分／失敗') : c?.reused?'快取完成':'完成',
      details:[...(c?[`API 完整 ${c.complete_days}/${c.requested_days} 天 · RSS 快照 ${c.snapshot_days} 天`,...(c.missing_ranges?.length?['仍有未覆蓋日期，可稍後補抓']:[])]:[]),...(msg.warnings||[])]});
    paintProgress();
    exportMeta.sources ||= {}; exportMeta.sources[msg.source] = { cache:c,error:msg.error,warnings:msg.warnings };
  }
  if (msg.type === 'done') { updateDB(msg.db); $('elapsed').textContent = `搜尋完成 · ${msg.elapsed ?? 0} 秒`; }
}
const today = new Date(); $('end').value = today.toISOString().slice(0, 10); $('end').max = $('end').value;
$('start').value = new Date(today.getTime() - 6 * 86400000).toISOString().slice(0, 10); $('start').max = $('end').value;
const dateRange=AtlasDates.init($);
const persistSearchDraft=AtlasUI.initSearch($,dateRange);
dateRange.onChange(()=>{persistSearchDraft();if(!focusView.articles.length){timelineBounds=AtlasTimeline.range([],{start:$('start').value,end:$('end').value});syncTimeFocus();}});
$('timeSizeEnabled').onchange=updateTimeFocus;$('timeFocusSlider').oninput=updateTimeFocus;syncTimeFocus();
$('form').addEventListener('submit', async e => {
  if(e.target&&e.target!==$('form'))return;
  e.preventDefault(); if (controller) return;dateRange.refresh();persistSearchDraft();
  const sources = [...document.querySelectorAll('.sources input:checked')].map(x => x.value);
  const query = $('query').value.trim(), ticker = $('ticker').value.trim(), key = $('key').value.trim();
  persistKey();
  const status = $('status'); status.replaceChildren(); sourceStates = {};
  if (!sources.length || (!query && !ticker)) { status.append(el('p', '請選擇來源並填寫關鍵字或股票代碼。', 'error')); return; }
  stopPlayback();clearFocus();timelineFocusRequested=true;timelineCutoff=null;networkPositions.clear();internalLengths.clear();if(graph)graph.graphData({nodes:[],links:[]});
  const request = ++currentSearch; controller = new AbortController(); sourceArticles = new Map();
  exportMeta = { query, ticker, start: $('start').value, end: $('end').value, sources: {} };
  selected = null; $('nodeJson').replaceChildren(); $('article').replaceChildren(); rebuild({ articles: [], relations: [] });
  $('submit').disabled = true; $('cancel').hidden = false; $('progress').hidden = false; $('progress').max = sources.length; $('progress').value = 0;
  $('elapsed').textContent = '正在檢查本地日期覆蓋…';
  for (const s of sources) sourceStates[s]={cached:0,new:0,total:0,phase:'等待中'};
  paintProgress();
  const abortTimer = setTimeout(() => controller?.abort(), 180000);
  try {
    const response = await fetch('/api/search', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...exportMeta, sources, massive_key: key, force_refresh: $('forceRefresh').checked }) });
    if (!response.ok || !response.body) { let detail = `搜尋服務回應異常（${response.status}）`; try { detail = (await response.json()).error || detail; } catch {} throw new Error(detail); }
    const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '', finished = false;
    while (true) {
      const { value, done } = await reader.read(); buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, idx); buffer = buffer.slice(idx + 1); if (!line) continue; const msg = JSON.parse(line); if (msg.type === 'done') finished = true; handleEvent(msg); }
      if (done) break;
    }
    if (!finished) throw new Error('搜尋連線提早中斷；已載入資料仍保留');
    $('empty').textContent = graph ? '這段日期沒有取得新聞。請查看來源狀態或調整日期。' : '3D 無法啟動，請使用新聞清單。';
  } catch (err) { status.append(el('p', err.name === 'AbortError' ? '已停止等待或連線超時。已取得資料保留；伺服器可能仍在完成本次補抓並寫入 DB。' : '搜尋失敗：' + err.message, 'error')); }
  finally { clearTimeout(abortTimer); if (request === currentSearch) { controller = null; $('submit').disabled = false; $('cancel').hidden = true; $('saveDB').disabled = !focusView.articles.length || saving; } }
});
$('cancel').onclick = () => controller?.abort();
$('export').onclick = () => { const data = { schema_version: '2.0', search: exportMeta, articles:focusView.articles, relations:focusView.relations, view: {sources:viewSources(),separate:isSeparate(),mode:viewMode,channel_filter:channelFilter,cutoff:timelineCutoff,timeline_style:timelineStyle,exploration,glow:glowConfig,time_focus:timeFocus,focus:{mode:lockedRoots.length?(keywordLocked?'keyword':'single'):'overview',root_ids:lockedRoots,query:keywordLocked?rootSearchState?.query||'':'',limit:rootSearchState?.limit||3},channel_definitions:channelDefinitions}, relation_note: '關聯來自明確代碼、文字實體、主題與標題相似規則；分數不是機率，連線不是因果。' }; const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = el('a'); a.href = url; a.download = 'news-atlas.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); };
$('fit').onclick = () => {if(viewMode==='timeline'){$('timelineZoom').value=1;$('timeline').scrollLeft=0;renderTimeline();}else graph?.zoomToFit(reducedMotion ? 0 : 600, 60);};
$('openSearch').onclick = () => $('searchPanel').classList.add('open'); $('closeSearch').onclick = () => $('searchPanel').classList.remove('open'); $('closeDetail').onclick = () => $('detail').classList.remove('open'); $('openResults').onclick = () => $('detail').classList.add('open');
fetch('/api/status').then(r => r.json()).then(info => { updateDB(info.db); if (info.massive_configured) $('key').placeholder = '伺服器已設定 key，可留白'; }).catch(() => {});

for (const p of providers) $('view-'+p).addEventListener('change',()=>{rememberNetwork(true);rebuild();});
$('separateSources').addEventListener('change',()=>{rememberNetwork(true);selected=null;rebuild();});
function savedPayload() {
  rememberNetwork();for(const [id,pos] of restoredPositions)networkPositions.set(id,pos);const ids=new Set(focusView.articles.map(a=>a.id));
  const positions=[...networkPositions].filter(([id])=>ids.has(id)).map(([id,p])=>({id,...p}));
  const payload=AtlasView.snapshot(basePayload,focusView,viewSources(),isSeparate(),exportMeta,positions);
  Object.assign(payload.view,{mode:viewMode,channel_filter:channelFilter,cutoff:timelineCutoff,timeline_zoom:Number($('timelineZoom').value)||1,timeline_style:timelineStyle,exploration,glow:glowConfig,time_focus:timeFocus,focus:{mode:lockedRoots.length?(keywordLocked?'keyword':'single'):'overview',root_ids:lockedRoots,query:keywordLocked?rootSearchState?.query||'':'',limit:rootSearchState?.limit||3},channel_definitions:channelDefinitions});
  return payload;
}
$('saveDB').onclick = async () => {
  if (saving || controller || !focusView.articles.length) return;
  const payload=savedPayload(); saving=true; $('saveDB').disabled=true; $('saveStatus').textContent='儲存中…';
  try {const response=await fetch('/api/snapshots',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const saved=await response.json();if(!response.ok)throw new Error(saved.error || '儲存失敗');$('saveStatus').textContent=`已儲存「${saved.name}」· ${payload.view.sources.map(p=>sourceNames[p]).join('／')} 分開保存`;updateDB(saved.db);await loadSnapshots();}
  catch(error){$('saveStatus').textContent='儲存失敗：'+error.message;}
  finally{saving=false;$('saveDB').disabled=!focusView.articles.length || !!controller;}
};
async function loadSnapshots() {
  try {const response=await fetch('/api/snapshots');if(!response.ok)return;const data=await response.json();const root=$('snapshots');root.replaceChildren();for(const saved of data.snapshots || []){const button=el('button',`${saved.name} · ${date(saved.created_at)}`,'raw');button.addEventListener('click',()=>restoreSnapshot(saved.id));root.append(button);}if(!data.snapshots?.length)root.append(el('p','尚無已儲存圖譜','muted'));} catch {}
}
async function restoreSnapshot(id) {
  if(controller || saving){$('saveStatus').textContent='請等待目前搜尋／儲存完成。';return;}
  try {
    const response=await fetch('/api/snapshots/'+encodeURIComponent(id));const saved=await response.json();if(!response.ok)throw new Error(saved.error);
    stopPlayback();networkPositions.clear();internalLengths.clear();
    for(const p of providers)$('view-'+p).checked=saved.view.sources.includes(p);
    $('separateSources').checked=saved.view.separate;exportMeta={...saved.search,sources:{}};
    // Restoring a graph must not overwrite the user's editable search draft.
    restoredPositions=new Map(saved.view.positions.map(p=>[p.id,p]));for(const [id,p] of restoredPositions)networkPositions.set(id,p);
    timelineFocusRequested=true;viewMode=saved.view.mode||'network';channelFilter=saved.view.channel_filter||'all';timelineCutoff=saved.view.cutoff||null;$('timelineZoom').value=saved.view.timeline_zoom||1;
    clearFocus();timeFocus=AtlasTimeline.timeSettings(saved.view.time_focus||{enabled:false});AtlasUI.write('timeFocus',timeFocus);glowConfig=AtlasGlow.settings(saved.view.glow||{});syncGlowControls();exploration=AtlasView.settings(saved.view.exploration||{});syncRelationControls();timelineStyle=saved.view.timeline_style||'density';$('timelineStyle').value=timelineStyle;
    selected=null;$('article').replaceChildren(el('p','點擊新聞查看來源與關聯依據。','muted'));$('nodeJson').replaceChildren();applyMode();rebuild({source_graphs:saved.source_graphs,cross_relations:saved.cross_relations,channel_definitions:saved.view.channel_definitions?.length?saved.view.channel_definitions:channelCatalog});
    const focus=saved.view.focus;if(focus?.root_ids?.length){lockedRoots=focus.root_ids.filter(id=>focusView.articles.some(a=>a.id===id));keywordLocked=focus.mode==='keyword'&&lockedRoots.length>0;$('rootQuery').value=focus.query||'';$('rootLimit').value=focus.limit||3;if(keywordLocked){rootSearchState={query:focus.query,limit:focus.limit,matches:lockedRoots.map(id=>({id,title:focusView.articles.find(a=>a.id===id).title,evidence:[]}))};renderRootResults();}refreshFocus();if(viewMode==='timeline')renderTimeline();touchFocus();}
    $('saveStatus').textContent=`已載入「${saved.name}」· ${date(saved.created_at)}`;sourceStates={};
    for(const [s,g] of Object.entries(saved.source_graphs))sourceStates[s]={cached:g.articles.length,new:0,total:g.articles.length,done:true,phase:'已存圖譜'};
    paintProgress();$('elapsed').textContent='歷史圖譜快照 · 未重新搜尋';
    if(!saved.view.channel_definitions?.length)await reclassifyCurrent();
  }catch(error){$('saveStatus').textContent='載入失敗：'+error.message;}
}
$('modeNetwork').onclick=()=>switchMode('network');$('modeTimeline').onclick=()=>switchMode('timeline');
$('channelFilter').onchange=()=>{channelFilter=$('channelFilter').value;timelineFocusRequested=true;rebuild();};
$('timelineZoom').oninput=renderTimeline;
$('timelineCutoff').oninput=()=>{const range=timelineBounds||AtlasTimeline.range([],{start:exportMeta.start,end:exportMeta.end});timelineCutoff=new Date(range.start+Number($('timelineCutoff').value)*86400000).toISOString().slice(0,10);rebuild();};
$('timelinePlay').onclick=()=>{if(timelineTimer){stopPlayback();return;}const slider=$('timelineCutoff');if(+slider.value>=+slider.max)slider.value=0;slider.oninput();$('timelinePlay').textContent='暫停';timelineTimer=setInterval(()=>{slider.value=Math.min(+slider.max,+slider.value+1);slider.oninput();if(+slider.value>=+slider.max)stopPlayback();},900);};
$('timeline').addEventListener('click',e=>{if(!e.target.closest?.('[data-node-id], [data-bucket-id], button'))clearFocus();});
$('timeline').addEventListener('pointermove',e=>{if(!$('preview').hidden)positionPreview(e);});
function resetChannelForm(){editingChannel=null;$('channelName').value='';$('channelKeywords').value='';$('channelMatch').value='any';$('channelColor').value='#9dd6c4';$('channelSubmit').textContent='新增 Channel';$('channelCancel').hidden=true;}
function renderChannelManager(){
  const root=$('channelList');root.replaceChildren();
  for(const c of channelCatalog){const row=el('div',null,'channel-row');const title=el('strong',c.name+(c.builtin?' · 預設':''),c.builtin?'':'raw');title.style.color=c.color;row.append(title,el('p',c.keywords.join('、')||'未命中其他分類',c.keywords.length?'raw':''));
    if(!c.builtin){const edit=el('button','編輯');edit.type='button';edit.onclick=()=>{editingChannel=c.id;$('channelName').value=c.name;$('channelKeywords').value=c.keywords.join(', ');$('channelMatch').value=c.match;$('channelColor').value=c.color;$('channelSubmit').textContent='更新 Channel';$('channelCancel').hidden=false;};const remove=el('button','移除');remove.type='button';remove.onclick=()=>deleteChannel(c.id);row.append(edit,remove);}root.append(row);
  }
}
async function loadChannels(){try{const response=await fetch('/api/channels');if(!response.ok)throw new Error('無法讀取分類');const data=await response.json();channelCatalog=data.channels;renderChannelManager();if(!channelDefinitions.length){channelDefinitions=channelCatalog;renderChannelFilter();if(viewMode==='timeline')renderTimeline();}}catch(error){$('channelStatus').textContent=error.message;}}
async function reclassifyCurrent(){
  if(classifying)return;classifying=true;const epoch=classificationEpoch;
  const groups=AtlasView.groups(basePayload),rows=[];for(const [provider,g] of Object.entries(groups))for(const a of g.articles)rows.push({id:provider+'::'+a.id,title:a.title,summary:a.summary||''});
  $('reclassify').disabled=true;$('channelStatus').textContent='重新分類中…';
  try{const response=await fetch('/api/classify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({articles:rows})});const data=await response.json();if(!response.ok)throw new Error(data.error);if(epoch!==classificationEpoch){$('channelStatus').textContent='搜尋資料已更新，請再按重新分類。';return;}const annotations=new Map(data.annotations.map(a=>[a.id,a]));for(const [provider,g] of Object.entries(groups))for(const a of g.articles){const hit=annotations.get(provider+'::'+a.id);if(hit){const {id,...classification}=hit;Object.assign(a,classification);}}basePayload.source_graphs=groups;basePayload.channel_definitions=data.channels;basePayload.channel_version=data.version;channelCatalog=data.channels;renderChannelManager();rebuild();$('channelStatus').textContent='已依最新規則分類目前新聞；已存快照不變。';}catch(error){$('channelStatus').textContent='分類失敗：'+error.message;}finally{classifying=false;$('reclassify').disabled=false;}
}
$('channelForm').addEventListener('submit',async e=>{e.preventDefault();const payload={name:$('channelName').value.trim(),keywords:$('channelKeywords').value.split(/[,，、\n]/).map(t=>t.trim()).filter(Boolean),match:$('channelMatch').value,color:$('channelColor').value};if(editingChannel)payload.id=editingChannel;$('channelSubmit').disabled=true;
  try{const response=await fetch('/api/channels',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw new Error(data.error);channelCatalog=data.channels;renderChannelManager();resetChannelForm();await reclassifyCurrent();}catch(error){$('channelStatus').textContent=error.message;}finally{$('channelSubmit').disabled=false;}});
async function deleteChannel(id){try{const response=await fetch('/api/channels/'+encodeURIComponent(id),{method:'DELETE'});const data=await response.json();if(!response.ok)throw new Error(data.error);if(editingChannel===id)resetChannelForm();channelCatalog=data.channels;renderChannelManager();await reclassifyCurrent();}catch(error){$('channelStatus').textContent=error.message;}}
$('channelCancel').onclick=resetChannelForm;$('reclassify').onclick=reclassifyCurrent;
loadSnapshots();loadChannels();applyMode();

$('manageChannels').onclick=()=>{$('searchPanel').classList.add('open');$('channelManager').open=true;$('channelManager').scrollIntoView({block:'nearest',behavior:reducedMotion?'instant':'smooth'});};

function renderNodeJson(n){
  const fields=['id','title','summary','url','published_at','source','symbols','language','fetched_at','entities','topics','analysis_version','origins','channels','primary_channel','channel_version'];
  const article={};for(const k of fields)if(n[k]!==undefined)article[k]=k==='id'?(n.article_id||n.id):n[k];
  const related=relations.filter(e=>e.source===n.id||e.target===n.id).map(e=>e.raw_relation||e);
  const trace=AtlasView.trace(relations,n.id,exploration);
  const paths=[...trace.nodes].filter(([id])=>id!==n.id).map(([id,info])=>({node_id:id,...info}));
  AtlasUI.jsonTree($('nodeJson'),{schema_version:'2.0',article,relations:related,visible_exploration:{root:n.id,settings:exploration,paths}});
}
function showBucket(bucket){
  selected=null;$('nodeJson').replaceChildren();const panel=$('article');panel.replaceChildren(el('h3',bucket.date+' UTC'),el('p',`${bucket.articles.length} 篇新聞 · 點選一篇查看內容`,'bucket-note'));
  const list=el('div',null,'bucket-list');for(const a of bucket.articles){const button=el('button');button.append(el('div',(a.display_sources||[a.source.provider]).map(p=>sourceNames[p]).join(' / ')+' · '+date(a.published_at),'meta'),el('div',a.title,'raw'));if(lockedRoots.length){const hit=activeTrace.nodes.get(a.id);button.append(el('div',hit?(hit.depth===0?'★ root':AtlasI18n.t('關聯深度')+' '+hit.depth):AtlasI18n.t('未在選定樹內'),'meta'));}button.onclick=()=>showArticle(a);list.append(button);}panel.append(list);$('detail').classList.add('open');
}
function previewBucket(bucket,event){const box=$('preview');box.replaceChildren();box.hidden=!bucket;if(!bucket)return;box.append(el('strong',bucket.date+' UTC'),el('div',`${bucket.articles.length} 篇新聞 · 點選一篇查看內容`),el('div',Object.entries(bucket.counts).map(([p,n])=>sourceNames[p]+' '+n).join(' / '),'meta'));positionPreview(event);}
function syncRelationControls(){if($('glowLegend'))syncGlowControls();for(const k of ['internalMin','crossMin','depth','branchLimit','pathMin']){$('rel-'+k).value=exploration[k];$('out-'+k).textContent=exploration[k];}}
for(const k of ['internalMin','crossMin','depth','branchLimit','pathMin'])$('rel-'+k).oninput=()=>{rememberNetwork(true);exploration=AtlasView.settings({...exploration,[k]:Number($('rel-'+k).value)});syncRelationControls();AtlasUI.write('exploration',exploration);rebuild();};
$('resetRelations').onclick=()=>{exploration=AtlasView.settings();syncRelationControls();AtlasUI.write('exploration',exploration);rememberNetwork(true);rebuild();};
$('timelineStyle').value=timelineStyle;$('timelineStyle').onchange=()=>{timelineStyle=$('timelineStyle').value;AtlasUI.write('timelineStyle',timelineStyle);timelineFocusRequested=true;renderTimeline();};
syncRelationControls();
const persistKey=AtlasUI.initKey($);
AtlasUI.initResize($,()=>{if(viewMode==='timeline')renderTimeline();});
let schemaLoaded=false;$('jsonInspector').addEventListener('toggle',async()=>{if(!$('jsonInspector').open||schemaLoaded)return;try{const response=await fetch('/schema/news-atlas.schema.json');if(!response.ok)throw new Error();AtlasUI.jsonTree($('schemaJson'),await response.json());schemaLoaded=true;}catch{$('schemaJson').textContent='Schema 載入失敗，請關閉後重試。';}});
$('language').value=AtlasI18n.language();$('language').onchange=()=>{AtlasI18n.setLanguage($('language').value);rebuild();};
AtlasI18n.start();

function syncGlowControls(){
  $('glow-enabled').checked=glowConfig.enabled;for(const key of ['brightness','radius','decay','background']){$('glow-'+key).value=glowConfig[key];$('glow-out-'+key).textContent=key==='decay'||key==='background'?Math.round(glowConfig[key]*100)+'%':glowConfig[key];}
  const legend=$('glowLegend');legend.replaceChildren();for(let depth=0;depth<=exploration.depth;depth++){const entry=el('span',depth===0?'root':String(depth));const dot=el('i');dot.style.opacity=1-Math.exp(-AtlasGlow.level(depth,glowConfig)*1.6);entry.append(dot);legend.append(entry);}
}
function updateGlow(){glowConfig=AtlasGlow.settings({enabled:$('glow-enabled').checked,...Object.fromEntries(['brightness','radius','decay','background'].map(k=>[k,Number($('glow-'+k).value)]))});AtlasUI.write('glow',glowConfig);syncGlowControls();refreshFocus();if(viewMode==='timeline')renderTimeline();}
for(const key of ['brightness','radius','decay','background'])$('glow-'+key).oninput=updateGlow;$('glow-enabled').onchange=updateGlow;
$('resetGlow').onclick=()=>{glowConfig=AtlasGlow.settings();AtlasUI.write('glow',glowConfig);syncGlowControls();refreshFocus();if(viewMode==='timeline')renderTimeline();};
$('clearRoot').onclick=clearFocus;
function glowState(){const preview=focusRoot()===null&&hovered!==null;return {graph,trace:preview?candidateTrace:activeTrace,config:preview?{...glowConfig,brightness:glowConfig.brightness*.3,radius:glowConfig.radius*.7}:glowConfig,colors,active:viewMode==='network'&&(focusRoot()!==null||preview),visible:viewMode==='network',reducedMotion,nodeStyle:nodeColor,edgeStyle,hitGuide:preview?interaction?.guide(hovered):Date.now()<stickyGuideUntil?interaction?.guide(focusRoot()):null};}
glowLayer=AtlasGlow.attach($('glowCanvas'),glowState);syncGlowControls();

idleFocus=AtlasInteraction.idleFocus(clearFocus,{isBusy:()=>interaction?.isDragging()===true});
interaction=AtlasInteraction.attach($('graph'),{getGraph:()=>graph,enabled:()=>viewMode==='network'&&!!graph,onHover:setHovered,onSelect:showArticle,onDragEnd:()=>rememberNetwork(),onBackground:clearFocus,onActivity:touchFocus,strength:()=>Number($('stickyStrength').value)});
$('stickyStrength').value=AtlasUI.read('stickyStrength',65);$('stickyStrengthValue').textContent=$('stickyStrength').value+'%';
$('stickyStrength').oninput=()=>{$('stickyStrengthValue').textContent=$('stickyStrength').value+'%';AtlasUI.write('stickyStrength',Number($('stickyStrength').value));stickyGuideUntil=Date.now()+2000;touchFocus();interaction?.refresh();glowLayer?.refresh();};
for(const name of ['pointermove','pointerdown','pointerup','wheel','keydown'])document.addEventListener?.(name,touchFocus,{capture:true,passive:true});

$('massiveHelpButton').onclick=()=>$('massiveHelp').showModal();
$('closeMassiveHelp').onclick=()=>$('massiveHelp').close();
$('massiveHelp').addEventListener('click',event=>{if(event.target!==$('massiveHelp'))return;const r=$('massiveHelp').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('massiveHelp').close();});

function rootFeedback(message,state='info'){
  const box=$('rootSearchStatus');box.textContent=message;box.className='root-search-status '+state;
}
async function searchRuntimeRoots(event){
  event?.preventDefault();event?.stopPropagation?.();if(rootSearchBusy)return;
  const query=$('rootQuery').value.trim(),limit=Number($('rootLimit').value);
  if(!query){rootFeedback(AtlasI18n.t('請輸入圖內搜尋關鍵字。'),'warning');return;}
  if(!articles.length){rootFeedback(AtlasI18n.t('目前圖譜沒有節點，請先搜尋新聞並勾選顯示來源。'),'warning');return;}
  if(!Number.isInteger(limit)||limit<1||limit>10){rootFeedback(AtlasI18n.t('Top N 必須為 1–10 的整數。'),'warning');return;}
  const ticket=++rootSearchTicket,button=$('rootSearchSubmit');rootSearchBusy=true;idleFocus?.stop();
  button.disabled=true;button.setAttribute('aria-busy','true');$('rootSearchSpinner').hidden=false;
  rootFeedback(AtlasI18n.t('搜尋中…')+' '+articles.length+' '+AtlasI18n.t('個節點'));
  try{
    // Yield a paint before local ranking so the busy state is visible.
    await new Promise(resolve=>setTimeout(resolve,80));
    if(ticket!==rootSearchTicket){rootFeedback(AtlasI18n.t('圖譜或選取已變更，請重新搜尋。'),'warning');return;}
    const result=AtlasView.rankRoots(articles,query,limit);
    if(!result.roots.length){rootFeedback(`「${query}」 · ${AtlasI18n.t('已掃描')} ${result.scanned_articles} · ${AtlasI18n.t('命中')} 0 · `+AtlasI18n.t('沒有符合的 roots；保留目前圖譜與星系。'),'warning');return;}
    lockedRoots=result.roots.map(r=>r.id);keywordLocked=true;rootSearchState={query,limit,matches:result.roots,total:result.matched_articles};
    refreshFocus();renderRootResults();if(viewMode==='timeline'){timelineFocusRequested=true;renderTimeline();}
    const warnings=[];
    if(!glowConfig.enabled||glowConfig.brightness===0)warnings.push(AtlasI18n.t('光暈已關閉或亮度為 0，請至光暈設定開啟。'));
    if(!activeTrace.edges.size)warnings.push(AtlasI18n.t('目前門檻下沒有延伸連線，僅標示 roots。'));
    if(viewMode==='network'&&graph){const nodes=graph.graphData().nodes,rect=$('stage').getBoundingClientRect();const inView=lockedRoots.some(id=>{const n=nodes.find(a=>a.id===id);if(!n)return false;const p=graph.graph2ScreenCoords(n.x,n.y,n.z);return p&&p.x>=0&&p.y>=0&&p.x<=rect.width&&p.y<=rect.height;});if(!inView)warnings.push(AtlasI18n.t('Roots 在目前視野外，可按「重設視角」查看全圖。'));}
    if(viewMode==='network'&&!graph)warnings.push(AtlasI18n.t('3D 無法使用，請查看下方 roots 清單。'));
    if(viewMode==='timeline'&&timelineStyle==='density')warnings.push(AtlasI18n.t('密度格以最淺關聯深度高亮；★ 表示 root，比例表示格內命中篇數。'));
    rootFeedback(`「${query}」 · ${AtlasI18n.t('已掃描')} ${result.scanned_articles} · ${AtlasI18n.t('命中')} ${result.matched_articles} · roots ${lockedRoots.length} · ${AtlasI18n.t('高亮節點')} ${activeTrace.nodes.size}`+(warnings.length?' · '+warnings.join(' '):' · '+AtlasI18n.t('已套用星系；視角保持不變。')),warnings.length?'warning':'success');
  }catch(error){rootFeedback(AtlasI18n.t('圖內搜尋失敗；目前圖譜保留。')+' '+String(error?.message||error),'error');}
  finally{rootSearchBusy=false;button.disabled=false;button.setAttribute('aria-busy','false');$('rootSearchSpinner').hidden=true;touchFocus();}
}
$('rootSearchSubmit').onclick=searchRuntimeRoots;
$('rootSearch').addEventListener('keydown',event=>{if(event.key==='Enter'&&(!event.target||['rootQuery','rootLimit'].includes(event.target.id))){event.preventDefault();return searchRuntimeRoots(event);}});

function renderRootResults(){
  const box=$('rootResults');box.replaceChildren();if(!rootSearchState)return;
  box.append(el('div',AtlasI18n.t('已鎖定 roots')+': '+lockedRoots.length+(rootSearchState.total===undefined?'':' / '+rootSearchState.total)));
  for(const [i,id] of lockedRoots.entries()){const root=rootSearchState.matches.find(r=>r.id===id);if(!root)continue;const button=el('button',`${i+1}. ${root.title}`+(root.score==null?'':` · ${root.score}`),'raw');button.type='button';button.title=root.evidence.map(e=>`${e.field}: ${e.match}`).join(' · ');button.onclick=()=>{const n=articles.find(a=>a.id===id);if(n)showArticle(n,false);};box.append(button);}
}

AtlasUI.initSourcePanel($);

document.addEventListener?.('keydown',event=>{if(event.key==='Escape'&&!['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName))clearFocus();});
