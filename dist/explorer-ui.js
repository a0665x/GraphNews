/* Browser preferences and lazy, text-only JSON inspection. No credentials enter graph data. */
(function(root){
  const read=(key,fallback=null)=>{try{return JSON.parse(localStorage.getItem('graphnews.'+key))??fallback;}catch{return fallback;}};
  const write=(key,value)=>{try{if(value===null)localStorage.removeItem('graphnews.'+key);else localStorage.setItem('graphnews.'+key,JSON.stringify(value));return true;}catch{return false;}};
  function jsonTree(container,value){
    const doc=container.ownerDocument||document;
    function field(key,val){
      const details=doc.createElement('details'),summary=doc.createElement('summary');
      const object=val!==null&&typeof val==='object';
      summary.textContent=key+' · '+(Array.isArray(val)?'array ['+val.length+']':object?'object {'+Object.keys(val).length+'}':val===null?'null':typeof val);
      details.append(summary);let loaded=false;
      details.addEventListener('toggle',()=>{if(!details.open||loaded)return;loaded=true;if(object){for(const [k,v] of Object.entries(val))details.append(field(k,v));}else{const pre=doc.createElement('pre');pre.textContent=JSON.stringify(val,null,2);details.append(pre);}});
      return details;
    }
    container.replaceChildren();for(const [k,v] of Object.entries(value))container.append(field(k,v));
  }
  function initKey($,{persist=()=>{},forget=()=>{}}={}){
    $('rememberKey').checked=read('rememberKey',true);if($('rememberKey').checked)$('key').value=read('massiveKey','');
    let lastSent='',pending=Promise.resolve();
    const enqueue=fn=>(pending=pending.catch(()=>{}).then(fn));
    function save(remote=true){
      const remember=$('rememberKey').checked,value=$('key').value.trim();write('rememberKey',remember);
      // Empty transient fields never erase a recorded key; only explicit forget/opt-out does.
      const ok=!remember?write('massiveKey',null):value?write('massiveKey',value):true;
      if(!ok)$('keyStatus').textContent='瀏覽器儲存不可用；此 key 僅供本次使用。';else if(remember&&(value||read('massiveKey','')))$('keyStatus').textContent='已記住金鑰；重新整理會沿用。';else if(!remember)$('keyStatus').textContent='';
      if(remote&&remember){const key=value||read('massiveKey','');if(key&&key!==lastSent){lastSent=key;enqueue(()=>persist(key)).catch(()=>{lastSent='';$('keyStatus').textContent='金鑰仍在此瀏覽器；伺服器保存失敗，請重試。';});}}
      return ok;
    }
    $('key').addEventListener('input',()=>save(false));$('key').addEventListener('change',()=>save());
    $('rememberKey').addEventListener('change',()=>{save(false);if(!$('rememberKey').checked){lastSent='';enqueue(forget).catch(()=>{$('keyStatus').textContent='伺服器金鑰清除失敗，請重試。';});}else save();});
    $('forgetKey').onclick=()=>{$('key').value='';lastSent='';const ok=write('massiveKey',null);$('keyStatus').textContent=ok?'已清除瀏覽器保存的 key。':'無法清除本機儲存；請使用瀏覽器網站資料設定清除。';enqueue(forget).catch(()=>{$('keyStatus').textContent='伺服器金鑰清除失敗，請重試。';});};
    save();return save;
  }
  // Editable search draft is separate from acquired graph/snapshot metadata.
  function initSearch($,dates){
    const providers=['google','yahoo','massive'],saved=read('searchDraft',{});
    if(saved&&typeof saved==='object'){
      for(const [id,max]of [['query',200],['ticker',20]])if(typeof saved[id]==='string')$(id).value=saved[id].slice(0,max);
      if(Array.isArray(saved.sources)&&saved.sources.every(p=>providers.includes(p)))for(const p of providers)$('source-'+p).checked=saved.sources.includes(p);
      if(['TW','US','HK','JP','GB'].includes(saved.rss_region))$('rssRegion').value=saved.rss_region;
      if(typeof saved.forceRefresh==='boolean')$('forceRefresh').checked=saved.forceRefresh;
      dates.restore(saved.dates);
    }
    function save(){
      const draft={rss_region:$('rssRegion').value||'TW',query:$('query').value,ticker:$('ticker').value,sources:providers.filter(p=>$('source-'+p).checked),forceRefresh:$('forceRefresh').checked===true,dates:dates.state()};
      const ok=write('searchDraft',draft);$('searchDraftStatus').textContent=ok?'搜尋設定已自動保存在此瀏覽器。':'瀏覽器儲存不可用；重新整理後無法保留搜尋設定。';return ok;
    }
    for(const id of ['query','ticker','rssRegion','forceRefresh',...providers.map(p=>'source-'+p)])for(const event of ['input','change'])$(id).addEventListener(event,save);
    dates.onChange(save);save();return save;
  }
  function initFloatingPanel($,{key,panelId,bodyId,handleId,toggleId,resetId,onChange=()=>{}}){
    const panel=$(panelId),body=$(bodyId),handle=$(handleId),toggle=$(toggleId),stage=$('stage');
    const saved=read(key,{});let x=Number(saved?.x)||0,y=Number(saved?.y)||0,collapsed=saved?.collapsed===true,drag=null,suppressClick=false;
    const persist=()=>write(key,{x,y,collapsed});
    function constrain(){
      const area=stage.getBoundingClientRect(),rect=panel.getBoundingClientRect(),baseX=rect.left-x,baseY=rect.top-y;
      x=Math.max(area.left-baseX,Math.min(area.right-baseX-rect.width,x));
      y=Math.max(area.top-baseY,Math.min(area.bottom-baseY-Math.min(rect.height,area.height),y));
      panel.style.transform=`translate(${x}px,${y}px)`;onChange();
    }
    function paint(){body.hidden=collapsed;panel.classList.toggle('collapsed',collapsed);toggle.setAttribute('aria-expanded',String(!collapsed));handle.setAttribute('aria-expanded',String(!collapsed));panel.style.transform=`translate(${x}px,${y}px)`;constrain();}
    function fold(){const before=panel.getBoundingClientRect();collapsed=!collapsed;paint();const after=panel.getBoundingClientRect();x+=before.left-after.left;y+=before.top-after.top;panel.style.transform=`translate(${x}px,${y}px)`;constrain();persist();}
    toggle.onclick=fold;
    $(resetId).onclick=()=>{x=0;y=0;panel.style.transform='';persist();onChange();};
    handle.onclick=e=>{if(suppressClick&&e?.detail!==0){suppressClick=false;return;}if(collapsed)fold();};
    handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={id:e.pointerId,cx:e.clientX,cy:e.clientY,x,y,moved:false};handle.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();});
    handle.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;drag.moved ||= Math.hypot(e.clientX-drag.cx,e.clientY-drag.cy)>4;x=drag.x+e.clientX-drag.cx;y=drag.y+e.clientY-drag.cy;panel.style.transform=`translate(${x}px,${y}px)`;constrain();});
    const end=e=>{if(!drag||drag.id!==e.pointerId)return;suppressClick=drag.moved;if(suppressClick)setTimeout(()=>{suppressClick=false;},0);drag=null;if(handle.hasPointerCapture?.(e.pointerId))handle.releasePointerCapture(e.pointerId);persist();};
    for(const event of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(event,end);
    handle.addEventListener('keydown',e=>{const delta={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[e.key];if(!delta)return;e.preventDefault();x+=delta[0];y+=delta[1];panel.style.transform=`translate(${x}px,${y}px)`;constrain();persist();});
    if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(constrain);observer.observe(stage);observer.observe(panel);}
    paint();return {constrain,state:()=>({x,y,collapsed})};
  }
  const initSourcePanel=$=>initFloatingPanel($,{key:'sourcePanel',panelId:'sourcePanel',bodyId:'sourcePanelBody',handleId:'sourcePanelDrag',toggleId:'sourcePanelToggle',resetId:'sourcePanelReset'});
  const initTimePanel=($,onChange)=>initFloatingPanel($,{key:'timePanel',panelId:'timeFocusBar',bodyId:'timeFocusBody',handleId:'timePanelDrag',toggleId:'timePanelToggle',resetId:'timePanelReset',onChange});
  function initResize($,onResize){
    if(!document.documentElement?.style)return;
    const style=document.documentElement.style;
    const limits=()=>window.innerWidth<=700?{left:Math.min(520,window.innerWidth*.92),right:window.innerWidth}:{left:Math.max(220,Math.min(520,window.innerWidth-620)),right:Math.max(240,Math.min(620,window.innerWidth-620))};
    const widths={left:read('leftWidth',290),right:read('rightWidth',320)};
    function apply(side,value){const other=side==='left'?'right':'left';const available=window.innerWidth<=700?window.innerWidth*.92:window.innerWidth>1050?window.innerWidth-widths[other]-316:side==='left'?window.innerWidth-288:window.innerWidth*.9;const max=Math.min(limits()[side],available),min=side==='left'?(window.innerWidth<=700?260:220):240; widths[side]=Math.max(min,Math.min(max,Number(value)||min));style.setProperty('--'+side+'-width',widths[side]+'px');const handle=$(side==='left'?'resizeLeft':'resizeRight');handle.setAttribute('aria-valuemin',min);handle.setAttribute('aria-valuemax',max);handle.setAttribute('aria-valuenow',widths[side]);onResize?.();}
    for(const side of ['left','right']){const handle=$(side==='left'?'resizeLeft':'resizeRight');apply(side,widths[side]);
      let start=null;
      handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;start={x:e.clientX,width:widths[side]};handle.setPointerCapture(e.pointerId);document.body.classList.add('resizing');e.preventDefault();});
      handle.addEventListener('pointermove',e=>{if(start)apply(side,start.width+(e.clientX-start.x)*(side==='left'?1:-1));});
      const end=()=>{if(!start)return;start=null;document.body.classList.remove('resizing');write(side+'Width',widths[side]);};
      handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);handle.addEventListener('lostpointercapture',end);
      handle.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home'].includes(e.key))return;e.preventDefault();apply(side,e.key==='Home'?(side==='left'?290:320):widths[side]+(e.key==='ArrowRight'?20:-20)*(side==='left'?1:-1));write(side+'Width',widths[side]);});
    }
    window.addEventListener('resize',()=>{for(const side of ['left','right'])apply(side,widths[side]);});
  }
  const api={read,write,jsonTree,initKey,initSearch,initFloatingPanel,initSourcePanel,initTimePanel,initResize};root.AtlasUI=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
