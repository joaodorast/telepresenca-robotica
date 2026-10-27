// Configuração pública do frontend. Nenhum segredo vive aqui: credenciais TURN e senhas
// ficam no servidor de sinalização e chegam ao navegador apenas como tokens temporários.

const raw = (import.meta.env.VITE_SIGNALING_URL as string | undefined)?.trim();

// Sem VITE_SIGNALING_URL, usa a própria origem: o Vite repassa /api e /ws ao servidor local
// (modo rede local), então qualquer notebook da rede alcança a sinalização pelo mesmo endereço.
export const SIGNALING_HTTP = (raw || window.location.origin).replace(/\/+$/, '');
export const SIGNALING_WS = `${SIGNALING_HTTP.replace(/^http/, 'ws')}/ws`;
export const SIGNALING_CONFIGURED = Boolean(raw);

/** Endereço na rede local (ex.: https://192.168.0.10:5173), definido por `npm run lan`. */
const lanOrigin = (import.meta.env.VITE_LAN_ORIGIN as string | undefined)?.trim().replace(/\/+$/, '');

/** Origem usada nos links do robô: se o operador abriu por localhost, troca pelo IP da rede. */
export function publicOrigin(): string {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  return local && lanOrigin ? lanOrigin : window.location.origin;
}

export const FALLBACK_ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
