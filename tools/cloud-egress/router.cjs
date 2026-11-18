'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

class HealthPool {
  constructor(nodes, { now = Date.now, staleMs = 55000, onChange = () => {} } = {}) {
    this.now = now; this.staleMs = staleMs; this.onChange = onChange; this.active = null; this.switches = 0;
    this.nodes = nodes.map(n => ({ ...n, transitions: [], healthy: false, tested: false, successes: 0, failures: 0, lastSuccessAt: 0, checkedAt: 0, status: null }));
  }
  usable(n) { return n.healthy && this.now() - n.lastSuccessAt < this.staleMs; }
  record(id, ok, status = null) {
    const n = this.nodes.find(n => n.id === id), before = n.healthy, first = !n.tested;
    n.tested = true; n.checkedAt = this.now(); n.status = Number.isInteger(status) ? status : null;
    if (ok) { n.lastSuccessAt = this.now(); n.failures = 0; n.successes++; if (first || n.successes >= 3) n.healthy = true; }
    else { n.successes = 0; n.failures++; if (n.failures >= 2 || first) n.healthy = false; }
    if (before !== n.healthy) { if (!first) this.transition(n); this.onChange({ type: 'node_health', node: id, healthy: n.healthy, at: this.now() }); }
    this.select();
  }
  connectionFailed(id) {
    const n = this.nodes.find(n => n.id === id); if (n.healthy) this.transition(n); n.healthy = false; n.successes = 0; n.failures++;
    this.onChange({ type: 'connect_failed', node: id, at: this.now() }); this.select();
  }
  transition(n) { n.transitions = n.transitions.filter(t => this.now() - t < 300000); n.transitions.push(this.now()); n.transitions = n.transitions.slice(-12); }
  select(excluded = new Set()) {
    const current = this.nodes.find(n => n.id === this.active && !excluded.has(n.id) && this.usable(n));
    const next = current || this.nodes.find(n => !excluded.has(n.id) && this.usable(n));
    const nextId = next?.id || null;
    if (nextId !== this.active) { const previous = this.active; this.active = nextId; if (previous) this.switches++; this.onChange({ type: 'route_change', previous, active: nextId, at: this.now() }); }
    return next;
  }
  snapshot() {
    this.select(); const healthy = this.nodes.filter(n => this.usable(n)).length;
    return { version: 1, status: healthy === this.nodes.length && healthy > 1 ? 'healthy' : healthy ? 'degraded' : 'unavailable', active: this.active, checkedAt: this.now(), switches: this.switches, nodes: this.nodes.map(n => ({ id: n.id, healthy: this.usable(n), checkedAt: n.checkedAt, lastSuccessAt: n.lastSuccessAt, failures: n.failures, status: n.status, unstable: n.transitions.filter(t => this.now() - t < 300000).length >= 4 })), generationRetries: 0 };
  }
}

function createRouter({ nodes, probe, now, onChange, intervalMs = 20000, staleMs = 55000, connectTimeoutMs = 4000, idleMs = 600000 }) {
  if (!nodes.length || nodes.length > 3 || nodes.some(n => !/^[a-z0-9-]{1,30}$/.test(n.id) || !Number.isInteger(n.port) || n.port < 1 || n.port > 65535) || new Set(nodes.map(n => n.id)).size !== nodes.length) throw Error('Invalid loopback nodes');
  const pool = new HealthPool(nodes, { now, staleMs, onChange });
  const sockets = new Set(); let stopped = false, timer, checking;
  const server = http.createServer({ maxHeaderSize: 8192 }, (req, res) => {
    if (req.method !== 'GET' || req.url !== '/health') { res.writeHead(405, { 'Content-Length': '0', Connection: 'close' }); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(pool.snapshot()));
  });
  server.headersTimeout = 5000; server.requestTimeout = 5000; server.maxConnections = 100;
  server.on('clientError', (_error, socket) => socket.destroy());
  server.on('connection', socket => { sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => sockets.delete(socket)); });
  function openTunnel(node, client) {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: node.port, method: 'CONNECT', path: 'api.openai.com:443', headers: { Host: 'api.openai.com:443' }, agent: false });
      let settled = false;
      const deadline = setTimeout(() => req.destroy(Error('CONNECT_TIMEOUT')), connectTimeoutMs);
      const abort = () => req.destroy(Error('CLIENT_CLOSED'));
      client.once('close', abort);
      const finish = () => { settled = true; clearTimeout(deadline); client.off('close', abort); };
      req.once('connect', (res, upstream, head) => { if (settled) { upstream.destroy(); return; } finish(); if (res.statusCode !== 200) { upstream.destroy(); reject(Error('CONNECT_REJECTED')); } else { upstream.pause(); resolve({ upstream, head }); } });
      req.once('response', res => { res.destroy(); if (!settled) { finish(); reject(Error('CONNECT_REJECTED')); } });
      req.on('error', () => { if (!settled) { finish(); reject(Error('CONNECT_FAILED')); } });
      req.end();
    });
  }
  server.on('connect', async (req, client, clientHead) => {
    client.pause();
    if (req.url?.toLowerCase() !== 'api.openai.com:443') { client.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'); return; }
    const attempted = new Set();
    for (let count = 0; count < nodes.length && !client.destroyed; count++) {
      const node = pool.select(attempted); if (!node) break; attempted.add(node.id);
      let tunnel;
      try { tunnel = await openTunnel(node, client); }
      catch { if (client.destroyed) return; pool.connectionFailed(node.id); continue; }
      const { upstream, head } = tunnel;
      if (client.destroyed) { upstream.destroy(); return; }
      sockets.add(upstream); upstream.once('close', () => { sockets.delete(upstream); client.destroy(); });
      client.once('close', () => upstream.destroy());
      upstream.on('error', () => { pool.connectionFailed(node.id); client.destroy(); });
      client.setTimeout(idleMs, () => client.destroy()); upstream.setTimeout(idleMs, () => upstream.destroy());
      // Retry is possible only before this point: no client TLS/application bytes
      // have been forwarded. Once accepted, never replay or migrate this tunnel.
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) client.write(head);
      if (clientHead.length) upstream.write(clientHead);
      client.pipe(upstream); upstream.pipe(client); client.resume(); upstream.resume(); return;
    }
    if (!client.destroyed) client.end('HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
  });
  async function check() {
    if (checking) return checking;
    checking = Promise.all(pool.nodes.map(async n => { try { const result = await probe(n); pool.record(n.id, result.ok === true, result.status); } catch { pool.record(n.id, false); } })).finally(() => { checking = null; });
    return checking;
  }
  async function loop() { await check(); if (!stopped) { timer = setTimeout(loop, intervalMs); timer.unref(); } }
  return { server, pool, check, startChecks: () => void loop(), close: async () => { stopped = true; clearTimeout(timer); for (const s of sockets) s.destroy(); await new Promise(resolve => server.close(resolve)); } };
}

function start(configFile) {
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  if (![10819,10839].includes(config.port) || config.nodes.length < 2 || config.nodes.some(n => ![10818,10828,10829].includes(n.port))) throw Error('Production loopback config rejected');
  const { createRequire } = require('node:module');
  const { fetch, ProxyAgent } = createRequire('C:/stable-cloud/runtime/package.json')('undici');
  const logFile = path.join(path.dirname(configFile), 'events.jsonl');
  const onChange = event => { try { if (fs.existsSync(logFile) && fs.statSync(logFile).size > 2 * 1024 * 1024) { fs.copyFileSync(logFile, logFile + '.previous'); fs.truncateSync(logFile, 0); } fs.appendFileSync(logFile, JSON.stringify(event) + '\n'); } catch { console.error('EGRESS_EVENT_WRITE_FAILED'); } };
  const probe = async n => {
    // A fresh tunnel on every check detects DNS/TLS/path failure hidden by pooled connections.
    const agent = new ProxyAgent('http://127.0.0.1:' + n.port);
    try { const res = await fetch('https://api.openai.com/v1/models', { dispatcher: agent, redirect: 'manual', signal: AbortSignal.timeout(8000) }); const status = res.status; await res.body?.cancel(); return { ok: status === 401, status }; }
    finally { await agent.destroy(); }
  };
  const router = createRouter({ nodes: config.nodes, probe, onChange });
  router.server.listen(config.port, '127.0.0.1', () => { console.log('EGRESS_ROUTER_STARTED'); router.startChecks(); });
  router.server.on('error', () => { console.error('EGRESS_ROUTER_LISTEN_FAILED'); process.exit(1); });
  process.once('SIGTERM', () => router.close().then(() => process.exit(0)));
  return router;
}
module.exports = { HealthPool, createRouter };
if (require.main === module) { try { start(process.argv[2]); } catch { console.error('EGRESS_ROUTER_START_FAILED'); process.exitCode = 1; } }
