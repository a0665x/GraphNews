import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit,parse_qs
from news_atlas import providers,search
from news_atlas.storage import Store

RSS=b'<rss><channel><item><title>Market news</title><link>https://example.com/news</link><pubDate>Fri, 02 Jan 2026 10:00:00 GMT</pubDate><source>Publisher</source></item></channel></rss>'

class RegionTests(unittest.TestCase):
    def test_selection_is_validated_and_scopes_cache(self):
        req=search.normalize_request({'query':'robot','sources':['google','yahoo'],'rss_region':'JP'})
        self.assertEqual(req.get('rss_region'),'JP')
        for bad in ['XX','jp',{},42]:
            with self.assertRaises(ValueError):search.normalize_request({'query':'robot','sources':['google'],'rss_region':bad})
        for source in ['google','yahoo']:
            self.assertNotEqual(search.query_key(source,'robot','TW'),search.query_key(source,'robot','US'))
        self.assertEqual(search.query_key('massive','NVDA','TW'),search.query_key('massive','NVDA','US'))

    def test_both_rss_providers_share_edition_and_yahoo_domain(self):
        for source in ['google','yahoo']:
            with patch('news_atlas.providers.fetch',return_value=RSS) as fetch:
                batch=providers.acquire(source,'robot','',[('2026-01-01','2026-01-03')],rss_region='TW')
            self.assertIsNone(batch.error)
            args=parse_qs(urlsplit(fetch.call_args.args[0]).query)
            self.assertEqual(args['gl'],['TW']);self.assertEqual(args['hl'],['zh-TW'])
            if source=='yahoo':self.assertIn('site:tw.news.yahoo.com',args['q'][0])
            self.assertEqual(batch.rows[0]['source']['country'],'TW')
            self.assertEqual(batch.rows[0]['source']['language'],'zh-TW')
            self.assertIsNone(batch.rows[0]['language'],'Feed edition is not article language detection')

    def test_same_url_retains_per_query_origin_and_cache_isolation(self):
        with tempfile.TemporaryDirectory() as folder:
            store=Store(Path(folder)/'news.sqlite3')
            with patch('news_atlas.providers.fetch',return_value=RSS) as fetch:
                for country in ['TW','US']:
                    result=search.search_source('google','robot','','',start='2026-01-01',end='2026-01-03',store=store,rss_region=country)
                    self.assertEqual(result['articles'][0]['source']['country'],country)
                self.assertEqual(fetch.call_count,2,'Second edition must fetch its own coverage')
                again=search.search_source('google','robot','','',start='2026-01-01',end='2026-01-03',store=store,rss_region='TW')
                self.assertEqual(fetch.call_count,2);self.assertTrue(again['cache']['reused'])
            loaded=Store(store.path).read('google',search.query_key('google','robot','TW'),'2026-01-01','2026-01-03')[0]
            self.assertEqual(loaded['source']['country'],'TW')
            self.assertEqual({o['country'] for o in loaded['origins']},{'TW','US'})
            self.assertEqual(again['articles'][0]['source']['country'],'TW')

    def test_existing_database_adds_context_table_without_rewriting_old_news(self):
        with tempfile.TemporaryDirectory() as folder:
            store=Store(Path(folder)/'news.sqlite3')
            old=providers.article('google','Old article','https://example.com/old','2026-01-02')
            store.save('google','old-query',[old],[])
            with store.connection() as db:
                db.execute('DROP TABLE membership_origins')
                db.execute('PRAGMA user_version=3')
            reopened=Store(store.path)
            self.assertEqual(reopened.read('google','old-query','2026-01-01','2026-01-03')[0]['source'],old['source'])
            with reopened.connection() as db:self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0],4)
            newer=copy.deepcopy(old);newer['source']['country']='US'
            reopened.save('google','new-US-query',[newer],[])
            self.assertEqual(reopened.read('google','old-query','2026-01-01','2026-01-03')[0]['source'],old['source'],'New country must not relabel a legacy membership')

    def test_shared_url_concurrent_editions_keep_all_origins(self):
        from concurrent.futures import ThreadPoolExecutor
        import threading
        with tempfile.TemporaryDirectory() as folder:
            store=Store(Path(folder)/'news.sqlite3');barrier=threading.Barrier(5)
            def save(region):
                row=providers.article('google','Same URL','https://example.com/shared','2026-01-02')
                row['source']['country']=region;barrier.wait()
                store.save('google',search.query_key('google','robot',region),[row],[])
            with ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(save,['TW','US','JP','HK','GB']))
            row=store.read('google',search.query_key('google','robot','JP'),'2026-01-01','2026-01-03')[0]
            self.assertEqual(row['source']['country'],'JP')
            self.assertEqual({o['country'] for o in row['origins']},{'TW','US','JP','HK','GB'})

if __name__=='__main__':unittest.main()
