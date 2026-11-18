'use strict';
// Server-only maintenance. No API key, model generation, or new node selection.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { createHash, randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const ROOT = 'C:/stable-cloud/egress-sync';
const SUB_DB = 'C:/Xiaohang/tools/v2rayN-7.25.6/v2rayN-windows-64/guiConfigs/guiNDB.db';
const SUB_ID_HASH = '19e821e6fa05';
const NODES = Object.freeze([
  { id: 'backup', file: 'C:/stable-cloud/egress-ha/backup.json', port: 10828, binary: 'C:/stable-cloud/egress-ha/xray.exe' },
  { id: 'primary', file: 'C:/stable-cloud/egress/config.json', port: 10818, binary: 'C:/stable-cloud/egress/xray.exe' },
]);
const sha = v => createHash('sha256').update(v).digest('hex');
function canonical(v) { return JSON.stringify(sort(v)); }
function sort(v) { return Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])])) : v; }
function check(ok, code) { if (!ok) throw Error(code); }
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
function write(file, value) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(value, null, 2)); fs.renameSync(tmp, file); }
function configHash(config) {
  const c = structuredClone(config);
  check(c.outbounds?.[0]?.protocol === 'vless' && c.outbounds[0].settings?.id, 'CONFIG_SCOPE');
  delete c.outbounds[0].settings.encryption;
  return sha(canonical(c));
}
function uriHash(u) {
  const entries = [...u.searchParams].filter(([k]) => k !== 'encryption').sort((a, b) => canonical(a).localeCompare(canonical(b)));
  return sha(canonical([u.protocol, u.hostname, u.port, u.pathname, u.username, u.password, entries]));
}
function matchNode(config, urls) {
  const s = config.outbounds[0].settings;
  const matches = urls.filter(u => u.protocol === 'vless:' && u.hostname === s.address && Number(u.port) === Number(s.port) && decodeURIComponent(u.username) === s.id);
  check(matches.length === 1, 'NODE_MISSING_OR_AMBIGUOUS');
  return matches[0];
}
function baseline(config, u) {
  const o = config.outbounds[0], s = o.settings, r = o.streamSettings, p = u.searchParams, t = r.realitySettings;
  check(r.network === 'tcp' && r.security === 'reality' && t, 'UNSUPPORTED_TRANSPORT');
  const pairs = [[r.network,p.get('type')||'tcp'],[r.security,p.get('security')], [t.serverName||'',p.get('sni')||''], [t.password||t.publicKey||'',p.get('pbk')||''], [t.shortId||'',p.get('sid')||''], [t.fingerprint||'',p.get('fp')||''], [s.flow||'',p.get('flow')||''], [t.spiderX||'',p.get('spx')||'']];
  check(pairs.every(([a,b]) => a === b), 'BASELINE_MAPPING_MISMATCH');
  check(!u.password && !t.allowInsecure, 'UNSAFE_BASELINE');
  return { configHash: configHash(config), uriHash: uriHash(u) };
}
function candidate(config, urls, policy) {
  check(configHash(config) === policy.configHash, 'CONFIG_DRIFT');
  const u = matchNode(config, urls);
  check(uriHash(u) === policy.uriHash, 'NON_ENCRYPTION_CHANGE');
  check(u.searchParams.getAll('encryption').length === 1, 'AMBIGUOUS_ENCRYPTION');
  const value = u.searchParams.get('encryption');
  check(typeof value === 'string' && value.length > 0 && value.length <= 2048 && !/[\x00-\x20\x7f]/.test(value), 'INVALID_ENCRYPTION');
  if (value === config.outbounds[0].settings.encryption) return null;
  const next = structuredClone(config); next.outbounds[0].settings.encryption = value;
  check(configHash(next) === policy.configHash, 'CONFIG_DRIFT');
  return next;
}
function subscription() {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(SUB_DB, { readOnly: true }); let rows;
  try { rows = db.prepare('SELECT * FROM SubItem WHERE Enabled=1').all().filter(s => sha(String(s.Id)).slice(0,12) === SUB_ID_HASH); } finally { db.close(); }
  check(rows.length === 1 && !rows[0].RequestHeaders, 'SUBSCRIPTION_CONFIG');
  const s = rows[0], u = new URL(s.Url);
  check(u.protocol === 'https:' && !u.username && !u.password, 'SUBSCRIPTION_DESTINATION');
  return { url: s.Url, agent: s.UserAgent || 'v2rayN/7.25.6' };
}
async function fetchUrls(sub) {
  const r = await fetch(sub.url, { redirect: 'manual', headers: { 'user-agent': sub.agent }, signal: AbortSignal.timeout(20000) });
  check(r.status === 200, 'SUBSCRIPTION_HTTP');
  const chunks = []; let length = 0;
  for await (const chunk of r.body) { length += chunk.length; check(length <= 6*1024*1024, 'SUBSCRIPTION_TOO_LARGE'); chunks.push(Buffer.from(chunk)); }
  let text = Buffer.concat(chunks).toString('utf8');
  if (!/^(vless|trojan|vmess|ss):\/\//m.test(text) && /^[A-Za-z0-9+/=_\s-]+$/.test(text)) text = Buffer.from(text, 'base64').toString('utf8');
  return text.split(/\r?\n/).map(s => s.trim()).filter(s => s.startsWith('vless://')).map(s => new URL(s));
}
async function freePort(port) {
  await new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', () => reject(Error('ISOLATION_PORT_BUSY'))); server.listen(port, '127.0.0.1', () => server.close(resolve)); });
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function qualify(node, next, dir) {
  await freePort(10838);
  const c = structuredClone(next); c.inbounds[0].port = 10838; c.log = { loglevel: 'none' };
  const file = path.join(dir, 'isolated.json'); write(file, c);
  check(spawnSync(node.binary, ['run','-test','-c',file], { windowsHide: true, stdio: 'ignore', timeout:10000 }).status === 0, 'CORE_REJECTED');
  const child = spawn(node.binary, ['run','-c',file], { windowsHide: true, stdio: 'ignore' });
  let failed = false; child.on('error', () => { failed = true; });
  const { fetch: request, ProxyAgent } = require('node:module').createRequire('C:/stable-cloud/runtime/package.json')('undici');
  try {
    await sleep(1000);
    for (let i=0;i<3;i++) {
      check(!failed && child.exitCode === null, 'ISOLATED_PROCESS_EXITED');
      const agent = new ProxyAgent('http://127.0.0.1:10838');
      try { const r = await request('https://api.openai.com/v1/models', { dispatcher:agent, redirect:'manual', signal:AbortSignal.timeout(10000) }); await r.body?.cancel(); check(r.status === 401, 'ISOLATED_PROBE_FAILED'); }
      finally { await agent.destroy(); }
      if(i<2) await sleep(5000);
    }
    return true;
  } finally {
    if (child.exitCode === null && child.pid) { child.kill(); await Promise.race([new Promise(r => child.once('exit',r)),sleep(2000)]); }
    fs.unlinkSync(file);
  }
}
async function health() { return (await fetch('http://127.0.0.1:10819/health', { signal:AbortSignal.timeout(3000) })).json(); }
function replaceable(h, id) {
  const n = h.nodes?.find(n => n.id === id);
  // Never stop an exit that the router can currently select, including standby.
  return !!n && n.healthy === false && n.status !== 401 && h.active !== id && Date.now()-h.checkedAt < 10000;
}
function verifyPlan(plan, policy, recovery=false) {
  const node = NODES.find(n => n.id === plan.id);
  check(node && (recovery || (Date.now()-plan.qualifiedAt >= 0 && Date.now()-plan.qualifiedAt < 180000)), 'STALE_PLAN');
  check(/^[a-f0-9-]{36}$/.test(plan.runId), 'INVALID_PLAN');
  const dir = path.join(ROOT,plan.runId), file=path.join(dir,'candidate.json');
  const currentFile=recovery?path.join(dir,'before.json'):node.file;
  check(sha(fs.readFileSync(currentFile)) === plan.beforeHash && sha(fs.readFileSync(file)) === plan.nextHash, 'CONCURRENT_CHANGE');
  const current=read(currentFile), next=read(file);
  check(configHash(current) === policy.nodes[node.id].configHash && configHash(next) === configHash(current), 'CONFIG_DRIFT');
  check(current.outbounds[0].settings.encryption !== next.outbounds[0].settings.encryption, 'NO_CHANGE');
  return true;
}
async function synchronizeNode({ current, urls, policy, qualify, apply }) {
  const next = candidate(current, urls, policy);
  if (!next) return 'unchanged';
  check(await qualify(next), 'ISOLATED_PROBE_FAILED');
  return await apply(next);
}
async function main(mode) {
  check(process.platform === 'win32', 'WINDOWS_ONLY');
  const policyFile=path.join(ROOT,'policy.json');
  if (mode === 'verify-plan' || mode === 'verify-plan-recovery') { verifyPlan(read(process.argv[3]),read(policyFile),mode==='verify-plan-recovery'); return; }
  const sub=subscription();
  if (mode==='init') {
    check(!fs.existsSync(policyFile), 'POLICY_EXISTS');
    const urls=await fetchUrls(sub), nodes={};
    for(const node of NODES) { const c=read(node.file); nodes[node.id]=baseline(c,matchNode(c,urls)); }
    fs.writeFileSync(policyFile,JSON.stringify({version:1,subscriptionHash:sha(sub.url),agentHash:sha(sub.agent),nodes},null,2),{flag:'wx'});
    console.log('SYNC_POLICY_PINNED=OK'); return;
  }
  check(mode==='run','INVALID_MODE');
  const p=read(policyFile); check(p.version===1 && sha(sub.url)===p.subscriptionHash && sha(sub.agent)===p.agentHash,'SUBSCRIPTION_CHANGED');
  // Resolve a process crash/reboot before any later update. Never silently leave
  // a stopped task or replace an unrelated manual config change.
  for(const entry of fs.readdirSync(ROOT,{withFileTypes:true})) {
    if(!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name))continue;
    const journal=path.join(ROOT,entry.name,'journal.json');if(!fs.existsSync(journal))continue;
    const status=read(journal).status;
    check(status!=='manual_recovery_required','MANUAL_RECOVERY_REQUIRED');
    if(status==='applying') {
      const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(ROOT,'encryption-sync-apply.ps1'),'-RunId',entry.name,'-Recover'],{windowsHide:true,stdio:'ignore'});
      check(result.status===0,'INTERRUPTED_UPDATE_RECOVERY_FAILED');
    }
  }
  const urls=await fetchUrls(sub), stateFile=path.join(ROOT,'state.json');
  const previous=fs.existsSync(stateFile)?read(stateFile):{};
  const report={at:new Date().toISOString(),generationCalls:0,nodes:[]};
  for(const node of NODES) {
    const row={id:node.id}; let dir;
    try {
      const current=read(node.file), next=candidate(current,urls,p.nodes[node.id]);
      if(!next) { row.status='unchanged'; continue; }
      row.candidateHash=sha(canonical(next));
      const prior=previous.nodes?.find(r=>r.id===node.id);
      if(prior?.candidateHash===row.candidateHash && prior.retryAfter>Date.now()){row.status='cooldown';row.retryAfter=prior.retryAfter;continue;}
      if(!replaceable(await health(),node.id)){row.status='deferred_healthy_or_active';continue;}
      const runId=randomUUID(); dir=path.join(ROOT,runId); fs.mkdirSync(dir);
      const beforeHash=sha(fs.readFileSync(node.file));
      row.status=await synchronizeNode({current,urls,policy:p.nodes[node.id],qualify: c=>qualify(node,c,dir), apply: async c=>{
        const file=path.join(dir,'candidate.json'); write(file,c);
        const plan={id:node.id,runId,beforeHash,nextHash:sha(fs.readFileSync(file)),qualifiedAt:Date.now()};
        write(path.join(dir,'plan.json'),plan); verifyPlan(plan,p);
        const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(ROOT,'encryption-sync-apply.ps1'),'-RunId',runId],{windowsHide:true,stdio:'ignore'});
        check(result.status===0,'APPLY_FAILED_OR_ROLLED_BACK'); return 'updated';
      }});
      row.runId=runId;
    } catch(e) { row.status='validation_failed_or_rolled_back'; row.reason=/^[A-Z_]{3,60}$/.test(e.message||'')?e.message:'CHECK_FAILED'; row.retryAfter=Date.now()+60*60*1000; }
    finally { report.nodes.push(row); write(stateFile,report); }
  }
  report.completedAt=new Date().toISOString();write(stateFile,report);
  const log=path.join(ROOT,'events.jsonl');
  if(fs.existsSync(log)&&fs.statSync(log).size>1024*1024)fs.renameSync(log,log+'.1');
  fs.appendFileSync(log,JSON.stringify(report)+'\n'); console.log(JSON.stringify(report));
  if(report.nodes.some(n=>n.status==='validation_failed_or_rolled_back'))process.exitCode=2;
}
module.exports={sha,canonical,configHash,uriHash,matchNode,baseline,candidate,replaceable,synchronizeNode};
if(require.main===module) main(process.argv[2]).catch(e=>{
  const report={at:new Date().toISOString(),status:'failed_closed',reason:/^[A-Z_]{3,60}$/.test(e.message||'')?e.message:'CHECK_FAILED',generationCalls:0};
  if(process.argv[2]==='run') { try { write(path.join(ROOT,'last-error.json'),report); } catch {} }
  console.log(JSON.stringify(report));process.exitCode=1;
});
