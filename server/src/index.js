// Servidor de sinalização da Telepresença Robótica.
// - HTTP: login do operador, criação de sessões, credenciais ICE/TURN.
// - WebSocket: troca de SDP/ICE, comandos do operador e status do personagem.
// A mídia (áudio/vídeo) NUNCA passa por aqui: ela trafega via WebRTC (P2P ou TURN).
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { createTokenService, safeEqual, randomId } from './tokens.js';
import { getIceServers } from './ice.js';

const env = process.env;
const PORT = Number(env.PORT || 8787);
const PROD = env.NODE_ENV === 'production';
const SESSION_TTL_H = Number(env.SESSION_TTL_HOURS || 12);
const MAX_MESSAGE_BYTES = 768 * 1024; // comporta uma saudação gravada (áudio Opus em base64)

let secret = env.SESSION_SECRET;
if (!secret) {
  if (PROD) {
    console.error('[fatal] Defina SESSION_SECRET (mínimo 32 caracteres).');
    process.exit(1);
  }
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('[aviso] SESSION_SECRET ausente: usando um segredo temporário (apenas desenvolvimento).');
}
if (!env.OPERATOR_PASSWORD) {
  if (PROD) {
    console.error('[fatal] Defina OPERATOR_PASSWORD.');
    process.exit(1);
  }
  console.warn('[aviso] OPERATOR_PASSWORD ausente: senha de desenvolvimento "operador".');
}
const OPERATOR_PASSWORD = env.OPERATOR_PASSWORD || 'operador';
const tokens = createTokenService(secret);
const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
if (!allowedOrigins.length) console.warn('[aviso] ALLOWED_ORIGINS vazio: qualquer origem é aceita.');

const originAllowed = (origin) => !allowedOrigins.length || (origin && allowedOrigins.includes(origin.replace(/\/$/, '')));

// ---------------------------------------------------------------- HTTP

const loginAttempts = new Map(); // ip -> { count, resetAt }
function rateLimited(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || rec.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  rec.count += 1;
  return rec.count > 8;
}

function send(res, status, body, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (origin && originAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(body === undefined ? '' : JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024) throw new Error('payload grande demais');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? tokens.verify(h.slice(7)) : null;
}

const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'OPTIONS') {
    if (!originAllowed(origin)) return send(res, 403, { error: 'Origem não autorizada.' });
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    });
    return res.end();
  }
  if (origin && !originAllowed(origin)) return send(res, 403, { error: 'Origem não autorizada.' });

  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return send(res, 200, { ok: true, service: 'telepresenca-signaling', rooms: rooms.size }, origin);
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      if (rateLimited(clientIp(req))) return send(res, 429, { error: 'Muitas tentativas. Aguarde um minuto.' }, origin);
      const { password } = await readJson(req);
      if (!password || !safeEqual(password, OPERATOR_PASSWORD)) {
        return send(res, 401, { error: 'Senha incorreta.' }, origin);
      }
      const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_H * 3600;
      return send(res, 200, { token: tokens.sign({ role: 'admin', exp }), expiresAt: exp * 1000 }, origin);
    }

    if (req.method === 'POST' && url.pathname === '/api/sessions') {
      const auth = bearer(req);
      if (!auth || auth.role !== 'admin') return send(res, 401, { error: 'Autenticação do operador necessária.' }, origin);
      const sid = randomId(12);
      const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_H * 3600;
      return send(res, 200, {
        sessionId: sid,
        operatorToken: tokens.sign({ role: 'operator', sid, exp }),
        robotToken: tokens.sign({ role: 'robot', sid, exp }),
        expiresAt: exp * 1000,
      }, origin);
    }

    if (req.method === 'GET' && url.pathname === '/api/ice') {
      const auth = bearer(req);
      if (!auth || !auth.sid || revoked.has(auth.sid)) return send(res, 401, { error: 'Token de sessão inválido.' }, origin);
      return send(res, 200, await getIceServers(env, auth.sid), origin);
    }

    return send(res, 404, { error: 'Rota não encontrada.' }, origin);
  } catch (err) {
    console.error('[http]', err);
    return send(res, 400, { error: 'Requisição inválida.' }, origin);
  }
});

// ---------------------------------------------------------------- WebSocket

/** @type {Map<string, {operator?: import('ws').WebSocket, robot?: import('ws').WebSocket, config: object|null, idleTimer?: NodeJS.Timeout}>} */
const rooms = new Map();
const revoked = new Map(); // sid -> expiração (ms)

const other = (role) => (role === 'operator' ? 'robot' : 'operator');
const sendWs = (ws, msg) => ws && ws.readyState === 1 && ws.send(JSON.stringify(msg));

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/ws') return socket.destroy();
  if (!originAllowed(req.headers.origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, url.searchParams.get('token')));
});

wss.on('connection', (ws, token) => {
  const auth = tokens.verify(token);
  if (!auth || !auth.sid || (auth.role !== 'operator' && auth.role !== 'robot')) {
    return ws.close(4003, 'token invalido');
  }
  if (revoked.has(auth.sid)) return ws.close(4004, 'sessao encerrada');

  const { sid, role } = auth;
  let room = rooms.get(sid);
  if (!room) {
    room = { config: null };
    rooms.set(sid, room);
  }
  clearTimeout(room.idleTimer);

  // Apenas um dispositivo por papel: a conexão mais recente substitui a anterior.
  if (room[role] && room[role] !== ws) room[role].close(4001, 'substituido');
  room[role] = ws;
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  sendWs(ws, { type: 'welcome', role, sessionId: sid, peerPresent: !!room[other(role)], config: room.config });
  sendWs(room[other(role)], { type: 'peer-joined', role });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return sendWs(ws, { type: 'error', message: 'Mensagem inválida.' });
    }
    const peer = room[other(role)];
    switch (msg.type) {
      case 'ping':
        return sendWs(ws, { type: 'pong', t: msg.t });
      case 'signal':
        return sendWs(peer, { type: 'signal', from: role, data: msg.data });
      case 'control':
        if (role !== 'operator') return;
        return sendWs(room.robot, { type: 'control', control: msg.control });
      case 'config':
        if (role !== 'operator' || typeof msg.config !== 'object' || !msg.config) return;
        room.config = { ...(room.config || {}), ...msg.config };
        return sendWs(room.robot, { type: 'config', config: msg.config });
      case 'status':
        if (role !== 'robot') return;
        return sendWs(room.operator, { type: 'status', status: msg.status });
      case 'end':
        if (role !== 'operator') return;
        revoked.set(sid, (auth.exp || 0) * 1000);
        for (const r of ['operator', 'robot']) {
          sendWs(room[r], { type: 'session-ended' });
          room[r]?.close(4004, 'sessao encerrada');
        }
        rooms.delete(sid);
        return;
      default:
        return sendWs(ws, { type: 'error', message: `Tipo desconhecido: ${msg.type}` });
    }
  });

  ws.on('close', () => {
    const current = rooms.get(sid);
    if (!current || current[role] !== ws) return;
    delete current[role];
    sendWs(current[other(role)], { type: 'peer-left', role });
    if (!current.operator && !current.robot) {
      current.idleTimer = setTimeout(() => rooms.delete(sid), 30 * 60_000);
    }
  });
});

// Detecta conexões mortas (rede caiu sem fechar o socket).
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
  const now = Date.now();
  for (const [sid, exp] of revoked) if (exp < now) revoked.delete(sid);
}, 20_000);

server.listen(PORT, () => console.log(`[sinalização] ouvindo na porta ${PORT}`));

const shutdown = () => {
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.close(1001, 'servidor reiniciando');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
