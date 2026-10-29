import json
import os
import stat
import unittest
from unittest.mock import patch
import test_server

class CredentialsTests(unittest.TestCase):
    setUp=test_server.HTTPTests.setUp
    tearDown=test_server.HTTPTests.tearDown
    request=test_server.HTTPTests.request
    def test_recorded_key_survives_reload_and_never_leaks(self):
        key='isolated-test-key'
        head,body=self.request('POST','/api/settings/massive-key',{'key':key})
        self.assertIn(b'200 OK',head)
        self.assertNotIn(key,body.decode())
        with patch.dict(os.environ,{'MASSIVE_API_KEY':''}):
            _,body=self.request('GET','/api/status')
            self.assertTrue(json.loads(body)['massive_configured'])
            self.assertNotIn(key,body.decode())
            with patch('server.search_events',return_value=iter([{'type':'done'}])) as events:
                self.request('POST','/api/search/result',{'query':'NVDA','ticker':'NVDA','sources':['massive']})
                self.assertEqual(events.call_args.args[1],key)
            head,_=self.request('DELETE','/api/settings/massive-key')
            self.assertIn(b'200 OK',head)
            _,body=self.request('GET','/api/status');self.assertFalse(json.loads(body)['massive_configured'])
        with self.store.connection() as db:
            self.assertNotIn(key,'\n'.join(db.iterdump()))

    def test_key_is_private_and_invalid_input_preserves_previous(self):
        from news_atlas.credentials import key_path
        self.request('POST','/api/settings/massive-key',{'key':'valid-test-key'})
        path=key_path(self.store.path)
        self.assertEqual(stat.S_IMODE(path.stat().st_mode),0o600)
        self.assertEqual(stat.S_IMODE(path.parent.stat().st_mode),0o700)
        for value in ['',None,{},'bad\nkey','x'*513]:
            head,_=self.request('POST','/api/settings/massive-key',{'key':value});self.assertIn(b'400',head)
        self.assertEqual(path.read_text(),'valid-test-key')
        head,_=self.request('GET','/data/private/'+path.name);self.assertIn(b'404',head)

if __name__=='__main__':unittest.main()
