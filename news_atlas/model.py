"""Source-independent article normalization and evidence-based relation rules."""
import datetime as dt
import email.utils
import hashlib
import html
import re
import urllib.parse

SCHEMA_VERSION = '2.0'
TICKER = re.compile(r'^[A-Za-z0-9][A-Za-z0-9.\-^]{0,19}$')
ENTITY_ALIASES = {
    'TSLA': ('Tesla', '特斯拉'), 'NVDA': ('NVIDIA', '輝達', '英伟达', '英偉達'),
    'AAPL': ('Apple', '蘋果', '苹果'), 'MSFT': ('Microsoft', '微軟', '微软'),
    'GOOGL': ('Google', 'Alphabet', '谷歌'), 'AMZN': ('Amazon', '亞馬遜', '亚马逊'),
    'META': ('Meta Platforms', 'Facebook', '臉書'), 'AMD': ('Advanced Micro Devices', '超微'),
    'TSM': ('TSMC', '台積電', '台积电', '2330.TW'), 'ASML': ('艾司摩爾', '艾司摩尔'),
    'NFLX': ('Netflix', '網飛'), 'BYD': ('比亞迪', '比亚迪'),
}
TOPICS = {
    'earnings': ('財報', '财报', 'earnings', 'revenue', '營收', '营收'),
    'ev': ('電動車', '电动车', 'electric vehicle', 'EV', 'autonomous', '自動駕駛', '自动驾驶'),
    'ai': ('人工智慧', '人工智能', 'AI', 'large language model', '大模型'),
    'chips': ('semiconductor', '半導體', '半导体', 'chip', 'GPU', '晶片', '芯片'),
    'energy': ('電力', '电力', 'energy', '能源', '電網', '电网'),
    'rates': ('interest rate', '利率', '降息', '升息', 'Federal Reserve', '聯準會'),
}
TOPIC_LABELS = {'earnings': '財報／營收', 'ev': '電動車／自駕', 'ai': '人工智慧', 'chips': '半導體', 'energy': '能源', 'rates': '利率'}

def clean(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', str(value or '')))).strip()

def timestamp(value):
    if not value:
        return None
    try:
        parsed = email.utils.parsedate_to_datetime(value) if ',' in value else dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.astimezone(dt.timezone.utc).isoformat().replace('+00:00', 'Z')
    except (ValueError, TypeError, OverflowError, AttributeError):
        return None

def canonical_url(value):
    try:
        p = urllib.parse.urlsplit(value)
        if p.scheme not in ('http', 'https') or not p.hostname or p.username or p.password:
            return None
        pairs = [(k, v) for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=True)
                 if not k.lower().startswith('utm_') and k.lower() not in ('fbclid', 'gclid', 'guccounter')]
        return urllib.parse.urlunsplit((p.scheme, p.netloc.lower(), p.path or '/', urllib.parse.urlencode(sorted(pairs)), ''))
    except (ValueError, TypeError):
        return None

def article(provider, title, url, published, publisher='', summary='', symbols=None):
    title, url = clean(title), canonical_url(url)
    if not title or not url:
        return None
    return {'id': hashlib.sha256(url.encode()).hexdigest()[:24], 'title': title[:2000], 'summary': clean(summary)[:12000],
            'url': url, 'published_at': timestamp(published), 'source': {'provider': provider, 'publisher': clean(publisher)},
            'symbols': sorted({s.upper() for s in (symbols or []) if isinstance(s, str) and TICKER.fullmatch(s)}),
            'language': None, 'fetched_at': dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00', 'Z')}

def mention(text, alias):
    # ASCII aliases need word boundaries; Chinese names need literal matching.
    pattern = re.escape(alias)
    if alias.isascii():
        pattern = r'(?<![A-Za-z0-9_])' + pattern + r'(?![A-Za-z0-9_])'
    match = re.search(pattern, text, re.I)
    return match.group(0) if match else None

def enrich(raw):
    result = dict(raw)
    entities = {}
    for symbol in raw.get('symbols', []):
        canonical = 'TSM' if symbol == '2330.TW' else symbol
        entities[canonical] = {'id': canonical, 'label': canonical, 'method': 'provider_ticker', 'evidence': symbol}
    for symbol, aliases in ENTITY_ALIASES.items():
        if symbol in entities:
            continue
        for field in ('title', 'summary'):
            hit = next((m for alias in (symbol, *aliases) if (m := mention(raw.get(field, ''), alias))), None)
            if hit:
                entities[symbol] = {'id': symbol, 'label': aliases[0] if aliases else symbol,
                                    'method': 'text_alias', 'field': field, 'evidence': hit}
                break
    topics = []
    text = raw['title'] + ' ' + raw.get('summary', '')
    for topic, aliases in TOPICS.items():
        hits = [m for alias in aliases if (m := mention(text, alias))]
        if hits:
            topics.append({'id': topic, 'label': TOPIC_LABELS[topic], 'evidence': hits})
    result.update(entities=list(entities.values()), topics=topics, analysis_version='rules-v1')
    return result

def deduplicate(rows):
    """Merge identical URLs only; keep publisher and provider provenance."""
    unique = {}
    for raw in rows:
        key = canonical_url(raw['url'])
        if key not in unique:
            unique[key] = {**raw, 'symbols': list(raw.get('symbols', [])), 'origins': list(raw.get('origins', [raw['source']]))}
        else:
            existing = unique[key]
            existing['symbols'] = sorted(set(existing['symbols']) | set(raw.get('symbols', [])))
            for origin in raw.get('origins', [raw['source']]):
                if origin not in existing['origins']:
                    existing['origins'].append(origin)
            if len(raw.get('summary', '')) > len(existing.get('summary', '')):
                existing['summary'] = raw['summary']
    return [enrich(row) for row in sorted(unique.values(), key=lambda a: (a.get('published_at') or '', a['id']), reverse=True)]

def title_tokens(title):
    stop = {'the', 'and', 'for', 'with', 'from', 'this', 'that', 'news', 'yahoo', 'finance', 'stock', 'stocks', 'shares', 'will', 'after'}
    tokens = set(re.findall(r'[a-z0-9]{3,}', title.lower())) - stop
    for run in re.findall(r'[\u3400-\u9fff]+', title):
        tokens.update(run[i:i+2] for i in range(len(run)-1))
    return tokens

def build_relations(rows, max_neighbors=6, cross_only=False):
    # All candidate pairs are considered; keep strongest edges first with bounded degree.
    candidates, degree = [], {}
    features = [(r, {e['id']: e for e in r['entities']}, {t['id'] for t in r['topics']}, title_tokens(r['title'])) for r in rows]
    for i, (a, ae, at, aw) in enumerate(features):
        if not a.get('published_at'):
            continue
        for b, be, bt, bw in features[i+1:]:
            if cross_only:
                a_sources = {s['provider'] for s in a.get('origins',[a['source']])}
                b_sources = {s['provider'] for s in b.get('origins',[b['source']])}
                if a_sources & b_sources:
                    continue
            if not b.get('published_at'):
                continue
            days = abs((dt.datetime.fromisoformat(a['published_at'].replace('Z', '+00:00')) - dt.datetime.fromisoformat(b['published_at'].replace('Z', '+00:00'))).total_seconds()) / 86400
            if days > 30:
                continue
            common = sorted(ae.keys() & be.keys())
            overlap = aw & bw
            similarity = len(overlap) / max(1, len(aw | bw))
            topics = sorted(at & bt)
            if common:
                kind, score = 'shared_entity', .72 + min(.2, .07 * len(common))
                evidence = [{'entity': entity, 'source': ae[entity], 'target': be[entity]} for entity in common]
            elif days <= 7 and topics and len(overlap) >= 2 and similarity >= .18:
                kind, score = 'shared_topic', .40 + min(.25, similarity)
                evidence = [{'topics': topics, 'title_terms': sorted(overlap)[:12], 'title_similarity': round(similarity, 3)}]
            elif days <= 3 and len(overlap) >= 4 and similarity >= .5:
                kind, score = 'similar_title', .45 + min(.3, similarity / 2)
                evidence = [{'title_terms': sorted(overlap)[:12], 'title_similarity': round(similarity, 3)}]
            else:
                continue
            candidates.append({'id': a['id'] + ':' + b['id'], 'source': a['id'], 'target': b['id'], 'type': kind,
                               'weight': round(score, 3), 'method': 'rules-v1', 'evidence': evidence, 'days_apart': round(days, 2)})
    result = []
    for edge in sorted(candidates, key=lambda e: (-e['weight'], e['days_apart'], e['id'])):
        if degree.get(edge['source'], 0) >= max_neighbors or degree.get(edge['target'], 0) >= max_neighbors:
            continue
        result.append(edge)
        for key in (edge['source'], edge['target']):
            degree[key] = degree.get(key, 0) + 1
    return result
