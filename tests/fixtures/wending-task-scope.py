"""Exercise the shipped SDK transport with synthetic accounts, never the network."""
import io
import json
import socket
import sys
from unittest.mock import patch
from crm_base_cli import config
from crm_base_cli.api import CrmAPI

scenario = sys.argv[1]
cfg = config.load_config()
expected = cfg.get('stable_brand_id')
remote = expected
business_calls = 0

def response(request, **kwargs):
    global remote, business_calls
    if request.get_header('Methodname') == 'getLoginRecord':
        if scenario == 'drift-before':
            remote = '999'
        # The live gateway returns JSON text inside result, not a plain object.
        record = json.dumps({'success': True, 'data': {'orgId': remote}, 'extInfo': {}, 'canRetry': False})
        return io.BytesIO(json.dumps({'result': record}).encode())
    business_calls += 1
    data = {'brand': remote, 'rows': [1, 2]}
    if scenario == 'drift-during':
        remote = '999'
    return io.BytesIO(json.dumps({'result': data}).encode())

with patch.object(socket, 'socket', side_effect=AssertionError('Network forbidden')), patch('urllib.request.urlopen', side_effect=response):
    try:
        api = CrmAPI()
        headers = {'methodName': 'switchOrganization' if scenario == 'switch' else 'businessQuery'}
        result = api._do_request('https://fixture.invalid', {}, headers)
        print(json.dumps({'result': result, 'businessCalls': business_calls, 'configDirectory': str(config.CONFIG_DIR)}, ensure_ascii=False))
    except RuntimeError as error:
        print(json.dumps({'error': str(error), 'businessCalls': business_calls}, ensure_ascii=False))
