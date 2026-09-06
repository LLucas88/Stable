"""Two independent CLI processes share a simulated server session under the SDK lock."""
import io
import json
import os
from pathlib import Path
import socket
import time
from unittest.mock import patch
from crm_base_cli import config
from crm_base_cli.api import CrmAPI
remote=Path(os.environ['WENDING_SHARED_AUTH_DIR'])/'mock-server-brand'
expected=config.load_config()['stable_brand_id']
def response(request,**kwargs):
    method=request.get_header('Methodname')
    if method=='getLoginRecord': value={'success':True,'data':{'orgId':remote.read_text()}}
    elif method=='switchOrganization':
        remote.write_text(str(json.loads(request.data)['args'][0])); time.sleep(.015); value=True
    else:
        time.sleep(.015); value={'brand':remote.read_text()}
    return io.BytesIO(json.dumps({'result':value}).encode())
with patch.object(socket,'socket',side_effect=AssertionError('Network forbidden')),patch('urllib.request.urlopen',side_effect=response):
    values=[CrmAPI()._do_request('https://fixture.invalid',{}, {'methodName':'businessQuery'})['brand'] for _ in range(8)]
    assert values==[expected]*8, 'Cross-conversation brand leakage'
    print(json.dumps({'brand':expected,'queries':len(values)}))
