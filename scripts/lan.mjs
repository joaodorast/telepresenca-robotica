// Modo rede local: sobe o servidor de sinalização e o frontend (HTTPS) neste notebook para que
// outro notebook da mesma rede Wi-Fi/cabo abra o /robot pelo IP — sem Vercel, Render ou internet.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
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
  PORT: String(SIGNALING_PORT),
  ALLOWED_ORIGINS: allowedOrigins.join(','),
});

run('frontend', [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--mode', 'lan', '--strictPort', '--port', String(WEB_PORT)], root, {
  SIGNALING_TARGET: `http://localhost:${SIGNALING_PORT}`,
  VITE_LAN_ORIGIN: lanOrigins[0] || '',
});

setTimeout(() => {
  const main = lanOrigins[0] || `https://localhost:${WEB_PORT}`;
  console.log(`
==================== TELEPRESENÇA — REDE LOCAL ====================
 Operador (este notebook):   ${main}/operator
 Senha: OPERATOR_PASSWORD do server/.env (sem ela: "operador")

 Notebook do robô: crie a sessão e abra o link / QR code da aba
 "Link do robô". Os dois notebooks precisam estar na MESMA rede.
${lanOrigins.length > 1 ? ` Outros IPs deste notebook: ${lanOrigins.slice(1).join(', ')}\n` : ''}
 O certificado é autoassinado: no navegador clique em "Avançado"
 → "Continuar para o site" (nos dois notebooks).
 Se o Windows perguntar sobre o Firewall, permita "Redes privadas".
 Ctrl+C para encerrar.
===================================================================
`);
}, 2500);
