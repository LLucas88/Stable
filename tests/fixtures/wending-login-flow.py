"""Offline protocol/regression tests against the actual bundled CRM SDK."""
import importlib.util
import json
from pathlib import Path
import socket
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('stable_login', ROOT / 'vendor/wending-cli/stable-login.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
config = module.config_mod

MOBILE = '13800000000'
CODE = '654321'
SMS = 'test-sms-token-never-public'
THIRD = 'test-third-token-never-public'
AUTH = 'test-business-token-never-public'
TEMP = 'test-temp-auth-never-public'


class FakeAPI:
    def __init__(self):
        self.calls = []
        self.accounts = [{'accountId': 'account-private-a', 'accountName': '测试账号 A', 'channel': 1}]
        self.brand_result = {'success': True, 'data': [{'orgId': 100, 'orgName': '测试品牌 A'}, {'orgId': 200, 'orgName': '测试品牌 B'}]}
        self.active = '100'
        self.failures = {}
        self.auth_result = {'authStatus': 1, 'authCode': AUTH}
        self.verify_result = None

    def __call__(self, **kwargs):
        self.wnToken = kwargs.get('wnToken')
        return self

    def _third_login_resolve_ext_info(self, request):
        return '{}'

    def __getattr__(self, name):
        def call(**kwargs):
            self.calls.append((name, kwargs))
            if name in self.failures: raise RuntimeError(self.failures[name])
            if name == 'third_login_send_verify_code': return {'token': SMS}
            if name == 'third_login_gen_temp_auth': return {'authTempCode': TEMP}
            if name == 'third_login_verify_code':
                self.last_verify = kwargs['request']
                return self.verify_result if self.verify_result is not None else {'accountList': self.accounts, 'token': SMS, 'thirdToken': THIRD}
            if name == 'third_login_auth':
                self.last_auth = kwargs['request']
                return self.auth_result
            if name == 'third_login_query_brand_list': return self.brand_result
            if name == 'third_login_switch_brand': self.active = str(kwargs['brandId']); return True
            if name == 'third_login_login_record': return {'success': True, 'data': {'orgId': self.active}}
            raise AssertionError('Unexpected API call')
        return call


class LoginTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='stable-login-test-')
        self.addCleanup(self.directory.cleanup)
        config.CONFIG_DIR = Path(self.directory.name) / '.crm-cli'
        config.CONFIG_FILE = config.CONFIG_DIR / 'config.json'
        self.api = FakeAPI()
        self.flow = module.LoginFlow(self.api)
        self.flow.handle('check', {})

    def send(self, channel='0'):
        return self.flow.handle('send', {'channel': channel, 'mobile': MOBILE})

    def login(self):
        self.send()
        return self.flow.handle('verify', {'code': CODE})

    def assert_private(self, result):
        serialized = json.dumps(result, ensure_ascii=False)
        for value in (MOBILE, CODE, SMS, THIRD, AUTH, TEMP, 'account-private-a'):
            self.assertNotIn(value, serialized)
        for key in ('token', 'thirdToken', 'authTempCode', 'codeVerifier', 'accountId'):
            self.assertNotIn('"' + key + '"', serialized)

    def test_missing_login_does_not_touch_network_or_create_config(self):
        self.assertEqual(self.flow.state['phase'], 'signed_out')
        self.assertEqual(self.api.calls, [])
        self.assertFalse(config.CONFIG_FILE.exists())

    def test_single_account_sequence_preserves_sms_token_and_delays_persistence(self):
        self.assertEqual(self.send('1')['phase'], 'code_sent')
        self.assertEqual(len(self.api.calls), 1)  # No temp auth while waiting for SMS.
        self.assertFalse(config.CONFIG_FILE.exists())
        result = self.flow.handle('verify', {'code': CODE})
        self.assertEqual(result['phase'], 'choose_brand')
        self.assertEqual(self.api.last_verify['token'], SMS)
        self.assertEqual(self.api.last_verify['verifyCode'], CODE)
        self.assertEqual(self.api.last_verify['authOpenRequest']['authTempCode'], TEMP)
        self.assertEqual(self.api.last_verify['authOpenRequest']['extInfo'], '{}')
        self.assertEqual(self.api.last_auth['thirdToken'], THIRD)
        self.assertEqual(self.api.last_auth['accountType'], 0)
        self.assertEqual(self.api.last_auth['extInfo'], '{}')
        self.assertTrue(all(kwargs['channel'] == '1' for _, kwargs in self.api.calls))
        self.assertFalse(config.CONFIG_FILE.exists())
        self.assert_private(result)
        selected = result['brands'][1]['id']
        result = self.flow.handle('brand', {'id': selected})
        self.assertEqual(result['phase'], 'ready')
        self.assertEqual(self.api.active, '200')
        cfg = config.load_config()
        self.assertEqual(cfg, {'wnToken': AUTH, 'third_login_channel': '1'})
        self.assert_private(result)

    def test_vendor_cli_bug_reproduced_but_fixed_flow_avoids_it(self):
        from crm_base_cli import cli
        config.update_third_login_context({'token': SMS, 'mobile': MOBILE})
        with patch.object(cli, 'get_open_api', return_value=self.api), patch.object(cli, 'output'):
            cli.third_login_gen_temp_auth_cmd.callback(channel='0', request_json=None)
        self.assertNotIn('token', config.get_third_login_context())
        self.login()
        self.assertEqual(self.api.last_verify['token'], SMS)

    def test_existing_auth_reused_without_sms(self):
        config.save_config({'wnToken': AUTH, 'third_login_channel': '1', 'other': {'keep': True}})
        before = config.CONFIG_FILE.read_bytes()
        result = self.flow.handle('check', {})
        self.assertEqual(result['phase'], 'ready')
        self.assertEqual(result['channel'], '1')
        self.assertEqual([name for name, _ in self.api.calls], ['third_login_login_record', 'third_login_query_brand_list'])
        self.assertEqual(before, config.CONFIG_FILE.read_bytes())
        self.assert_private(result)

    def test_network_error_is_not_misreported_as_expired_login(self):
        config.save_config({'wnToken': AUTH})
        self.api.failures['third_login_login_record'] = 'API error [SYSTEM_ERROR]: 系统异常'
        result = self.flow.handle('check', {})
        self.assertEqual(result['phase'], 'unknown')
        self.assertEqual(result['error']['code'], 'SYSTEM_ERROR')
        self.assertIn('系统异常', result['error']['message'])
        self.assertNotIn('120', result['error']['message'])
        self.assertEqual(config.load_config()['wnToken'], AUTH)

    def test_explicit_expired_login_offers_sms_without_clearing_old_config(self):
        config.save_config({'wnToken': AUTH})
        self.api.failures['third_login_login_record'] = 'API error [TOKEN_EXPIRED]: 登录已过期'
        result = self.flow.handle('check', {})
        self.assertEqual(result['phase'], 'signed_out')
        self.assertEqual(config.load_config()['wnToken'], AUTH)

    def test_multi_account_waits_and_uses_selected_channel_and_token(self):
        self.api.accounts.append({'accountId': 'account-private-b', 'accountName': MOBILE, 'channel': 2})
        result = self.login()
        self.assertEqual(result['phase'], 'choose_account')
        self.assertFalse(any(name == 'third_login_auth' for name, _ in self.api.calls))
        self.assert_private(result)
        invalid = self.flow.handle('account', {'id': 'account-private-b'})
        self.assertEqual(invalid['error']['code'], 'INVALID_ACCOUNT')
        result = self.flow.handle('account', {'id': result['accounts'][1]['id']})
        self.assertEqual(result['phase'], 'choose_brand')
        self.assertEqual(self.api.last_auth['accountId'], 'account-private-b')
        self.assertEqual(self.api.last_auth['accountType'], 1)
        self.assertEqual(self.api.last_auth['thirdToken'], THIRD)

    def test_no_account_and_no_brand_do_not_mark_success(self):
        self.api.accounts = []
        result = self.login()
        self.assertEqual(result['error']['code'], 'NO_ACCOUNTS')
        self.assertFalse(config.CONFIG_FILE.exists())
        self.flow.handle('reset', {})
        self.api.accounts = [{'accountId': 'account-private-a', 'channel': 1}]
        self.api.brand_result = []
        result = self.login()
        self.assertEqual(result['phase'], 'choose_brand')
        self.assertEqual(result['error']['code'], 'NO_BRANDS')
        self.assertFalse(config.CONFIG_FILE.exists())

    def test_invalid_expired_selections_and_cancel_cannot_resume_old_context(self):
        result = self.login()
        old_id = result['brands'][0]['id']
        self.flow.handle('reset', {})
        self.assertEqual(self.flow.handle('verify', {'code': CODE})['error']['code'], 'MISSING_CONTEXT')
        self.assertEqual(self.flow.handle('brand', {'id': old_id})['error']['code'], 'INVALID_BRAND')
        self.assertFalse(config.CONFIG_FILE.exists())

    def test_wrong_code_retains_sms_context_and_redacts_credentials(self):
        self.send()
        self.api.failures['third_login_verify_code'] = f'API error [BAD_CODE]: 验证码错误 {CODE} mobile={MOBILE} token={SMS} thirdToken=unknown-secret'
        result = self.flow.handle('verify', {'code': CODE})
        self.assertEqual(result['phase'], 'code_sent')
        self.assertEqual(result['error']['code'], 'BAD_CODE')
        self.assertIn('验证码错误', result['error']['message'])
        self.assertNotIn('unknown-secret', result['error']['message'])
        self.assert_private(result)
        del self.api.failures['third_login_verify_code']
        self.assertEqual(self.flow.handle('verify', {'code': CODE})['phase'], 'choose_brand')

    def test_failed_auth_or_brand_never_overwrites_prior_credentials(self):
        config.save_config({'wnToken': 'prior-business-session', 'unrelated': {'preserve': True}})
        before = config.CONFIG_FILE.read_bytes()
        self.api.auth_result = {'authStatus': 0, 'authCode': AUTH}
        result = self.login()
        self.assertEqual(result['error']['code'], 'AUTH_REJECTED')
        self.assertEqual(before, config.CONFIG_FILE.read_bytes())
        self.api.auth_result = {'authCode': AUTH}
        result = self.flow.handle('account', {'id': result['accounts'][0]['id']})
        self.api.failures['third_login_switch_brand'] = 'API error [FAIL_BIZ_04]: 当前品牌无权访问'
        result = self.flow.handle('brand', {'id': result['brands'][0]['id']})
        self.assertEqual(result['phase'], 'choose_brand')
        self.assertEqual(result['error']['code'], 'FAIL_BIZ_04')
        self.assertEqual(before, config.CONFIG_FILE.read_bytes())
        del self.api.failures['third_login_switch_brand']
        result = self.flow.handle('brand', {'id': result['brands'][0]['id']})
        self.assertEqual(result['phase'], 'ready')
        self.assertEqual(config.load_config()['unrelated'], {'preserve': True})

    def test_brand_confirmation_required_and_brand_fetch_retry_does_not_reauthorize(self):
        self.api.failures['third_login_query_brand_list'] = 'network timeout'
        result = self.login()
        self.assertEqual(result['phase'], 'choose_brand')
        del self.api.failures['third_login_query_brand_list']
        result = self.flow.handle('brands', {})
        self.assertEqual(sum(name == 'third_login_auth' for name, _ in self.api.calls), 1)
        self.api.active = None
        with patch.object(module.LoginFlow, 'active_brand', return_value=None):
            result = self.flow.handle('brand', {'id': result['brands'][0]['id']})
        self.assertEqual(result['error']['code'], 'BRAND_NOT_CONFIRMED')
        self.assertFalse(config.CONFIG_FILE.exists())

    def test_validation_and_unrecognized_response_fail_closed(self):
        self.assertEqual(self.flow.handle('send', {'channel': '2', 'mobile': MOBILE})['error']['code'], 'INVALID_CHANNEL')
        self.assertEqual(self.flow.handle('send', {'channel': '0', 'mobile': '123'})['error']['code'], 'INVALID_MOBILE')
        self.assertEqual(self.api.calls, [])
        self.send()
        self.assertEqual(self.flow.handle('verify', {'code': 'abc'})['error']['code'], 'INVALID_CODE')
        self.api.verify_result = {'accountId': 'account-private-a', 'token': SMS, 'thirdToken': THIRD}
        self.assertEqual(self.flow.handle('verify', {'code': CODE})['phase'], 'choose_brand')
        self.assertEqual(self.flow.handle('arbitrary', {})['error']['code'], 'INVALID_OPERATION')

    def test_atomic_save_failure_keeps_previous_config_and_cleans_temporary_file(self):
        config.save_config({'wnToken': 'prior-session', 'custom': 'keep'})
        before = config.CONFIG_FILE.read_bytes()
        result = self.login()
        with patch.object(module.os, 'replace', side_effect=OSError('配置目录不可写')):
            result = self.flow.handle('brand', {'id': result['brands'][0]['id']})
        self.assertEqual(result['phase'], 'choose_brand')
        self.assertIn('配置目录不可写', result['error']['message'])
        self.assertEqual(before, config.CONFIG_FILE.read_bytes())
        self.assertEqual(list(config.CONFIG_DIR.glob('.stable-auth-*')), [])

    def test_missing_auth_token_and_false_business_result_never_mark_ready(self):
        self.api.auth_result = {'authStatus': 1}
        result = self.login()
        self.assertEqual(result['error']['code'], 'MISSING_AUTH_TOKEN')
        self.assertFalse(config.CONFIG_FILE.exists())
        self.flow.handle('reset', {})
        self.api.auth_result = {'authStatus': 1, 'authCode': AUTH}
        self.api.brand_result = {'success': False, 'message': '服务端拒绝品牌查询'}
        result = self.login()
        self.assertEqual(result['error']['code'], 'SERVICE_REJECTED')
        self.assertNotEqual(result['phase'], 'ready')


if __name__ == '__main__':
    # Even a test accidentally using the real SDK cannot send network traffic.
    with patch.object(socket, 'socket', side_effect=AssertionError('Network forbidden in login tests')):
        unittest.main(verbosity=2)
