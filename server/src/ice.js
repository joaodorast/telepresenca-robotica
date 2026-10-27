// Montagem da lista de servidores ICE (STUN + TURN) entregue aos clientes autenticados.
// Os segredos ficam somente aqui no backend; o navegador recebe credenciais temporárias.
import crypto from 'node:crypto';

const DEFAULT_STUN = 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302';
const split = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

let meteredCache = { at: 0, servers: null };

async function fetchMetered(env) {
  if (!env.METERED_DOMAIN || !env.METERED_API_KEY) return [];
  if (meteredCache.servers && Date.now() - meteredCache.at < 10 * 60_000) return meteredCache.servers;
  const url = `https://${env.METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${encodeURIComponent(env.METERED_API_KEY)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Metered respondeu ${res.status}`);
  const data = await res.json();
  const servers = Array.isArray(data) ? data : Array.isArray(data.iceServers) ? data.iceServers : [];
  meteredCache = { at: Date.now(), servers };
  return servers;
}

function coturn(env, sessionId) {
  const urls = split(env.TURN_URLS);
  if (!urls.length) return [];
  if (env.TURN_STATIC_AUTH_SECRET) {
    // Credenciais temporárias no padrão "TURN REST API" (coturn: use-auth-secret / static-auth-secret)
    const ttl = Number(env.TURN_TTL_SECONDS || 6 * 3600);
    const username = `${Math.floor(Date.now() / 1000) + ttl}:${sessionId}`;
    const credential = crypto.createHmac('sha1', env.TURN_STATIC_AUTH_SECRET).update(username).digest('base64');
    return [{ urls, username, credential }];
  }
  if (env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    return [{ urls, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }];
  }
  return [];
}

export async function getIceServers(env, sessionId) {
  const servers = [{ urls: split(env.STUN_URLS || DEFAULT_STUN) }];
  const warnings = [];
  try {
    servers.push(...(await fetchMetered(env)));
  } catch (err) {
    warnings.push(`TURN (Metered) indisponível: ${err.message}`);
  }
  servers.push(...coturn(env, sessionId));
  const hasTurn = servers.some((s) => [].concat(s.urls).some((u) => String(u).startsWith('turn')));
  // Na rede local (npm run lan) a mídia vai direto entre os notebooks; TURN não faz falta.
  if (!hasTurn && !env.LAN_MODE) warnings.push('Nenhum servidor TURN configurado: conexões atrás de NAT restritivo podem falhar.');
  return { iceServers: servers, hasTurn, warnings };
}
