"""Private stdin-only login worker. Never print SDK responses or credentials."""
import contextlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import sys
import tempfile

from crm_base_cli import config as config_mod
from crm_base_cli.api import CrmAPI
from crm_base_cli.stable_response import decode_response
from crm_base_cli.cli import (
    _generate_third_login_code_verifier,
    _build_third_login_auth_open_request,
    _extract_third_login_auth_token,
    _resolve_third_login_account_type,
)


class LoginError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


class LoginFlow:
    def __init__(self, api_factory=CrmAPI):
        self.api_factory = api_factory
        self.state = {"phase": "unknown", "channel": "0", "detail": "尚未检查登录态。"}
        self.context = {}
        self.accounts = {}
        self.brands = {}
        self.auth_token = None
        self.private_values = set()

    def remember(self, value):
        if isinstance(value, dict):
            for key, item in value.items():
                if re.search(r"token|code|verifier|mobile|accountId", key, re.I) and isinstance(item, (str, int)):
                    if str(item): self.private_values.add(str(item))
                self.remember(item)
        elif isinstance(value, list):
            for item in value: self.remember(item)

    def redact(self, value):
        text = str(value or "")
        for secret in sorted(self.private_values, key=len, reverse=True):
            text = text.replace(secret, "[已隐藏]")
        text = re.sub(r'https?://\S+', '[服务地址]', text)
        text = re.sub(r'(?i)[\w]*(?:token|verifier|tempcode|verifycode|authcode)[\w]*[\s\"\x27:=]+[^,;\s}]+', '[凭据已隐藏]', text)
        text = re.sub(r'(?<!\d)1\d{10}(?!\d)', '[手机号已隐藏]', text)
        text = re.sub(r'[A-Za-z0-9_+/=-]{24,}', '[已隐藏]', text)
        return re.sub(r'[\r\n\t]+', ' ', text)[:400]

    def result(self, error=None):
        value = dict(self.state)
        if error:
            code = getattr(error, "code", None)
            if not code:
                match = re.search(r'\[([A-Z][A-Z0-9_]{1,50})\]|\((\d{3})\)', str(error))
                code = next((part for part in match.groups() if part), None) if match else 'REQUEST_FAILED'
            value['error'] = {"code": code, "message": self.redact(error)}
        return value

    def api(self, token=None):
        api = self.api_factory(wnToken=token, require_auth=False)
        # Open login endpoints must not inherit a previously configured token.
        api.wnToken = token
        api._stable_login_worker = True
        return api

    def reset(self, channel='0'):
        self.context.clear()
        self.accounts.clear()
        self.brands.clear()
        self.auth_token = None
        self.private_values.clear()
        self.state = {"phase": "signed_out", "channel": channel, "detail": "请在此表单完成手机号验证。"}

    def invoke(self, api, method, **kwargs):
        result = decode_response(getattr(api, method)(channel=self.state['channel'], **kwargs))
        self.remember(result)
        if isinstance(result, dict) and (result.get('success') is False or result.get('succeed') is False):
            raise LoginError('SERVICE_REJECTED', self.redact(result.get('errorMsg') or result.get('message') or result.get('resultMsg') or '服务端拒绝了本次请求。'))
        return result

    def brand_options(self, result):
        found = {}
        self.brands.clear()
        empty_list = False
        invalid = False
        def visit(value):
            nonlocal empty_list, invalid
            value = decode_response(value)
            if isinstance(value, list):
                if not value: empty_list = True
                for item in value: visit(item)
            elif isinstance(value, dict):
                if value.get('success') is False or value.get('succeed') is False:
                    raise LoginError('SERVICE_REJECTED', '服务端未确认品牌查询成功，请重试品牌查询。')
                ident = value.get('orgId', value.get('brandId'))
                name = value.get('orgName') or value.get('brandName') or value.get('name')
                recognized = False
                if ident is not None and name and re.fullmatch(r'\d+', str(ident)):
                    found[str(ident)] = str(name)
                    recognized = True
                for key in ('data', 'result', 'nodes', 'brandList', 'brands', 'list', 'children', 'orgList', 'organizationList'):
                    if key in value:
                        recognized = True
                        visit(value[key])
                if not recognized: invalid = True
            else:
                invalid = True
        visit(result)
        if not found and (invalid or not empty_list):
            raise LoginError('INVALID_BRAND_RESPONSE', '品牌查询返回格式无法识别，不能据此判断账号没有品牌。请重试品牌查询。')
        self.brands = {secrets.token_hex(12): {'id': key, 'label': self.redact(name)} for key, name in found.items()}
        return [{'id': key, 'label': value['label']} for key, value in self.brands.items()]

    @staticmethod
    def active_brand(record):
        record = decode_response(record)
        if not isinstance(record, dict): return None
        if record.get('success') is False or record.get('succeed') is False: return None
        for key in ('orgId', 'brandId', 'currentOrgId', 'currentBrandId'):
            if record.get(key) is not None: return str(record[key])
        for key in ('data', 'result', 'organization', 'org', 'brand', 'loginRecord'):
            value = LoginFlow.active_brand(record.get(key))
            if value: return value
        return None

    def check(self):
        self.reset()
        cfg = config_mod.load_config()
        token = cfg.get('wnToken')
        self.state['channel'] = str(cfg.get('third_login_channel', '0'))
        if self.state['channel'] not in ('0', '1'): self.state['channel'] = '0'
        if not token: return
        self.private_values.add(str(token))
        self.state.update(phase='unknown', detail='正在核验原有登录态；检查失败不代表必须重新登录。')
        api = self.api(token)
        try:
            record = self.invoke(api, 'third_login_login_record')
            options = self.brand_options(self.invoke(api, 'third_login_query_brand_list'))
        except Exception as error:
            # Only explicit authentication errors justify a new SMS login.
            if re.search(r'未登录|登录已过期|登录失效|NOT_LOGIN|LOGIN_EXPIRED|INVALID_TOKEN|TOKEN_EXPIRED', str(error), re.I):
                self.state.update(phase='signed_out', detail='登录态已失效，请重新验证手机号。')
            raise
        if not record:
            raise LoginError('EMPTY_LOGIN_RECORD', '服务端未返回有效登录记录，请重试检查。')
        self.auth_token = token
        active = self.active_brand(record)
        if os.environ.get('WENDING_CONFIG_DIR') and cfg.get('stable_brand_id') and active != str(cfg['stable_brand_id']):
            raise LoginError('BRAND_BINDING_CHANGED', '服务端品牌与此任务绑定的品牌不一致，请重新开始登录；不会自动更换任务品牌。')
        current = next((item for item in self.brands.values() if item['id'] == active), None)
        if current:
            self.state.update(phase='ready', detail='已核验登录态与当前品牌。', brandLabel=current['label'])
        else:
            self.state.update(phase='choose_brand', brands=options, detail='登录有效，请选择本次使用的品牌。')
            if not options: raise LoginError('NO_BRANDS', '账号未返回可用品牌，请联系管理员或重新检查。')

    def send(self, payload):
        channel, mobile = payload.get('channel'), payload.get('mobile')
        if channel not in ('0', '1'): raise LoginError('INVALID_CHANNEL', '请选择登录渠道。')
        if not isinstance(mobile, str) or not re.fullmatch(r'1\d{10}', mobile):
            raise LoginError('INVALID_MOBILE', '请输入 11 位手机号。')
        if self.state['phase'] not in ('signed_out', 'code_sent'):
            raise LoginError('INVALID_STATE', '请先重新开始登录，再确认发送验证码。')
        self.reset(channel)
        self.private_values.add(mobile)
        result = self.invoke(self.api(), 'third_login_send_verify_code', mobile=mobile)
        if not isinstance(result, dict) or not result.get('token'):
            raise LoginError('MISSING_SMS_TOKEN', '短信接口未返回校验上下文，请稍后重新确认发送。')
        self.context = {'channel': channel, 'mobile': mobile, 'token': result['token']}
        self.state.update(phase='code_sent', mobileHint=mobile[:3] + '****' + mobile[-4:], detail='验证码已发送，请输入收到的验证码。')

    def verify(self, payload):
        if self.state['phase'] != 'code_sent' or not self.context.get('token'):
            raise LoginError('MISSING_CONTEXT', '本次短信上下文已失效，请重新开始。')
        code = payload.get('code')
        if not isinstance(code, str) or not re.fullmatch(r'\d{4,8}', code):
            raise LoginError('INVALID_CODE', '请输入 4 至 8 位数字验证码。')
        self.private_values.add(code)
        api = self.api()
        verifier = _generate_third_login_code_verifier()
        self.private_values.add(verifier)
        generation_request = {'codeVerifier': verifier}
        generated = self.invoke(api, 'third_login_gen_temp_auth', request=generation_request)
        if not isinstance(generated, dict) or not generated.get('authTempCode'):
            raise LoginError('MISSING_TEMP_AUTH', '临时授权接口未返回授权码，请重试验证。')
        # Crucially, do not run the CLI gen-temp-auth command: it deletes SMS token.
        self.context.update(codeVerifier=verifier, authTempCode=generated['authTempCode'], extInfo=api._third_login_resolve_ext_info(generation_request))
        request = {'mobile': self.context['mobile'], 'verifyCode': code, 'token': self.context['token'], 'authTempCode': self.context['authTempCode']}
        request['authOpenRequest'] = _build_third_login_auth_open_request(request, self.context)
        result = self.invoke(api, 'third_login_verify_code', request=request)
        if not isinstance(result, dict): raise LoginError('INVALID_VERIFY_RESPONSE', '验证码接口响应格式不正确，请重新开始。')
        accounts = result.get('accountList') or []
        if not accounts and result.get('accountId') is not None:
            accounts = [{'accountId': result['accountId'], 'channel': result.get('channel')}]
        self.context.update(token=result.get('token') or self.context['token'], thirdToken=result.get('thirdToken'))
        self.accounts = {secrets.token_hex(12): item for item in accounts if isinstance(item, dict) and item.get('accountId') is not None}
        self.context.pop('mobile', None)
        self.state = {'phase': 'choose_account', 'channel': self.state['channel'], 'detail': '请选择本次登录的账号。',
                      'accounts': [{'id': key, 'label': self.redact(item.get('accountName') or item.get('name') or f'账号 {index + 1}') + f"（尾号 {str(item['accountId'])[-4:]}）"} for index, (key, item) in enumerate(self.accounts.items())]}
        if not self.accounts: raise LoginError('NO_ACCOUNTS', '该手机号未返回可用账号，请联系管理员或重新开始。')
        if len(self.accounts) == 1: self.select_account({'id': next(iter(self.accounts))})

    def select_account(self, payload):
        if self.state['phase'] != 'choose_account' or payload.get('id') not in self.accounts:
            raise LoginError('INVALID_ACCOUNT', '请选择本次验证返回的账号，不可使用过期或手动填写的账号。')
        account = self.accounts[payload['id']]
        context = {**self.context, 'selectedChannel': account.get('channel')}
        request = {'accountId': account['accountId'], 'thirdToken': account.get('thirdToken') or context.get('thirdToken'),
                   'token': context['token'], 'authType': '登录授权', 'authTempCode': context['authTempCode'],
                   'codeVerifier': context['codeVerifier'], 'accountType': _resolve_third_login_account_type({}, context)}
        if context.get('extInfo'): request['extInfo'] = context['extInfo']
        result = self.invoke(self.api(), 'third_login_auth', request=request)
        if not isinstance(result, dict): raise LoginError('INVALID_AUTH_RESPONSE', '授权接口响应格式不正确，请重新开始。')
        if result.get('authStatus') not in (None, 1, '1'):
            raise LoginError('AUTH_REJECTED', '服务端未确认登录授权成功，请重新开始。')
        token = _extract_third_login_auth_token(result)
        if not token: raise LoginError('MISSING_AUTH_TOKEN', '授权接口未返回业务令牌，请重新开始。')
        self.auth_token = token
        self.context.clear()
        self.accounts.clear()
        self.state = {'phase': 'choose_brand', 'channel': self.state['channel'], 'detail': '授权已完成，请选择品牌。', 'brands': []}
        self.refresh_brands()

    def refresh_brands(self):
        if not self.auth_token or self.state['phase'] != 'choose_brand':
            raise LoginError('INVALID_STATE', '请先完成手机号验证。')
        self.brands.clear()
        self.state['brands'] = []
        options = self.brand_options(self.invoke(self.api(self.auth_token), 'third_login_query_brand_list'))
        self.state['brands'] = options
        if not options: raise LoginError('NO_BRANDS', '账号未返回可用品牌，请联系管理员或重试品牌查询。')

    def select_brand(self, payload):
        if self.state['phase'] != 'choose_brand' or payload.get('id') not in self.brands:
            raise LoginError('INVALID_BRAND', '请选择本次查询返回的品牌。')
        brand = self.brands[payload['id']]
        api = self.api(self.auth_token)
        switched = self.invoke(api, 'third_login_switch_brand', brandId=brand['id'])
        if switched is False or (isinstance(switched, dict) and switched.get('success') is False):
            raise LoginError('BRAND_SWITCH_FAILED', '服务端未确认品牌切换成功，请重试。')
        record = self.invoke(api, 'third_login_login_record')
        if self.active_brand(record) != brand['id']:
            raise LoginError('BRAND_NOT_CONFIRMED', '登录记录未确认所选品牌，未保存新登录态，请重试或联系管理员。')
        self.persist(brand)
        self.state = {'phase': 'ready', 'channel': self.state['channel'], 'detail': '登录与品牌验证已完成。', 'brandLabel': brand['label']}
        self.brands.clear()
        self.context.clear()

    def persist(self, brand=None):
        # Same encoded format as vendor config; atomic replace, preserving unrelated settings.
        cfg = config_mod.load_config()
        cfg.update(wnToken=self.auth_token, third_login_channel=self.state['channel'])
        if brand:
            cfg.update(stable_brand_id=brand['id'], stable_brand_label=brand['label'])
        encoded = {key: config_mod._encode_value(value) if isinstance(value, str) else value for key, value in cfg.items()}
        config_mod.ensure_config_dir()
        destination = Path(config_mod.CONFIG_FILE)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=destination.parent, prefix='.stable-auth-', delete=False) as output:
                temporary = output.name
                json.dump(encoded, output, ensure_ascii=False)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, destination)
        finally:
            if temporary and os.path.exists(temporary): os.unlink(temporary)

    def handle(self, operation, payload):
        try:
            if not isinstance(payload, dict): raise LoginError('INVALID_INPUT', '登录请求格式不正确。')
            if operation == 'check': self.check()
            elif operation == 'send': self.send(payload)
            elif operation == 'verify': self.verify(payload)
            elif operation == 'account': self.select_account(payload)
            elif operation == 'brand': self.select_brand(payload)
            elif operation == 'brands': self.refresh_brands()
            elif operation == 'reset': self.reset(self.state['channel'])
            else: raise LoginError('INVALID_OPERATION', '不支持的登录操作。')
            return self.result()
        except Exception as error:
            return self.result(error)


def main():
    flow = LoginFlow()
    for line in sys.stdin:
        try:
            if len(line) > 4096: raise ValueError('invalid request')
            request = json.loads(line)
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                result = flow.handle(request['operation'], request.get('payload', {}))
        except Exception:
            result = {'phase': 'unknown', 'channel': '0', 'detail': '登录请求无效。', 'error': {'code': 'INVALID_INPUT', 'message': '登录请求格式不正确。'}}
        print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
