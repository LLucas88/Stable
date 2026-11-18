const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),net=require('node:net');
const {HealthPool,createRouter}=require('./router.cjs');
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
test('two failures isolate an exit, recovery needs three successes and does not flap back',()=>{
 let now=1000;const events=[],pool=new HealthPool([{id:'primary',port:1},{id:'backup',port:2}],{now:()=>now,onChange:e=>events.push(e)});
 pool.record('primary',true,401);pool.record('backup',true,401);assert.equal(pool.snapshot().status,'healthy');assert.equal(pool.active,'primary');
 now+=1000;pool.record('primary',false);assert.equal(pool.active,'primary');pool.record('primary',false);assert.equal(pool.active,'backup');
 pool.record('primary',true);pool.record('primary',true);assert.equal(pool.snapshot().status,'degraded');pool.record('primary',true);assert.equal(pool.snapshot().status,'healthy');assert.equal(pool.active,'backup');
 now+=56000;assert.equal(pool.select(),undefined);assert.equal(pool.snapshot().status,'unavailable');assert(events.some(e=>e.type==='route_change'&&e.active==='backup'));
});
async function echoProxy(t,{drop=false}={}){
 const sockets=new Set(),received=[];const server=http.createServer();
 server.on('connection',s=>{sockets.add(s);s.on('error',()=>{});s.on('close',()=>sockets.delete(s))});
 server.on('connect',(req,socket,head)=>{assert.equal(req.url,'api.openai.com:443');assert.equal(head.length,0);socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');socket.on('data',data=>{received.push(data.toString());if(drop)socket.destroy();else socket.write(data)})});
 const port=await listen(server);t.after(async()=>{for(const s of sockets)s.destroy();await new Promise(r=>server.close(r))});return {port,received};
}
function connect(port,target='api.openai.com:443'){
 return new Promise((resolve,reject)=>{const socket=net.connect(port,'127.0.0.1'),chunks=[];socket.on('error',reject);socket.setTimeout(3000,()=>socket.destroy(Error('Test timeout')));socket.once('connect',()=>socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));const read=data=>{chunks.push(data);const b=Buffer.concat(chunks),end=b.indexOf('\r\n\r\n');if(end<0)return;socket.off('data',read);resolve({socket,status:Number(b.toString('ascii').split(' ')[1])})};socket.on('data',read)});
}
async function fixture(t,nodes){const router=createRouter({nodes,probe:async()=>({ok:true,status:401}),connectTimeoutMs:200});const port=await listen(router.server);t.after(()=>router.close());await router.check();return {router,port};}
test('a new tunnel uses healthy backup; an existing tunnel is not replayed or interrupted',async t=>{
 const a=await echoProxy(t),b=await echoProxy(t),{router,port}=await fixture(t,[{id:'primary',port:a.port},{id:'backup',port:b.port}]);
 const first=await connect(port);assert.equal(first.status,200);
 router.pool.record('primary',false);router.pool.record('primary',false);
 const firstEcho=new Promise(r=>first.socket.once('data',r));first.socket.write('existing-request');assert.equal((await firstEcho).toString(),'existing-request');
 const second=await connect(port);assert.equal(second.status,200);const secondEcho=new Promise(r=>second.socket.once('data',r));second.socket.write('new-request');await secondEcho;
 assert.deepEqual(a.received,['existing-request']);assert.deepEqual(b.received,['new-request']);first.socket.destroy();second.socket.destroy();
});
test('connection refused before accepting client bytes safely selects the second exit',async t=>{
 const dead=net.createServer(),deadPort=await listen(dead);await new Promise(r=>dead.close(r));const b=await echoProxy(t);
 const {router,port}=await fixture(t,[{id:'primary',port:deadPort},{id:'backup',port:b.port}]);const c=await connect(port);assert.equal(c.status,200);assert.equal(router.pool.active,'backup');
 const echo=new Promise(r=>c.socket.once('data',r));c.socket.write('only-once');await echo;assert.deepEqual(b.received,['only-once']);c.socket.destroy();
});
test('failure after accepting a tunnel never resubmits application bytes through backup',async t=>{
 const a=await echoProxy(t,{drop:true}),b=await echoProxy(t),{port}=await fixture(t,[{id:'primary',port:a.port},{id:'backup',port:b.port}]);const c=await connect(port);assert.equal(c.status,200);
 const closed=new Promise(r=>c.socket.once('close',r));c.socket.write('paid-request');await closed;assert.deepEqual(a.received,['paid-request']);assert.deepEqual(b.received,[]);
});
test('all exits down fail closed; arbitrary hosts and normal proxy requests are rejected',async t=>{
 const a=await echoProxy(t),{router,port}=await fixture(t,[{id:'primary',port:a.port}]);
 router.pool.connectionFailed('primary');const c=await connect(port);assert.equal(c.status,503);c.socket.destroy();assert.deepEqual(a.received,[]);
 for(const target of ['localhost:443','api.openai.com:80','api.openai.com.evil:443','user@api.openai.com:443']){const x=await connect(port,target);assert.equal(x.status,403);x.socket.destroy();}
 assert.equal((await fetch('http://127.0.0.1:'+port+'/v1/images/generations',{method:'POST',body:'secret'})).status,405);
 const health=await(await fetch('http://127.0.0.1:'+port+'/health')).json();assert.equal(health.status,'unavailable');assert.equal(health.generationRetries,0);assert(!JSON.stringify(health).includes('port'));
});
