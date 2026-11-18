// Run on the server AFTER installing a verified backup, BEFORE production cutover.
// Faults affect only the three drill loopback ports, never production listeners.
const net=require('node:net'),fs=require('node:fs'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const {fetch,ProxyAgent}=createRequire('C:/stable-cloud/runtime/package.json')('undici');
const {createRouter}=require('./router.cjs');
const report={startedAt:new Date().toISOString(),faultsIsolated:true,generationCalls:0,checks:[]};
async function bridge(port,destination){const sockets=new Set();let blocked=false;const server=net.createServer(client=>{
 sockets.add(client);client.on('error',()=>{});client.once('close',()=>sockets.delete(client));
 if(blocked){client.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n',()=>client.destroy());return;}
 const upstream=net.connect(destination,'127.0.0.1');for(const s of [client,upstream]){sockets.add(s);s.on('error',()=>{client.destroy();upstream.destroy()});s.on('close',()=>sockets.delete(s));}client.on('close',()=>upstream.destroy());upstream.on('close',()=>client.destroy());client.pipe(upstream);upstream.pipe(client);
});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
return {block(value){blocked=value;if(value)for(const s of sockets)s.destroy()},async close(){for(const s of sockets)s.destroy();await new Promise(r=>server.close(r))}};}
async function probe(port){const agent=new ProxyAgent('http://127.0.0.1:'+port);try{const r=await fetch('https://api.openai.com/v1/models',{dispatcher:agent,redirect:'manual',signal:AbortSignal.timeout(8000)});await r.body?.cancel();return {ok:r.status===401,status:r.status};}finally{await agent.destroy()}}
async function run(){let primary,backup,backup2,router;try{
 const config=JSON.parse(fs.readFileSync('C:/stable-cloud/egress-ha/router.json','utf8'));
 const nodes=[{id:'primary',port:10838},{id:'backup',port:10837}];
 primary=await bridge(10838,10818);backup=await bridge(10837,10828);
 if(config.nodes.some(n=>n.id==='backup-2')){backup2=await bridge(10836,10829);nodes.push({id:'backup-2',port:10836})}
 router=createRouter({nodes,probe:n=>probe(n.port),intervalMs:1000,staleMs:55000});
 await new Promise((resolve,reject)=>{router.server.once('error',reject);router.server.listen(10839,'127.0.0.1',resolve)});
 await router.check();assert.equal(router.pool.snapshot().status,'healthy');router.pool.active='primary';assert.equal((await probe(10839)).status,401);report.checks.push({phase:'both_healthy',...router.pool.snapshot()});
 // Use the production failure/recovery thresholds, accelerate only the wait between checks.
 primary.block(true);await router.check();await router.check();assert.equal(router.pool.active,'backup');assert.equal((await probe(10839)).status,401);report.checks.push({phase:'primary_path_failed_backup_serves',...router.pool.snapshot()});
 backup.block(true);await router.check();await router.check();
 if(backup2){assert.equal(router.pool.active,'backup-2');assert.equal((await probe(10839)).status,401);report.checks.push({phase:'first_two_failed_second_backup_serves',...router.pool.snapshot()});backup2.block(true);await router.check();await router.check();}
 assert.equal(router.pool.snapshot().status,'unavailable');await assert.rejects(probe(10839));report.checks.push({phase:'all_failed_closed',...router.pool.snapshot()});
 primary.block(false);backup.block(false);backup2?.block(false);await router.check();await router.check();assert.equal(router.pool.snapshot().status,'unavailable');await router.check();assert.equal(router.pool.snapshot().status,'healthy');assert.equal((await probe(10839)).status,401);report.checks.push({phase:'three_checks_recovered',...router.pool.snapshot()});
 report.ok=true;
}catch(e){report.ok=false;report.error=e.name==='AssertionError'?'assertion_failed':'drill_failed';process.exitCode=1;}
finally{fs.writeFileSync('C:/stable-cloud/egress-ha/fault-drill.json',JSON.stringify(report,null,2));await router?.close();await primary?.close();await backup?.close();await backup2?.close();report.finishedAt=new Date().toISOString();fs.writeFileSync('C:/stable-cloud/egress-ha/fault-drill.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}}
run();
