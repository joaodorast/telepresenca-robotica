import { SIGNALING_HTTP } from '../config/env';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SIGNALING_HTTP}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(
      `Não foi possível alcançar o servidor de sinalização (${SIGNALING_HTTP}). Verifique se ele está em execução e se a origem está autorizada.`,
      0,
    );
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new ApiError(body.error || `Erro ${res.status} no servidor.`, res.status);
  return body;
}

export interface SessionCredentials {
  sessionId: string;
  operatorToken: string;
  robotToken: string;
  expiresAt: number;
}

export interface IceResponse {
  iceServers: RTCIceServer[];
  hasTurn: boolean;
  warnings: string[];
}

export const api = {
  login: (password: string) =>
    request<{ token: string; expiresAt: number }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  createSession: (adminToken: string) => request<SessionCredentials>('/api/sessions', { method: 'POST', body: '{}' }, adminToken),
  ice: (sessionToken: string) => request<IceResponse>('/api/ice', { method: 'GET' }, sessionToken),
};

/** Lê o payload de um token sem validar a assinatura (apenas para exibir expiração/ID na interface). */
export function peekToken(token: string): { role?: string; sid?: string; exp?: number } | null {
  try {
    const body = token.split('.')[0];
    const json = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}
