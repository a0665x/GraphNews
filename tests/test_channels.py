import tempfile
import unittest
from pathlib import Path
from news_atlas.channels import definitions, classify
from news_atlas.model import article
from news_atlas.storage import Store
import server

class ChannelTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.path=Path(self.tmp.name)/'atlas.sqlite3'
        self.store=Store(self.path)
    def tearDown(self):self.tmp.cleanup()
    def test_multi_label_with_explanation(self):
        result=classify({'title':'新晶圓廠量產推升營收','summary':'company research'},definitions())
        self.assertTrue({'chip-manufacturing','production','financial-reports'}.issubset({c['id'] for c in result['channels']}))
        for c in result['channels']:
            self.assertTrue(c['evidence'])
            self.assertEqual(c['evidence'][0]['field'],'title' if c['id']!='products' else 'summary')
    def test_mixed_language_keywords_match_without_regex_expansion(self):
        result=classify({'title':'EPS成長，股價上漲'},definitions())
        self.assertIn('financial-reports',[c['id'] for c in result['channels']])
        self.assertIn('stock-prices',[c['id'] for c in result['channels']])

    def test_unknown_is_not_forced_into_company_channel(self):
        result=classify({'title':'Tesla weather forecast','summary':''},definitions())
        self.assertEqual(result['primary_channel'],'other')
        self.assertEqual(result['channels'][0]['evidence'],[])
    def test_custom_all_rule_update_delete_and_restart(self):
        saved=self.store.save_channel({'name':'機器人商業化','keywords':['robot','orders'],'match':'all'})
        channels=Store(self.path).list_channels()
        self.assertTrue(any(c['id']==saved['id'] for c in channels))
        self.assertNotIn(saved['id'],[c['id'] for c in classify({'title':'robot experiment'},channels)['channels']])
        hit=classify({'title':'Robot receives orders'},channels)
        self.assertIn(saved['id'],[c['id'] for c in hit['channels']])
        self.store.save_channel({**saved,'keywords':['humanoid'],'match':'any'})
        self.assertTrue(any(c['keywords']==['humanoid'] for c in self.store.list_channels()))
        self.assertTrue(self.store.delete_channel(saved['id']))
        self.assertFalse(any(c['id']==saved['id'] for c in Store(self.path).list_channels()))
    def test_validation_and_literal_keywords(self):
        with self.assertRaises(ValueError):self.store.save_channel({'name':'','keywords':['foo']})
        with self.assertRaises(ValueError):self.store.save_channel({'name':'x','keywords':[]})
        with self.assertRaises(ValueError):self.store.save_channel({'id':'production','name':'x','keywords':['x']})
        custom=self.store.save_channel({'name':'literal','keywords':['.*']})
        result=classify({'title':'unrelated story'},self.store.list_channels())
        self.assertNotIn(custom['id'],[c['id'] for c in result['channels']])
    def test_cross_budget_preserves_internal_relations(self):
        def row(provider,i):return article(provider,'Tesla production and earnings',f'https://example.com/{provider}/{i}',f'2026-01-{i+1:02}T00:00:00Z',symbols=['TSLA'])
        google=[row('google',i) for i in range(8)]
        massive=[row('massive',i) for i in range(8)]
        single=server.graph_payload(google)
        combined=server.graph_payload(google+massive)
        self.assertEqual(single['source_graphs']['google']['relations'],combined['source_graphs']['google']['relations'])
        self.assertTrue(combined['cross_relations'])
        self.assertTrue(all(set(e['cross_sources'])=={'google','massive'} for e in combined['cross_relations']))
        ids={a['id']:a['source']['provider'] for a in combined['articles']}
        self.assertTrue(all(ids[e['source']]!=ids[e['target']] for e in combined['cross_relations']))
    def test_timeline_snapshot_freezes_channel_rules_and_mode(self):
        custom=self.store.save_channel({'name':'Robot','keywords':['robot']})
        channels=self.store.list_channels()
        raw=article('google','Robot production earnings','https://example.com/robot','2026-01-02T00:00:00Z')
        graph=server.graph_payload([raw],channels)
        body={'search':{'query':'robot'},'view':{'sources':['google'],'separate':False,'positions':[], 'mode':'timeline','channel_filter':custom['id'],'channel_definitions':channels,'cutoff':'2026-01-03','timeline_zoom':2,'timeline_style':'density','exploration':{'depth':4,'crossMin':.65,'pathMin':.3}},'source_graphs':{'google':graph['source_graphs']['google']},'cross_relations':[]}
        saved=self.store.save_snapshot(body)
        self.store.delete_channel(custom['id'])
        result=Store(self.path).load_snapshot(saved['id'])
        self.assertEqual(result['view']['mode'],'timeline')
        self.assertEqual(result['view']['timeline_zoom'],2)
        self.assertTrue(any(c['id']==custom['id'] for c in result['view']['channel_definitions']))
        self.assertTrue(result['source_graphs']['google']['articles'][0]['channels'])
        self.assertEqual(result['view']['exploration']['depth'],4)
        self.assertEqual(result['view']['exploration']['crossMin'],.65)
        body['view']['exploration']['depth']=7
        with self.assertRaises(ValueError):self.store.save_snapshot(body)
        body['view']['exploration']['depth']=4
        body['view']['mode']='invalid'
        with self.assertRaises(ValueError):self.store.save_snapshot(body)

if __name__=='__main__':unittest.main()
