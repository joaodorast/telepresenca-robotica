import type { Tone } from '../../ui/controls';
import type { OperatorSnapshot } from '../OperatorSession';

export function connectionInfo(s: OperatorSnapshot): { label: string; tone: Tone; detail?: string } {
  if (s.phase === 'idle' || s.phase === 'starting') return { label: s.phase === 'starting' ? 'Iniciando…' : 'Central pronta', tone: 'idle' };
  if (s.phase === 'ended') return { label: 'Sessão encerrada', tone: 'idle' };
  if (s.signaling.state === 'reconnecting') return { label: 'Reconectando ao servidor', tone: 'warn', detail: `tentativa ${s.signaling.attempt}` };
  if (s.signaling.state !== 'open') return { label: 'Conectando ao servidor', tone: 'warn' };
  if (!s.robotPresent) return { label: 'Aguardando o robô', tone: 'warn' };
  switch (s.peerState) {
    case 'connected':
      return { label: 'Conectado', tone: 'ok' };
    case 'failed':
      return { label: 'Falha na mídia — reconectando', tone: 'error' };
    case 'disconnected':
      return { label: 'Conexão instável', tone: 'warn' };
    default:
      return { label: 'Estabelecendo mídia', tone: 'info' };
  }
}

export const ACTIVITY_LABEL = {
  waiting: 'Aguardando',
  listening: 'Escutando',
  speaking: 'Falando',
  greeting: 'Saudando',
} as const;

export function formatDuration(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
