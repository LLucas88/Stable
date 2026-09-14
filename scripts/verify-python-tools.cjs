const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const result=spawnSync(path.join(root,'vendor/wending-cli/python/python.exe'),['-I','-X','utf8','-c',`import openpyxl, tempfile
from pathlib import Path
assert openpyxl.__version__ == '3.1.5'
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'probe.xlsx'
 w=openpyxl.Workbook(); w.active['A1']='中文测试'; w.active['B1']=123; w.save(p); w.close()
 r=openpyxl.load_workbook(p); assert r.active['A1'].value=='中文测试' and r.active['B1'].value==123; r.close()
print('OPENPYXL_3.1.5_ROUNDTRIP_PASS')`],{encoding:'utf8',windowsHide:true,timeout:30000});
if(result.status!==0)throw Error('内置 Python Excel 依赖校验失败，请运行 npm run python:install。'+(result.stderr||result.error||''));
console.log(result.stdout.trim());
