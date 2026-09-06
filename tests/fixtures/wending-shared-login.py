"""Shared login regressions: synthetic API only, no remote calls or real credentials."""
import importlib.util
import json
import os
from pathlib import Path
import socket
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('existing_login_tests', Path(__file__).with_name('wending-login-flow.py'))
existing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(existing)
module, config = existing.module, existing.config

class SharedLoginTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='stable-shared-login-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.env = patch.dict(os.environ, {'WENDING_SHARED_AUTH_DIR': str(self.root/'auth'), 'WENDING_SESSION_LOCK_DIR': str(self.root/'locks'), 'WENDING_CONFIG_DIR': str(self.root/'a')})
        self.env.start(); self.addCleanup(self.env.stop)
        self.api = existing.FakeAPI()
        self.flow = self.open('a')

    def open(self, task):
        config.CONFIG_DIR = self.root/task
        config.CONFIG_FILE = config.CONFIG_DIR/'config.json'
        flow = module.LoginFlow(self.api)
        flow.handle('check', {})
        return flow

    def authorize(self):
        self.flow.handle('send', {'channel':'0','mobile':existing.MOBILE})
        return self.flow.handle('verify', {'code':existing.CODE})

    def choose(self, flow, index):
        result = flow.handle('brand', {'id':flow.state['brands'][index]['id']})
        self.assertNotIn('error', result)
        self.assertEqual(result['phase'],'ready')
        return result

    def test_once_login_new_conversation_restart_and_switch_never_send_another_sms(self):
        self.authorize(); self.choose(self.flow,0)
        a_config=(self.root/'a'/'config.json').read_bytes()
        second=self.open('b')
        self.assertEqual(second.state['phase'],'choose_brand')
        self.choose(second,1)
        self.assertEqual((self.root/'a'/'config.json').read_bytes(),a_config)
        restored=self.open('a')
        self.assertEqual(restored.state['phase'],'ready')
        self.assertEqual(restored.state['brandLabel'],'测试品牌 A')
        options=restored.handle('brands',{})
        self.assertEqual(options['phase'],'choose_brand')
        self.choose(restored,1)
        self.assertEqual(self.open('a').state['brandLabel'],'测试品牌 B')
        calls=[name for name,_ in self.api.calls]
        self.assertEqual(calls.count('third_login_send_verify_code'),1)
        self.assertEqual(calls.count('third_login_auth'),1)
        for task in ('a','b'):
            raw=json.loads((self.root/task/'config.json').read_text())
            self.assertNotIn('wnToken',raw)
        self.assertEqual(config.load_shared_auth()['wnToken'],existing.AUTH)

    def test_cancel_after_authorization_before_brand_does_not_lose_shared_login(self):
        self.authorize()
        self.assertFalse(config.CONFIG_FILE.exists())
        restored=self.open('b')
        self.assertEqual(restored.state['phase'],'choose_brand')
        self.assertEqual(sum(name=='third_login_auth' for name,_ in self.api.calls),1)

    def test_only_explicit_expiry_requests_login_and_network_errors_keep_session(self):
        self.authorize(); self.choose(self.flow,0)
        before=(self.root/'auth'/'config.json').read_bytes()
        self.api.failures['third_login_login_record']='API error [SYSTEM_ERROR]: 系统异常'
        self.assertEqual(self.open('b').state['phase'],'unknown')
        self.api.failures['third_login_login_record']='API error [TOKEN_EXPIRED]: 登录已过期'
        self.assertEqual(self.open('b').state['phase'],'signed_out')
        self.assertEqual((self.root/'auth'/'config.json').read_bytes(),before)
        self.assertEqual(sum(name=='third_login_send_verify_code' for name,_ in self.api.calls),1)

    def test_stale_brand_form_cannot_restore_a_superseded_global_account(self):
        self.authorize()
        old_id=self.flow.state['brands'][0]['id']
        config.save_shared_auth('replacement-fixture-session','1')
        result=self.flow.handle('brand',{'id':old_id})
        self.assertEqual(result['error']['code'],'SESSION_CHANGED')
        self.assertEqual(result['phase'],'unknown')
        self.assertEqual(config.load_shared_auth()['wnToken'],'replacement-fixture-session')
        self.assertFalse(any(name=='third_login_switch_brand' for name,_ in self.api.calls))

    def test_brand_failure_keeps_authorization_and_other_task_brand(self):
        self.authorize(); self.choose(self.flow,0)
        a_config=(self.root/'a'/'config.json').read_bytes()
        second=self.open('b')
        self.api.failures['third_login_switch_brand']='API error [FAIL_BIZ_04]: 品牌无权访问'
        result=second.handle('brand',{'id':second.state['brands'][1]['id']})
        self.assertEqual(result['error']['code'],'FAIL_BIZ_04')
        self.assertEqual((self.root/'a'/'config.json').read_bytes(),a_config)
        self.assertEqual(config.load_shared_auth()['wnToken'],existing.AUTH)
        del self.api.failures['third_login_switch_brand']
        self.assertEqual(self.open('b').state['phase'],'choose_brand')

    def test_changing_global_channel_requires_brand_choice_without_sms(self):
        self.authorize(); self.choose(self.flow,0)
        config.save_shared_auth(existing.AUTH,'1')
        reopened=self.open('a')
        self.assertEqual(reopened.state['phase'],'choose_brand')
        self.assertEqual(reopened.state['channel'],'1')

    def test_deleted_conversation_does_not_delete_global_login(self):
        self.authorize(); self.choose(self.flow,0)
        config.CONFIG_FILE.unlink()
        self.assertEqual(self.open('b').state['phase'],'choose_brand')
        self.assertEqual(config.load_shared_auth()['wnToken'],existing.AUTH)

if __name__=='__main__':
    with patch.object(socket,'socket',side_effect=AssertionError('Network forbidden')):
        unittest.main(verbosity=2)
