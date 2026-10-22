// Configuração pública do frontend. Nenhum segredo vive aqui: credenciais TURN e senhas
// ficam no servidor de sinalização e chegam ao navegador apenas como tokens temporários.

const raw = (import.meta.env.VITE_SIGNALING_URL as string | undefined)?.trim();

export const SIGNALING_HTTP = (raw || 'http://localhost:8787').replace(/\/+$/, '');
export const SIGNALING_WS = `${SIGNALING_HTTP.replace(/^http/, 'ws')}/ws`;
export const SIGNALING_CONFIGURED = Boolean(raw);

export const FALLBACK_ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
