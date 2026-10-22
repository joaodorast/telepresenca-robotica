import { useEffect, useState } from 'react';
import { Eye, EyeOff, LogOut, Radio } from 'lucide-react';
import type { OperatorSession, OperatorSnapshot } from '../OperatorSession';
import { Button, Dot } from '../../ui/controls';
import { BrandMark } from './Brand';
import { connectionInfo, formatDuration } from './status';

function Timer({ since }: { since: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return <span className="font-mono text-xs tabular-nums text-white/70">{since ? formatDuration(now - since) : '--:--:--'}</span>;
}

export function TopBar({ s, session, onLogout }: { s: OperatorSnapshot; session: OperatorSession; onLogout: () => void }) {
  const c = connectionInfo(s);
  const latency = s.stats?.rttMs ?? null;
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-white/[0.06] px-5 py-3">
      <BrandMark />
      <div className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span className="flex items-center gap-2">
          <Dot tone={c.tone} pulse />
          <span className="font-medium text-white/90">{c.label}</span>
          {c.detail && <span className="text-white/40">({c.detail})</span>}
        </span>
        {latency !== null ? (
          <span className="text-white/55" title="Tempo de ida e volta medido pelo WebRTC">
            Latência <span className="font-mono text-white/85">{latency} ms</span>
          </span>
        ) : s.signaling.rttMs !== null ? (
          <span className="text-white/45" title="Ida e volta até o servidor de sinalização">
            Sinalização <span className="font-mono text-white/70">{s.signaling.rttMs} ms</span>
          </span>
        ) : null}
        {s.stats?.relayed != null && (
          <span className="flex items-center gap-1 text-white/45" title={s.stats.relayed ? 'Mídia retransmitida por servidor TURN' : 'Mídia direta entre os dispositivos'}>
            <Radio size={12} /> {s.stats.relayed ? 'via TURN' : 'P2P direto'}
          </span>
        )}
        {s.stats?.lossPct != null && s.stats.lossPct > 2 && <span className="text-amber-300">Perda de pacotes {s.stats.lossPct}%</span>}
      </div>
      <div className="flex items-center gap-2">
        <Timer since={s.connectedAt} />
        <Button
          variant="subtle"
          onClick={() => session.reveal(!s.revealShown)}
          disabled={!s.robotPresent}
          title="Exibe no robô que o personagem é conduzido por uma pessoa"
        >
          {s.revealShown ? <EyeOff size={15} /> : <Eye size={15} />}
          <span className="hidden sm:inline">{s.revealShown ? 'Ocultar revelação' : 'Revelar operador'}</span>
        </Button>
        <Button variant="subtle" onClick={onLogout} title="Sair da central">
          <LogOut size={15} />
        </Button>
      </div>
    </header>
  );
}
