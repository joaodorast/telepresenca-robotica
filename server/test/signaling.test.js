// Teste de integração: login, criação de sessão, ICE e troca de mensagens entre operador e robô.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const PORT = 18787;
const BASE = `http://localhost:${PORT}`;
let proc;

before(async () => {
  proc = spawn(process.execPath, ['src/index.js'], {
    env: { ...process.env, PORT: String(PORT), SESSION_SECRET: 'x'.repeat(40), OPERATOR_PASSWORD: 'segredo', ALLOWED_ORIGINS: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('servidor não subiu');
});
after(() => proc.kill());

const post = (path, body, token) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {}),
  });

function connect(token) {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws?token=${encodeURIComponent(token)}`);
  const queue = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    const w = waiters.shift();
    w ? w(m) : queue.push(m);
  });
  ws.next = () => new Promise((r) => (queue.length ? r(queue.shift()) : waiters.push(r)));
  ws.closed = new Promise((r) => ws.on('close', (code) => r(code)));
  return ws;
}

test('fluxo completo de sessão', async () => {
  assert.equal((await post('/api/auth/login', { password: 'errada' })).status, 401);
  const { token } = await (await post('/api/auth/login', { password: 'segredo' })).json();
  assert.ok(token);

  assert.equal((await post('/api/sessions', {}, 'token-falso')).status, 401);
  const s = await (await post('/api/sessions', {}, token)).json();
  assert.ok(s.sessionId && s.operatorToken && s.robotToken);

  const ice = await (await fetch(`${BASE}/api/ice`, { headers: { Authorization: `Bearer ${s.robotToken}` } })).json();
  assert.ok(Array.isArray(ice.iceServers) && ice.iceServers.length >= 1);

  const op = connect(s.operatorToken);
  const w1 = await op.next();
  assert.equal(w1.type, 'welcome');
  assert.equal(w1.peerPresent, false);

  op.send(JSON.stringify({ type: 'config', config: { greetingText: 'Oi!' } }));
  const robot = connect(s.robotToken);
  const w2 = await robot.next();
  assert.equal(w2.peerPresent, true);
  assert.equal(w2.config.greetingText, 'Oi!');
  assert.equal((await op.next()).type, 'peer-joined');

  op.send(JSON.stringify({ type: 'signal', data: { kind: 'offer', pcId: 'a', sdp: 'v=0' } }));
  assert.deepEqual((await robot.next()).data.kind, 'offer');

  op.send(JSON.stringify({ type: 'control', control: { action: 'expression', expression: 'happy' } }));
  assert.equal((await robot.next()).control.expression, 'happy');

  // O robô não pode enviar comandos de controle
  robot.send(JSON.stringify({ type: 'control', control: { action: 'greet' } }));
  robot.send(JSON.stringify({ type: 'status', status: { activity: 'waiting' } }));
  const st = await op.next();
  assert.equal(st.type, 'status');

  op.send(JSON.stringify({ type: 'end' }));
  assert.equal((await robot.next()).type, 'session-ended');
  assert.equal(await robot.closed, 4004);

  const again = connect(s.robotToken);
  assert.equal(await again.closed, 4004);
});
