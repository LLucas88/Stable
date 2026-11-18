'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { baseline, candidate, uriHash, synchronizeNode, replaceable } = require('./encryption-sync.cjs');
function fixture() {
  const config = {inbounds:[{listen:'127.0.0.1',port:10818}],outbounds:[{protocol:'vless',settings:{address:'fixture.invalid',port:443,id:'fixture-credential',encryption:'none',flow:'xtls-rprx-vision'},streamSettings:{network:'tcp',security:'reality',realitySettings:{serverName:'tls.invalid',password:'fixture-key',shortId:'aa',fingerprint:'chrome',spiderX:''}}},{protocol:'blackhole'}]};
  const url = new URL('vless://fixture-credential@fixture.invalid:443?type=tcp&security=reality&sni=tls.invalid&pbk=fixture-key&sid=aa&fp=chrome&flow=xtls-rprx-vision&encryption=none#name');
  return {config,url,policy:baseline(config,url)};
}
test('only encryption changes; all other configuration remains identical',()=>{
  const {config,url,policy}=fixture(); url.searchParams.set('encryption','new-fixture-encryption');
  const next=candidate(config,[url],policy);assert.equal(next.outbounds[0].settings.encryption,'new-fixture-encryption');next.outbounds[0].settings.encryption='none';assert.deepEqual(next,config);
});
test('unchanged exits do not probe or restart',async()=>{
  const {config,url,policy}=fixture();let calls=0;
  assert.equal(await synchronizeNode({current:config,urls:[url],policy,qualify:()=>calls++,apply:()=>calls++}),'unchanged');assert.equal(calls,0);
});
for(const field of ['hostname','port','username','password'])test('identity drift rejects '+field,()=>{
  const {config,url,policy}=fixture();url[field]=field==='port'?'444':'different';assert.throws(()=>candidate(config,[url],policy));
});
for(const field of ['pbk','sni','type','security','flow','fp','sid','unrecognized'])test('reject every non-encryption URI change: '+field,()=>{
  const {config,url,policy}=fixture();url.searchParams.set(field,'changed');assert.throws(()=>candidate(config,[url],policy),/NON_ENCRYPTION_CHANGE/);
});
test('query ordering and display name do not change identity',()=>{
  const {url}=fixture();const reordered=new URL(url);reordered.searchParams.sort();reordered.hash='renamed';assert.equal(uriHash(reordered),uriHash(url));
});
test('duplicate matching nodes or encryption parameters fail closed',()=>{
  const {config,url,policy}=fixture();assert.throws(()=>candidate(config,[url,url],policy),/AMBIGUOUS/);url.searchParams.append('encryption','different');assert.throws(()=>candidate(config,[url],policy),/AMBIGUOUS/);
});
test('on-disk routing or credential drift fails closed',()=>{
  const {config,url,policy}=fixture();config.inbounds[0].listen='0.0.0.0';assert.throws(()=>candidate(config,[url],policy),/CONFIG_DRIFT/);
});
test('failed isolated checks never apply; successful check applies exactly once',async()=>{
  const {config,url,policy}=fixture();url.searchParams.set('encryption','new-fixture');let applied=0;
  await assert.rejects(synchronizeNode({current:config,urls:[url],policy,qualify:async()=>false,apply:()=>applied++}),/PROBE_FAILED/);assert.equal(applied,0);
  assert.equal(await synchronizeNode({current:config,urls:[url],policy,qualify:async()=>true,apply:()=>{applied++;return 'updated'}}),'updated');assert.equal(applied,1);
});
test('healthy, active, recovering, missing and stale health prevent replacement',()=>{
  const h={checkedAt:Date.now(),active:'primary',nodes:[{id:'backup',healthy:false,status:null}]};assert.equal(replaceable(h,'backup'),true);
  assert.equal(replaceable({...h,active:'backup'},'backup'),false);
  assert.equal(replaceable({...h,nodes:[{id:'backup',healthy:true,status:401}]},'backup'),false);
  assert.equal(replaceable({...h,nodes:[{id:'backup',healthy:false,status:401}]},'backup'),false);
  assert.equal(replaceable({...h,checkedAt:Date.now()-20000},'backup'),false);
  assert.equal(replaceable({...h,nodes:[]},'backup'),false);
});
