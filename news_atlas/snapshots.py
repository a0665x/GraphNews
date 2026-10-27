"""Validate explicit saved views, keeping source partitions separate from acquisition cache."""
import math
import datetime as dt
import re
from .model import canonical_url

PROVIDERS = ('google', 'yahoo', 'massive')
ARTICLE_FIELDS = ('id','title','summary','url','published_at','source','symbols','language','fetched_at','entities','topics','analysis_version','origins','channels','primary_channel','channel_version')
EDGE_FIELDS = ('id','source','target','type','weight','method','evidence','days_apart','cross_sources')

def validate_snapshot(body):
    if not isinstance(body, dict):
        raise ValueError('快照必須是 JSON object')
    view = body.get('view', {})
    sources = view.get('sources') if isinstance(view, dict) else None
    if not isinstance(sources, list) or not sources or len(sources)>3 or any(s not in PROVIDERS for s in sources) or len(set(sources)) != len(sources):
        raise ValueError('請選擇要儲存的來源')
    if not isinstance(view.get('separate'), bool):
        raise ValueError('無效圖譜模式')
    groups = body.get('source_graphs', {})
    if not isinstance(groups, dict) or set(groups) != set(sources):
        raise ValueError('快照來源與圖譜來源不一致')
    normalized, all_ids = {}, set()
    for provider in sources:
        group = groups[provider]
        if not isinstance(group, dict) or not isinstance(group.get('articles'), list) or len(group['articles']) > 800:
            raise ValueError('每個來源最多儲存 800 篇新聞')
        articles, ids = [], set()
        for row in group['articles']:
            if not isinstance(row, dict) or not re.fullmatch(r'[a-f0-9]{24}', str(row.get('id',''))) or row['id'] in ids:
                raise ValueError('文章 ID 格式錯誤或重複')
            if not isinstance(row.get('source'), dict) or row['source'].get('provider') != provider:
                raise ValueError('文章來源不符合分組')
            if not isinstance(row.get('title'), str) or not row['title'] or not canonical_url(row.get('url')):
                raise ValueError('文章缺少標題或有效網址')
            ids.add(row['id'])
            articles.append({k: row[k] for k in ARTICLE_FIELDS if k in row})
        relations = validate_edges(group.get('relations', []), ids)
        normalized[provider] = {'articles': articles, 'relations': relations, 'total_articles': len(articles)}
        all_ids.update(ids)
    if not all_ids:
        raise ValueError('目前沒有可儲存的新聞')
    cross = validate_edges(body.get('cross_relations', []), all_ids)
    if view['separate'] and cross:
        raise ValueError('來源分組模式不能包含跨來源連線')
    positions = []
    valid_view_ids = {f'{p}::{a["id"]}' for p, g in normalized.items() for a in g['articles']} if view['separate'] else all_ids
    for pos in view.get('positions', []):
        if not isinstance(pos, dict) or pos.get('id') not in valid_view_ids:
            raise ValueError('節點位置參照無效')
        coords = [pos.get(k) for k in ('x','y','z')]
        if not all(isinstance(v,(int,float)) and math.isfinite(v) and abs(v)<=1e6 for v in coords):
            raise ValueError('節點位置超出範圍')
        positions.append({k: pos[k] for k in ('id','x','y','z')})
    mode=view.get('mode','network')
    if mode not in ('network','timeline'):
        raise ValueError('無效呈現模式')
    channel_defs=view.get('channel_definitions',[])
    if not isinstance(channel_defs,list) or len(channel_defs)>32:
        raise ValueError('Channel 定義數量錯誤')
    from .channels import validate_custom, OTHER
    frozen_defs=[]
    for definition in channel_defs:
        if not isinstance(definition,dict) or not isinstance(definition.get('id'),str) or not re.fullmatch(r'[a-z0-9-]{1,60}',definition['id']):
            raise ValueError('Channel ID 格式錯誤')
        normalized_def=dict(OTHER) if definition['id']=='other' else validate_custom(definition)
        normalized_def.update(id=definition['id'],builtin=bool(definition.get('builtin',False)))
        frozen_defs.append(normalized_def)
    if len({d['id'] for d in frozen_defs}) != len(frozen_defs):
        raise ValueError('Channel ID 重複')
    channel_filter=view.get('channel_filter','all')
    if channel_filter!='all' and channel_filter not in {d['id'] for d in frozen_defs}:
        raise ValueError('分類篩選不在快照定義內')
    cutoff=view.get('cutoff')
    if cutoff is not None:
        if not isinstance(cutoff,str):
            raise ValueError('時間軸截止日格式錯誤')
        cutoff=dt.date.fromisoformat(cutoff).isoformat()
    zoom=view.get('timeline_zoom',1)
    if not isinstance(zoom,(int,float)) or not math.isfinite(zoom) or not 1<=zoom<=4:
        raise ValueError('時間軸縮放值錯誤')
    search = body.get('search', {})
    if not isinstance(search,dict):
        raise ValueError('搜尋資訊格式錯誤')
    # Never persist credentials, request headers or arbitrary form fields.
    search = {k: str(search[k])[:200] for k in ('query','ticker','start','end') if k in search}
    return {'name': str(body.get('name') or search.get('query') or search.get('ticker') or '新聞圖譜')[:120],
            'search': search, 'view': {'sources': sources, 'separate': view['separate'], 'positions': positions, 'mode':mode, 'channel_filter':channel_filter, 'cutoff':cutoff, 'timeline_zoom':zoom, 'channel_definitions':frozen_defs},
            'source_graphs': normalized, 'cross_relations': cross}

def validate_edges(edges, ids):
    if not isinstance(edges,list) or len(edges)>6000:
        raise ValueError('快照關聯數量超過限制')
    out, seen = [], set()
    for edge in edges:
        if not isinstance(edge,dict) or edge.get('source') not in ids or edge.get('target') not in ids or edge['source']==edge['target']:
            raise ValueError('關聯參照不存在的節點')
        if not isinstance(edge.get('id'),str) or len(edge['id'])>150 or edge['id'] in seen:
            raise ValueError('關聯 ID 錯誤或重複')
        if edge.get('type') not in ('shared_entity','shared_topic','similar_title') or not isinstance(edge.get('evidence'),list):
            raise ValueError('關聯類型或依據格式錯誤')
        seen.add(edge['id'])
        out.append({k:edge[k] for k in EDGE_FIELDS if k in edge})
    return out
