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
const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function el(tag, text, cls) { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
function date(value) { if (!value) return '日期未知'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '日期未知' : d.toLocaleString('zh-TW'); }
try {
  graph = ForceGraph3D()($('graph')).backgroundColor('#090f1b').nodeId('id')
    .nodeColor(n => colors[n.display_provider || n.source.provider] || '#b9d8df').nodeVal(3).nodeOpacity(.95)
    .linkColor(l => hovered === null ? (l.scope==='cross'?'rgba(244,205,132,.45)':l.type === 'shared_entity' ? 'rgba(130,200,210,.4)' : 'rgba(195,160,240,.3)') : l.from === hovered || l.to === hovered ? 'rgba(140,255,220,1)' : 'rgba(120,155,180,.045)')
    .linkWidth(l => hovered !== null && (l.from === hovered || l.to === hovered) ? 2 : .6).linkOpacity(1)
    .onNodeHover(n => { hovered = n ? n.id : null; graph.linkColor(graph.linkColor()).linkWidth(graph.linkWidth()); showPreview(n); })
    .onNodeClick(n => showArticle(n)).onNodeDragEnd(n => { n.fx = undefined; n.fy = undefined; n.fz = undefined; rememberNetwork(); graph.d3ReheatSimulation(); });
  graph.d3Force('charge').strength(-45); graph.d3Force('link').distance(l => AtlasView.linkStyle(l,internalLengths.get(edgeKey(l))).distance).strength(l=>AtlasView.linkStyle(l).strength); graph.cooldownTime(reducedMotion ? 800 : 8000);
  graph.d3Force('source-cluster', alpha => {
    if (!isSeparate()) return;
    const active = viewSources();
    for (const n of graph.graphData().nodes) { const center = (active.indexOf(n.display_provider) - (active.length - 1) / 2) * 240; n.vx = (n.vx || 0) + (center - (n.x || 0)) * .035 * alpha; n.vy = (n.vy || 0) - (n.y || 0) * .012 * alpha; n.vz = (n.vz || 0) - (n.z || 0) * .012 * alpha; }
  });
  graph.d3Force('preserve-position', alpha=>{if(isSeparate())return;for(const n of graph.graphData().nodes){if(!n.anchor)continue;for(const k of ['x','y','z'])n['v'+k]=(n['v'+k]||0)+(n.anchor[k]-(n[k]||0))*.012*alpha;}});
  new ResizeObserver(() => { const r = $('stage').getBoundingClientRect(); graph.width(r.width).height(r.height); if(viewMode==='timeline')renderTimeline(); }).observe($('stage'));
} catch (error) { graph = null; $('empty').textContent = '此瀏覽器無法啟動 3D 圖譜，仍可搜尋並使用右側新聞清單。'; }
function showPreview(n) { const box = $('preview'); box.replaceChildren(); box.hidden = !n; if (!n) return; box.append(el('div', (n.source.publisher || n.source.provider) + ' · ' + (n.display_sources || [n.source.provider]).map(p=>sourceNames[p]).join('／'), 'meta'), el('strong', n.title), el('div', date(n.published_at), 'muted')); }
$('graph').addEventListener('pointermove', e => { const box = $('preview'), r = $('stage').getBoundingClientRect(); if (!box.hidden) { box.style.left = Math.max(8, Math.min(r.width - box.offsetWidth - 8, e.clientX - r.left + 18)) + 'px'; box.style.top = Math.max(8, Math.min(r.height - box.offsetHeight - 8, e.clientY - r.top + 18)) + 'px'; } });
function evidenceText(edge) {
  return (edge.evidence || []).map(e => e.entity ? `${e.entity}：${e.source.method === 'provider_ticker' ? '來源標註' : '文章文字'}「${e.source.evidence}」↔ ${e.target.method === 'provider_ticker' ? '來源標註' : '文章文字'}「${e.target.evidence}」` : `共同詞：${(e.title_terms || []).join('、')}；標題相似度 ${e.title_similarity}`).join('；');
}
function showArticle(n) {
  selected = n.id;
  const root = $('article'); root.replaceChildren(); const card = el('div', null, 'card');
  card.append(el('div', `${n.source.publisher || n.source.provider} · ${date(n.published_at)}`, 'meta'), el('h3', n.title), el('p', n.summary || '來源未提供摘要。', 'muted'));
  for (const entity of n.entities || []) card.append(el('span', `${entity.id} · ${entity.method === 'provider_ticker' ? '來源標註' : '文字辨識'}`, 'tag'));
  const link = el('a', '閱讀原文 ↗'); link.href = n.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(el('p'), link);
  if (n.source.via) card.append(el('p', '取得途徑：' + n.source.via, 'muted'));
  root.append(card, el('h3', 'Channel 分類依據'));
  for(const c of n.channels||[]){const block=el('div',null,'channel-evidence');block.append(el('strong',c.name+(c.id===n.primary_channel?' · 主要分類':'')),el('p',c.evidence.length?c.evidence.map(e=>`${e.field==='title'?'標題':'摘要'}：${e.match}`).join('；'):'未命中目前分類規則'));root.append(block);}
  root.append(el('h3', '與這篇新聞的關聯'));
  const related = relations.filter(r => r.source === n.id || r.target === n.id);
  for (const edge of related) {
    const target = articles.find(a => a.id === (edge.source === n.id ? edge.target : edge.source)); if (!target) continue;
    const item = el('div', null, 'card'), button = el('button', target.title);
    button.addEventListener('click', () => showArticle(target));
    item.append(el('div', `${edge.scope==='cross'?'跨來源 · ':''}${relationNames[edge.type] || edge.type} · 相隔 ${edge.days_apart ?? '—'} 天`, 'meta'), button, el('p', evidenceText(edge), 'muted'));
    root.append(item);
  }
  if (!related.length) root.append(el('p', '目前沒有足夠文字依據建立關聯，保留為獨立節點。', 'muted'));
  $('detail').classList.add('open');
}
function rebuild(payload) {
  const previousCount = articles.length;
  if (payload) {basePayload = payload;classificationEpoch++;}
  if(basePayload.channel_definitions)channelDefinitions=basePayload.channel_definitions;
  renderChannelFilter();
  currentView = AtlasView.select(basePayload, viewSources(), isSeparate());
  syncTimelineRange(currentView.articles);
  if(viewMode==='timeline') currentView=AtlasTimeline.filter(currentView,channelFilter,timelineCutoff);
  articles = currentView.articles; relations = currentView.relations;
  exportMeta.total_articles = basePayload.total_articles ?? articles.length;
  hovered = null; showPreview(null);
  $('count').textContent = articles.length; $('edges').textContent = relations.length;
  $('empty').hidden = articles.length > 0 && (viewMode==='timeline'||!!graph); $('export').disabled = !articles.length;
  $('saveDB').disabled = !articles.length || !!controller || saving;
  $('empty').textContent = viewSources().length ? '目前來源沒有可顯示新聞。' : '請勾選至少一個顯示來源。';
  const groups = AtlasView.groups(basePayload);
  for (const p of providers) $('view-count-'+p).textContent = groups[p]?.articles.length || 0;
  const total = viewSources().reduce((n,p)=>n+(groups[p]?.total_articles ?? groups[p]?.articles.length ?? 0),0);
  $('viewLimit').textContent = `顯示 ${articles.length} 節點 · 所選來源共 ${total} 筆 · 上限 800`;
  const list = $('list'); list.replaceChildren();
  for (const a of articles) { const b = el('button'); b.append(el('div', (a.display_sources || []).map(p=>sourceNames[p]).join('／') + ' · ' + date(a.published_at), 'meta'), el('div', a.title)); b.addEventListener('click', () => showArticle(a)); list.append(b); }
  if (selected) { const n = articles.find(a => a.id === selected); if (n) showArticle(n); else { selected = null; $('article').replaceChildren(el('p', '點擊新聞查看來源與關聯依據。', 'muted')); } }
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
  if(viewMode==='timeline')renderTimeline();
}
function rememberNetwork(distances=false){
  if(!graph)return;
  const data=graph.graphData();
  for(const n of data.nodes||[])if(['x','y','z'].every(k=>Number.isFinite(n[k])))networkPositions.set(n.id,{x:n.x,y:n.y,z:n.z});
  if(distances){const nodes=new Map(data.nodes.map(n=>[n.id,n]));for(const l of data.links||[]){if(l.scope==='cross')continue;const a=typeof l.source==='object'?l.source:nodes.get(l.source),b=typeof l.target==='object'?l.target:nodes.get(l.target);if(a&&b){const length=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);if(Number.isFinite(length)&&length>0)internalLengths.set(edgeKey(l),length);}}}
}
function renderChannelFilter(){
  const select=$('channelFilter');select.replaceChildren();const all=el('option','全部分類');all.value='all';select.append(all);
  for(const c of channelDefinitions){const option=el('option',c.name);option.value=c.id;select.append(option);}
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
function positionPreview(event){
  if(!event)return;const box=$('preview'),r=$('stage').getBoundingClientRect();const bounds=event.currentTarget?.getBoundingClientRect?.();
  const x=Number.isFinite(event.clientX)?event.clientX:bounds?.left||r.left+30,y=Number.isFinite(event.clientY)?event.clientY:bounds?.top||r.top+30;
  box.style.left=Math.max(8,Math.min(r.width-box.offsetWidth-8,x-r.left+16))+'px';box.style.top=Math.max(8,Math.min(r.height-box.offsetHeight-8,y-r.top+16))+'px';
}
function renderTimeline(){
  if(viewMode!=='timeline')return;
  $('timeline').style.top=(($('graphTools').offsetHeight||220)+25)+'px';
  const width=Math.max(900,$('stage').getBoundingClientRect().width)*(Number($('timelineZoom').value)||1);
  const model=AtlasTimeline.render($('timeline'),currentView,channelDefinitions,{width,start:timelineBounds?.startDate,end:timelineBounds?.endDate,channel:channelFilter,colors,onSelect:showArticle,onHover:(n,e)=>{showPreview(n);positionPreview(e);}});
  if(timelineFocusRequested&&model.nodes.length){$('timeline').scrollLeft=Math.max(0,Math.min(...model.nodes.map(n=>n.x))-210);timelineFocusRequested=false;}
}
function stopPlayback(){if(timelineTimer){clearInterval(timelineTimer);timelineTimer=null;}$('timelinePlay').textContent='播放';}
function applyMode(){
  const timeline=viewMode==='timeline';$('graph').hidden=timeline;$('timeline').hidden=!timeline;$('timelineControls').hidden=!timeline;
  $('modeNetwork').classList.toggle('active',!timeline);$('modeTimeline').classList.toggle('active',timeline);
  $('modeNetwork').setAttribute('aria-pressed',String(!timeline));$('modeTimeline').setAttribute('aria-pressed',String(timeline));
  $('stageHint').textContent=timeline?'橫向捲動／縮放 · 發布日期（UTC）× 主要分類 · 連線非因果':'拖曳節點牽動關聯 · 拖曳空白旋轉 · 金色線為跨來源關聯';
  if(graph){if(timeline)graph.pauseAnimation();else graph.resumeAnimation();}
}
function switchMode(mode){rememberNetwork(true);stopPlayback();timelineFocusRequested=true;viewMode=mode;applyMode();rebuild();}

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
$('form').addEventListener('submit', async e => {
  e.preventDefault(); if (controller) return;
  const sources = [...document.querySelectorAll('.sources input:checked')].map(x => x.value);
  const query = $('query').value.trim(), ticker = $('ticker').value.trim(), key = $('key').value.trim();
  const status = $('status'); status.replaceChildren(); sourceStates = {};
  if (!sources.length || (!query && !ticker)) { status.append(el('p', '請選擇來源並填寫關鍵字或股票代碼。', 'error')); return; }
  stopPlayback();timelineFocusRequested=true;timelineCutoff=null;networkPositions.clear();internalLengths.clear();if(graph)graph.graphData({nodes:[],links:[]});
  const request = ++currentSearch; controller = new AbortController(); sourceArticles = new Map();
  exportMeta = { query, ticker, start: $('start').value, end: $('end').value, sources: {} };
  selected = null; $('article').replaceChildren(); rebuild({ articles: [], relations: [] });
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
  finally { clearTimeout(abortTimer); if (request === currentSearch) { controller = null; $('submit').disabled = false; $('cancel').hidden = true; $('saveDB').disabled = !articles.length || saving; } }
});
$('cancel').onclick = () => controller?.abort();
$('export').onclick = () => { const data = { schema_version: '2.0', search: exportMeta, articles, relations, view: {sources:viewSources(),separate:isSeparate(),mode:viewMode,channel_filter:channelFilter,cutoff:timelineCutoff,channel_definitions:channelDefinitions}, relation_note: '關聯來自明確代碼、文字實體、主題與標題相似規則；分數不是機率，連線不是因果。' }; const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = el('a'); a.href = url; a.download = 'news-atlas.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); };
$('fit').onclick = () => {if(viewMode==='timeline'){$('timelineZoom').value=1;$('timeline').scrollLeft=0;renderTimeline();}else graph?.zoomToFit(reducedMotion ? 0 : 600, 60);};
$('openSearch').onclick = () => $('searchPanel').classList.add('open'); $('closeSearch').onclick = () => $('searchPanel').classList.remove('open'); $('closeDetail').onclick = () => $('detail').classList.remove('open'); $('openResults').onclick = () => $('detail').classList.add('open');
fetch('/api/status').then(r => r.json()).then(info => { updateDB(info.db); if (info.massive_configured) $('key').placeholder = '伺服器已設定 key，可留白'; }).catch(() => {});

for (const p of providers) $('view-'+p).addEventListener('change',()=>{rememberNetwork(true);rebuild();});
$('separateSources').addEventListener('change',()=>{rememberNetwork(true);selected=null;rebuild();});
function savedPayload() {
  rememberNetwork();for(const [id,pos] of restoredPositions)networkPositions.set(id,pos);const ids=new Set(currentView.articles.map(a=>a.id));
  const positions=[...networkPositions].filter(([id])=>ids.has(id)).map(([id,p])=>({id,...p}));
  const payload=AtlasView.snapshot(basePayload,currentView,viewSources(),isSeparate(),exportMeta,positions);
  Object.assign(payload.view,{mode:viewMode,channel_filter:channelFilter,cutoff:timelineCutoff,timeline_zoom:Number($('timelineZoom').value)||1,channel_definitions:channelDefinitions});
  return payload;
}
$('saveDB').onclick = async () => {
  if (saving || controller || !articles.length) return;
  const payload=savedPayload(); saving=true; $('saveDB').disabled=true; $('saveStatus').textContent='儲存中…';
  try {const response=await fetch('/api/snapshots',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const saved=await response.json();if(!response.ok)throw new Error(saved.error || '儲存失敗');$('saveStatus').textContent=`已儲存「${saved.name}」· ${payload.view.sources.map(p=>sourceNames[p]).join('／')} 分開保存`;updateDB(saved.db);await loadSnapshots();}
  catch(error){$('saveStatus').textContent='儲存失敗：'+error.message;}
  finally{saving=false;$('saveDB').disabled=!articles.length || !!controller;}
};
async function loadSnapshots() {
  try {const response=await fetch('/api/snapshots');if(!response.ok)return;const data=await response.json();const root=$('snapshots');root.replaceChildren();for(const saved of data.snapshots || []){const button=el('button',`${saved.name} · ${date(saved.created_at)}`);button.addEventListener('click',()=>restoreSnapshot(saved.id));root.append(button);}if(!data.snapshots?.length)root.append(el('p','尚無已儲存圖譜','muted'));} catch {}
}
async function restoreSnapshot(id) {
  if(controller || saving){$('saveStatus').textContent='請等待目前搜尋／儲存完成。';return;}
  try {
    const response=await fetch('/api/snapshots/'+encodeURIComponent(id));const saved=await response.json();if(!response.ok)throw new Error(saved.error);
    stopPlayback();networkPositions.clear();internalLengths.clear();
    for(const p of providers)$('view-'+p).checked=saved.view.sources.includes(p);
    $('separateSources').checked=saved.view.separate;exportMeta={...saved.search,sources:{}};
    for(const k of ['query','ticker','start','end'])if(saved.search[k])$(k).value=saved.search[k];
    restoredPositions=new Map(saved.view.positions.map(p=>[p.id,p]));for(const [id,p] of restoredPositions)networkPositions.set(id,p);
    timelineFocusRequested=true;viewMode=saved.view.mode||'network';channelFilter=saved.view.channel_filter||'all';timelineCutoff=saved.view.cutoff||null;$('timelineZoom').value=saved.view.timeline_zoom||1;
    selected=null;applyMode();rebuild({source_graphs:saved.source_graphs,cross_relations:saved.cross_relations,channel_definitions:saved.view.channel_definitions?.length?saved.view.channel_definitions:channelCatalog});
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
$('timeline').addEventListener('pointermove',e=>{if(!$('preview').hidden)positionPreview(e);});
function resetChannelForm(){editingChannel=null;$('channelName').value='';$('channelKeywords').value='';$('channelMatch').value='any';$('channelColor').value='#9dd6c4';$('channelSubmit').textContent='新增 Channel';$('channelCancel').hidden=true;}
function renderChannelManager(){
  const root=$('channelList');root.replaceChildren();
  for(const c of channelCatalog){const row=el('div',null,'channel-row');const title=el('strong',c.name+(c.builtin?' · 預設':''));title.style.color=c.color;row.append(title,el('p',c.keywords.join('、')||'未命中其他分類'));
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
