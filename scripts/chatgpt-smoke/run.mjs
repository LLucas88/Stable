import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { transaction, authorizationURL, callbackResult, discover, exchangeCode, verifyTokens,
  listModels, invoke, SmokeError, safeError } from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(root, '.local', 'chatgpt-smoke');
const args = process.argv.slice(2);
if (args.some((value, i) => value !== '--model' && args[i - 1] !== '--model') || args.filter(x => x === '--model').length > 1 || args.at(-1) === '--model') {
  console.error('Usage: node scripts/chatgpt-smoke/run.mjs [--model MODEL_SLUG]'); process.exit(2);
}
const requestedModel = args.includes('--model') ? args[args.indexOf('--model') + 1] : undefined;
const report = { startedAt: new Date().toISOString(), status: 'running', stages: {} };
const reportFile = path.join(dir, 'latest-result.json');
fs.mkdirSync(dir, { recursive: true });
function save(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
function stage(name, status) {
  report.stages[name] = status; save(reportFile, report);
  console.log(`[${name}] ${status}`);
}
function openBrowser(url) {
  if (new URL(url).origin !== 'https://auth.openai.com') throw new SmokeError('UNTRUSTED_BROWSER_URL');
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-Command', '$u=[Console]::In.ReadToEnd(); Start-Process -FilePath $u'],
      { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('error', () => reject(new SmokeError('BROWSER_LAUNCH_FAILED')));
    child.on('exit', code => code === 0 ? resolve() : reject(new SmokeError('BROWSER_LAUNCH_FAILED')));
    child.stdin.on('error', () => {}); child.stdin.end(url);
  });
}
let server, timer, accessToken, stopLogin;
const shutdown = () => { clearTimeout(timer); server?.closeAllConnections(); server?.close(); accessToken = undefined; };
process.on('SIGINT', () => { shutdown(); process.exit(130); });
process.on('SIGTERM', () => { shutdown(); process.exit(143); });
try {
  if (process.platform !== 'win32') throw new SmokeError('WINDOWS_VALIDATION_ONLY');
  const require = createRequire(import.meta.url);
  const { windowsUserProtection } = require(path.join(root, 'desktop/services/windows-user-protection.cjs'));
  const registrationFile = path.join(dir, 'registration.dpapi');
  let registration = {};
  if (fs.existsSync(registrationFile)) {
    registration = JSON.parse(windowsUserProtection.decryptString(fs.readFileSync(registrationFile)));
  }
  const hostFile = path.join(dir, 'host.json');
  let hostId = fs.existsSync(hostFile) ? JSON.parse(fs.readFileSync(hostFile, 'utf8')).hostId : `urn:uuid:${randomUUID()}`;
  if (!/^urn:uuid:[0-9a-f-]{36}$/i.test(hostId)) throw new SmokeError('INVALID_SAVED_HOST');
  if (!fs.existsSync(hostFile)) save(hostFile, { hostId });
  function saveRegistration(value) {
    const encrypted = windowsUserProtection.encryptString(JSON.stringify(value));
    const tmp = `${registrationFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, encrypted, { mode: 0o600 }); fs.renameSync(tmp, registrationFile);
  }
  // Verify OS encryption before requesting authorization. Only registration metadata is persisted.
  if (windowsUserProtection.decryptString(windowsUserProtection.encryptString('probe')) !== 'probe') throw new SmokeError('ENCRYPTION_UNAVAILABLE');
  stage('preflight', 'running');
  const jwks = await discover();
  stage('preflight', 'passed');
  const tx = transaction(registration.clientId);
  const callback = new Promise((resolve, reject) => {
    stopLogin = reject;
    server = http.createServer((req, res) => {
      const headers = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' };
      if (req.method !== 'GET' || req.headers.host !== `127.0.0.1:${server.address().port}` || !req.url.startsWith('/auth/callback?')) {
        res.writeHead(404, headers); res.end('Not found'); return;
      }
      try {
        const result = callbackResult(new URL(req.url, tx.redirectUri), tx);
        res.writeHead(200, headers); res.end('Stable 已收到授权回调。正在验证身份、获取模型并发送一条测试消息；请回到 Codex 查看最终结果。');
        resolve(result);
      } catch (error) {
        res.writeHead(400, headers); res.end('授权回调无效。请回到 Codex 查看验证状态。');
        if (tx.consumed) reject(error);
      }
    });
    server.on('error', () => reject(new SmokeError('CALLBACK_LISTENER_FAILED')));
    timer = setTimeout(() => reject(new SmokeError('SIGN_IN_TIMED_OUT')), 600_000);
  });
  callback.catch(() => {});
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  tx.redirectUri = `http://127.0.0.1:${server.address().port}/auth/callback`;
  stage('login', 'waiting_for_user');
  console.log('请在打开的浏览器中登录 ChatGPT 并授权 Stable 使用订阅额度。仅发送固定短测试消息。');
  await openBrowser(authorizationURL(tx, hostId));
  const result = await callback;
  clearTimeout(timer); server.close();
  // Retain the issued registration even if token exchange later fails; never persist tokens.
  registration = { ...registration, clientId: result.clientId }; saveRegistration(registration);
  let tokens = await exchangeCode(result, tx);
  const verified = await verifyTokens(tokens, tx, result.clientId, jwks, registration.subject);
  accessToken = verified.accessToken; tokens = undefined;
  saveRegistration({ clientId: result.clientId, subject: verified.subject });
  stage('login', 'passed');
  const models = await listModels(accessToken);
  report.models = models;
  stage('models', 'passed');
  console.log('可用模型：\n' + models.map(m => JSON.stringify(m)).join('\n'));
  const model = requestedModel || models[0].slug;
  if (!models.some(m => m.slug === model)) throw new SmokeError('REQUESTED_MODEL_NOT_AVAILABLE');
  report.model = model;
  stage('inference', 'running');
  const output = await invoke(accessToken, model);
  report.responseCompleted = output.completed;
  report.output = output.text;
  report.exactMatch = output.text.trim() === 'STABLE_SIWC_OK';
  stage('inference', 'passed');
  report.status = 'passed'; report.finishedAt = new Date().toISOString(); save(reportFile, report);
  console.log('STABLE_SIWC_PASS ' + JSON.stringify({ model, output: output.text, exactMatch: report.exactMatch }));
} catch (error) {
  report.status = 'failed'; report.error = safeError(error); report.finishedAt = new Date().toISOString();
  save(reportFile, report); console.error('STABLE_SIWC_FAIL ' + JSON.stringify(report.error)); process.exitCode = 1;
} finally { stopLogin?.(new SmokeError('CANCELLED')); shutdown(); }
