#!/usr/bin/env python3
"""Local News Atlas HTTP server; no credentials are persisted."""
import concurrent.futures
import datetime as dt
import json
import os
import queue
import itertools
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from news_atlas.model import SCHEMA_VERSION, article, clean, timestamp, deduplicate, build_relations
from news_atlas.search import normalize_request, query_key, search_source
from news_atlas.storage import Store
from news_atlas.channels import definitions, annotate, classify, version as channel_version

ROOT = Path(__file__).resolve().parent
MAX_GRAPH_ARTICLES = 800

def graph_payload(rows, channels=None):
    channels = channels or definitions()
    all_rows = annotate(deduplicate(rows), channels)
    shown = all_rows[:MAX_GRAPH_ARTICLES]
    source_graphs = {}
    for provider in ('google', 'yahoo', 'massive'):
        own = annotate(deduplicate([r for r in rows if r['source']['provider'] == provider]), channels)
        subset = own[:MAX_GRAPH_ARTICLES]
        source_graphs[provider] = {'articles': subset, 'relations': build_relations(subset), 'total_articles': len(own)}
    # Separate cross-source budgets preserve all existing within-source relations.
    cross = {}
    for left, right in itertools.combinations(source_graphs,2):
        a,b = source_graphs[left]['articles'],source_graphs[right]['articles']
        if not a or not b:
            continue
        candidates=deduplicate([r for pair in itertools.zip_longest(a,b) for r in pair if r][:MAX_GRAPH_ARTICLES])
        for edge in build_relations(candidates, max_neighbors=2, cross_only=True):
            cross[tuple(sorted((edge['source'],edge['target'])))]={**edge,'cross_sources':[left,right]}
    return {'schema_version': SCHEMA_VERSION, 'articles': shown, 'relations': build_relations(shown),
            'source_graphs': source_graphs, 'cross_relations': list(cross.values()),
            'channel_definitions': channels, 'channel_version': channel_version(channels),
            'total_articles': len(all_rows), 'display_limit': MAX_GRAPH_ARTICLES,
            'relation_note': '規則關聯並非因果；分數為排序用啟發式指標，不是機率。'}

def search_events(request, key, store):
    start_time = time.monotonic()
    by_source = {}
    for source in request['sources']:
        term = request['ticker'] if source == 'massive' else request['query']
        by_source[source] = store.read(source, query_key(source, term), request['start'], request['end'])
    yield {'type': 'cache', 'graph': graph_payload([a for rows in by_source.values() for a in rows], store.list_channels()),
           'counts': {s: len(rows) for s, rows in by_source.items()},
           'message': '檢查日期覆蓋'}
    events = queue.Queue()
    def work(source):
        def progress(message):
            events.put({'type': 'status', 'source': source, **(message if isinstance(message, dict) else {'message': message})})
        try:
            if source == 'massive' and not request['ticker']:
                events.put({'type': 'source', 'source': source, 'articles': [], 'error': '未填股票代碼，已略過', 'error_code': 'missing_ticker'})
                return
            result = search_source(source, request['query'], request['ticker'], key, request['start'], request['end'], store, request['force_refresh'], progress)
        except Exception:
            # Deliberately exclude exception text that might contain request URLs or keys.
            result = {'source': source, 'articles': by_source[source], 'error': '資料處理失敗；已保留本地結果，請稍後重試', 'error_code': 'internal'}
        events.put({'type': 'source', **result})
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for source in request['sources']:
            pool.submit(work, source)
        completed = 0
        while completed < len(request['sources']):
            try:
                event = events.get(timeout=5)
            except queue.Empty:
                yield {'type': 'heartbeat', 'elapsed': round(time.monotonic() - start_time)}
                continue
            if event['type'] == 'source':
                completed += 1
                by_source[event['source']] = event['articles']
                event.update(completed=completed, total=len(request['sources']),
                             graph=graph_payload([a for rows in by_source.values() for a in rows], store.list_channels()))
            yield event
    yield {'type': 'done', 'elapsed': round(time.monotonic() - start_time), 'db': store.stats()}

class Handler(BaseHTTPRequestHandler):
    @property
    def store(self):
        return self.server.store

    def json_response(self, code, payload):
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path).path
        if path == '/api/status':
            self.json_response(200, {'schema_version': SCHEMA_VERSION, 'db': self.store.stats(), 'massive_configured': bool(os.environ.get('MASSIVE_API_KEY'))})
            return
        if path == '/api/channels':
            channels = self.store.list_channels()
            self.json_response(200, {'channels':channels,'version':channel_version(channels)})
            return
        if path == '/api/snapshots':
            self.json_response(200, {'snapshots': self.store.list_snapshots()})
            return
        if path.startswith('/api/snapshots/'):
            saved = self.store.load_snapshot(path.rsplit('/',1)[-1])
            self.json_response(200 if saved else 404, saved or {'error':'快照不存在'})
            return
        files = {'/': ('dist/index.html', 'text/html; charset=utf-8'), '/3d-force-graph.min.js': ('dist/3d-force-graph.min.js', 'text/javascript; charset=utf-8'), '/app.js': ('dist/app.js', 'text/javascript; charset=utf-8'), '/graph-view.js': ('dist/graph-view.js', 'text/javascript; charset=utf-8'), '/timeline.js': ('dist/timeline.js', 'text/javascript; charset=utf-8')}
        if path not in files:
            self.send_error(404)
            return
        name, mime = files[path]
        data = (ROOT / name).read_bytes()
        self.send_response(200)
        for k, v in [('Content-Type', mime), ('Content-Length', str(len(data))), ('X-Content-Type-Options', 'nosniff'), ('Cache-Control', 'no-cache')]:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def do_DELETE(self):
        path=urllib.parse.urlsplit(self.path).path
        if not path.startswith('/api/channels/custom-'):
            self.json_response(404, {'error':'自訂 channel 不存在'})
            return
        removed=self.store.delete_channel(path.rsplit('/',1)[-1])
        self.json_response(200 if removed else 404, {'channels':self.store.list_channels()} if removed else {'error':'自訂 channel 不存在'})

    def do_POST(self):
        if self.path not in ('/api/search', '/api/snapshots', '/api/channels', '/api/classify'):
            self.send_error(404)
            return
        if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
            self.json_response(415, {'error': '需要 application/json'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= (12000000 if self.path in ('/api/snapshots','/api/classify') else 16384):
                raise ValueError('搜尋內容大小錯誤')
            body = json.loads(self.rfile.read(length))
            if self.path == '/api/channels':
                saved = self.store.save_channel(body)
                self.json_response(200, {'channel':saved,'channels':self.store.list_channels()})
                return
            if self.path == '/api/classify':
                rows = body.get('articles') if isinstance(body,dict) else None
                if not isinstance(rows,list) or len(rows)>2400 or any(not isinstance(r,dict) or not isinstance(r.get('id'),str) or len(r['id'])>100 or not isinstance(r.get('title'),str) or len(r['title'])>2000 or not isinstance(r.get('summary',''),str) or len(r.get('summary',''))>12000 for r in rows):
                    raise ValueError('重新分類的文章格式或數量不正確')
                channels=self.store.list_channels()
                self.json_response(200, {'annotations':[{"id":r['id'],**classify(r,channels)} for r in rows],'channels':channels,'version':channel_version(channels)})
                return
            if self.path == '/api/snapshots':
                saved = self.store.save_snapshot(body)
                self.json_response(201, {**saved, 'db': self.store.stats()})
                return
            request = normalize_request(body)
            key = str(body.get('massive_key', '')).strip() or os.environ.get('MASSIVE_API_KEY', '')
            if len(key) > 512 or any(ord(c) < 32 or ord(c) > 126 for c in key):
                raise ValueError('API key 格式不正確')
        except (ValueError, TypeError, OverflowError) as exc:
            self.json_response(400, {'error': str(exc) if not isinstance(exc, json.JSONDecodeError) else '無效 JSON'})
            return
        self.send_response(200)
        self.send_header('Content-Type', 'application/x-ndjson; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Accel-Buffering', 'no')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        try:
            for event in search_events(request, key, self.store):
                self.wfile.write((json.dumps(event, ensure_ascii=False) + '\n').encode())
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass

if __name__ == '__main__':
    store = Store()
    port = int(os.environ.get('PORT', '8765'))
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.store = store
    print(f'News Atlas: http://127.0.0.1:{port}\nSQLite: {store.path}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
