// Modo rede local: sobe o servidor de sinalização e o frontend (HTTPS) neste notebook para que
// outro notebook da mesma rede Wi-Fi/cabo abra o /robot pelo IP — sem Vercel, Render ou internet.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { request } from 'node:https';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB_PORT = 5173;
const SIGNALING_PORT = Number(process.env.SIGNALING_PORT || 8787);

for (const dir of ['node_modules', join('server', 'node_modules')]) {
  if (!existsSync(join(root, dir))) {
    console.error(`[lan] Dependências ausentes em ${dir}. Rode "npm install" na raiz e em "server".`);
    process.exit(1);
  }
}

// IPv4 da rede local; endereços privados (192.168/10/172.16-31) primeiro.
const isPrivate = (ip) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
const ips = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
  .map((a) => a.address)
  .sort((a, b) => Number(isPrivate(b)) - Number(isPrivate(a)));

if (!ips.length) console.warn('[lan] Nenhum IP de rede encontrado: conecte este notebook ao Wi-Fi/cabo.');

const lanOrigins = ips.map((ip) => `https://${ip}:${WEB_PORT}`);
const allowedOrigins = [...lanOrigins, `https://localhost:${WEB_PORT}`, `http://localhost:${WEB_PORT}`];

const children = [];
function run(name, args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' });
  child.on('exit', (code) => {
    console.error(`[lan] ${name} encerrou (código ${code}).`);
    shutdown(code ?? 1);
  });
  children.push(child);
}

function shutdown(code = 0) {
  for (const c of children) if (c.exitCode === null) c.kill();
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// Variáveis do processo têm precedência sobre server/.env (--env-file não as sobrescreve).
run('servidor de sinalização', ['--env-file-if-exists=.env', 'src/index.js'], join(root, 'server'), {
  NODE_ENV: 'development',
  LAN_MODE: '1',
  PORT: String(SIGNALING_PORT),
  ALLOWED_ORIGINS: allowedOrigins.join(','),
});

run('frontend', [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--mode', 'lan', '--strictPort', '--port', String(WEB_PORT)], root, {
  SIGNALING_TARGET: `http://localhost:${SIGNALING_PORT}`,
  VITE_LAN_ORIGIN: lanOrigins[0] || '',
});

// ---------------------------------------------------------------- abertura automática

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const main = lanOrigins[0] || `https://localhost:${WEB_PORT}`;
const signaling = `http://localhost:${SIGNALING_PORT}`;

/** Senha da central: a mesma que o servidor lê de server/.env (ou a padrão de desenvolvimento). */
function operatorPassword() {
  if (process.env.OPERATOR_PASSWORD) return process.env.OPERATOR_PASSWORD;
  try {
    const m = readFileSync(join(root, 'server', '.env'), 'utf8').match(/^OPERATOR_PASSWORD=(.*)$/m);
    if (m && m[1].trim()) return m[1].trim();
  } catch {
    // sem server/.env
  }
  return 'operador';
}

/** O Vite usa certificado autoassinado, então a checagem ignora a validação TLS. */
const viteUp = () =>
  new Promise((resolve) => {
    const req = request(`https://localhost:${WEB_PORT}/`, { rejectUnauthorized: false, timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => req.destroy());
    req.end();
  });

async function waitReady() {
  for (let i = 0; i < 120; i++) {
    const sig = await fetch(`${signaling}/health`).then((r) => r.ok, () => false);
    if (sig && (await viteUp())) return true;
    await sleep(500);
  }
  return false;
}

async function api(path, body, token) {
  const res = await fetch(`${signaling}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `erro ${res.status}`);
  return json;
}

function findBrowser() {
  const local = process.env.LOCALAPPDATA || '';
  return [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    join(local, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].find((p) => existsSync(p));
}

function copyToClipboard(text) {
  if (process.platform !== 'win32') return false;
  try {
    spawn('clip', { stdio: ['pipe', 'ignore', 'ignore'] }).stdin.end(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Abre a central num perfil próprio do navegador (pasta .navegador-operador), em janela de app.
 * Esse perfil aceita o certificado local, libera microfone/câmera e áudio sem clique — por isso a
 * sessão já começa sozinha. O navegador do dia a dia não é alterado.
 */
function openOperator(admin, creds) {
  const browser = findBrowser();
  const auto = Buffer.from(JSON.stringify({ admin, creds })).toString('base64url');
  if (!browser) return false;
  spawn(
    browser,
    [
      `--user-data-dir=${join(root, '.navegador-operador')}`,
      `--app=${main}/operator#auto=${auto}`,
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream',
      '--ignore-certificate-errors',
      '--no-first-run',
      '--no-default-browser-check',
      '--start-maximized',
      // Diagnóstico: OPERATOR_DEBUG_PORT=9333 npm run lan permite inspecionar a central pelo DevTools.
      ...(process.env.OPERATOR_DEBUG_PORT ? [`--remote-debugging-port=${process.env.OPERATOR_DEBUG_PORT}`] : []),
    ],
    { detached: true, stdio: 'ignore' },
  ).unref();
  return true;
}

(async () => {
  if (!(await waitReady())) {
    console.error('[lan] O servidor não respondeu a tempo. Abra manualmente: ' + `${main}/operator`);
    return;
  }
  let robotLink = null;
  let opened = false;
  try {
    const admin = await api('/api/auth/login', { password: operatorPassword() });
    const creds = await api('/api/sessions', {}, admin.token);
    robotLink = `${main}/robot?t=${encodeURIComponent(creds.robotToken)}`;
    opened = openOperator({ token: admin.token, expiresAt: admin.expiresAt }, creds);
  } catch (err) {
    console.error(`[lan] Não foi possível criar a sessão automaticamente: ${err.message}`);
  }
  const copied = robotLink && copyToClipboard(robotLink);
  console.log(`
==================== TELEPRESENÇA — REDE LOCAL ====================
 Central do operador: ${opened ? 'aberta automaticamente, sessão já iniciada.' : `${main}/operator`}
 Senha (se pedir): ${operatorPassword()}
${robotLink ? `
 LINK DO NOTEBOOK DO ROBÔ${copied ? ' (já copiado — é só colar no WhatsApp)' : ''}:
 ${robotLink}
` : ''}
 No notebook do robô (MESMA rede): abra o link no Chrome, clique em
 "Avançado" → "Continuar para o site" e toque em "Toque para iniciar".
${lanOrigins.length > 1 ? ` Outros IPs deste notebook: ${lanOrigins.slice(1).join(', ')}\n` : ''}
 Se o Windows perguntar sobre o Firewall, permita "Redes privadas".
 Ctrl+C para encerrar.
===================================================================
`);
})();
