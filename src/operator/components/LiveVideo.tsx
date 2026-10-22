import { useEffect, useRef } from 'react';
import { CameraOff, Loader2, Play, Smartphone } from 'lucide-react';
import type { OperatorSession, OperatorSnapshot } from '../OperatorSession';
import { Button, LevelBar } from '../../ui/controls';

/** Área principal: vídeo ao vivo da pessoa diante do robô (somente na central). */
export function LiveVideo({ s, session, onShowLink }: { s: OperatorSnapshot; session: OperatorSession; onShowLink: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (v && v.srcObject !== s.remoteStream) v.srcObject = s.remoteStream;
  }, [s.remoteStream]);

  const robotCam = s.robot?.camera;
  const showVideo = s.hasRemoteVideo && s.peerState === 'connected';

  let overlay: React.ReactNode = null;
  if (s.phase === 'idle' || s.phase === 'starting') {
    overlay = (
      <div className="text-center">
        <p className="font-display text-xl font-light">Central pronta</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-white/50">Ao iniciar, o navegador pedirá acesso ao seu microfone. Sua voz será transformada antes de chegar ao robô.</p>
        <Button variant="gold" className="mt-5" onClick={() => void session.start()} disabled={s.phase === 'starting'}>
          {s.phase === 'starting' ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Iniciar sessão
        </Button>
      </div>
    );
  } else if (!s.robotPresent) {
    overlay = (
      <div className="text-center">
        <Smartphone className="mx-auto text-gold-400" size={28} />
        <p className="mt-3 font-display text-lg font-light">Aguardando o dispositivo do robô</p>
        <p className="mt-1 text-sm text-white/50">Abra o link do personagem no dispositivo e toque em “Iniciar”.</p>
        <Button className="mt-4" onClick={onShowLink}>
          Mostrar link e QR code
        </Button>
      </div>
    );
  } else if (robotCam === 'error') {
    overlay = (
      <div className="max-w-sm text-center">
        <CameraOff className="mx-auto text-amber-300" size={28} />
        <p className="mt-3 font-display text-lg font-light">Câmera do robô indisponível</p>
        <p className="mt-1 text-sm text-white/55">{s.robot?.cameraError}</p>
        <p className="mt-2 text-xs text-white/35">O robô tenta reconectar a câmera automaticamente.</p>
      </div>
    );
  } else if (!showVideo) {
    overlay = (
      <div className="flex items-center gap-2 text-sm text-white/60">
        <Loader2 size={16} className="animate-spin" /> Recebendo vídeo…
      </div>
    );
  }

  const v = s.stats?.video;
  return (
    <div className="panel relative aspect-video w-full overflow-hidden !rounded-3xl bg-black">
      <video ref={ref} autoPlay playsInline muted className={showVideo ? 'h-full w-full object-cover' : 'hidden'} />
      {overlay && <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(255,170,70,.06),transparent_70%)] p-6">{overlay}</div>}
      {showVideo && (
        <>
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 text-[11px] text-white/85 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Ao vivo
            {v && (
              <span className="font-mono text-white/60">
                · {v.height}p · {v.fps} fps{s.stats?.inboundKbps ? ` · ${s.stats.inboundKbps} kbps` : ''}
              </span>
            )}
          </div>
          {s.robot?.mic === 'on' && (
            <div className="absolute bottom-4 left-4 w-40 rounded-lg bg-black/55 px-3 py-2 backdrop-blur" title="Áudio ambiente do robô">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-white/50">Áudio ambiente</p>
              <LevelBar read={() => session.remoteLevel} segments={14} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
