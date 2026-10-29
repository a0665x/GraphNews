"""Application-facing operations independent of any browser session."""
import json
from pathlib import Path
from . import exploration
from .channels import annotate
from .model import article, canonical_url, timestamp
from .search import normalize_request,query_key
from .snapshots import validate_snapshot
from .regions import REGIONS

SCHEMA_PATH=Path(__file__).resolve().parent.parent/'schema/news-atlas.schema.json'
POST_PATHS=('/api/cache/graph','/api/normalize','/api/graph/build','/api/graph/filter','/api/graph/explore','/api/timeline','/api/view/validate')

def capabilities():
    return {'schema_version':'2.0','limits':{**exploration.LIMITS,'search_days':366,'requests_per_source':12},
      'rss_regions':REGIONS,'rss_region_ui_default':'TW','sources':{'google':{'transport':'google_news_rss','region_selectable':True},'yahoo':{'transport':'google_news_rss','region_selectable':True},'massive':{'transport':'massive_rest','ticker_required':True}},
      'visualization':{'modes':['network','timeline_density','timeline_nodes'],'source_filters':True,'mixed_sources':True,'separate_sources':True,'physics_drag':True,'ctrl_pan':True,'depth_glow':True,'compact_draggable_panels':True,'direct_curve_width':True,'adaptive_stickiness':True,'locked_roots':True,'keyword_multi_root':True,'timeline_channels':True,'time_cutoff':True,'custom_channels':True,'json_inspector':True,'snapshot_restore':True,'ui_languages':['zh-Hant','en'],'timeline_root_sync':True,'time_focus':True,'node_size':'optional UTC date lens: radius 1–12x base, default Gaussian with directly sculptable local curve (129-point profile); perspective compensation ramps from maximum gain 2x to 8x; mesh scale updated per render; missing dates retain base size; disable for constant size'},
      'credential_storage':{'remembered_host_key':True,'returned_in_api':False,'news_db':False},'browser_only':['camera position, pointer/keyboard gestures, panel widths; REST returns data and view state, not remote DOM control'],
      'openapi':'/openapi.json','docs':'/docs','mcp':'operationId and x-mcp annotations describe candidate tools; this is REST, not an MCP transport'}

def dispatch(path,body,store,build):
    if path=='/api/cache/graph':
        req=normalize_request(body);rows=[];coverage={}
        for provider in req['sources']:
            key=query_key(provider,req['ticker'] if provider=='massive' else req['query'],req.get('rss_region'))
            rows.extend(store.read(provider,key,req['start'],req['end']))
            fresh,gaps=store.coverage(provider,key,req['start'],req['end'])
            coverage[provider]={'fresh_days':fresh,'missing_ranges':gaps,'end_exclusive':req['end']}
        return {'graph':build(rows,store.list_channels()),'coverage':coverage,'network_requests':0}
    if path=='/api/normalize':
        rows=body.get('articles')
        if not isinstance(rows,list) or len(rows)>800: raise ValueError('articles 最多 800 筆')
        result=[];rejected=[]
        for index,row in enumerate(rows):
            if not isinstance(row,dict) or row.get('provider') not in ('google','yahoo','massive') or not isinstance(row.get('title'),str) or not isinstance(row.get('url'),str) or not isinstance(row.get('published_at'),str) or not isinstance(row.get('symbols',[]),list): raise ValueError('無效原始文章格式')
            normalized=article(row['provider'],row['title'],row['url'],row['published_at'],row.get('publisher',''),row.get('summary',''),row.get('symbols',[]))
            if normalized and normalized['published_at']: result.append(normalized)
            else: rejected.append({'index':index,'reason':'標題、網址或日期無效'})
        from .model import deduplicate
        return {'schema_version':'2.0','articles':annotate(deduplicate(result),store.list_channels()),'rejected':rejected,'persisted':False}
    if path=='/api/view/validate': return validate_snapshot(body)
    if path=='/api/graph/explore': return exploration.explore(body)
    if path=='/api/graph/build':
        graph=exploration.graph_input({'articles':body.get('articles'),'relations':[]})
        if any(not canonical_url(a.get('url')) or not isinstance(a.get('published_at'),str) or not timestamp(a['published_at']) for a in graph['articles']): raise ValueError('建立圖譜需要網址與發布日期')
        return build(graph['articles'],store.list_channels())
    graph=exploration.filter_graph(exploration.graph_input(body.get('graph')),body.get('filters'))
    if path=='/api/graph/filter': return graph
    if path=='/api/timeline': return exploration.timeline(graph,(body.get('filters') or {}).get('channel','all'))
    raise ValueError('未知 operation')
